// src/dtos/add-exam.dto.ts
import { Consecuencia, ExamenState, TiempoAgotado } from "../types/Exam";
import { Type } from "class-transformer";
import {
  IsArray,
  IsBoolean,
  IsDate,
  IsIn,
  IsNotEmpty,
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

export class add_exam_dto {
  @IsString({ message: "Nombre debe ser string" })
  @IsNotEmpty({ message: "Nombre no puede ser nulo" })
  nombre!: string;

  @IsString({ message: "La descripción debe ser una cadena de texto" })
  @IsOptional()
  descripcion?: string;

  @IsString({ message: "La clave debe ser string" })
  @IsOptional()
  contrasena?: string;

  @Type(() => Date)
  @IsNotEmpty({ message: "La fecha de creación es obligatoria" })
  fecha_creacion!: Date;

  @IsIn(Object.values(ExamenState), {
    message:
      "El formato del estado del examen es incorrecto, debe ser open, closed o archivado",
  })
  @IsNotEmpty({ message: "El estado del examen es obligatorio" })
  estado!: ExamenState;

  @IsNumber(
    {},
    { message: "El id del profesor proporcionada tiene formato incorrecto" },
  )
  @IsNotEmpty({
    message:
      "Es obligatorio proporcionar el id de un profesor al crear un examen",
  })
  id_profesor!: number;

  @IsNotEmpty({ message: "Falta especificar necesitaNombreCompleto" })
  @IsBoolean({ message: "necesitaCodigoEstudiantil debe ser true o false" })
  necesitaNombreCompleto!: boolean;

  @IsNotEmpty({ message: "Falta especificar necesitaCorreoElectronico" })
  @IsBoolean({ message: "necesitaCodigoEstudiantil debe ser true o false" })
  necesitaCorreoElectrónico!: boolean;

  @IsNotEmpty({ message: "Falta especificar necesitaCodigoEstudiantil" })
  @IsBoolean({ message: "necesitaCodigoEstudiantil debe ser true o false" })
  necesitaCodigoEstudiantil!: boolean;

  @IsNotEmpty({ message: "Falta especificar incluirHerramientaDibujo" })
  @IsBoolean({ message: "incluirHerramientaDibujo debe ser true o false" })
  incluirHerramientaDibujo!: boolean;

  @IsNotEmpty({ message: "Falta especificar incluirCalculadoraCientifica" })
  @IsBoolean({ message: "incluirCalculadoraCientifica debe ser true o false" })
  incluirCalculadoraCientifica!: boolean;

  @IsNotEmpty({ message: "Falta especificar incluirHojaExcel" })
  @IsBoolean({ message: "incluirHojaExcel debe ser true o false" })
  incluirHojaExcel!: boolean;

  @IsNotEmpty({ message: "Falta especificar incluirJavascript" })
  @IsBoolean({ message: "incluirJavascript debe ser true o false" })
  incluirJavascript!: boolean;

  @IsNotEmpty({ message: "Falta especificar incluirPython" })
  @IsBoolean({ message: "incluirPython debe ser true o false" })
  incluirPython!: boolean;

  @IsNotEmpty({ message: "Falta especificar si el examen necesita contraseña" })
  @IsBoolean({ message: "necesita contraseña debe ser true o false" })
  necesitaContrasena!: boolean;

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
  @IsNotEmpty({
    message:
      "Debe especificar limiteTiempoCumplido cuando hay límite de tiempo o fecha de cierre",
  })
  @IsIn(Object.values(TiempoAgotado), {
    message: "limiteTiempoCumplido debe ser 'enviar' o 'descartar'",
  })
  limiteTiempoCumplido?: string | null;

  @IsNotEmpty({
    message: "Falta especificar la consecuencia al salir del examen",
  })
  @IsIn(Object.values(Consecuencia), {
    message: "Consecuencia invalida",
  })
  consecuencia!: Consecuencia;

  @IsString({
    message: "El nombre del archivo PDF debe ser una cadena de texto",
  })
  @IsOptional()
  archivoPDF?: string;

  @IsBoolean({ message: "cambioEstadoAutomatico debe ser true o false" })
  @IsOptional()
  cambioEstadoAutomatico?: boolean;

  @IsBoolean({ message: "dividirPreguntas debe ser true o false" })
  @IsOptional()
  dividirPreguntas?: boolean;

  @IsBoolean({ message: "permitirVolverPreguntas debe ser true o false" })
  @IsOptional()
  permitirVolverPreguntas?: boolean;

  @IsBoolean({ message: "ordenAleatorio debe ser true o false" })
  @IsOptional()
  ordenAleatorio?: boolean;

  @IsNotEmpty()
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
  questions!: BaseQuestionDto[];
}
