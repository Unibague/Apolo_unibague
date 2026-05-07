import { DataSource } from "typeorm";
import "reflect-metadata";

import { ExamAttempt } from "../models/ExamAttempt";
import { ExamAnswer } from "../models/ExamAnswer";
import { ExamInProgress } from "../models/ExamInProgress";
import { ExamEvent } from "../models/ExamEvent";

// SSL solo si DB_SSL=true (necesario para algunas BDs gestionadas; MySQL local no lo requiere)
const useSsl = process.env.DB_SSL === "true";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  synchronize: true,
  logging: false,
  entities: [ExamAttempt, ExamAnswer, ExamEvent, ExamInProgress],
  ...(useSsl && {
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  }),
  connectTimeoutMS: 30000,
  extra: {
    // Mantiene las conexiones del pool vivas para evitar ECONNRESET en TiDB Cloud
    enableKeepAlive: true,
    keepAliveInitialDelay: 10000,
    connectionLimit: 50,
    connectTimeoutMS: 30000,
    waitForConnections: true,
    queueLimit: 0,
  },
});
