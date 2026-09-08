import { Request, Response, NextFunction } from "express";
import { ExamService } from "../services/ExamService";
import { validateDTO, throwValidationErrors } from "../validators/common";
import { CreateExamAttemptDto } from "../dtos/Create-Examttempt.dto";
import { CreateExamAnswerDto } from "../dtos/Create-ExamAnswer.dto";
import { CreateExamEventDto } from "../dtos/Create-ExamEvent.dto";
import { StartExamAttemptDto } from "../dtos/Start-ExamAttempt.dto";
import { ResumeExamAttemptDto } from "../dtos/Resume-ExamAttempt.dto";
import { UpdateManualGradeDto } from "../dtos/Update-ManualGrade.dto";
import { UpdatePDFGradeDto } from "../dtos/Update-PDFGrade.dto";
import { TipoRespuesta } from "../models/ExamAnswer";
import { answerFileService } from "../services/AnswerFileService";

export class ExamController {
  static async startAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = await validateDTO(StartExamAttemptDto, req.body);
      if (errors.length) throwValidationErrors(errors);

      const result = await ExamService.startAttempt(
        req.body,
        req.app.get("io"),
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async resumeAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = await validateDTO(ResumeExamAttemptDto, req.body);
      if (errors.length) throwValidationErrors(errors);

      const result = await ExamService.resumeAttempt(
        req.body,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async saveAnswer(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = await validateDTO(CreateExamAnswerDto, req.body);
      if (errors.length) throwValidationErrors(errors);

      const result = await ExamService.saveAnswer(req.body, req.app.get("io"));
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async createEvent(req: Request, res: Response, next: NextFunction) {
    try {
      const errors = await validateDTO(CreateExamEventDto, req.body);
      if (errors.length) throwValidationErrors(errors);

      const result = await ExamService.createEvent(req.body, req.app.get("io"));
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async finishAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const intento_id = Number(req.params.intento_id);

      if (isNaN(intento_id)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.finishAttempt(
        intento_id,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async checkDuplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const { codigo_examen, correo_estudiante, identificacion_estudiante } = req.body;
      await ExamService.checkDuplicate(codigo_examen, correo_estudiante, identificacion_estudiante);
      res.status(200).json({ ok: true });
    } catch (err) {
      next(err);
    }
  }

  static async unlockAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const intento_id = Number(req.params.intento_id);

      if (isNaN(intento_id)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.unlockAttempt(
        intento_id,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async unlockAllAttempts(req: Request, res: Response, next: NextFunction) {
    try {
      const examId = Number(req.params.examId);
      if (isNaN(examId)) return res.status(400).json({ message: "ID de examen inválido" });
      const result = await ExamService.unlockAllBlockedAttempts(examId, req.app.get("io"));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getActiveAttemptsByExam(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const examId = Number(req.params.examId);

      if (isNaN(examId)) {
        return res.status(400).json({ message: "ID de examen inválido" });
      }

      const attempts = await ExamService.getActiveAttemptsByExam(examId);
      res.status(200).json(attempts);
    } catch (err) {
      next(err);
    }
  }

  static async abandonAttempt(req: Request, res: Response, next: NextFunction) {
    try {
      const intento_id = Number(req.params.intento_id);

      if (isNaN(intento_id)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.abandonAttempt(
        intento_id,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getAttemptEvents(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const attemptId = Number(req.params.attemptId);

      if (isNaN(attemptId)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const events = await ExamService.getAttemptEvents(attemptId);
      res.status(200).json(events);
    } catch (err) {
      next(err);
    }
  }
  static async markEventsAsRead(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const attemptId = Number(req.params.attemptId);

      if (isNaN(attemptId)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.markEventsAsRead(
        attemptId,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getAttemptDetails(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const intento_id = Number(req.params.intento_id);

      if (isNaN(intento_id)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const details = await ExamService.getAttemptDetails(intento_id);
      res.status(200).json(details);
    } catch (err) {
      next(err);
    }
  }

  static async updateManualGrade(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const respuesta_id = Number(req.params.respuesta_id);

      if (isNaN(respuesta_id)) {
        return res.status(400).json({ message: "ID de respuesta inválido" });
      }

      const errors = await validateDTO(UpdateManualGradeDto, req.body);
      if (errors.length) throwValidationErrors(errors);

      const result = await ExamService.updateManualGrade(
        respuesta_id,
        req.body.puntaje,
        req.body.retroalimentacion,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async gradeUnansweredQuestion(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const intento_id = Number(req.params.intento_id);
      if (isNaN(intento_id)) return res.status(400).json({ message: "ID de intento inválido" });

      const { pregunta_id, puntaje, retroalimentacion } = req.body;
      if (typeof pregunta_id !== "number" || typeof puntaje !== "number") {
        return res.status(400).json({ message: "pregunta_id y puntaje son requeridos y deben ser números" });
      }

      const result = await ExamService.gradeUnansweredQuestion(
        intento_id,
        pregunta_id,
        puntaje,
        retroalimentacion,
        req.app.get("io"),
      );
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async updatePDFAttemptGrade(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const intento_id = Number(req.params.intento_id);

      if (isNaN(intento_id)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const errors = await validateDTO(UpdatePDFGradeDto, req.body);
      if (errors.length) throwValidationErrors(errors);

      const result = await ExamService.updatePDFAttemptGrade(
        intento_id,
        req.body.puntaje,
        req.body.retroalimentacion,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async finishByExamClose(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const examId = Number(req.params.examId);
      if (isNaN(examId)) {
        return res.status(400).json({ message: "ID de examen inválido" });
      }
      const result = await ExamService.finishByExamClose(examId, req.app.get("io"));
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async forceFinishActiveAttempts(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const examId = Number(req.params.examId);

      if (isNaN(examId)) {
        return res.status(400).json({ message: "ID de examen inválido" });
      }

      const result = await ExamService.forceFinishActiveAttempts(
        examId,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteAttemptEvents(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const attemptId = Number(req.params.attemptId);

      if (isNaN(attemptId)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.deleteAttemptEvents(
        attemptId,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async forceFinishSingleAttempt(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const attemptId = Number(req.params.attemptId);

      if (isNaN(attemptId)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.forceFinishSingleAttempt(
        attemptId,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async deleteAttempt(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const attemptId = Number(req.params.attemptId);

      if (isNaN(attemptId)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.deleteAttempt(
        attemptId,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async getAttemptCountByExam(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const examId = Number(req.params.examId);

      if (isNaN(examId)) {
        return res.status(400).json({ message: "ID de examen inválido" });
      }

      const count = await ExamService.getAttemptCountByExam(examId);
      res.status(200).json({ count });
    } catch (err) {
      next(err);
    }
  }

  static async downloadGrades(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const examId = Number(req.params.examId);

      if (isNaN(examId)) {
        return res.status(400).json({ message: "ID de examen inválido" });
      }

      const { buffer, examName } = await ExamService.getGradesForDownload(examId);

      const safeName = examName
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-zA-Z0-9_\- ]/g, "")
        .trim()
        .replace(/\s+/g, "_");
      const filename = `notas_${safeName}.xlsx`;

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${filename}"`,
      );
      res.status(200).send(buffer);
    } catch (err) {
      next(err);
    }
  }

  static async sendGrades(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const examId = Number(req.params.examId);
      if (isNaN(examId)) {
        return res.status(400).json({ message: "ID de examen inválido" });
      }
      const io = req.app.get("io");

      res.status(202).json({ message: "Enviando correos en segundo plano..." });

      ExamService.sendGradesEmail(examId, io)
        .then((result) => {
          io.to(`exam_${examId}`).emit("grades_email_done", result);
        })
        .catch((err) => {
          console.error("Error enviando correos en background:", err);
          io.to(`exam_${examId}`).emit("grades_email_done", {
            enviados: 0,
            errores: -1,
            sinCorreo: 0,
            error: err?.message || "Error desconocido",
          });
        });
    } catch (err) {
      next(err);
    }
  }

  static async getAttemptFeedback(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { codigo_acceso } = req.params;

      if (!codigo_acceso || typeof codigo_acceso !== "string") {
        return res.status(400).json({ message: "Código de acceso inválido" });
      }

      const result = await ExamService.getAttemptFeedback(codigo_acceso);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async saveQuestionOrder(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const attemptId = Number(req.params.attemptId);

      if (isNaN(attemptId)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const { questionIds } = req.body;

      if (!Array.isArray(questionIds)) {
        return res.status(400).json({ message: "questionIds debe ser un array" });
      }

      const result = await ExamService.saveQuestionOrder(attemptId, questionIds);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async removeTimeLimit(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const examId = Number(req.params.examId);

      if (isNaN(examId)) {
        return res.status(400).json({ message: "ID de examen inválido" });
      }

      const result = await ExamService.removeTimeLimit(examId, req.app.get("io"));

      // Detener timers en memoria del SocketHandler para cada intento afectado
      const socketHandler = req.app.get("socketHandler");
      if (socketHandler && result.intentoIds) {
        for (const intentoId of result.intentoIds) {
          socketHandler.stopTimer(intentoId);
        }
      }

      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async notifyConnectionLost(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const attemptId = Number(req.params.attemptId);

      if (isNaN(attemptId)) {
        return res.status(400).json({ message: "ID de intento inválido" });
      }

      const result = await ExamService.notifyConnectionLost(
        attemptId,
        req.app.get("io"),
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  }

  static async notifyProfessor(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      const { profesorId, event, data } = req.body;

      if (!profesorId || !event) {
        return res.status(400).json({ message: "profesorId y event son requeridos" });
      }

      const socketHandler = req.app.get("socketHandler");
      if (socketHandler) {
        socketHandler.emitToProfessor(Number(profesorId), event, data);
      }

      res.status(200).json({ message: "Notificación enviada" });
    } catch (err) {
      next(err);
    }
  }

  static async uploadAnswerFile(
    req: Request,
    res: Response,
    next: NextFunction,
  ) {
    try {
      if (!req.file) {
        return res.status(400).json({ message: "No se proporcionó ningún archivo" });
      }

      const intento_id = Number(req.params.intento_id);
      const pregunta_id = Number(req.body.pregunta_id);

      if (!intento_id || !pregunta_id) {
        return res
          .status(400)
          .json({ message: "Falta intento_id o pregunta_id" });
      }

      const fileInfo = await answerFileService.saveAnswerFile(req.file);

      const payload = {
        pregunta_id,
        intento_id,
        respuesta: JSON.stringify(fileInfo.fileName),
        fecha_respuesta: new Date(),
        tipo_respuesta: TipoRespuesta.ARCHIVO,
        metadata_codigo: JSON.stringify({
          originalName: fileInfo.originalName,
          mimeType: fileInfo.mimeType,
          size: fileInfo.size,
        }),
      };

      const errors = await validateDTO(CreateExamAnswerDto, payload);
      if (errors.length) throwValidationErrors(errors);

      const result = await ExamService.saveAnswer(
        payload as CreateExamAnswerDto,
        req.app.get("io"),
      );

      res.status(201).json({
        message: "Archivo subido exitosamente",
        fileName: fileInfo.fileName,
        originalName: fileInfo.originalName,
        mimeType: fileInfo.mimeType,
        size: fileInfo.size,
        answer: result,
      });
    } catch (err) {
      next(err);
    }
  }

  static async getAnswerFile(req: Request, res: Response, next: NextFunction) {
    try {
      const fileName = String(req.params.fileName);
      const filePath = await answerFileService.resolveAnswerFilePath(fileName);
      if (!filePath) {
        return res.status(404).json({ message: "Archivo no encontrado" });
      }

      const originalName = typeof req.query.name === "string" ? req.query.name : undefined;
      if (originalName) {
        return res.download(filePath, originalName);
      }
      return res.sendFile(filePath);
    } catch (err) {
      next(err);
    }
  }
}
