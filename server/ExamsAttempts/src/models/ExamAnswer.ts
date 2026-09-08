import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from "typeorm";
import type { ExamAttempt } from "./ExamAttempt";

export enum TipoRespuesta {
  NORMAL = "normal",
  TEXTO_PLANO = "texto_plano",
  PYTHON = "python",
  JAVASCRIPT = "javascript",
  DIAGRAMA = "diagrama",
  HOJA_CALCULO = "hoja_calculo",
  ARCHIVO = "archivo",
  SIN_RESPUESTA = "sin_respuesta",
}

@Entity("exam_answers")
export class ExamAnswer {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  pregunta_id!: number;

  @Column({ type: "text", nullable: true, default: null })
  respuesta?: string | null;

  @Column({ type: "timestamp" })
  fecha_respuesta!: Date;

  @Index()
  @Column()
  intento_id!: number;

  @ManyToOne("ExamAttempt", "respuestas")
  @JoinColumn({ name: "intento_id" })
  intento!: ExamAttempt;

  @Column({ type: "float", nullable: true, default: null })
  puntaje?: number | null;

  @Column({ type: "varchar", nullable: true, length: 2000 })
  retroalimentacion?: string;

  @Column({ type: "varchar", length: 30, default: TipoRespuesta.NORMAL })
  tipo_respuesta!: TipoRespuesta;

  @Column({ type: "text", nullable: true, default: null })
  metadata_codigo?: string | null;
}
