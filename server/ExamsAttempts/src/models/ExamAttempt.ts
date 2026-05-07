import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  ManyToOne,
  OneToMany,
  Index,
} from "typeorm";
import { ExamInProgress } from "./ExamInProgress";
import { ExamAnswer } from "./ExamAnswer";
import { ExamEvent } from "./ExamEvent";

export enum AttemptState {
  ACTIVE = "activo",
  BLOCKED = "blocked",
  PAUSED = "paused",
  FINISHED = "finished",
  ABANDONADO = "abandonado",
}

@Entity("exam_attempts")
export class ExamAttempt {
  @PrimaryGeneratedColumn()
  id!: number;

  @Index()
  @Column()
  examen_id!: number;

  @Column({ type: "text" })
  estado!: AttemptState;

  @Column({ type: "text", nullable: true })
  nombre_estudiante?: string | null;

  @Column({ type: "text", nullable: true })
  correo_estudiante?: string | null;

  @Column({ type: "text", nullable: true })
  identificacion_estudiante?: string | null;

  @Column({ type: "float", nullable: true })
  puntaje?: number | null;

  @Column({ type: "float" })
  puntajeMaximo!: number;

  @Column({ type: "float", nullable: true })
  progreso?: number;

  @Column({ type: "timestamp" })
  fecha_inicio!: Date;

  @Column({ type: "timestamp", nullable: true })
  fecha_fin?: Date | null;

  @Column({ type: "varchar", length: 50, nullable: true })
  limiteTiempoCumplido?: string | null;

  @Column({ type: "varchar", length: 50 })
  consecuencia!: string; // "ninguna", "notificar", "bloquear"

  @Column({ type: "float", nullable: true, default: null })
  porcentaje?: number | null;

  @Column({ type: "float", nullable: true, default: null })
  notaFinal?: number | null;

  @Column({ type: "boolean", default: false })
  esExamenPDF!: boolean;

  @Column({ type: "boolean", default: false })
  calificacionPendiente!: boolean;

  @Column({ type: "text", nullable: true, default: null })
  retroalimentacion?: string | null;

  @Column({ type: "varchar", length: 10, nullable: true, unique: true, default: null })
  codigoRevision?: string | null;

  @Column({ type: "text", nullable: true, default: null })
  ordenPreguntas?: string | null;

  @OneToMany(() => ExamAnswer, (answer) => answer.intento, {
    cascade: true,
  })
  respuestas?: ExamAnswer[];
}
