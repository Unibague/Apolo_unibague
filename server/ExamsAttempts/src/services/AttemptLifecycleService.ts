import { AppDataSource } from "../data-source/AppDataSource";
import { Server } from "socket.io";
import { ExamAttempt, AttemptState } from "../models/ExamAttempt";
import { ExamAnswer } from "../models/ExamAnswer";
import { ExamEvent } from "../models/ExamEvent";
import { ExamInProgress } from "../models/ExamInProgress";
import { ExamAttemptValidator } from "../validators/ExamAttemptValidator";
import {
  generateAccessCode,
  generateSessionId,
} from "../utils/CodeGenerator";
import { In } from "typeorm";
import { throwHttpError } from "../utils/errors";
import { StartExamAttemptDto } from "../dtos/Start-ExamAttempt.dto";
import { ResumeExamAttemptDto } from "../dtos/Resume-ExamAttempt.dto";
import { ScoringService } from "./ScoringService";

export class AttemptLifecycleService {
  static async checkDuplicate(codigo_examen: string, correo?: string, identificacion?: string) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const exam = await ExamAttemptValidator.validateExamExists(codigo_examen);
    const activeStates = [AttemptState.ACTIVE, AttemptState.BLOCKED, AttemptState.FINISHED];
    if (correo) {
      const existing = await attemptRepo.findOne({
        where: { examen_id: exam.id, correo_estudiante: correo, estado: In(activeStates) },
      });
      if (existing) throwHttpError("Ya existe un intento registrado con ese correo electrónico para este examen.", 409);
    }
    if (identificacion) {
      const existing = await attemptRepo.findOne({
        where: { examen_id: exam.id, identificacion_estudiante: identificacion, estado: In(activeStates) },
      });
      if (existing) throwHttpError("Ya existe un intento registrado con esa identificación para este examen.", 409);
    }
  }

  static async startAttempt(data: StartExamAttemptDto, io: Server) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const progressRepo = AppDataSource.getRepository(ExamInProgress);

    const exam = await ExamAttemptValidator.validateExamExists(
      data.codigo_examen,
    );
    ExamAttemptValidator.validateExamState(exam);
    ExamAttemptValidator.validateRequiredStudentData(
      exam,
      data.nombre_estudiante,
      data.correo_estudiante,
      data.identificacion_estudiante,
    );
    ExamAttemptValidator.validateExamPassword(exam, data.contrasena);

    // Validar duplicados por correo o identificación
    const activeStates = [AttemptState.ACTIVE, AttemptState.BLOCKED, AttemptState.FINISHED];
    if (data.correo_estudiante) {
      const existing = await attemptRepo.findOne({
        where: { examen_id: exam.id, correo_estudiante: data.correo_estudiante, estado: In(activeStates) },
      });
      if (existing) throwHttpError("Ya existe un intento registrado con ese correo electrónico para este examen.", 409);
    }
    if (data.identificacion_estudiante) {
      const existing = await attemptRepo.findOne({
        where: { examen_id: exam.id, identificacion_estudiante: data.identificacion_estudiante, estado: In(activeStates) },
      });
      if (existing) throwHttpError("Ya existe un intento registrado con esa identificación para este examen.", 409);
    }

    // Detectar si es un examen PDF (tiene archivoPDF y no tiene preguntas)
    const esExamenPDF = !!(
      exam.archivoPDF &&
      (!exam.questions || exam.questions.length === 0)
    );

    // Para exámenes PDF el puntaje máximo es 5 (calificación directa 0-5)
    const puntajeMaximo = esExamenPDF
      ? 5
      : exam.questions.reduce((sum: number, q: any) => sum + q.puntaje, 0);

    const fecha_inicio = new Date();

    const attempt = attemptRepo.create({
      examen_id: exam.id,
      limiteTiempoCumplido: exam.limiteTiempoCumplido,
      consecuencia: exam.consecuencia,
      estado: AttemptState.ACTIVE,
      nombre_estudiante: data.nombre_estudiante || null,
      correo_estudiante: data.correo_estudiante || null,
      identificacion_estudiante: data.identificacion_estudiante || null,
      puntajeMaximo,
      fecha_inicio,
      esExamenPDF,
      calificacionPendiente: esExamenPDF,
    });

    await attemptRepo.save(attempt);

    const fecha_expiracion_timestamp = ExamAttemptValidator.validateTimeLimit(
      exam,
      fecha_inicio,
    );

    // Retry en caso de colisión de codigo_acceso o id_sesion (unique constraint)
    let examInProgress;
    const MAX_RETRIES = 10;
    for (let attempt_n = 0; attempt_n < MAX_RETRIES; attempt_n++) {
      const codigo_acceso = generateAccessCode();
      const id_sesion = generateSessionId();
      try {
        examInProgress = progressRepo.create({
          codigo_acceso,
          estado: AttemptState.ACTIVE,
          fecha_inicio,
          id_sesion,
          fecha_expiracion: fecha_expiracion_timestamp
            ? new Date(fecha_expiracion_timestamp)
            : null,
          intento_id: attempt.id,
        });
        await progressRepo.save(examInProgress);
        break;
      } catch (err: any) {
        // Colisión de clave única en codigo_acceso o id_sesion → reintentar
        const isDupEntry = err?.errno === 1062 || err?.code === "ER_DUP_ENTRY";
        if (isDupEntry && attempt_n < MAX_RETRIES - 1) {
          continue;
        }
        throw err;
      }
    }

    const room = `attempt_${attempt.id}`;
    io.to(room).emit("attempt_started", {
      attemptId: attempt.id,
      codigo_acceso: examInProgress!.codigo_acceso,
      id_sesion: examInProgress!.id_sesion,
      limiteTiempo: exam.limiteTiempo,
      fecha_expiracion: examInProgress!.fecha_expiracion,
    });

    io.to(`exam_${exam.id}`).emit("student_started_exam", {
      attemptId: attempt.id,
      codigo_acceso: examInProgress!.codigo_acceso,
      estudiante: {
        nombre: attempt.nombre_estudiante,
        correo: attempt.correo_estudiante,
        identificacion: attempt.identificacion_estudiante,
      },
      fecha_inicio,
    });

    return {
      attempt,
      examInProgress,
      exam,
    };
  }

  static async resumeAttempt(data: ResumeExamAttemptDto, io: Server) {
    const progressRepo = AppDataSource.getRepository(ExamInProgress);
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);

    const examInProgress = await progressRepo.findOne({
      where: { codigo_acceso: data.codigo_acceso },
    });

    if (!examInProgress) {
      throwHttpError("Código de acceso inválido", 404);
    }

    // Solo los intentos finalizados no son reanudables
    if (examInProgress.estado === AttemptState.FINISHED) {
      throwHttpError("Este intento ya ha finalizado", 403);
    }

    const attempt = await attemptRepo.findOne({
      where: { id: examInProgress.intento_id },
      relations: ["respuestas"],
    });

    if (!attempt) {
      throwHttpError("Intento no encontrado", 404);
    }

    // Verificar expiración antes de reactivar
    if (examInProgress.fecha_expiracion) {
      const now = new Date();
      if (now > examInProgress.fecha_expiracion) {
        await this.handleTimeExpired(attempt, examInProgress, io);
        throwHttpError("El tiempo del examen ha expirado", 403);
      }
    }

    const estadoAnterior = examInProgress.estado;

    // Siempre generar nueva sesión — invalida cualquier sesión anterior y evita duplicados
    examInProgress.id_sesion = generateSessionId();

    // Reactivar si no estaba activo (abandonado, bloqueado, pausado)
    if (examInProgress.estado !== AttemptState.ACTIVE) {
      examInProgress.estado = AttemptState.ACTIVE;
      examInProgress.fecha_fin = null;
      attempt.estado = AttemptState.ACTIVE;
      attempt.fecha_fin = null;
    }

    await progressRepo.save(examInProgress);
    await attemptRepo.save(attempt);

    // Desplazar cualquier sesión anterior activa — previene conexiones duplicadas
    io.to(`attempt_${attempt.id}`).emit("session_replaced", {
      message: "Accediste al examen desde otro lugar. Esta sesión fue cerrada.",
    });

    // Notificar al profesor si se reanudó desde un estado inactivo
    if (estadoAnterior !== AttemptState.ACTIVE) {
      io.to(`exam_${attempt.examen_id}`).emit("student_resumed_exam", {
        attemptId: attempt.id,
        estudiante: {
          nombre: attempt.nombre_estudiante,
          correo: attempt.correo_estudiante,
          identificacion: attempt.identificacion_estudiante,
        },
      });
      console.log(`🔄 Intento ${attempt.id} reanudado desde estado: ${estadoAnterior}`);
    }

    // Obtener examen sanitizado (mismo formato que startAttempt)
    const examBasic = await ExamAttemptValidator.validateExamExistsById(
      attempt.examen_id,
    );
    const exam = await ExamAttemptValidator.validateExamExists(
      examBasic.codigoExamen,
    );

    return {
      attempt,
      examInProgress,
      exam,
    };
  }

  static async finishAttempt(intento_id: number, io: Server) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const progressRepo = AppDataSource.getRepository(ExamInProgress);

    const attempt = await attemptRepo.findOne({
      where: { id: intento_id },
      relations: ["respuestas"],
    });

    if (!attempt) {
      throwHttpError("Intento no encontrado", 404);
    }

    const examInProgress = await progressRepo.findOne({
      where: { intento_id },
    });

    if (!examInProgress) {
      throwHttpError("Examen en progreso no encontrado", 404);
    }

    if (attempt.estado === AttemptState.BLOCKED) {
      throwHttpError("No puedes finalizar un examen bloqueado", 403);
    }

    if (attempt.estado === AttemptState.FINISHED) {
      throwHttpError("Este examen ya fue finalizado", 400);
    }

    // Para exámenes PDF: no calificar automáticamente
    if (attempt.esExamenPDF) {
      attempt.puntaje = null;
      attempt.porcentaje = null;
      attempt.notaFinal = null;
      attempt.calificacionPendiente = true;
    } else {
      try {
        const puntaje = await ScoringService.calculateScore(attempt);
        attempt.puntaje = puntaje;
      } catch (scoringError) {
        // Si el servicio de exámenes falla, guardar como pendiente en vez de crashear
        console.error(`❌ Error al calificar intento ${attempt.id}, se marca como pendiente:`, scoringError);
        attempt.puntaje = null;
        attempt.porcentaje = null;
        attempt.notaFinal = null;
        attempt.calificacionPendiente = true;
      }
    }

    attempt.fecha_fin = new Date();
    attempt.estado = AttemptState.FINISHED;
    attempt.codigoRevision = generateAccessCode();

    // Envolver las escrituras finales en una transacción. Reintentar hasta 5 veces
    // en caso de colisión en codigoRevision (ER_DUP_ENTRY) o deadlock (ER_LOCK_DEADLOCK).
    // Ambos son transitorios bajo alta concurrencia.
    const MAX_RETRIES = 5;
    for (let i = 0; i < MAX_RETRIES; i++) {
      try {
        await AppDataSource.transaction(async (manager) => {
          await manager.save(ExamAttempt, attempt);
          await manager.delete(ExamInProgress, { intento_id });
        });
        break;
      } catch (err: any) {
        const isDupEntry = err?.errno === 1062 || err?.code === "ER_DUP_ENTRY";
        const isDeadlock = err?.errno === 1213 || err?.code === "ER_LOCK_DEADLOCK";
        if ((isDupEntry || isDeadlock) && i < MAX_RETRIES - 1) {
          if (isDupEntry) {
            // Regenerar codigoRevision para evitar la colisión en el índice único
            attempt.codigoRevision = generateAccessCode();
          }
          continue;
        }
        throw err;
      }
    }

    io.to(`attempt_${intento_id}`).emit("attempt_finished", {
      puntaje: attempt.puntaje,
      puntajeMaximo: attempt.puntajeMaximo,
      esExamenPDF: attempt.esExamenPDF,
      calificacionPendiente: attempt.calificacionPendiente,
    });

    io.to(`exam_${attempt.examen_id}`).emit("student_finished_exam", {
      attemptId: intento_id,
      estudiante: {
        nombre: attempt.nombre_estudiante,
        correo: attempt.correo_estudiante,
      },
      puntaje: attempt.puntaje,
      notaFinal: attempt.notaFinal,
      esExamenPDF: attempt.esExamenPDF,
      calificacionPendiente: attempt.calificacionPendiente,
    });

    return attempt;
  }

  static async handleTimeExpired(
    attempt: ExamAttempt,
    _examInProgress: ExamInProgress,
    io: Server,
  ) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const progressRepo = AppDataSource.getRepository(ExamInProgress);

    if (attempt.esExamenPDF) {
      if (attempt.limiteTiempoCumplido === "descartar") {
        attempt.puntaje = 0;
        attempt.calificacionPendiente = false;
      } else {
        attempt.puntaje = null;
        attempt.calificacionPendiente = true;
      }
    } else if (attempt.limiteTiempoCumplido === "descartar") {
      attempt.puntaje = 0;
    } else {
      try {
        const puntaje = await ScoringService.calculateScore(attempt);
        attempt.puntaje = puntaje;
      } catch (scoringError) {
        console.error(`❌ Error al calificar intento ${attempt.id} por tiempo expirado, se marca como pendiente:`, scoringError);
        attempt.puntaje = null;
        attempt.porcentaje = null;
        attempt.notaFinal = null;
        attempt.calificacionPendiente = true;
      }
    }

    attempt.fecha_fin = new Date();
    attempt.estado = AttemptState.FINISHED;
    attempt.codigoRevision = generateAccessCode();

    await attemptRepo.save(attempt);
    await progressRepo.delete({ intento_id: attempt.id });

    io.to(`attempt_${attempt.id}`).emit("time_expired", {
      message: "El tiempo del examen ha expirado",
      puntaje: attempt.puntaje,
      esExamenPDF: attempt.esExamenPDF,
      calificacionPendiente: attempt.calificacionPendiente,
      limiteTiempoCumplido: attempt.limiteTiempoCumplido,
    });

    io.to(`exam_${attempt.examen_id}`).emit("student_finished_exam", {
      attemptId: attempt.id,
      estudiante: {
        nombre: attempt.nombre_estudiante,
        correo: attempt.correo_estudiante,
      },
      puntaje: attempt.puntaje,
      notaFinal: attempt.notaFinal,
      esExamenPDF: attempt.esExamenPDF,
      calificacionPendiente: attempt.calificacionPendiente,
    });
  }

  static async abandonAttempt(intento_id: number, io: Server) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const progressRepo = AppDataSource.getRepository(ExamInProgress);

    const attempt = await attemptRepo.findOne({
      where: { id: intento_id },
    });

    if (!attempt) {
      throwHttpError("Intento no encontrado", 404);
    }

    const examInProgress = await progressRepo.findOne({
      where: { intento_id },
    });

    if (!examInProgress) {
      throwHttpError("Examen en progreso no encontrado", 404);
    }

    if (attempt.estado === AttemptState.ACTIVE) {
      attempt.estado = AttemptState.ABANDONADO;
      examInProgress.estado = AttemptState.ABANDONADO;
      attempt.fecha_fin = new Date();
      examInProgress.fecha_fin = new Date();

      await attemptRepo.save(attempt);
      await progressRepo.save(examInProgress);

      io.to(`exam_${attempt.examen_id}`).emit("student_abandoned_exam", {
        attemptId: intento_id,
        estudiante: {
          nombre: attempt.nombre_estudiante,
          correo: attempt.correo_estudiante,
        },
      });

      console.log(`🚪 Intento ${intento_id} marcado como abandonado`);
    }

    return attempt;
  }

  static async deleteAttempt(attemptId: number, io?: Server) {
    return await AppDataSource.transaction(async (manager) => {
      const attemptRepo = manager.getRepository(ExamAttempt);
      const answerRepo = manager.getRepository(ExamAnswer);
      const eventRepo = manager.getRepository(ExamEvent);
      const progressRepo = manager.getRepository(ExamInProgress);

      console.log(`\n🗑️ ELIMINANDO INTENTO - ID: ${attemptId}`);

      const attempt = await attemptRepo.findOne({
        where: { id: attemptId },
      });

      if (!attempt) {
        throwHttpError("Intento no encontrado", 404);
      }

      const examId = attempt.examen_id;
      const studentInfo = {
        nombre: attempt.nombre_estudiante,
        correo: attempt.correo_estudiante,
        identificacion: attempt.identificacion_estudiante,
      };

      // 2. Contar y eliminar respuestas
      const answersCount = await answerRepo.count({
        where: { intento_id: attemptId },
      });
      await answerRepo.delete({ intento_id: attemptId });

      // 3. Contar y eliminar eventos
      const eventsCount = await eventRepo.count({
        where: { intento_id: attemptId },
      });
      await eventRepo.delete({ intento_id: attemptId });

      // 4. Eliminar ExamInProgress
      const progressDeleted = await progressRepo.delete({
        intento_id: attemptId,
      });
  

      // 5. Eliminar el intento
      await attemptRepo.delete({ id: attemptId });


      // 6. Notificar vía WebSocket si se proporcionó io
      if (io) {
        io.to(`attempt_${attemptId}`).emit("attempt_deleted", {
          message: "Tu intento ha sido eliminado por el profesor",
          attemptId,
        });

        io.to(`exam_${examId}`).emit("attempt_deleted_notification", {
          attemptId,
          estudiante: studentInfo,
          deletedData: {
            respuestas: answersCount,
            eventos: eventsCount,
          },
        });
      }

      return {
        message: "Intento eliminado exitosamente",
        attemptId,
        estudiante: studentInfo,
        deletedData: {
          respuestas: answersCount,
          eventos: eventsCount,
          examInProgress: progressDeleted.affected || 0,
        },
      };
    });
  }

  static async saveQuestionOrder(attemptId: number, questionIds: number[]) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);

    const attempt = await attemptRepo.findOne({ where: { id: attemptId } });
    if (!attempt) {
      throwHttpError("Intento no encontrado", 404);
    }

    if (attempt.estado === AttemptState.FINISHED) {
      throwHttpError("No se puede modificar un intento finalizado", 400);
    }

    attempt.ordenPreguntas = JSON.stringify(questionIds);
    await attemptRepo.save(attempt);

    return { message: "Orden de preguntas guardado", attemptId };
  }
}
