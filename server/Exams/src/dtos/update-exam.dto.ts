// src/dtos/update-exam.dto.ts
import { Consecuencia, ExamenState, TiempoAgotado } from "../types/Exam";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  ValidateIf,
  ValidateNested,
} from "class-validator";
import { BaseQuestionDto } from "./base-question.dto";
import { TestQuestionDto } from "./add-test-question.dto";
import { OpenQuestionDto } from "./add-open-question.dto";
import { FillBlankQuestionDto } from "./add-blank-question.dto";
import { MatchingQuestionDto } from "./add-matching-question.dto";
import { FileUploadQuestionDto } from "./add-file-upload-question.dto";

export class UpdateExamDto {
  // ❌ NO se puede cambiar el ID del examen (viene en params)
  // ❌ NO se puede cambiar el codigoExamen (se mantiene siempre)
  // ❌ NO se puede cambiar el id_profesor (verificación de autorización)

  @IsString({ message: "Nombre debe ser string" })
  @IsOptional()
  nombre?: string;

  @IsString({ message: "La descripción debe ser una cadena de texto" })
  @IsOptional()
  descripcion?: string;

  @IsString({ message: "La clave debe ser string" })
  @IsOptional()
  contrasena?: string;

  @IsIn(Object.values(ExamenState), {
    message: "El formato del estado del examen es incorrecto, debe ser open, closed o archivado",
  })
  @IsOptional()
  estado?: ExamenState;

  @IsBoolean({ message: "necesitaNombreCompleto debe ser true o false" })
  @IsOptional()
  necesitaNombreCompleto?: boolean;

  @IsBoolean({ message: "necesitaCorreoElectrónico debe ser true o false" })
  @IsOptional()
  necesitaCorreoElectrónico?: boolean;

  @IsBoolean({ message: "necesitaCodigoEstudiantil debe ser true o false" })
  @IsOptional()
  necesitaCodigoEstudiantil?: boolean;

  @IsBoolean({ message: "incluirHerramientaDibujo debe ser true o false" })
  @IsOptional()
  incluirHerramientaDibujo?: boolean;

  @IsBoolean({ message: "incluirCalculadoraCientifica debe ser true o false" })
  @IsOptional()
  incluirCalculadoraCientifica?: boolean;

  @IsBoolean({ message: "incluirHojaExcel debe ser true o false" })
  @IsOptional()
  incluirHojaExcel?: boolean;

  @IsBoolean({ message: "incluirJavascript debe ser true o false" })
  @IsOptional()
  incluirJavascript?: boolean;

  @IsBoolean({ message: "incluirPython debe ser true o false" })
  @IsOptional()
  incluirPython?: boolean;

  @IsBoolean({ message: "necesitaContrasena debe ser true o false" })
  @IsOptional()
  necesitaContrasena?: boolean;

  @Type(() => Date)
  @IsDate({ message: "La hora de apertura debe ser una fecha válida" })
  @IsOptional()
  horaApertura?: Date;

  @Type(() => Date)
  @IsDate({ message: "La hora de cierre debe ser una fecha válida" })
  @IsOptional()
  horaCierre?: Date;

  @IsOptional()
  @IsNumber({}, { message: "Limite de tiempo debe ser un número" })
  limiteTiempo?: number | null;

  @ValidateIf((o) => (o.limiteTiempo !== null && o.limiteTiempo !== undefined) || !!o.horaCierre)
  @IsIn(Object.values(TiempoAgotado), {
    message: "limiteTiempoCumplido debe ser 'enviar' o 'descartar'",
  })
  @IsOptional()
  limiteTiempoCumplido?: string | null;

  @IsIn(Object.values(Consecuencia), {
    message: "Consecuencia invalida",
  })
  @IsOptional()
  consecuencia?: Consecuencia;

  @IsBoolean({ message: "dividirPreguntas debe ser true o false" })
  @IsOptional()
  dividirPreguntas?: boolean;

  @IsBoolean({ message: "permitirVolverPreguntas debe ser true o false" })
  @IsOptional()
  permitirVolverPreguntas?: boolean;

  @IsBoolean({ message: "ordenAleatorio debe ser true o false" })
  @IsOptional()
  ordenAleatorio?: boolean;

  @IsString({
    message: "El nombre del archivo PDF debe ser una cadena de texto",
  })
  @IsOptional()
  archivoPDF?: string;

  @IsArray({ message: "Las preguntas deben ser un array" })
  @ValidateNested({ each: true })
  @Type(() => BaseQuestionDto, {
    keepDiscriminatorProperty: true,
    discriminator: {
      property: "type",
      subTypes: [
        { value: TestQuestionDto, name: "test" },
        { value: OpenQuestionDto, name: "open" },
        { value: FillBlankQuestionDto, name: "fill_blanks" },
        { value: MatchingQuestionDto, name: "matching" },
        { value: FileUploadQuestionDto, name: "file_upload" },
      ],
    },
  })
  @IsOptional()
  questions?: BaseQuestionDto[];
}
