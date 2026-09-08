import { IsNumber, IsString, IsDate, IsNotEmpty, IsOptional, IsIn } from "class-validator";
import { Type } from "class-transformer";
import { TipoRespuesta } from "../models/ExamAnswer";

export class CreateExamAnswerDto {
  @IsNumber({}, {})
  @IsNotEmpty({message: "Falta el id de la pregunta"})
  pregunta_id!: number;

  @IsString()
  @IsNotEmpty({message: "Falta la respuesta de la pregunta"})
  respuesta!: string;

  @Type(() => Date)
  @IsDate({ message: "La fecha de respuesta debe ser válida" })
  @IsNotEmpty({message: "Falta la fecha de respuesta"})
  fecha_respuesta!: Date;

  @IsNumber({}, {})
  @IsNotEmpty({message: "Falta el id del intento"})
  intento_id!: number;

  @IsOptional()
  @IsString()
  retroalimentacion?: string;

  @IsOptional()
  @IsIn([
    TipoRespuesta.NORMAL,
    TipoRespuesta.TEXTO_PLANO,
    TipoRespuesta.PYTHON,
    TipoRespuesta.JAVASCRIPT,
    TipoRespuesta.DIAGRAMA,
    TipoRespuesta.HOJA_CALCULO,
    TipoRespuesta.ARCHIVO,
  ], {
    message: "El tipo de respuesta debe ser 'normal', 'texto_plano', 'python', 'javascript', 'diagrama', 'hoja_calculo' o 'archivo'",
  })
  tipo_respuesta?: TipoRespuesta;

  @IsOptional()
  @IsString({ message: "La metadata del código debe ser una cadena de texto" })
  metadata_codigo?: string;
}
