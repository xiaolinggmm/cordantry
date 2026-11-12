import { describe, expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { migrate } from "./schema";

describe("fresh MAH-only schema", () => {
  it("contains only company planning, Assignment, binding, and result persistence", () => {
    const database = createDatabaseClient(":memory:");
    migrate(database);
    const tables = (database.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as Array<{ name: string }>).map((row) => row.name);
    expect(tables).toEqual([
      "assignment_execution_bindings", "assignment_results", "companies", "company_events", "company_problems",
      "department_assignments", "departments", "mah_company_planning", "objectives",
    ]);
    const allColumns = tables.flatMap((table) => (database.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>).map((row) => row.name));
    expect(allColumns).not.toEqual(expect.arrayContaining([
      "execution_mode", "mah_config", "selected_ceo_agent_id", "lead_agent_id", "assignee_agent_id", "agent_run_id", "task_id",
    ]));
    database.close();
  });
});
