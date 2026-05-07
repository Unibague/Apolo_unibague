import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  OneToMany,
  Index,
} from "typeorm";

import { Consecuencia, ExamenState, TiempoAgotado } from "../types/Exam";
import { Question } from "./Question";

@Entity("examenes")
export class Exam {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "varchar", length: 255 })
  nombre!: string;

  @Column({ type: "text" })
  descripcion?: string;

  @Index()
  @Column({ type: "varchar", length: 50 })
  codigoExamen?: string;

  @Column({ type: "varchar", length: 255, nullable: true })
  contrasena?: string | null;

  @CreateDateColumn()
  fecha_creacion!: Date;

  @Column({ type: "enum", enum: ExamenState })
  estado!: ExamenState;

  @Index()
  @Column()
  id_profesor!: number;

  @Column({ type: "boolean" })
  necesitaNombreCompleto!: boolean;

  @Column({ type: "boolean" })
  necesitaCorreoElectrónico!: boolean;

  @Column({ type: "boolean" })
  necesitaCodigoEstudiantil!: boolean;

  @Column({ type: "boolean" })
  incluirHerramientaDibujo!: boolean;

  @Column({ type: "boolean" })
  incluirCalculadoraCientifica!: boolean;

  @Column({ type: "boolean" })
  incluirHojaExcel!: boolean;

  @Column({ type: "boolean" })
  incluirJavascript!: boolean;

  @Column({ type: "boolean" })
  incluirPython!: boolean;

  @Column({ type: "timestamp", nullable: true })
  horaApertura?: Date | null;

  @Column({ type: "timestamp", nullable: true })
  horaCierre?: Date | null;

  @Column({ type: "int", nullable: true })
  limiteTiempo?: number | null;

  @Column({ type: "text", nullable: true })
  limiteTiempoCumplido?: string | null;

  @Column({ type: "boolean", default: false })
  necesitaContrasena!: boolean;

  @Column({ type: "enum", enum: Consecuencia })
  consecuencia!: Consecuencia;

  @Column({ type: "varchar", length: 255, nullable: true })
  archivoPDF?: string | null;

  @Column({ type: "boolean", default: false })
  cambioEstadoAutomatico!: boolean;

  @Column({ type: "timestamp", nullable: true, default: null })
  codigoRegeneradoEn?: Date | null;

  @Column({ type: "boolean", default: false })
  tienePreguntasAbiertas!: boolean;

  @Column({ type: "boolean", default: false })
  dividirPreguntas!: boolean;

  @Column({ type: "boolean", default: false })
  permitirVolverPreguntas!: boolean;

  @Column({ type: "boolean", default: false })
  ordenAleatorio!: boolean;

  @OneToMany(() => Question, (question) => question.exam, {
    onDelete: "CASCADE",
    eager: true,
  })
  questions!: Question[];
}
