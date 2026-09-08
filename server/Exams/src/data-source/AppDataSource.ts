import { DataSource } from "typeorm";
import "reflect-metadata";

import { Question } from "../models/Question";
import { Exam } from "../models/Exam";
import { TestQuestion } from "../models/TestQuestion";
import { TestOption } from "../models/TestOption";

import { BlankAnswer } from "../models/FillBlankAnswer";
import { FillBlankQuestion } from "../models/FillBlankQuestion";

import { OpenQuestion } from "../models/OpenQuestion";
import { FileUploadQuestion } from "../models/FileUploadQuestion";

import { MatchQuestion } from "../models/MatchQuestion";

import { MatchItemA } from "../models/MatchItemA";
import { MatchItemB } from "../models/MatchItemB";
import { MatchPair } from "../models/MatchPair";
import { OpenQuestionKeyword } from "../models/OpenQuestionKeyWord";

// SSL solo si DB_SSL=true (necesario para algunas BDs gestionadas; Postgres local no lo requiere)
const useSsl = process.env.DB_SSL === "true";

// crear el AppDataSource (Conexión BD)
export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASS,
  port: Number(process.env.DB_PORT),
  username: process.env.DB_USER,
  synchronize: true,
  logging: false,
  entities: [
    Exam,
    Question,
    TestQuestion,
    OpenQuestion,
    FileUploadQuestion,
    FillBlankQuestion,
    MatchQuestion,
    TestOption,
    BlankAnswer,
    MatchItemA,
    MatchItemB,
    MatchPair,
    OpenQuestionKeyword,
  ],
  ...(useSsl && {
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  }),
  extra: {
    max: 10,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10000,
    connectionTimeoutMillis: 30000,
  },
});
