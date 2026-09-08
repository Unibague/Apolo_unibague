import { TipoRespuesta } from "../models/ExamAnswer";
import type { ExamAttempt } from "../models/ExamAttempt";
import type { ExamAnswer } from "../models/ExamAnswer";

export class QuestionResponseBuilder {
  static parseStudentAnswer(_type: string, respuesta: string | null | undefined): any {
    if (respuesta == null) return null;
    try {
      return JSON.parse(respuesta);
    } catch {
      return respuesta;
    }
  }

  static buildPDFResponses(respuestas: ExamAnswer[]): any[] {
    return (respuestas || []).filter((r) => r.tipo_respuesta !== TipoRespuesta.SIN_RESPUESTA).map((r) => {
      let metadataParsed = null;
      if (r.metadata_codigo) {
        try {
          metadataParsed = JSON.parse(r.metadata_codigo);
        } catch {
          metadataParsed = r.metadata_codigo;
        }
      }

      let respuestaParsed: any = r.respuesta;
      const structuredTypes = [
        TipoRespuesta.DIAGRAMA,
        TipoRespuesta.PYTHON,
        TipoRespuesta.JAVASCRIPT,
        TipoRespuesta.HOJA_CALCULO,
      ];
      if (structuredTypes.includes(r.tipo_respuesta)) {
        try {
          respuestaParsed = JSON.parse(r.respuesta ?? "");
        } catch {
          respuestaParsed = r.respuesta;
        }
      }

      return {
        id: r.id,
        pregunta_id: r.pregunta_id,
        tipo_respuesta: r.tipo_respuesta,
        respuesta: respuestaParsed,
        metadata_codigo: metadataParsed,
        puntajeObtenido: r.puntaje,
        fecha_respuesta: r.fecha_respuesta,
        retroalimentacion: r.retroalimentacion,
      };
    });
  }

  static buildQuestionsWithAnswers(
    questions: any[],
    respuestas: ExamAnswer[],
  ): any[] {
    return questions.map((pregunta: any) => {
      const respuestaEstudiante = respuestas?.find(
        (r) => r.pregunta_id === pregunta.id,
      );

      let respuestaParsed = null;
      if (respuestaEstudiante) {
        respuestaParsed = this.parseStudentAnswer(
          pregunta.type,
          respuestaEstudiante.respuesta,
        );
      }

      const preguntaDetalle: any = {
        id: pregunta.id,
        enunciado: pregunta.enunciado,
        type: pregunta.type,
        puntajeMaximo: pregunta.puntaje,
        calificacionParcial: pregunta.calificacionParcial,
        nombreImagen: pregunta.nombreImagen,
        respuestaEstudiante: respuestaEstudiante
          ? {
              id: respuestaEstudiante.id,
              respuestaParsed: respuestaParsed,
              puntajeObtenido: respuestaEstudiante.puntaje || 0,
              fecha_respuesta: respuestaEstudiante.fecha_respuesta,
              retroalimentacion: respuestaEstudiante.retroalimentacion,
            }
          : null,
      };

      switch (pregunta.type) {
        case "test": {
          preguntaDetalle.opciones = pregunta.options?.map((opt: any) => ({
            id: opt.id,
            texto: opt.texto,
            esCorrecta: opt.esCorrecta,
          }));
          preguntaDetalle.cantidadRespuestasCorrectas =
            pregunta.cantidadRespuestasCorrectas ??
            pregunta.options?.filter((opt: any) => opt.esCorrecta).length ??
            0;

          if (respuestaEstudiante && respuestaParsed) {
            preguntaDetalle.respuestaEstudiante.opcionesSeleccionadas =
              pregunta.options
                ?.filter((opt: any) => respuestaParsed.includes(opt.id))
                .map((opt: any) => ({
                  id: opt.id,
                  texto: opt.texto,
                  esCorrecta: opt.esCorrecta,
                }));
          }
          break;
        }

        case "open": {
          preguntaDetalle.textoRespuesta = pregunta.textoRespuesta;
          preguntaDetalle.keywords = pregunta.keywords?.map((kw: any) => ({
            id: kw.id,
            texto: kw.texto,
          }));

          if (respuestaEstudiante && respuestaParsed) {
            let textoRespuesta = respuestaParsed;
            if (
              typeof textoRespuesta === "string" &&
              textoRespuesta.startsWith('"') &&
              textoRespuesta.endsWith('"')
            ) {
              textoRespuesta = textoRespuesta.slice(1, -1);
            }
            preguntaDetalle.respuestaEstudiante.textoEscrito = textoRespuesta;
          }
          break;
        }

        case "fill_blanks": {
          const blanks = pregunta.blanks || pregunta.respuestas;
          preguntaDetalle.textoCorrecto = pregunta.textoCorrecto;
          preguntaDetalle.respuestasCorrectas = blanks?.map((r: any) => ({
            id: r.id,
            posicion: r.posicion,
            textoCorrecto: r.textoCorrecto,
          }));

          if (
            respuestaEstudiante &&
            respuestaParsed &&
            Array.isArray(respuestaParsed)
          ) {
            preguntaDetalle.respuestaEstudiante.espaciosLlenados = blanks
              ?.sort((a: any, b: any) => a.posicion - b.posicion)
              .map((blank: any, index: number) => ({
                posicion: blank.posicion,
                respuestaEstudiante: respuestaParsed[index] || "",
                respuestaCorrecta: blank.textoCorrecto,
                esCorrecta:
                  String(respuestaParsed[index] || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, " ")
                    .trim() ===
                  String(blank.textoCorrecto || "")
                    .toLowerCase()
                    .normalize("NFD")
                    .replace(/[\u0300-\u036f]/g, "")
                    .replace(/\s+/g, " ")
                    .trim(),
              }));
          }
          break;
        }

        case "match": {
          preguntaDetalle.paresCorrectos = pregunta.pares?.map((par: any) => ({
            id: par.id,
            itemA: { id: par.itemA.id, text: par.itemA.text },
            itemB: { id: par.itemB.id, text: par.itemB.text },
          }));

          if (
            respuestaEstudiante &&
            respuestaParsed &&
            Array.isArray(respuestaParsed)
          ) {
            preguntaDetalle.respuestaEstudiante.paresSeleccionados =
              respuestaParsed.map((parEst: any) => {
                const itemA = pregunta.pares
                  ?.flatMap((p: any) => [p.itemA, p.itemB])
                  .find((item: any) => item.id === parEst.itemA_id);
                const itemB = pregunta.pares
                  ?.flatMap((p: any) => [p.itemA, p.itemB])
                  .find((item: any) => item.id === parEst.itemB_id);
                // Match exacto por ID, o fallback por texto si hay duplicados con diferente ID
                const esCorrecto = pregunta.pares?.some(
                  (p: any) =>
                    (p.itemA.id === parEst.itemA_id && p.itemB.id === parEst.itemB_id) ||
                    (itemA && itemB && p.itemA.text === itemA.text && p.itemB.text === itemB.text),
                );
                return {
                  itemA: itemA
                    ? { id: itemA.id, text: itemA.text }
                    : { id: parEst.itemA_id, text: "Desconocido" },
                  itemB: itemB
                    ? { id: itemB.id, text: itemB.text }
                    : { id: parEst.itemB_id, text: "Desconocido" },
                  esCorrecto,
                };
              });
          }
          break;
        }

        case "file_upload": {
          if (respuestaEstudiante && respuestaParsed) {
            let metadataParsed: any = null;
            if (respuestaEstudiante.metadata_codigo) {
              try {
                metadataParsed = JSON.parse(respuestaEstudiante.metadata_codigo);
              } catch {
                metadataParsed = null;
              }
            }
            preguntaDetalle.respuestaEstudiante.archivo = {
              nombreArchivo: respuestaParsed,
              nombreOriginal: metadataParsed?.originalName ?? null,
              mimeType: metadataParsed?.mimeType ?? null,
              tamano: metadataParsed?.size ?? null,
            };
          }
          break;
        }
      }

      return preguntaDetalle;
    });
  }

  static buildAttemptSummary(attempt: ExamAttempt, includePDFFields = false): any {
    const summary: any = {
      id: attempt.id,
      examen_id: attempt.examen_id,
      estado: attempt.estado,
      nombre_estudiante: attempt.nombre_estudiante,
      correo_estudiante: attempt.correo_estudiante,
      identificacion_estudiante: attempt.identificacion_estudiante,
      fecha_inicio: attempt.fecha_inicio,
      fecha_fin: attempt.fecha_fin,
      limiteTiempoCumplido: attempt.limiteTiempoCumplido,
      consecuencia: attempt.consecuencia,
      puntaje: attempt.puntaje,
      puntajeMaximo: attempt.puntajeMaximo,
      porcentaje: attempt.porcentaje,
      notaFinal: attempt.notaFinal,
      progreso: attempt.progreso,
    };

    if (includePDFFields) {
      summary.esExamenPDF = attempt.esExamenPDF;
      summary.calificacionPendiente = attempt.calificacionPendiente;
      summary.retroalimentacion = attempt.retroalimentacion || null;
    }

    return summary;
  }

  static buildStatistics(
    attempt: ExamAttempt,
    totalPreguntas: number,
    preguntasConRespuestas: any[],
  ): any {
    const preguntasRespondidas = attempt.respuestas?.filter(r => r.tipo_respuesta === TipoRespuesta.NORMAL || r.tipo_respuesta === TipoRespuesta.ARCHIVO).length || 0;
    const preguntasCorrectas = preguntasConRespuestas.filter(
      (p: any) =>
        p.respuestaEstudiante &&
        p.respuestaEstudiante.puntajeObtenido === p.puntajeMaximo,
    ).length;

    return {
      totalPreguntas,
      preguntasRespondidas,
      preguntasCorrectas,
      preguntasIncorrectas: preguntasRespondidas - preguntasCorrectas,
      preguntasSinResponder: totalPreguntas - preguntasRespondidas,
      tiempoTotal:
        attempt.fecha_fin && attempt.fecha_inicio
          ? Math.floor(
              (new Date(attempt.fecha_fin).getTime() -
                new Date(attempt.fecha_inicio).getTime()) /
                1000,
            )
          : null,
    };
  }

  static buildTimeTotalSeconds(attempt: ExamAttempt): number | null {
    if (attempt.fecha_fin && attempt.fecha_inicio) {
      return Math.floor(
        (new Date(attempt.fecha_fin).getTime() -
          new Date(attempt.fecha_inicio).getTime()) /
          1000,
      );
    }
    return null;
  }
}
