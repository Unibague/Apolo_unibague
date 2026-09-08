import { Router } from "express";
import { ExamController } from "../controllers/ExamController";
import { uploadAnswerFile } from "../middlewares/uploadAnswerFile";

const router = Router();

/**
 * @openapi
 * /api/exam/attempt/start:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Iniciar un nuevo intento de examen
 *     description: Permite a un estudiante iniciar un nuevo intento de examen proporcionando el código del examen y sus datos personales (si son requeridos).
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/StartExamAttemptDto'
 *     responses:
 *       201:
 *         description: Intento iniciado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 attempt:
 *                   $ref: '#/components/schemas/ExamAttempt'
 *                 examInProgress:
 *                   type: object
 *                   properties:
 *                     codigo_acceso:
 *                       type: string
 *                       example: 'XYZ789'
 *                     id_sesion:
 *                       type: string
 *                       example: 'session-uuid-123'
 *                     fecha_expiracion:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                 exam:
 *                   type: object
 *                   description: Información del examen
 *       400:
 *         description: Datos inválidos o examen no disponible
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Examen no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/attempt/start", ExamController.startAttempt);
router.post("/attempt/check-duplicate", ExamController.checkDuplicate);

/**
 * @openapi
 * /api/exam/attempt/resume:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Reanudar un intento de examen existente
 *     description: Permite a un estudiante reanudar un intento de examen usando su código de acceso y sesión.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/ResumeExamAttemptDto'
 *     responses:
 *       200:
 *         description: Intento reanudado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 attempt:
 *                   $ref: '#/components/schemas/ExamAttempt'
 *                 examInProgress:
 *                   type: object
 *                 exam:
 *                   type: object
 *       403:
 *         description: Intento bloqueado o expirado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/attempt/resume", ExamController.resumeAttempt);

/**
 * @openapi
 * /api/exam/answer:
 *   post:
 *     tags:
 *       - Answers
 *     summary: Guardar o actualizar una respuesta
 *     description: Permite al estudiante guardar o actualizar su respuesta a una pregunta del examen.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExamAnswerDto'
 *     responses:
 *       201:
 *         description: Respuesta guardada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExamAnswer'
 *       400:
 *         description: Datos inválidos
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No se pueden guardar respuestas en este intento (bloqueado o finalizado)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/answer", ExamController.saveAnswer);

/**
 * @openapi
 * /api/exam/attempt/{intento_id}/answer-file:
 *   post:
 *     tags:
 *       - Answers
 *     summary: Subir un archivo como respuesta (pregunta tipo "Subir archivo")
 *     description: Sube el archivo entregado por el estudiante para una pregunta de tipo "file_upload" y la guarda como su respuesta (calificación siempre manual).
 *     parameters:
 *       - in: path
 *         name: intento_id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - pregunta_id
 *               - file
 *             properties:
 *               pregunta_id:
 *                 type: integer
 *               file:
 *                 type: string
 *                 format: binary
 *     responses:
 *       201:
 *         description: Archivo subido y guardado como respuesta
 *       400:
 *         description: Datos inválidos, archivo faltante o tipo no permitido
 *       403:
 *         description: No se pueden guardar respuestas en este intento
 *       404:
 *         description: Intento no encontrado
 */
router.post(
  "/attempt/:intento_id/answer-file",
  uploadAnswerFile.single("file"),
  ExamController.uploadAnswerFile,
);

/**
 * @openapi
 * /api/exam/answer-file/{fileName}:
 *   get:
 *     tags:
 *       - Answers
 *     summary: Descargar/ver el archivo entregado por un estudiante
 *     parameters:
 *       - in: path
 *         name: fileName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Nombre original con el que se debe descargar el archivo
 *     responses:
 *       200:
 *         description: Archivo retornado (stream del archivo local)
 *       404:
 *         description: Archivo no encontrado
 */
router.get("/answer-file/:fileName", ExamController.getAnswerFile);

/**
 * @openapi
 * /api/exam/event:
 *   post:
 *     tags:
 *       - Events
 *     summary: Registrar un evento de seguridad
 *     description: Registra eventos de seguridad como cambio de pestaña, salida de pantalla completa, etc.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/CreateExamEventDto'
 *     responses:
 *       201:
 *         description: Evento registrado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: number
 *                 tipo_evento:
 *                   type: string
 *                 fecha_envio:
 *                   type: string
 *                   format: date-time
 *                 intento_id:
 *                   type: number
 *                 leido:
 *                   type: boolean
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/event", ExamController.createEvent);

/**
 * @openapi
 * /api/exam/attempt/{intento_id}/finish:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Finalizar un intento de examen
 *     description: Finaliza el intento de examen, calcula el puntaje total y actualiza el estado a 'finished'.
 *     parameters:
 *       - in: path
 *         name: intento_id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento
 *     responses:
 *       200:
 *         description: Intento finalizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExamAttempt'
 *       400:
 *         description: El examen ya fue finalizado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: No puedes finalizar un examen bloqueado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/attempt/:intento_id/finish", ExamController.finishAttempt);

/**
 * @openapi
 * /api/exam/attempt/{intento_id}/unlock:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Desbloquear un intento bloqueado (solo profesor)
 *     description: |
 *       Permite al profesor desbloquear un intento que fue bloqueado por actividad sospechosa.
 *       Actualiza el estado a 'active' en ambas tablas (exams_attempts y exams_in_progress).
 *       Notifica al estudiante vía WebSocket para que pueda continuar el examen sin perder progreso.
 *     parameters:
 *       - in: path
 *         name: intento_id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento a desbloquear
 *     responses:
 *       200:
 *         description: Intento desbloqueado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Intento desbloqueado exitosamente'
 *                 codigo_acceso:
 *                   type: string
 *                   example: 'ABC123'
 *                 estado:
 *                   type: string
 *                   enum: [active]
 *                   example: 'active'
 *                 attemptId:
 *                   type: number
 *                   example: 48
 *                 estudiante:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: 'Juan Pérez'
 *                     correo:
 *                       type: string
 *                       example: 'juan@example.com'
 *                     identificacion:
 *                       type: string
 *                       example: '123456'
 *       400:
 *         description: El intento no está bloqueado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               not_blocked:
 *                 value:
 *                   message: 'El intento no está bloqueado'
 *       404:
 *         description: Intento no encontrado o ExamInProgress no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/attempt/:intento_id/unlock", ExamController.unlockAttempt);

/**
 * @openapi
 * /api/exam/attempt/{intento_id}/abandon:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Abandonar un intento de examen
 *     description: Marca el intento como abandonado cuando el estudiante cierra el examen sin finalizarlo.
 *     parameters:
 *       - in: path
 *         name: intento_id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento
 *     responses:
 *       200:
 *         description: Intento marcado como abandonado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExamAttempt'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post("/attempt/:intento_id/abandon", ExamController.abandonAttempt);

/**
 * @openapi
 * /api/exam/{examId}/active-attempts:
 *   get:
 *     tags:
 *       - Attempts
 *     summary: Obtener todos los intentos de un examen
 *     description: Obtiene la lista de todos los intentos (activos, finalizados, bloqueados) de un examen específico.
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del examen
 *     responses:
 *       200:
 *         description: Lista de intentos obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   nombre_estudiante:
 *                     type: string
 *                   correo_estudiante:
 *                     type: string
 *                   identificacion_estudiante:
 *                     type: string
 *                   estado:
 *                     type: string
 *                     enum: [active, finished, blocked, abandonado]
 *                   fecha_inicio:
 *                     type: string
 *                     format: date-time
 *                   tiempoTranscurrido:
 *                     type: string
 *                   progreso:
 *                     type: number
 *                   alertas:
 *                     type: number
 *                   alertasNoLeidas:
 *                     type: number
 *                   codigo_acceso:
 *                     type: string
 *                   fecha_expiracion:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *       400:
 *         description: ID de examen inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/:examId/active-attempts", ExamController.getActiveAttemptsByExam);

/**
 * @openapi
 * /api/exam/attempt/{attemptId}/events:
 *   get:
 *     tags:
 *       - Events
 *     summary: Obtener eventos de un intento
 *     description: Obtiene todos los eventos de seguridad registrados para un intento específico.
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento
 *     responses:
 *       200:
 *         description: Lista de eventos obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: number
 *                   tipo_evento:
 *                     type: string
 *                   fecha_envio:
 *                     type: string
 *                     format: date-time
 *                   leido:
 *                     type: boolean
 *       400:
 *         description: ID de intento inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get("/attempt/:attemptId/events", ExamController.getAttemptEvents);

/**
 * @openapi
 * /api/exam/attempt/{attemptId}/events/read:
 *   patch:
 *     tags:
 *       - Events
 *     summary: Marcar eventos como leídos
 *     description: Marca todos los eventos no leídos de un intento como leídos.
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento
 *     responses:
 *       200:
 *         description: Eventos marcados como leídos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Alertas marcadas como leídas'
 *       400:
 *         description: ID de intento inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch("/attempt/:attemptId/events/read", ExamController.markEventsAsRead);

router.patch("/attempt/:attemptId/question-order", ExamController.saveQuestionOrder);

/**
 * @openapi
 * /api/exam/attempt/{intento_id}/details:
 *   get:
 *     tags:
 *       - Attempts
 *     summary: Obtener detalles completos de un intento (para el profesor)
 *     description: Obtiene información detallada del intento incluyendo todas las respuestas, puntajes, retroalimentación, eventos y estadísticas.
 *     parameters:
 *       - in: path
 *         name: intento_id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento
 *     responses:
 *       200:
 *         description: Detalles del intento obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/AttemptDetails'
 *       400:
 *         description: ID de intento inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/attempt/:intento_id/details', ExamController.getAttemptDetails);

/**
 * @openapi
 * /api/exam/answer/{respuesta_id}/manual-grade:
 *   patch:
 *     tags:
 *       - Grading
 *     summary: Actualizar calificación manual y retroalimentación
 *     description: Permite al profesor actualizar manualmente el puntaje y/o agregar retroalimentación a una respuesta. El puntaje debe estar entre 0 y el máximo de la pregunta. Recalcula automáticamente el puntaje total del intento.
 *     parameters:
 *       - in: path
 *         name: respuesta_id
 *         required: true
 *         schema:
 *           type: number
 *         description: ID de la respuesta
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/UpdateManualGradeDto'
 *     responses:
 *       200:
 *         description: Calificación actualizada exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ExamAnswer'
 *       400:
 *         description: Puntaje inválido (negativo o mayor al máximo permitido)
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               puntaje_negativo:
 *                 value:
 *                   message: 'El puntaje no puede ser negativo'
 *               puntaje_excedido:
 *                 value:
 *                   message: 'El puntaje no puede exceder el máximo de la pregunta (5 puntos)'
 *       404:
 *         description: Respuesta no encontrada
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.patch('/answer/:respuesta_id/manual-grade', ExamController.updateManualGrade);
router.post('/attempt/:intento_id/grade-unanswered', ExamController.gradeUnansweredQuestion);

/**
 * @openapi
 * /api/exam/attempt/{intento_id}/pdf-grade:
 *   patch:
 *     tags:
 *       - Grading
 *     summary: Calificar intento de examen PDF (calificación general)
 *     description: |
 *       Permite al profesor asignar una calificación general (0-5) y retroalimentación
 *       a un intento de examen PDF. A diferencia de manual-grade que califica por pregunta,
 *       este endpoint califica el intento completo ya que los exámenes PDF no tienen preguntas individuales.
 *     parameters:
 *       - in: path
 *         name: intento_id
 *         required: true
 *         schema:
 *           type: integer
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               puntaje:
 *                 type: number
 *                 minimum: 0
 *                 maximum: 5
 *                 description: Puntaje global del intento (escala 0-5)
 *               retroalimentacion:
 *                 type: string
 *                 description: Retroalimentación general del profesor
 *     responses:
 *       200:
 *         description: Calificación actualizada exitosamente
 *       400:
 *         description: No es un examen PDF o datos inválidos
 *       404:
 *         description: Intento no encontrado
 */
router.patch('/attempt/:intento_id/pdf-grade', ExamController.updatePDFAttemptGrade);

/**
 * @openapi
 * /api/exam/{examId}/force-finish:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Forzar envío de todos los intentos activos (solo profesor)
 *     description: |
 *       Finaliza automáticamente todos los intentos activos de un examen.
 *       Califica cada intento con las respuestas que tenga hasta el momento y actualiza el estado a 'finished' en ambas tablas (exams_attempts y exams_in_progress).
 *       Notifica a cada estudiante que su examen fue forzado a terminar.
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del examen
 *     responses:
 *       200:
 *         description: Intentos finalizados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: '5 intentos activos han sido finalizados exitosamente'
 *                 finalizados:
 *                   type: number
 *                   example: 5
 *                 detalles:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       intentoId:
 *                         type: number
 *                         example: 48
 *                       estudiante:
 *                         type: object
 *                         properties:
 *                           nombre:
 *                             type: string
 *                             example: 'Juan Pérez'
 *                           correo:
 *                             type: string
 *                             example: 'juan@example.com'
 *                           identificacion:
 *                             type: string
 *                             example: '123456'
 *                       puntaje:
 *                         type: number
 *                         example: 7.5
 *                       puntajeMaximo:
 *                         type: number
 *                         example: 10
 *                       porcentaje:
 *                         type: number
 *                         example: 75
 *                       notaFinal:
 *                         type: number
 *                         example: 3.75
 *                       respuestasGuardadas:
 *                         type: number
 *                         description: Número de respuestas que el estudiante había guardado
 *                         example: 8
 *       400:
 *         description: ID de examen inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:examId/unlock-all', ExamController.unlockAllAttempts);
router.post('/:examId/force-finish', ExamController.forceFinishActiveAttempts);
router.post('/:examId/close-finish', ExamController.finishByExamClose);
router.patch('/:examId/remove-time-limit', ExamController.removeTimeLimit);

/**
 * @openapi
 * /api/exam/attempt/{attemptId}/force-finish:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Forzar envío de un intento específico (solo profesor)
 *     description: |
 *       Finaliza automáticamente un intento específico de examen.
 *       Califica el intento con las respuestas que tenga hasta el momento y actualiza el estado a 'finished'.
 *       Solo funciona con intentos en estado 'active'.
 *       Notifica al estudiante que su examen fue finalizado por el profesor.
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento a finalizar
 *     responses:
 *       200:
 *         description: Intento finalizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Intento finalizado exitosamente'
 *                 intentoId:
 *                   type: number
 *                   example: 48
 *                 estudiante:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: 'Juan Pérez'
 *                     correo:
 *                       type: string
 *                       example: 'juan@example.com'
 *                     identificacion:
 *                       type: string
 *                       example: '123456'
 *                 puntaje:
 *                   type: number
 *                   example: 7.5
 *                 puntajeMaximo:
 *                   type: number
 *                   example: 10
 *                 porcentaje:
 *                   type: number
 *                   example: 75
 *                 notaFinal:
 *                   type: number
 *                   example: 3.75
 *                 respuestasGuardadas:
 *                   type: number
 *                   description: Número de respuestas que el estudiante había guardado
 *                   example: 8
 *       400:
 *         description: ID de intento inválido o el intento no está en estado activo
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *             examples:
 *               not_active:
 *                 value:
 *                   message: 'El intento ya está en estado finished. Solo se pueden forzar intentos activos.'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/attempt/:attemptId/force-finish', ExamController.forceFinishSingleAttempt);

/**
 * @openapi
 * /api/exam/attempt/{attemptId}/events:
 *   delete:
 *     tags:
 *       - Events
 *     summary: Eliminar todas las alertas/eventos de un intento
 *     description: |
 *       Elimina todos los eventos de seguridad (alertas) registrados para un intento específico.
 *       Esta acción es útil cuando el profesor decide limpiar las alertas después de revisar un intento.
 *       Notifica a través de WebSocket sobre la eliminación.
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento
 *     responses:
 *       200:
 *         description: Eventos eliminados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Se eliminaron 5 evento(s) del intento'
 *                 deletedCount:
 *                   type: number
 *                   description: Cantidad de eventos eliminados
 *                   example: 5
 *                 attemptId:
 *                   type: number
 *                   description: ID del intento
 *                   example: 123
 *       400:
 *         description: ID de intento inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/attempt/:attemptId/events', ExamController.deleteAttemptEvents);

/**
 * @openapi
 * /api/exam/attempt/{attemptId}:
 *   delete:
 *     tags:
 *       - Attempts
 *     summary: Eliminar completamente un intento de examen (solo profesor)
 *     description: |
 *       Elimina permanentemente un intento de examen y todos sus datos relacionados.
 *       Esta acción elimina:
 *       - Todas las respuestas del intento (exam_answers)
 *       - Todos los eventos de seguridad (exam_events)
 *       - El registro de ExamInProgress
 *       - El intento completo (exam_attempts)
 *       Esta operación es irreversible y se ejecuta dentro de una transacción.
 *     parameters:
 *       - in: path
 *         name: attemptId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del intento a eliminar
 *     responses:
 *       200:
 *         description: Intento eliminado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: 'Intento eliminado exitosamente'
 *                 attemptId:
 *                   type: number
 *                   example: 48
 *                 estudiante:
 *                   type: object
 *                   properties:
 *                     nombre:
 *                       type: string
 *                       example: 'Juan Pérez'
 *                     correo:
 *                       type: string
 *                       example: 'juan@example.com'
 *                     identificacion:
 *                       type: string
 *                       example: '123456'
 *                 deletedData:
 *                   type: object
 *                   description: Resumen de datos eliminados
 *                   properties:
 *                     respuestas:
 *                       type: number
 *                       description: Cantidad de respuestas eliminadas
 *                       example: 10
 *                     eventos:
 *                       type: number
 *                       description: Cantidad de eventos eliminados
 *                       example: 5
 *                     examInProgress:
 *                       type: number
 *                       description: Registros de ExamInProgress eliminados
 *                       example: 1
 *       400:
 *         description: ID de intento inválido
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Intento no encontrado
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/attempt/:attemptId', ExamController.deleteAttempt);

/**
 * @openapi
 * /api/exam/{examId}/attempt-count:
 *   get:
 *     tags:
 *       - Attempts
 *     summary: Obtener cantidad de intentos de un examen
 *     description: Retorna la cantidad total de intentos (cualquier estado) para un examen específico.
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del examen
 *     responses:
 *       200:
 *         description: Cantidad obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 count:
 *                   type: number
 *       400:
 *         description: ID de examen inválido
 */
router.get('/:examId/attempt-count', ExamController.getAttemptCountByExam);

/**
 * @openapi
 * /api/exam/{examId}/grades/download:
 *   get:
 *     tags:
 *       - Grading
 *     summary: Descargar notas de todos los intentos de un examen (CSV)
 *     description: |
 *       Genera un archivo CSV con las notas de todos los intentos del examen.
 *       La columna de identificación del estudiante se elige según la configuración del examen:
 *       1. Código estudiantil (si fue requerido)
 *       2. Correo electrónico (si fue requerido y no se pidió código)
 *       3. Nombre (si no se pidió código ni correo)
 *       La calificación final se muestra en escala 0 a 5 con 2 decimales.
 *     parameters:
 *       - in: path
 *         name: examId
 *         required: true
 *         schema:
 *           type: number
 *         description: ID del examen
 *     responses:
 *       200:
 *         description: Archivo CSV descargado exitosamente
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *       404:
 *         description: No hay intentos registrados
 */
router.get('/:examId/grades/download', ExamController.downloadGrades);
router.post('/:examId/grades/send-email', ExamController.sendGrades);

/**
 * @openapi
 * /api/exam/attempt/feedback/{codigo_acceso}:
 *   get:
 *     tags:
 *       - Feedback
 *     summary: Ver retroalimentación completa de un intento finalizado (para el estudiante)
 *     description: |
 *       Permite al estudiante ver la retroalimentación completa de su examen finalizado
 *       usando su código de acceso. Incluye las respuestas correctas, puntajes por pregunta,
 *       retroalimentación del profesor, y calificación final.
 *       Solo disponible para intentos en estado 'finished'.
 *       No incluye eventos de seguridad.
 *     parameters:
 *       - in: path
 *         name: codigo_acceso
 *         required: true
 *         schema:
 *           type: string
 *         description: Código de acceso del intento
 *     responses:
 *       200:
 *         description: Retroalimentación obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 intento:
 *                   type: object
 *                   description: Información del intento con calificaciones
 *                 examen:
 *                   type: object
 *                   description: Información del examen
 *                 estadisticas:
 *                   type: object
 *                   description: Estadísticas del intento
 *                 preguntas:
 *                   type: array
 *                   description: Preguntas con respuestas correctas, respuestas del estudiante y retroalimentación
 *                 respuestasPDF:
 *                   type: array
 *                   description: Solo para exámenes PDF - respuestas con retroalimentación
 *       403:
 *         description: El intento no está finalizado
 *       404:
 *         description: Código de acceso inválido o intento no encontrado
 */
router.get('/attempt/feedback/:codigo_acceso', ExamController.getAttemptFeedback);

/**
 * @openapi
 * /api/exam/attempt/{intento_id}/regenerate-review-code:
 *   post:
 *     tags:
 *       - Attempts
 *     summary: Regenerar el código de revisión de un intento
 *     description: El código de revisión es de un solo uso; una vez el estudiante consulta su retroalimentación queda invalidado. Este endpoint permite al profesor generar uno nuevo para que el estudiante pueda volver a consultarla.
 *     parameters:
 *       - in: path
 *         name: intento_id
 *         required: true
 *         schema:
 *           type: integer
 *     responses:
 *       200:
 *         description: Código de revisión regenerado
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 codigoRevision:
 *                   type: string
 *       403:
 *         description: El intento no está finalizado
 *       404:
 *         description: Intento no encontrado
 */
router.post('/attempt/:intento_id/regenerate-review-code', ExamController.regenerateReviewCode);

router.post('/internal/notify-professor', ExamController.notifyProfessor);
router.post('/attempt/:attemptId/connection-lost', ExamController.notifyConnectionLost);

export default router;
