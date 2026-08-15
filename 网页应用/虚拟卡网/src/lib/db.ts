import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { seedIfEmpty } from "./seed.ts";

const dataDir = path.join(process.cwd(), "data");
fs.mkdirSync(dataDir, { recursive: true });

const dbPath = process.env.DB_PATH || path.join(dataDir, "app.db");

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA busy_timeout = 5000;");

const schemaPath = path.join(process.cwd(), "src", "lib", "schema.sql");
db.exec(fs.readFileSync(schemaPath, "utf8"));

seedIfEmpty(db);
