import {
  Entity,
  TableInheritance,
  Column,
  PrimaryGeneratedColumn,
  ManyToOne,
  Index,
} from "typeorm";
import { Exam } from "./Exam";

@Entity()
@TableInheritance({ column: { type: "varchar", name: "type" } })
export abstract class Question {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "text" })
  enunciado!: string;

  @Column({ type: "float", default: 1 })
  puntaje!: number;

  @Column()
  type!: string;

  @Column({ type: "boolean" })
  calificacionParcial!: boolean;

  @Column({ type: "int", default: 0 })
  orden!: number;

  @Index()
  @ManyToOne("Exam", "questions", { onDelete: "CASCADE" })
  exam!: Exam;

  @Column({ type: "text", nullable: true })
  nombreImagen?: string;
}
