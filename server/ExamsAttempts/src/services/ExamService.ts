import { Server } from "socket.io";
import { ExamAttempt } from "../models/ExamAttempt";
import { AttemptEvent } from "../models/ExamEvent";
import { ExamInProgress } from "../models/ExamInProgress";
import { CreateExamAnswerDto } from "../dtos/Create-ExamAnswer.dto";
import { CreateExamEventDto } from "../dtos/Create-ExamEvent.dto";
import { StartExamAttemptDto } from "../dtos/Start-ExamAttempt.dto";
import { ResumeExamAttemptDto } from "../dtos/Resume-ExamAttempt.dto";
import { AttemptLifecycleService } from "./AttemptLifecycleService";
import { AnswerService } from "./AnswerService";
import { SecurityEventService } from "./SecurityEventService";
import { ScoringService } from "./ScoringService";
import { AttemptQueryService } from "./AttemptQueryService";

/**
 * Fachada que delega a servicios especializados.
 * Mantiene la interfaz pública original para que controllers y SocketHandler no cambien.
 */
export class ExamService {
  // ── Ciclo de vida ──
  static startAttempt(data: StartExamAttemptDto, io: Server) {
    return AttemptLifecycleService.startAttempt(data, io);
  }
  static checkDuplicate(codigo_examen: string, correo?: string, identificacion?: string) {
    return AttemptLifecycleService.checkDuplicate(codigo_examen, correo, identificacion);
  }
  static resumeAttempt(data: ResumeExamAttemptDto, io: Server) {
    return AttemptLifecycleService.resumeAttempt(data, io);
  }
  static finishAttempt(intento_id: number, io: Server) {
    return AttemptLifecycleService.finishAttempt(intento_id, io);
  }
  static handleTimeExpired(
    attempt: ExamAttempt,
    examInProgress: ExamInProgress,
    io: Server,
  ) {
    return AttemptLifecycleService.handleTimeExpired(
      attempt,
      examInProgress,
      io,
    );
  }
  static abandonAttempt(intento_id: number, io: Server) {
    return AttemptLifecycleService.abandonAttempt(intento_id, io);
  }
  static deleteAttempt(attemptId: number, io?: Server) {
    return AttemptLifecycleService.deleteAttempt(attemptId, io);
  }
  static saveQuestionOrder(attemptId: number, questionIds: number[]) {
    return AttemptLifecycleService.saveQuestionOrder(attemptId, questionIds);
  }

  // ── Respuestas y calificación manual ──
  static saveAnswer(data: CreateExamAnswerDto, io: Server) {
    return AnswerService.saveAnswer(data, io);
  }
  static updateManualGrade(
    respuesta_id: number,
    puntaje?: number,
    retroalimentacion?: string,
    io?: Server,
  ) {
    return AnswerService.updateManualGrade(
      respuesta_id,
      puntaje,
      retroalimentacion,
      io,
    );
  }
  static gradeUnansweredQuestion(
    intento_id: number,
    pregunta_id: number,
    puntaje: number,
    retroalimentacion?: string,
    io?: Server,
  ) {
    return AnswerService.gradeUnansweredQuestion(intento_id, pregunta_id, puntaje, retroalimentacion, io);
  }
  static updatePDFAttemptGrade(
    intento_id: number,
    puntaje?: number,
    retroalimentacion?: string,
    io?: Server,
  ) {
    return AnswerService.updatePDFAttemptGrade(
      intento_id,
      puntaje,
      retroalimentacion,
      io,
    );
  }

  // ── Eventos de seguridad ──
  static createEvent(data: CreateExamEventDto, io: Server) {
    return SecurityEventService.createEvent(data, io);
  }
  static applyConsequence(
    attempt: ExamAttempt,
    examInProgress: ExamInProgress,
    evento: AttemptEvent,
    io: Server,
  ) {
    return SecurityEventService.applyConsequence(
      attempt,
      examInProgress,
      evento,
      io,
    );
  }
  static unlockAttempt(intento_id: number, io: Server) {
    return SecurityEventService.unlockAttempt(intento_id, io);
  }
  static unlockAllBlockedAttempts(examId: number, io: Server) {
    return SecurityEventService.unlockAllBlockedAttempts(examId, io);
  }
  static notifyConnectionLost(attemptId: number, io: Server) {
    return SecurityEventService.notifyConnectionLost(attemptId, io);
  }
  static getAttemptEvents(attemptId: number) {
    return SecurityEventService.getAttemptEvents(attemptId);
  }
  static markEventsAsRead(attemptId: number, io: Server) {
    return SecurityEventService.markEventsAsRead(attemptId, io);
  }
  static deleteAttemptEvents(attemptId: number, io?: Server) {
    return SecurityEventService.deleteAttemptEvents(attemptId, io);
  }

  // ── Calificación automática y envío forzado ──
  static calculateScore(attempt: ExamAttempt) {
    return ScoringService.calculateScore(attempt);
  }
  static forceFinishActiveAttempts(examId: number, io: Server) {
    return ScoringService.forceFinishActiveAttempts(examId, io);
  }
  static forceFinishSingleAttempt(attemptId: number, io: Server) {
    return ScoringService.forceFinishSingleAttempt(attemptId, io);
  }
  static finishByExamClose(examId: number, io: Server) {
    return ScoringService.finishByExamClose(examId, io);
  }
  static removeTimeLimit(examId: number, io: Server) {
    return ScoringService.removeTimeLimit(examId, io);
  }
  static sendGradesEmail(examId: number, io: Server) {
    return ScoringService.sendGradesEmail(examId, io);
  }

  // ── Consultas y reportes ──
  static getAttemptDetails(intento_id: number) {
    return AttemptQueryService.getAttemptDetails(intento_id);
  }
  static getAttemptFeedback(codigo_acceso: string) {
    return AttemptQueryService.getAttemptFeedback(codigo_acceso);
  }
  static regenerateReviewCode(intento_id: number) {
    return AttemptQueryService.regenerateReviewCode(intento_id);
  }
  static getActiveAttemptsByExam(examId: number) {
    return AttemptQueryService.getActiveAttemptsByExam(examId);
  }
  static getAttemptCountByExam(examId: number) {
    return AttemptQueryService.getAttemptCountByExam(examId);
  }
  static getGradesForDownload(examId: number) {
    return AttemptQueryService.getGradesForDownload(examId);
  }
}
