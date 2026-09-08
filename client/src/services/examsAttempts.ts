import { examsAttemptsApi } from "./api";

export const examsAttemptsService = {
  async startAttempt(data: {
    codigo_examen: string;
    nombre_estudiante?: string;
    correo_estudiante?: string;
    identificacion_estudiante?: string;
    contrasena?: string;
  }) {
    const response = await examsAttemptsApi.post("/attempt/start", data);
    return response.data;
  },

  async checkDuplicate(data: { codigo_examen: string; correo_estudiante?: string; identificacion_estudiante?: string }) {
    const response = await examsAttemptsApi.post("/attempt/check-duplicate", data);
    return response.data;
  },

  async resumeAttempt(data: { codigo_acceso: string }) {
    const response = await examsAttemptsApi.post("/attempt/resume", data);
    return response.data;
  },

  async getActiveAttemptsByExam(examId: number) {
    const response = await examsAttemptsApi.get(`/${examId}/active-attempts`);
    return response.data;
  },
  async unlockAttempt(attemptId: number) {
    const response = await examsAttemptsApi.post(
      `/attempt/${attemptId}/unlock`,
    );
    return response.data;
  },
  async unlockAllAttempts(examId: number) {
    const response = await examsAttemptsApi.post(`/${examId}/unlock-all`);
    return response.data;
  },

  getAttemptEvents: async (attemptId: number) => {
    try {
      const response = await examsAttemptsApi.get(
        `/attempt/${attemptId}/events`,
      );
      return response.data;
    } catch (error: any) {
      console.error("Error obteniendo eventos:", error);
      throw error;
    }
  },

  markEventsAsRead: async (attemptId: number) => {
    try {
      await examsAttemptsApi.patch(`/attempt/${attemptId}/events/read`);
    } catch (error: any) {
      console.error("Error marcando eventos como leídos:", error);
      throw error;
    }
  },

  async deleteAttemptEvents(attemptId: number) {
    const response = await examsAttemptsApi.delete(`/attempt/${attemptId}/events`);
    return response.data;
  },

  async deleteAttempt(attemptId: number) {
    const response = await examsAttemptsApi.delete(`/attempt/${attemptId}`);
    return response.data;
  },

  async forceFinishExam(examId: number) {
    const response = await examsAttemptsApi.post(`/${examId}/force-finish`);
    return response.data;
  },

  async removeTimeLimit(examId: number) {
    const response = await examsAttemptsApi.patch(`/${examId}/remove-time-limit`);
    return response.data;
  },

  async forceFinishAttempt(attemptId: number) {
    const response = await examsAttemptsApi.post(`/attempt/${attemptId}/force-finish`);
    return response.data;
  },

  async getAttemptCount(examId: number): Promise<number> {
    const response = await examsAttemptsApi.get(`/${examId}/attempt-count`);
    return response.data.count;
  },

  async downloadGrades(examId: number): Promise<Blob> {
    const response = await examsAttemptsApi.get(`/${examId}/grades/download`, {
      responseType: 'blob',
    });
    return response.data;
  },

  async sendGrades(examId: number): Promise<{ message: string }> {
    const response = await examsAttemptsApi.post(`/${examId}/grades/send-email`);
    return response.data;
  },

  async getAttemptDetails(intentoId: number) {
    const response = await examsAttemptsApi.get(`/attempt/${intentoId}/details`);
    return response.data;
  },

  async updateManualGrade(respuestaId: number, data: { puntaje?: number; retroalimentacion?: string }) {
    const response = await examsAttemptsApi.patch(`/answer/${respuestaId}/manual-grade`, data);
    return response.data;
  },

  async gradeUnansweredQuestion(intentoId: number, data: { pregunta_id: number; puntaje: number; retroalimentacion?: string }) {
    const response = await examsAttemptsApi.post(`/attempt/${intentoId}/grade-unanswered`, data);
    return response.data;
  },

  async updatePDFAttemptGrade(intentoId: number, data: { puntaje?: number; retroalimentacion?: string }) {
    const response = await examsAttemptsApi.patch(`/attempt/${intentoId}/pdf-grade`, data);
    return response.data;
  },

  async getAttemptFeedback(codigoRevision: string) {
    const response = await examsAttemptsApi.get(`/attempt/feedback/${codigoRevision}`);
    return response.data;
  },

  async uploadAnswerFile(
    intentoId: number,
    preguntaId: number,
    file: File,
  ): Promise<{ fileName: string; originalName: string; mimeType: string; size: number }> {
    const formData = new FormData();
    formData.append("pregunta_id", String(preguntaId));
    formData.append("file", file);
    // La instancia fuerza Content-Type: application/json por defecto, lo que
    // haría que axios serialice el FormData como JSON. Se limpia aquí para
    // que el navegador genere el boundary multipart/form-data automáticamente.
    // Timeout ampliado por el tamaño del archivo (hasta 20MB).
    const response = await examsAttemptsApi.post(
      `/attempt/${intentoId}/answer-file`,
      formData,
      { headers: { "Content-Type": undefined }, timeout: 60000 },
    );
    return response.data;
  },
};
