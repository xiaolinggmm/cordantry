import type { DatabaseClient } from "./client";

export function migrate(database: DatabaseClient): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS companies (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      founder_vision TEXT NOT NULL,
      status TEXT NOT NULL,
      creation_idempotency_key TEXT UNIQUE,
      creation_input TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS mah_company_planning (
      company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      record TEXT NOT NULL,
      state TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_problems (
      company_id TEXT PRIMARY KEY REFERENCES companies(id) ON DELETE CASCADE,
      record TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS company_events (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL,
      status TEXT,
      sequence INTEGER NOT NULL,
      kind TEXT NOT NULL,
      occurred_at TEXT NOT NULL,
      business_payload TEXT NOT NULL,
      UNIQUE(company_id, sequence)
    );

    CREATE TABLE IF NOT EXISTS objectives (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      status TEXT NOT NULL,
      priority INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS departments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      responsibility TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS department_assignments (
      id TEXT PRIMARY KEY,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      department_id TEXT NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
      objective_id TEXT NOT NULL REFERENCES objectives(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      expected_outcome TEXT NOT NULL,
      depends_on_assignment_ids TEXT NOT NULL,
      route TEXT NOT NULL,
      plan_order INTEGER NOT NULL,
      stage TEXT NOT NULL,
      status TEXT NOT NULL,
      direction_key TEXT
    );

    CREATE TABLE IF NOT EXISTS assignment_execution_bindings (
      assignment_id TEXT PRIMARY KEY REFERENCES department_assignments(id) ON DELETE CASCADE,
      company_id TEXT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
      record TEXT NOT NULL,
      state TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS assignment_results (
      assignment_id TEXT PRIMARY KEY REFERENCES department_assignments(id) ON DELETE CASCADE,
      digest TEXT NOT NULL,
      record TEXT NOT NULL,
      accepted_at TEXT NOT NULL
    );
  `);
}
