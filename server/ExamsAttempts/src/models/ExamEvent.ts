import { Column, Entity, PrimaryGeneratedColumn, Index } from "typeorm";

export enum AttemptEvent {
  INTENTO_INICIADO = "intento_iniciado",
  INTENTO_FINALIZADO = "intento_finalizado",
  PANTALLA_COMPLETA_CERRADA = "pantalla_completa_cerrada",
  COMBINACION_TECLAS_PROHIBIDA = "combinacion_teclas_prohibida",
  INTENTO_ABANDONADO = "intento_abandonado",
  FOCO_PERDIDO = "foco_perdido",
  INTENTO_COPIAR_PEGAR_IMPRIMIR = "intento_copiar_pegar_imprimir",
  MANIPULACION_CODIGO = "manipulacion_codigo",
  PESTANA_CAMBIADA = "pestana_cambiada",
}

@Entity("exam_events")
export class ExamEvent {
  @PrimaryGeneratedColumn()
  id!: number;

  @Column({ type: "text" })
  tipo_evento!: AttemptEvent;

  @Column({ type: "timestamp" })
  fecha_envio!: Date;

  @Index()
  @Column()
  intento_id!: number;

  @Column({ type: "boolean", default: false })
  leido!: boolean;
}
