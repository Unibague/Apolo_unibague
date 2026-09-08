import { Exam } from "../models/Exam";
import { BlankAnswer } from "../models/FillBlankAnswer";
import { FillBlankQuestion } from "../models/FillBlankQuestion";
import { MatchItemA } from "../models/MatchItemA";
import { MatchItemB } from "../models/MatchItemB";
import { MatchPair } from "../models/MatchPair";
import { MatchQuestion } from "../models/MatchQuestion";
import { OpenQuestion } from "../models/OpenQuestion";
import { OpenQuestionKeyword } from "../models/OpenQuestionKeyWord";
import { FileUploadQuestion } from "../models/FileUploadQuestion";
import { Question } from "../models/Question";
import { throwHttpError } from "../utils/errors";

export class QuestionValidator {
  static crearPreguntasDesdeDto(questionsDto: any[], exam: Exam): Question[] {
    if (!Array.isArray(questionsDto)) {
      throwHttpError("Las preguntas deben ser un arreglo", 400);
    }

    return questionsDto.map((questionDto, index) => {
      if (!questionDto?.type) {
        throwHttpError(`La pregunta en posición ${index} no tiene tipo`, 400);
      }

      const preguntaBase: Partial<Question> = {
        enunciado: questionDto.enunciado,
        type: questionDto.type,
        puntaje: questionDto.puntaje,
        calificacionParcial: questionDto.calificacionParcial,
        orden: index,
        exam,
      };

      const preguntaBaseData = {
        enunciado: questionDto.enunciado,
        type: questionDto.type,
        puntaje: questionDto.puntaje,
        calificacionParcial: questionDto.calificacionParcial,
        orden: index,
        exam,
      };

      switch (questionDto.type) {
        case "test":
          if (questionDto.options && Array.isArray(questionDto.options)) {
            if (questionDto.options.length > 10) {
              throwHttpError(
                `La pregunta ${index} tiene demasiadas opciones. Máximo permitido: 10.`,
                400,
              );
            }
          }

          return {
            ...preguntaBase,
            shuffleOptions: questionDto.shuffleOptions ?? false,
            nombreImagen: questionDto.nombreImagen ?? null,
            options:
              questionDto.options?.map((opt: any, optIndex: number) => {
                if (!opt?.texto || typeof opt.esCorrecta !== "boolean") {
                  throwHttpError(
                    `Opción inválida en pregunta ${index}, opción ${optIndex}`,
                    400,
                  );
                }

                return {
                  texto: opt.texto,
                  esCorrecta: opt.esCorrecta,
                };
              }) || [],
          } as Question;

        case "open":
          const openQ = new OpenQuestion();
          Object.assign(openQ, preguntaBaseData);

          openQ.nombreImagen = questionDto.nombreImagen ?? null;

          const tieneTexto =
            questionDto.textoRespuesta &&
            questionDto.textoRespuesta.trim() !== "";
          const tieneKeywords =
            questionDto.palabrasClave &&
            Array.isArray(questionDto.palabrasClave) &&
            questionDto.palabrasClave.length > 0;

          if (tieneTexto && tieneKeywords) {
            throwHttpError(
              `Error en pregunta ${index}: No se puede definir 'textoRespuesta' y 'palabrasClave' al mismo tiempo. Elige un método de calificación.`,
              400,
            );
          }

          openQ.textoRespuesta = questionDto.textoRespuesta ?? null;

          if (tieneKeywords) {
            openQ.keywords = questionDto.palabrasClave.map(
              (kwDto: any, kwIndex: number) => {
                const keyword = new OpenQuestionKeyword();

                if (!kwDto?.texto) {
                  throwHttpError(
                    `Palabra clave inválida en pregunta ${index}, posición ${kwIndex}. Debe tener 'texto'`,
                    400,
                  );
                }

                keyword.texto = kwDto.texto;

                return keyword;
              },
            );
          } else {
            openQ.keywords = [];
          }

          return openQ;

        case "fill_blanks":
          const fillQ = new FillBlankQuestion();
          Object.assign(fillQ, preguntaBaseData);

          fillQ.nombreImagen = questionDto.nombreImagen ?? null;

          if (!questionDto.textoCorrecto) {
            throwHttpError(
              `La pregunta ${index} (Rellenar) requiere el texto base.`,
              400,
            );
          }

          fillQ.textoCorrecto = questionDto.textoCorrecto;

          if (questionDto.respuestas && Array.isArray(questionDto.respuestas)) {
            fillQ.respuestas = questionDto.respuestas.map(
              (respDto: any, respIndex: number) => {
                const answer = new BlankAnswer();

                if (respDto.posicion === undefined || !respDto.textoCorrecto) {
                  throwHttpError(
                    `Error en pregunta ${index}: La respuesta ${respIndex} debe tener posición y textoCorrecto.`,
                    400,
                  );
                }

                answer.posicion = respDto.posicion;
                answer.textoCorrecto = respDto.textoCorrecto;
                return answer;
              },
            );
            const matches = fillQ.textoCorrecto.match(/___/g) || [];

            if (matches.length !== fillQ.respuestas.length) {
              throwHttpError(
                `Pregunta ${index}: El número de espacios en blanco (___) no coincide con las respuestas enviadas.`,
                400,
              );
            }
          } else {
            throwHttpError(
              `La pregunta ${index} debe tener al menos una respuesta correcta.`,
              400,
            );
          }

          return fillQ;

        case "matching":
          const matchQ = new MatchQuestion();
          Object.assign(matchQ, preguntaBaseData);

          matchQ.nombreImagen = questionDto.nombreImagen ?? null;

          if (
            !questionDto.pares ||
            !Array.isArray(questionDto.pares) ||
            questionDto.pares.length === 0
          ) {
            throwHttpError(
              `Error en pregunta ${index}: Las preguntas de emparejamiento deben tener al menos un par de elementos.`,
              400,
            );
          }

          // LÍMITE MÁXIMO DE 10 PARES
          if (questionDto.pares.length > 10) {
            throwHttpError(
              `La pregunta ${index} tiene demasiados pares. Máximo permitido: 10 pares.`,
              400,
            );
          }

          matchQ.pares = questionDto.pares.map(
            (pairDto: any, pairIndex: number) => {
              if (!pairDto.itemA || !pairDto.itemB) {
                throwHttpError(
                  `Error en pregunta ${index}, par ${pairIndex}: Ambos elementos (itemA e itemB) son obligatorios.`,
                  400,
                );
              }

              const itemA = new MatchItemA();
              itemA.text = pairDto.itemA;

              const itemB = new MatchItemB();
              itemB.text = pairDto.itemB;

              const pair = new MatchPair();
              pair.itemA = itemA;
              pair.itemB = itemB;
              pair.question = matchQ;

              return pair;
            },
          );

          return matchQ;

        case "file_upload":
          const fileUploadQ = new FileUploadQuestion();
          Object.assign(fileUploadQ, preguntaBaseData);

          fileUploadQ.nombreImagen = questionDto.nombreImagen ?? null;

          return fileUploadQ;

        default:
          throwHttpError(
            `Tipo de pregunta no soportado: ${questionDto.type}`,
            400,
          );
      }
    });
  }
}
