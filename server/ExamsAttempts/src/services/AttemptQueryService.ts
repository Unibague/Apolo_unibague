import { AppDataSource } from "../data-source/AppDataSource";
import { ExamAttempt, AttemptState } from "../models/ExamAttempt";
import { ExamEvent } from "../models/ExamEvent";
import { ExamInProgress } from "../models/ExamInProgress";
import { TipoRespuesta } from "../models/ExamAnswer";
import { ExamAttemptValidator } from "../validators/ExamAttemptValidator";
import { In } from "typeorm";
import { throwHttpError } from "../utils/errors";
import { QuestionResponseBuilder } from "./QuestionResponseBuilder";
import { internalHttpClient } from "../utils/httpClient";
import ExcelJS from "exceljs";

export class AttemptQueryService {
  static async getAttemptDetails(intento_id: number) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const eventRepo = AppDataSource.getRepository(ExamEvent);
    const progressRepo = AppDataSource.getRepository(ExamInProgress);

    // 1. Obtener el intento con todas sus respuestas
    const attempt = await attemptRepo.findOne({
      where: { id: intento_id },
      relations: ["respuestas"],
    });

    if (!attempt) {
      throwHttpError("Intento no encontrado", 404);
    }

    // 1b. Obtener el código de acceso desde ExamInProgress
    const examInProgress = await progressRepo.findOne({
      where: { intento_id },
    });

    // 2. Obtener todos los eventos de seguridad
    const eventos = await eventRepo.find({
      where: { intento_id },
      order: { fecha_envio: "DESC" },
    });

    // 3. Obtener el examen completo usando el código del examen
    const examBasic = await ExamAttemptValidator.validateExamExistsById(
      attempt.examen_id,
    );

    const exam = examBasic;

    console.log(
      `✅ Examen obtenido: "${exam.nombre}" con ${exam.questions?.length || 0} preguntas`,
    );

    const eventosFormatted = eventos.map((e) => ({
      id: e.id,
      tipo_evento: e.tipo_evento,
      fecha_envio: e.fecha_envio,
      leido: e.leido,
    }));

    // Si es examen PDF, retornar estructura especial
    if (attempt.esExamenPDF) {
      const respuestasPDF = QuestionResponseBuilder.buildPDFResponses(
        attempt.respuestas || [],
      );

      return {
        intento: {
          ...QuestionResponseBuilder.buildAttemptSummary(attempt, true),
          codigo_acceso: examInProgress?.codigo_acceso ?? attempt.codigoRevision ?? null,
        },
        examen: {
          id: exam.id,
          nombre: exam.nombre,
          descripcion: exam.descripcion,
          codigoExamen: exam.codigoExamen,
          estado: exam.estado,
          nombreProfesor: exam.nombreProfesor,
          archivoPDF: exam.archivoPDF,
        },
        estadisticas: {
          totalRespuestas: respuestasPDF.length,
          tiempoTotal: QuestionResponseBuilder.buildTimeTotalSeconds(attempt),
        },
        respuestasPDF,
        eventos: eventosFormatted,
      };
    }

    // Flujo normal para exámenes con preguntas
    if (!exam.questions) {
      throwHttpError(
        "No se pudo obtener la información completa del examen",
        500,
      );
    }

    const preguntasConRespuestas =
      QuestionResponseBuilder.buildQuestionsWithAnswers(
        exam.questions,
        attempt.respuestas || [],
      );

    return {
      intento: {
        ...QuestionResponseBuilder.buildAttemptSummary(attempt),
        codigo_acceso: examInProgress?.codigo_acceso ?? attempt.codigoRevision ?? null,
      },
      examen: {
        id: exam.id,
        nombre: exam.nombre,
        descripcion: exam.descripcion,
        codigoExamen: exam.codigoExamen,
        estado: exam.estado,
        nombreProfesor: exam.nombreProfesor,
      },
      estadisticas: QuestionResponseBuilder.buildStatistics(
        attempt,
        exam.questions.length,
        preguntasConRespuestas,
      ),
      preguntas: preguntasConRespuestas,
      ...((() => {
        const herramientas = (attempt.respuestas || []).filter(r => r.tipo_respuesta !== TipoRespuesta.NORMAL && r.tipo_respuesta !== TipoRespuesta.ARCHIVO);
        return herramientas.length > 0 ? { respuestasPDF: QuestionResponseBuilder.buildPDFResponses(herramientas) } : {};
      })()),
      eventos: eventosFormatted,
    };
  }

  static async getAttemptFeedback(codigo_acceso: string) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);

    // Buscar directamente el intento por codigoRevision (case-sensitive)
    const attempt = await attemptRepo.findOne({
      where: { codigoRevision: codigo_acceso },
      relations: ["respuestas"],
    });

    if (!attempt) {
      throwHttpError("Código de acceso inválido", 404);
    }

    // Solo para intentos finalizados
    if (attempt.estado !== AttemptState.FINISHED) {
      throwHttpError(
        "La retroalimentación solo está disponible para exámenes finalizados",
        403,
      );
    }

    // 4. Obtener examen completo (con respuestas correctas) desde Exams MS
    const examBasic = await ExamAttemptValidator.validateExamExistsById(
      attempt.examen_id,
    );

    // 5. Si es examen PDF, retornar estructura especial
    if (attempt.esExamenPDF) {
      const respuestasPDF = QuestionResponseBuilder.buildPDFResponses(
        attempt.respuestas || [],
      );

      const pdfResult = {
        intento: QuestionResponseBuilder.buildAttemptSummary(attempt, true),
        examen: {
          id: examBasic.id,
          nombre: examBasic.nombre,
          descripcion: examBasic.descripcion,
          codigoExamen: examBasic.codigoExamen,
          estado: examBasic.estado,
          nombreProfesor: examBasic.nombreProfesor,
          archivoPDF: examBasic.archivoPDF,
        },
        estadisticas: {
          totalRespuestas: respuestasPDF.length,
          tiempoTotal: QuestionResponseBuilder.buildTimeTotalSeconds(attempt),
        },
        respuestasPDF,
      };
      // Código de un solo uso: invalidar tras entregar los datos
      attempt.codigoRevision = null;
      await attemptRepo.save(attempt);
      return pdfResult;
    }

    // 6. Examen con preguntas: obtener examen con respuestas correctas
    const EXAM_MS_URL = process.env.EXAM_MS_URL;
    const examResponse = await internalHttpClient.get(
      `${EXAM_MS_URL}/api/exams/by-id/${attempt.examen_id}`,
    );
    const exam = examResponse.data;

    if (!exam || !exam.questions) {
      throwHttpError(
        "No se pudo obtener la información completa del examen",
        500,
      );
    }

    // 7. Usar QuestionResponseBuilder para construir preguntas con respuestas
    const preguntasConRespuestas =
      QuestionResponseBuilder.buildQuestionsWithAnswers(
        exam.questions,
        attempt.respuestas || [],
      );

    const result = {
      intento: QuestionResponseBuilder.buildAttemptSummary(attempt),
      examen: {
        id: exam.id,
        nombre: exam.nombre,
        descripcion: exam.descripcion,
        codigoExamen: exam.codigoExamen,
        estado: exam.estado,
        nombreProfesor: examBasic.nombreProfesor,
      },
      estadisticas: QuestionResponseBuilder.buildStatistics(
        attempt,
        exam.questions.length,
        preguntasConRespuestas,
      ),
      preguntas: preguntasConRespuestas,
      ...((() => {
        const herramientas = (attempt.respuestas || []).filter(r => r.tipo_respuesta !== TipoRespuesta.NORMAL && r.tipo_respuesta !== TipoRespuesta.ARCHIVO);
        return herramientas.length > 0 ? { respuestasPDF: QuestionResponseBuilder.buildPDFResponses(herramientas) } : {};
      })()),
    };
    // Código de un solo uso: invalidar tras entregar los datos
    attempt.codigoRevision = null;
    await attemptRepo.save(attempt);
    return result;
  }

  static async getActiveAttemptsByExam(examId: number) {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const progressRepo = AppDataSource.getRepository(ExamInProgress);
    const eventRepo = AppDataSource.getRepository(ExamEvent);

    // 1 query: todos los intentos del examen
    const attempts = await attemptRepo.find({
      where: { examen_id: examId },
      order: { fecha_inicio: "DESC" },
    });

    if (attempts.length === 0) return [];

    const attemptIds = attempts.map((a) => a.id);

    // 2 queries en paralelo en vez de 2N queries individuales
    const [allProgress, allEvents] = await Promise.all([
      progressRepo.find({ where: { intento_id: In(attemptIds) } }),
      eventRepo.find({
        where: { intento_id: In(attemptIds) },
        order: { fecha_envio: "DESC" },
      }),
    ]);

    // Indexar en memoria para lookup O(1)
    const progressMap = new Map(allProgress.map((p) => [p.intento_id, p]));
    const eventsMap = new Map<number, ExamEvent[]>();
    for (const event of allEvents) {
      if (!eventsMap.has(event.intento_id)) eventsMap.set(event.intento_id, []);
      eventsMap.get(event.intento_id)!.push(event);
    }

    return attempts.map((attempt) => {
      const progress = progressMap.get(attempt.id);
      const events = eventsMap.get(attempt.id) ?? [];
      const unreadCount = events.filter((e) => !e.leido).length;

      const endTime = attempt.fecha_fin ? new Date(attempt.fecha_fin) : new Date();
      const elapsedMinutes = Math.floor(
        (endTime.getTime() - new Date(attempt.fecha_inicio).getTime()) / 60000,
      );

      return {
        id: attempt.id,
        nombre_estudiante: attempt.nombre_estudiante || "Sin nombre",
        correo_estudiante: attempt.correo_estudiante,
        identificacion_estudiante: attempt.identificacion_estudiante,
        estado: attempt.estado,
        fecha_inicio: attempt.fecha_inicio,
        tiempoTranscurrido: `${elapsedMinutes} min`,
        progreso: attempt.progreso || 0,
        alertas: events.length,
        alertasNoLeidas: unreadCount,
        codigo_acceso: progress?.codigo_acceso ?? attempt.codigoRevision ?? null,
        fecha_expiracion: progress?.fecha_expiracion,
        fecha_fin: attempt.fecha_fin,
        esExamenPDF: attempt.esExamenPDF,
        calificacionPendiente: attempt.calificacionPendiente,
        notaFinal: attempt.notaFinal,
      };
    });
  }

  static async getAttemptCountByExam(examId: number): Promise<number> {
    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    return await attemptRepo.count({ where: { examen_id: examId } });
  }

  static async getGradesForDownload(examId: number): Promise<{ buffer: Buffer; examName: string }> {
    const exam = await ExamAttemptValidator.validateExamExistsById(examId);

    const attemptRepo = AppDataSource.getRepository(ExamAttempt);
    const attempts = await attemptRepo.find({
      where: { examen_id: examId },
      relations: ["respuestas"],
      order: { fecha_inicio: "ASC" },
    });

    if (attempts.length === 0) {
      throwHttpError("No hay intentos registrados para este examen", 404);
    }

    const usaCodigo = exam.necesitaCodigoEstudiantil;
    const usaCorreo = exam.necesitaCorreoElectrónico;

    const getIdEstudiante = (a: ExamAttempt): string => {
      if (usaCodigo && a.identificacion_estudiante) return a.identificacion_estudiante;
      if (usaCorreo && a.correo_estudiante) return a.correo_estudiante;
      return a.nombre_estudiante || "Sin identificar";
    };

    let nombreColumnaId = "Estudiante";
    if (usaCodigo) nombreColumnaId = "Código estudiantil";
    else if (usaCorreo) nombreColumnaId = "Correo";
    else nombreColumnaId = "Nombre";

    const estadoTexto: Record<string, string> = {
      [AttemptState.ACTIVE]: "En curso",
      [AttemptState.FINISHED]: "Finalizado",
      [AttemptState.BLOCKED]: "Bloqueado",
      [AttemptState.ABANDONADO]: "Abandonado",
      [AttemptState.PAUSED]: "Pausado",
    };

    // Preguntas del examen (solo si no es PDF)
    const questions: any[] = exam.questions || [];

    const workbook = new ExcelJS.Workbook();

    // ════════════════════════════════════════════════
    // HOJA 1: "Notas" — cabeceras compactas + datos
    // ════════════════════════════════════════════════
    const sheet = workbook.addWorksheet("Notas");

    const fillAzul      = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FF4472C4" } };
    const fillAzulClaro = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFB8CCE4" } };
    const fontBlanco    = { bold: true, color: { argb: "FFFFFFFF" } };
    const fontOscuro    = { bold: true, color: { argb: "FF1F3864" } };
    const alignCenter   = { horizontal: "center" as const, vertical: "middle" as const, wrapText: true };

    // Columnas: id, estado, P1…PN, notaFinal
    const colDefs: Partial<ExcelJS.Column>[] = [
      { key: "id",       width: 32 },
      { key: "estado",   width: 16 },
    ];
    for (let i = 0; i < questions.length; i++) {
      colDefs.push({ key: `p_${questions[i].id}`, width: 30 });
    }
    colDefs.push({ key: "notaFinal", width: 14 });
    sheet.columns = colDefs;

    const totalCols = colDefs.length;

    const truncate = (text: string, max: number) =>
      text.length > max ? text.substring(0, max) + "…" : text;

    const round2 = (n: number) => Math.round(n * 100) / 100;

    // Puntaje máximo raw del examen (suma de todas las preguntas)
    const totalMaxRaw: number = questions.reduce((sum: number, q: any) => sum + (q.puntaje ?? 0), 0);

    // Peso de cada pregunta en escala 0-5
    // weightedMax(q) = (q.puntaje / totalMaxRaw) * 5
    const weightedMax = (q: any): number =>
      totalMaxRaw > 0 ? round2((q.puntaje / totalMaxRaw) * 5) : 0;

    // Puntaje obtenido por el estudiante en escala 0-5
    const weightedScore = (rawScore: number): number =>
      totalMaxRaw > 0 ? round2((rawScore / totalMaxRaw) * 5) : 0;

    // ── Fila 1: "P#N\nEnunciado: [truncado]" por pregunta + columnas fijas ──
    const row1Values: any[] = [nombreColumnaId, "Estado"];
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const enunciado = truncate(q.enunciado || `Pregunta ${i + 1}`, 80);
      row1Values.push(`P#${i + 1}\nEnunciado: ${enunciado}`);
    }
    row1Values.push("Nota Final\n(sobre 5)");
    const headerRow1 = sheet.addRow(row1Values);
    headerRow1.height = 52;

    // ── Fila 2: "Puntaje (Máx: X.XX / 5)" por pregunta ──
    const row2Values: any[] = ["", ""];
    for (const q of questions) {
      row2Values.push(`Puntaje (Máx: ${weightedMax(q)})`);
    }
    row2Values.push("");
    const headerRow2 = sheet.addRow(row2Values);
    headerRow2.height = 20;

    // Fusionar filas 1-2 para columnas fijas (id, estado, notaFinal)
    sheet.mergeCells(1, 1, 2, 1);
    sheet.mergeCells(1, 2, 2, 2);
    sheet.mergeCells(1, totalCols, 2, totalCols);

    headerRow1.eachCell({ includeEmpty: true }, (cell) => {
      cell.font = fontBlanco;
      cell.fill = fillAzul;
      cell.alignment = alignCenter;
    });
    headerRow2.eachCell({ includeEmpty: true }, (cell, colIdx) => {
      if (colIdx > 2 && colIdx < totalCols) {
        cell.font = fontOscuro;
        cell.fill = fillAzulClaro;
        cell.alignment = alignCenter;
      }
    });

    // ── Filas de datos ──
    for (const a of attempts) {
      const rowData: Record<string, string | number | null> = {
        id:     getIdEstudiante(a),
        estado: estadoTexto[a.estado] || a.estado,
      };

      const respuestasMap = new Map<number, number | null>();
      for (const r of a.respuestas || []) {
        respuestasMap.set(r.pregunta_id, r.puntaje ?? null);
      }
      for (const q of questions) {
        const rawScore = respuestasMap.get(q.id);
        rowData[`p_${q.id}`] = rawScore != null ? weightedScore(rawScore) : null;
      }

      if (a.estado === AttemptState.FINISHED) {
        rowData.notaFinal = a.calificacionPendiente
          ? "Pendiente"
          : (a.notaFinal != null ? round2(a.notaFinal) : 0);
      } else {
        rowData.notaFinal = null;
      }

      const row = sheet.addRow(rowData);
      row.eachCell((cell) => {
        cell.alignment = { horizontal: "center", vertical: "middle" };
      });
    }

    // ════════════════════════════════════════════════
    // HOJA 2: "Preguntas" — leyenda de enunciados
    // ════════════════════════════════════════════════
    if (questions.length > 0) {
      const sheetQ = workbook.addWorksheet("Preguntas");
      sheetQ.columns = [
        { key: "num",        width: 10, header: "#"                    },
        { key: "enunc",      width: 70, header: "Enunciado"            },
        { key: "maxRaw",     width: 18, header: "Puntaje Máx (raw)"    },
        { key: "maxWeighted", width: 18, header: "Puntaje Máx (/ 5)"  },
      ];

      const headerRowQ = sheetQ.getRow(1);
      headerRowQ.height = 22;
      headerRowQ.eachCell((cell) => {
        cell.font = fontBlanco;
        cell.fill = fillAzul;
        cell.alignment = alignCenter;
      });

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        const row = sheetQ.addRow({
          num:         i + 1,
          enunc:       q.enunciado || `Pregunta ${i + 1}`,
          maxRaw:      q.puntaje != null ? round2(q.puntaje) : null,
          maxWeighted: weightedMax(q),
        });
        row.getCell("num").alignment         = { horizontal: "center", vertical: "top" };
        row.getCell("enunc").alignment       = { horizontal: "left",   vertical: "top", wrapText: true };
        row.getCell("maxRaw").alignment      = { horizontal: "center", vertical: "top" };
        row.getCell("maxWeighted").alignment = { horizontal: "center", vertical: "top" };
        row.height = 20;
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    return { buffer: Buffer.from(buffer), examName: exam.nombre };
  }
}
