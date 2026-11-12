import { DatabaseSync } from "node:sqlite";

export type DatabaseClient = DatabaseSync;

const BUSY_TIMEOUT_MS = 5_000;

export function createDatabaseClient(path: string): DatabaseClient {
  const database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  database.exec("PRAGMA journal_mode = WAL");
  database.exec(`PRAGMA busy_timeout = ${BUSY_TIMEOUT_MS}`);
  return database;
}
