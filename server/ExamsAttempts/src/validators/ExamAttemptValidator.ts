import { AppDataSource } from "../data-source/AppDataSource";
import { ExamInProgress } from "../models/ExamInProgress";
import { throwHttpError } from "../utils/errors";
import { internalHttpClient } from "../utils/httpClient";

const EXAM_MS_URL = process.env.EXAM_MS_URL;

// Caché en memoria para datos del examen — evita llamadas repetidas al Exams MS
// bajo alta concurrencia. TTL de 60 s: los datos del examen no cambian durante
// una sesión activa, por lo que este margen es seguro.
const EXAM_CACHE_TTL_MS = 60_000;
const examCacheByCode = new Map<string, { data: any; expiresAt: number }>();
const examCacheById   = new Map<number, { data: any; expiresAt: number }>();

export class ExamAttemptValidator {
  static async validateExamExists(codigo_examen: string) {
    const now = Date.now();
    const cached = examCacheByCode.get(codigo_examen);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      const response = await internalHttpClient.get(
        `${EXAM_MS_URL}/api/exams/forAttempt/${codigo_examen}`,
      );
      examCacheByCode.set(codigo_examen, { data: response.data, expiresAt: now + EXAM_CACHE_TTL_MS });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throwHttpError("El código de examen no existe", 404);
      }
      throwHttpError("Error al validar el examen", 500);
    }
  }

  static async validateExamExistsById(examen_id: number) {
    const now = Date.now();
    const cached = examCacheById.get(examen_id);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }

    try {
      const response = await internalHttpClient.get(
        `${EXAM_MS_URL}/api/exams/by-id/${examen_id}`,
      );
      examCacheById.set(examen_id, { data: response.data, expiresAt: now + EXAM_CACHE_TTL_MS });
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        throwHttpError("El código de examen no existe", 404);
      }
      throwHttpError("Error al validar el examen", 500);
    }
  }

  // Invalida la caché de un examen específico — llamar cuando el profesor
  // cierra o modifica el examen para que el cambio sea inmediato.
  static invalidateCache(examen_id?: number, codigo_examen?: string) {
    if (examen_id)    examCacheById.delete(examen_id);
    if (codigo_examen) examCacheByCode.delete(codigo_examen);
  }

  static validateExamState(exam: any) {
    if (exam.estado === "archivado") {
      throwHttpError(
        "No se puede presentar el examen porque ha sido archivado",
        403,
      );
    }

    if (exam.estado !== "open") {
      throwHttpError(
        "No se puede presentar el examen porque está cerrado",
        403,
      );
    }
  }

  static validateRequiredStudentData(
    exam: any,
    nombre?: string,
    correo?: string,
    identificacion?: string,
  ) {
    const errors: string[] = [];

    if (exam.necesitaNombreCompleto && !nombre) {
      errors.push("El nombre completo es requerido");
    }

    if (exam.necesitaCorreoElectrónico && !correo) {
      errors.push("El correo electrónico es requerido");
    }

    if (exam.necesitaCodigoEstudiantil && !identificacion) {
      errors.push("La identificación del estudiante es requerida");
    }

    if (errors.length > 0) {
      throwHttpError(errors.join(", "), 400);
    }
  }

  static validateExamPassword(exam: any, providedPassword?: string) {
    if (exam.necesitaContrasena) {
      if (!providedPassword) {
        throwHttpError("Se requiere contraseña para este examen", 400);
      }
      if (exam.contrasena !== providedPassword) {
        throwHttpError("Contraseña incorrecta", 401);
      }
    }
  }

  static async validateSessionUniqueness(
    codigo_acceso: string,
    id_sesion: string,
  ) {
    const repo = AppDataSource.getRepository(ExamInProgress);
    const examInProgress = await repo.findOne({
      where: { codigo_acceso },
    });

    if (!examInProgress) {
      throwHttpError("Código de acceso inválido", 404);
    }

    if (examInProgress.id_sesion !== id_sesion) {
      throwHttpError(
        "Ya existe una sesión activa para este intento. Solo puede haber un usuario conectado",
        409,
      );
    }

    return examInProgress;
  }

  static validateTimeLimit(exam: any, fecha_inicio: Date): number | null {
    let expirationMs: number | null = null;

    if (exam.limiteTiempo > 0) {
      const tiempoLimiteMs = exam.limiteTiempo * 60 * 1000;
      expirationMs = fecha_inicio.getTime() + tiempoLimiteMs;
    }

    if (exam.horaCierre) {
      const horaCierreMs = new Date(exam.horaCierre).getTime();
      if (expirationMs === null || horaCierreMs < expirationMs) {
        expirationMs = horaCierreMs;
      }
    }

    return expirationMs;
  }
}
