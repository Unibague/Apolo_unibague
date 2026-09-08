import { AppDataSource } from "../data-source/AppDataSource";
import { In } from "typeorm";
import { Server } from "socket.io";
import { ExamAttempt } from "../models/ExamAttempt";
import { ExamAnswer, TipoRespuesta } from "../models/ExamAnswer";
import { ExamInProgress, } from "../models/ExamInProgress";
import { AttemptState } from "../models/ExamAttempt";
import { ExamAttemptValidator } from "../validators/ExamAttemptValidator";
import { throwHttpError } from "../utils/errors";
import { CreateExamAnswerDto } from "../dtos/Create-ExamAnswer.dto";
import { GradingService } from "./GradingService";

// Cache de cantidad de preguntas por examen para evitar llamadas al MS en cada respuesta guardada
const examQuestionCountCache = new Map<number, { count: number; expiresAt: number }>();
const EXAM_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

async function getExamQuestionCount(examId: number): Promise<number> {
  const cached = examQuestionCountCache.get(examId);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.count;
  }
  const exam = await ExamAttemptValidator.validateExamExistsById(examId);
  const count = exam.questions?.length ?? 0;
  examQuestionCountCache.set(examId, { count, expiresAt: Date.now() + EXAM_CACHE_TTL_MS });
  return count;
}

export class AnswerService {
  static async saveAnswer(data: CreateExamAnswerDto, io: Server) {
    const repo = AppDataSource.getRepository(ExamAnswer);
    const progressRepo = AppDataSource.getRepository(ExamInProgress);
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);

    const examInProgress = await progressRepo.findOne({
      where: { intento_id: data.intento_id },
    });

    if (!examInProgress) {
      throwHttpError("Intento no encontrado", 404);
    }

    if (examInProgress.estado !== AttemptState.ACTIVE) {
      throwHttpError("No se pueden guardar respuestas en este intento", 403);
    }

    // Detección de respuesta en blanco para preguntas de texto:
    // si la respuesta solo contiene espacios/tabs/saltos de línea, no se persiste
    // como contenido real — se marca el registro como SIN_RESPUESTA.
    const tipoEntrada = data.tipo_respuesta;
    const esTipoTexto =
      !tipoEntrada ||
      tipoEntrada === TipoRespuesta.NORMAL ||
      tipoEntrada === TipoRespuesta.TEXTO_PLANO;
    let esRespuestaEnBlanco = false;
    if (esTipoTexto && typeof data.respuesta === "string") {
      let parsed: any = data.respuesta;
      try {
        parsed = JSON.parse(data.respuesta);
      } catch {
        // No era JSON, usar el string crudo
      }
      if (parsed == null) {
        esRespuestaEnBlanco = true;
      } else if (typeof parsed === "string" && parsed.replace(/\s/g, "").length === 0) {
        esRespuestaEnBlanco = true;
      }
    }

    const existingAnswer = await repo.findOne({
      where: {
        intento_id: data.intento_id,
        pregunta_id: data.pregunta_id,
      },
    });

    let answer;

    // Si llega una respuesta en blanco y no existe registro previo,
    // no se crea nada — la pregunta queda como no contestada.
    if (esRespuestaEnBlanco && !existingAnswer) {
      return null;
    }

    if (existingAnswer) {
      if (esRespuestaEnBlanco) {
        existingAnswer.respuesta = null;
        existingAnswer.tipo_respuesta = TipoRespuesta.SIN_RESPUESTA;
      } else {
        existingAnswer.respuesta = data.respuesta;
        if (data.tipo_respuesta !== undefined) {
          existingAnswer.tipo_respuesta = data.tipo_respuesta;
        }
      }
      existingAnswer.fecha_respuesta = data.fecha_respuesta;
      if (data.retroalimentacion !== undefined) {
        existingAnswer.retroalimentacion = data.retroalimentacion;
      }
      if (data.metadata_codigo !== undefined) {
        existingAnswer.metadata_codigo = data.metadata_codigo;
      }
      answer = await repo.save(existingAnswer);
      io.to(`attempt_${data.intento_id}`).emit("answer_updated", answer);
    } else {
      answer = repo.create(data);
      await repo.save(answer);
      io.to(`attempt_${data.intento_id}`).emit("answer_saved", answer);
    }

    const totalAnswers = await repo.count({
      where: {
        intento_id: data.intento_id,
        tipo_respuesta: In([TipoRespuesta.NORMAL, TipoRespuesta.ARCHIVO]),
      },
    });


    const attempt = await attemptRepo.findOne({
      where: { id: data.intento_id },
    });

    if (!attempt) {
      return answer;
    }


    // Para exámenes PDF, el progreso se calcula diferente (no hay preguntas)
    if (attempt.esExamenPDF) {
      const progreso = totalAnswers > 0 ? 100 : 0;
      attempt.progreso = progreso;
      const savedAttempt = await attemptRepo.save(attempt);
      io.to(`exam_${attempt.examen_id}`).emit("progress_updated", {
        attemptId: data.intento_id,
        progreso,
      });
      return answer;
    }

    const totalQuestions = await getExamQuestionCount(attempt.examen_id);

    if (totalQuestions === 0) {
      return answer;
    }

    const progreso = Math.min(100, Math.round((totalAnswers / totalQuestions) * 100));

    attempt.progreso = progreso;

    const savedAttempt = await attemptRepo.save(attempt);

    io.to(`exam_${attempt.examen_id}`).emit("progress_updated", {
      attemptId: data.intento_id,
      progreso,
    });

    return answer;
  }

  static async updateManualGrade(
    respuesta_id: number,
    puntaje?: number,
    retroalimentacion?: string,
    io?: Server,
  ) {
    const answerRepo = AppDataSource.getRepository(ExamAnswer);
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);

    const answer = await answerRepo.findOne({
      where: { id: respuesta_id },
    });

    if (!answer) {
      throwHttpError("Respuesta no encontrada", 404);
    }

    if (puntaje !== undefined) {
      const attempt = await attemptRepo.findOne({
        where: { id: answer.intento_id },
      });

      if (!attempt) {
        throwHttpError("Intento no encontrado", 404);
      }

      const exam = await ExamAttemptValidator.validateExamExistsById(
        attempt.examen_id,
      );

      const question = exam.questions?.find(
        (q: any) => q.id === answer.pregunta_id,
      );

      if (!question) {
        throwHttpError("Pregunta no encontrada en el examen", 404);
      }

      if (puntaje < 0) {
        throwHttpError("El puntaje no puede ser negativo", 400);
      }

      if (puntaje > question.puntaje) {
        throwHttpError(
          `El puntaje no puede exceder el máximo de la pregunta (${question.puntaje} puntos)`,
          400,
        );
      }

      answer.puntaje = puntaje;
    }

    if (retroalimentacion !== undefined) {
      answer.retroalimentacion = retroalimentacion;
    }

    await answerRepo.save(answer);

    // Recalcular el puntaje total del intento
    const attempt = await attemptRepo.findOne({
      where: { id: answer.intento_id },
      relations: ["respuestas"],
    });

    if (attempt) {
      const puntajeTotal =
        attempt.respuestas?.reduce((sum, r) => sum + (r.puntaje || 0), 0) || 0;

      attempt.puntaje = puntajeTotal;

      const { porcentaje, notaFinal } = GradingService.calculateFinalGrade(
        puntajeTotal,
        attempt.puntajeMaximo,
      );

      attempt.porcentaje = porcentaje;
      attempt.notaFinal = notaFinal;

      await attemptRepo.save(attempt);

      if (io) {
        io.to(`exam_${attempt.examen_id}`).emit("grade_updated", {
          attemptId: attempt.id,
          respuestaId: respuesta_id,
          puntaje,
          retroalimentacion,
          puntajeTotal: attempt.puntaje,
        });
      }
    }

    return answer;
  }

  /**
   * Crea una respuesta vacía y asigna nota manual cuando el estudiante no respondió la pregunta.
   * Solo aplica cuando NO existe un registro previo para ese intento+pregunta.
   * Los datos existentes nunca se tocan.
   */
  static async gradeUnansweredQuestion(
    intento_id: number,
    pregunta_id: number,
    puntaje: number,
    retroalimentacion?: string,
    io?: Server,
  ) {
    const answerRepo = AppDataSource.getRepository(ExamAnswer);
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);

    // Seguridad: si ya existe una respuesta, rechazar (usar updateManualGrade)
    const existing = await answerRepo.findOne({ where: { intento_id, pregunta_id } });
    if (existing) {
      throwHttpError("Ya existe una respuesta para esta pregunta; usa el endpoint de calificación manual.", 409);
    }

    const attempt = await attemptRepo.findOne({ where: { id: intento_id } });
    if (!attempt) throwHttpError("Intento no encontrado", 404);

    const exam = await ExamAttemptValidator.validateExamExistsById(attempt.examen_id);
    const question = exam.questions?.find((q: any) => q.id === pregunta_id);
    if (!question) throwHttpError("Pregunta no encontrada en el examen", 404);

    if (puntaje < 0) throwHttpError("El puntaje no puede ser negativo", 400);
    if (puntaje > question.puntaje) {
      throwHttpError(`El puntaje no puede exceder el máximo de la pregunta (${question.puntaje} puntos)`, 400);
    }

    // Crear registro placeholder — respuesta null, tipo sin_respuesta
    const answer = answerRepo.create({
      intento_id,
      pregunta_id,
      respuesta: null,
      tipo_respuesta: TipoRespuesta.SIN_RESPUESTA,
      fecha_respuesta: new Date(),
      puntaje,
      retroalimentacion: retroalimentacion ?? undefined,
    });
    await answerRepo.save(answer);

    // Recalcular puntaje total del intento (igual que updateManualGrade)
    const attemptWithAnswers = await attemptRepo.findOne({
      where: { id: intento_id },
      relations: ["respuestas"],
    });

    if (attemptWithAnswers) {
      const puntajeTotal = attemptWithAnswers.respuestas?.reduce((sum, r) => sum + (r.puntaje || 0), 0) || 0;
      attemptWithAnswers.puntaje = puntajeTotal;

      const { porcentaje, notaFinal } = GradingService.calculateFinalGrade(puntajeTotal, attemptWithAnswers.puntajeMaximo);
      attemptWithAnswers.porcentaje = porcentaje;
      attemptWithAnswers.notaFinal = notaFinal;
      await attemptRepo.save(attemptWithAnswers);

      if (io) {
        io.to(`exam_${attemptWithAnswers.examen_id}`).emit("grade_updated", {
          attemptId: attemptWithAnswers.id,
          respuestaId: answer.id,
          puntaje,
          retroalimentacion,
          puntajeTotal: attemptWithAnswers.puntaje,
        });
      }
    }

    return answer;
  }

  static async updatePDFAttemptGrade(
    intento_id: number,
    puntaje?: number,
    retroalimentacion?: string,
    io?: Server,
  ) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);

    const attempt = await attemptRepo.findOne({
      where: { id: intento_id },
    });

    if (!attempt) {
      throwHttpError("Intento no encontrado", 404);
    }

    if (!attempt.esExamenPDF) {
      throwHttpError(
        "Este endpoint solo aplica para intentos de exámenes PDF. Use /answer/:id/manual-grade para exámenes normales",
        400,
      );
    }

    if (puntaje !== undefined) {
      if (puntaje < 0) {
        throwHttpError("El puntaje no puede ser negativo", 400);
      }
      if (puntaje > attempt.puntajeMaximo) {
        throwHttpError(
          `El puntaje no puede exceder el máximo del examen (${attempt.puntajeMaximo} puntos)`,
          400,
        );
      }

      attempt.puntaje = puntaje;

      const { porcentaje, notaFinal } = GradingService.calculateFinalGrade(
        puntaje,
        attempt.puntajeMaximo,
      );
      attempt.porcentaje = porcentaje;
      attempt.notaFinal = notaFinal;
      attempt.calificacionPendiente = false;
    }

    if (retroalimentacion !== undefined) {
      attempt.retroalimentacion = retroalimentacion;
    }

    await attemptRepo.save(attempt);

    if (io) {
      io.to(`exam_${attempt.examen_id}`).emit("grade_updated", {
        attemptId: attempt.id,
        puntaje: attempt.puntaje,
        porcentaje: attempt.porcentaje,
        notaFinal: attempt.notaFinal,
        retroalimentacion: attempt.retroalimentacion,
        calificacionPendiente: attempt.calificacionPendiente,
      });
    }

    return {
      id: attempt.id,
      puntaje: attempt.puntaje,
      puntajeMaximo: attempt.puntajeMaximo,
      porcentaje: attempt.porcentaje,
      notaFinal: attempt.notaFinal,
      retroalimentacion: attempt.retroalimentacion,
      calificacionPendiente: attempt.calificacionPendiente,
    };
  }
}
