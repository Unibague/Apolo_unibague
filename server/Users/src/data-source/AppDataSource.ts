import { DataSource } from "typeorm";
import "reflect-metadata";

import { User } from "../models/User";

// SSL solo si DB_SSL=true (necesario para algunas BDs gestionadas; MySQL local no lo requiere)
const useSsl = process.env.DB_SSL === "true";

export const AppDataSource = new DataSource({
  type: "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_NAME || "webexams",
  password: process.env.DB_PASS || "",
  port: parseInt(process.env.DB_PORT || "3306"),
  username: process.env.DB_USER || "root",
  synchronize: true,
  logging: false,
  entities: [User],
  ...(useSsl && {
    ssl: {
      minVersion: "TLSv1.2",
      rejectUnauthorized: true,
    },
  }),
});
