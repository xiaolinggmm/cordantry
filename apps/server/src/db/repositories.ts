import type { Company, CompanyEvent, Department, DepartmentAssignment, Objective } from "@cordantry/core";
import type { DatabaseClient } from "./client";
import { createAssignmentExecutionStore } from "./assignmentExecution";
import { createMahCompanyPlanningStore } from "./mahCompanyPlanning";

export type CompanyProblemAction =
  | { kind: "download_mah"; url: string }
  | { kind: "recheck" | "try_again" | "new_attempt" };

export type StoredCompanyProblem = {
  schemaVersion: 1;
  kind: "company_problem";
  category: "installation_required" | "setup_required" | "try_again_later" | "plan_needs_new_attempt" | "work_stopped";
  message: string;
  availableActions: CompanyProblemAction[];
};

export function createRepositories(database: DatabaseClient) {
  let savepoint = 0;
  const repositories = {
    mahCompanyPlanning: createMahCompanyPlanningStore(database),
    assignmentExecution: createAssignmentExecutionStore(database),

    transaction<T>(work: () => T): T {
      const name = `cordantry_${savepoint++}`;
      database.exec(`SAVEPOINT ${name}`);
      try {
        const result = work();
        database.exec(`RELEASE ${name}`);
        return result;
      } catch (error) {
        database.exec(`ROLLBACK TO ${name}`);
        database.exec(`RELEASE ${name}`);
        throw error;
      }
    },

    createCompany(company: Company): void {
      database.prepare(`INSERT INTO companies (
        id, name, founder_vision, status, creation_idempotency_key, creation_input, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        company.id, company.name, company.founderVision, company.status,
        company.creationIdempotencyKey ?? null,
        company.creationInput ? JSON.stringify(company.creationInput) : null,
        company.createdAt, company.updatedAt,
      );
    },

    getCompany(id: string): Company | null {
      const row = database.prepare("SELECT * FROM companies WHERE id = ?").get(id) as CompanyRow | undefined;
      return row ? mapCompany(row) : null;
    },

    listCompanies(): Company[] {
      return (database.prepare("SELECT * FROM companies ORDER BY updated_at DESC, created_at DESC").all() as CompanyRow[]).map(mapCompany);
    },

    getCompanyByCreationIdempotencyKey(key: string): Company | null {
      const row = database.prepare("SELECT * FROM companies WHERE creation_idempotency_key = ?").get(key) as CompanyRow | undefined;
      return row ? mapCompany(row) : null;
    },

    updateCompanyStatus(id: string, status: Company["status"], updatedAt: string): void {
      database.prepare("UPDATE companies SET status = ?, updated_at = ? WHERE id = ?").run(status, updatedAt, id);
    },

    activatePlannedCompany(id: string, name: string, updatedAt: string): void {
      database.prepare("UPDATE companies SET name = ?, status = 'active', updated_at = ? WHERE id = ?").run(name, updatedAt, id);
    },

    saveCompanyProblem(companyId: string, problem: StoredCompanyProblem): void {
      database.prepare(`INSERT INTO company_problems(company_id, record) VALUES (?, ?)
        ON CONFLICT(company_id) DO UPDATE SET record = excluded.record`).run(companyId, JSON.stringify(problem));
    },

    getCompanyProblem(companyId: string): StoredCompanyProblem | null {
      const row = database.prepare("SELECT record FROM company_problems WHERE company_id = ?").get(companyId) as { record: string } | undefined;
      return row ? JSON.parse(row.record) as StoredCompanyProblem : null;
    },

    clearCompanyProblem(companyId: string): void {
      database.prepare("DELETE FROM company_problems WHERE company_id = ?").run(companyId);
    },

    appendCompanyEvent(event: CompanyEvent): void {
      database.prepare(`INSERT INTO company_events(
        id, company_id, type, message, created_at, status, sequence, kind, occurred_at, business_payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        event.id, event.companyId, event.type, event.message, event.createdAt, event.status ?? null,
        event.sequence, event.kind, event.occurredAt, JSON.stringify(event.businessPayload),
      );
    },

    listCompanyEventsForCompany(companyId: string): CompanyEvent[] {
      return (database.prepare("SELECT * FROM company_events WHERE company_id = ? ORDER BY sequence").all(companyId) as CompanyEventRow[]).map(mapCompanyEvent);
    },

    createObjective(objective: Objective): void {
      database.prepare("INSERT INTO objectives(id, company_id, title, status, priority) VALUES (?, ?, ?, ?, ?)")
        .run(objective.id, objective.companyId, objective.title, objective.status, objective.priority);
    },

    listObjectives(companyId: string): Objective[] {
      return (database.prepare("SELECT * FROM objectives WHERE company_id = ? ORDER BY priority, id").all(companyId) as ObjectiveRow[]).map((row) => ({ id: row.id, companyId: row.company_id, title: row.title, status: row.status, priority: row.priority }));
    },

    createDepartment(department: Department): void {
      database.prepare("INSERT INTO departments(id, company_id, name, responsibility) VALUES (?, ?, ?, ?)")
        .run(department.id, department.companyId, department.name, department.responsibility);
    },

    listDepartments(companyId: string): Department[] {
      return (database.prepare("SELECT * FROM departments WHERE company_id = ? ORDER BY id").all(companyId) as DepartmentRow[]).map((row) => ({ id: row.id, companyId: row.company_id, name: row.name, responsibility: row.responsibility }));
    },

    createDepartmentAssignment(assignment: DepartmentAssignment): void {
      database.prepare(`INSERT INTO department_assignments(
        id, company_id, department_id, objective_id, title, expected_outcome,
        depends_on_assignment_ids, route, plan_order, stage, status, direction_key
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        assignment.id, assignment.companyId, assignment.departmentId, assignment.objectiveId,
        assignment.title, assignment.expectedOutcome, JSON.stringify(assignment.dependsOnAssignmentIds),
        JSON.stringify(assignment.route), assignment.order, assignment.stage, assignment.status,
        assignment.directionKey ?? null,
      );
    },

    listDepartmentAssignments(companyId: string): DepartmentAssignment[] {
      return (database.prepare("SELECT * FROM department_assignments WHERE company_id = ? ORDER BY plan_order, id").all(companyId) as AssignmentRow[]).map(mapAssignment);
    },

    updateDepartmentAssignment(id: string, fields: Pick<DepartmentAssignment, "status" | "stage">): void {
      database.prepare("UPDATE department_assignments SET status = ?, stage = ? WHERE id = ?").run(fields.status, fields.stage, id);
    },
  };
  return repositories;
}

type CompanyRow = { id: string; name: string; founder_vision: string; status: Company["status"]; creation_idempotency_key: string | null; creation_input: string | null; created_at: string; updated_at: string };
type CompanyEventRow = { id: string; company_id: string; type: string; message: string; created_at: string; status: Company["status"] | null; sequence: number; kind: string; occurred_at: string; business_payload: string };
type ObjectiveRow = { id: string; company_id: string; title: string; status: Objective["status"]; priority: number };
type DepartmentRow = { id: string; company_id: string; name: string; responsibility: string };
type AssignmentRow = { id: string; company_id: string; department_id: string; objective_id: string; title: string; expected_outcome: string; depends_on_assignment_ids: string; route: string; plan_order: number; stage: DepartmentAssignment["stage"]; status: DepartmentAssignment["status"]; direction_key: string | null };

const mapCompany = (row: CompanyRow): Company => ({ id: row.id, name: row.name, founderVision: row.founder_vision, status: row.status, creationIdempotencyKey: row.creation_idempotency_key, creationInput: row.creation_input ? JSON.parse(row.creation_input) : null, createdAt: row.created_at, updatedAt: row.updated_at });
const mapCompanyEvent = (row: CompanyEventRow): CompanyEvent => ({ id: row.id, companyId: row.company_id, type: row.type, message: row.message, createdAt: row.created_at, status: row.status, sequence: row.sequence, kind: row.kind, occurredAt: row.occurred_at, businessPayload: JSON.parse(row.business_payload) });
const mapAssignment = (row: AssignmentRow): DepartmentAssignment => ({ id: row.id, companyId: row.company_id, departmentId: row.department_id, objectiveId: row.objective_id, title: row.title, expectedOutcome: row.expected_outcome, dependsOnAssignmentIds: JSON.parse(row.depends_on_assignment_ids), route: JSON.parse(row.route), order: row.plan_order, stage: row.stage, status: row.status, directionKey: row.direction_key });
