import type { AssignmentResult } from "@cordantry/core";
import type { DatabaseClient } from "./client";

export type AssignmentExecutionBinding = {
  assignmentId: string;
  companyId: string;
  mahTaskId: string;
  projectRoot: string;
  requestDigest: string;
  state: "prepared" | "submitting" | "submitted" | "unknown" | "admitted" | "completed" | "failed";
  submitCount: number;
  taskNotFoundCount: number;
  reconciliationDeadline: string;
  detail: string;
  createdAt: string;
  updatedAt: string;
};

export type AcceptedAssignmentResult = {
  assignmentId: string;
  digest: string;
  result: AssignmentResult;
  acceptedAt: string;
};

export function createAssignmentExecutionStore(database: DatabaseClient) {
  return {
    getBinding(assignmentId: string): AssignmentExecutionBinding | null {
      const row = database.prepare("SELECT record FROM assignment_execution_bindings WHERE assignment_id = ?").get(assignmentId) as { record: string } | undefined;
      return row ? JSON.parse(row.record) as AssignmentExecutionBinding : null;
    },
    saveBinding(binding: AssignmentExecutionBinding): void {
      database.prepare(`INSERT INTO assignment_execution_bindings(assignment_id, company_id, record, state)
        VALUES (?, ?, ?, ?) ON CONFLICT(assignment_id) DO UPDATE SET record = excluded.record, state = excluded.state`)
        .run(binding.assignmentId, binding.companyId, JSON.stringify(binding), binding.state);
    },
    getResult(assignmentId: string): AcceptedAssignmentResult | null {
      const row = database.prepare("SELECT digest, record, accepted_at FROM assignment_results WHERE assignment_id = ?").get(assignmentId) as { digest: string; record: string; accepted_at: string } | undefined;
      return row ? { assignmentId, digest: row.digest, result: JSON.parse(row.record) as AssignmentResult, acceptedAt: row.accepted_at } : null;
    },
    saveResult(result: AcceptedAssignmentResult): boolean {
      return database.prepare("INSERT OR IGNORE INTO assignment_results(assignment_id, digest, record, accepted_at) VALUES (?, ?, ?, ?)")
        .run(result.assignmentId, result.digest, JSON.stringify(result.result), result.acceptedAt).changes === 1;
    },
  };
}
