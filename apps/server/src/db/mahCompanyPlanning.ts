import type { DatabaseClient } from "./client";

export type MahCompanyPlanningState = "prepared" | "submitting" | "submitted" | "unknown" | "completed" | "failed";

export type MahCompanyPlanning = {
  companyId: string;
  mahTaskId: string;
  projectRoot: string;
  requestDigest: string;
  state: MahCompanyPlanningState;
  detail: string;
  createdAt: string;
  updatedAt: string;
};

export function createMahCompanyPlanningStore(database: DatabaseClient) {
  return {
    get(companyId: string): MahCompanyPlanning | null {
      const row = database.prepare("SELECT record FROM mah_company_planning WHERE company_id = ?")
        .get(companyId) as { record: string } | undefined;
      return row ? JSON.parse(row.record) as MahCompanyPlanning : null;
    },
    save(record: MahCompanyPlanning): void {
      database.prepare(`INSERT INTO mah_company_planning(company_id, record, state) VALUES(?, ?, ?)
        ON CONFLICT(company_id) DO UPDATE SET record = excluded.record, state = excluded.state`)
        .run(record.companyId, JSON.stringify(record), record.state);
    },
    claimSubmission(companyId: string): boolean {
      const record = this.get(companyId);
      if (!record) return false;
      const next = { ...record, state: "submitting" as const, updatedAt: new Date().toISOString() };
      return database.prepare("UPDATE mah_company_planning SET record = ?, state = 'submitting' WHERE company_id = ? AND state = 'prepared'")
        .run(JSON.stringify(next), companyId).changes === 1;
    },
  };
}
