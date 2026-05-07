import {
  Column,
  Entity,
  PrimaryGeneratedColumn,
  OneToOne,
  JoinColumn,
  Index,
} from "typeorm";
import type { ExamAttempt } from "./ExamAttempt";

export enum AttemptState {
  ACTIVE = "activo",
  BLOCKED = "blocked",
  PAUSED = "paused",
  FINISHED = "finished",
  ABANDONADO = "abandonado",
}

@Entity("exams_in_progress")
export class ExamInProgress {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", unique: true, length: 10  })
  codigo_acceso!: string;

  @Column({ type: "text" })
  estado!: AttemptState;

  @Column({ type: "timestamp" })
  fecha_inicio!: Date;

  @Column({ type: "timestamp", nullable: true })
  fecha_fin?: Date | null;

  @Column({ type: "varchar", unique: true, length: 10  })
  id_sesion!: string;

  @Column({ type: "timestamp", nullable: true })
  fecha_expiracion?: Date | null;

  @Index()
  @Column()
  intento_id!: number;

  @OneToOne("ExamAttempt", "examenes_en_curso")
  @JoinColumn({ name: "intento_id" })
  intento!: ExamAttempt;
}

  

