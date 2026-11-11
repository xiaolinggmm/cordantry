import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import type { MahCommand } from "../adapters/mahCli";
import { createDatabaseClient } from "../db/client";
import { createRepositories } from "../db/repositories";
import { migrate } from "../db/schema";
import { runAssignmentCoordinatorOnce } from "./assignmentCoordinator";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

it("accepts one real Assignment Result, activates its dependent, and reuses the binding after restart", async () => {
  const root = mkdtempSync(join(tmpdir(), "cordantry-assignment-coordinator-"));
  roots.push(root);
  const database = createDatabaseClient(":memory:");
  migrate(database);
  const repositories = createRepositories(database);
  const at = "2026-11-10T00:00:00.000Z";
  repositories.createCompany({ id: "company_1", name: "Studio", founderVision: "Help creators.", locale: "en", selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null, executionMode: "mah", mahConfig: null, status: "active", createdAt: at, updatedAt: at });
  repositories.createObjective({ id: "objective_1", companyId: "company_1", title: "Validate demand", status: "active", priority: 0 });
  repositories.createDepartment({ id: "department_1", companyId: "company_1", name: "Research", responsibility: "Validate demand.", leadAgentId: "mah", memoryPath: "memory.md" });
  repositories.createDepartmentAssignment({ id: "assignment_1", companyId: "company_1", departmentId: "department_1", objectiveId: "objective_1", title: "Interview creators", expectedOutcome: "A ranked problem list.", dependsOnAssignmentIds: [], route: { kind: "ordinary_task", rationale: "Research." }, order: 0, stage: "research", status: "ready" });
  repositories.createDepartmentAssignment({ id: "assignment_2", companyId: "company_1", departmentId: "department_1", objectiveId: "objective_1", title: "Test the top problem", expectedOutcome: "A demand test.", dependsOnAssignmentIds: ["assignment_1"], route: { kind: "ordinary_task", rationale: "Research." }, order: 1, stage: "research", status: "waiting" });

  const taskId = "stable-assignment-task";
  let submitted = false;
  const calls: string[][] = [];
  let wakeCount = 0;
  const command: MahCommand = async (args) => {
    calls.push(args);
    if (args[1] === "show") return submitted
      ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: taskId, status: "completed" } }), stderr: "" }
      : { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" };
    if (args[1] === "submit") { submitted = true; return { exitCode: 0, stdout: JSON.stringify({ task_id: taskId }), stderr: "" }; }
    if (args[1] === "context") return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(validResult()) }), stderr: "" };
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  await runAssignmentCoordinatorOnce({ repositories, cordantryProjectRoot: root, mahProjectRoot: root, command, createTaskId: () => taskId, requestSchedulerWake: () => { wakeCount += 1; } });
  expect(repositories.listDepartmentAssignments("company_1")).toMatchObject([
    { id: "assignment_1", status: "completed", stage: "acceptance" },
    { id: "assignment_2", status: "ready", stage: "research" },
  ]);
  expect(repositories.assignmentExecution.getBinding("assignment_1")).toMatchObject({ mahTaskId: taskId, submitCount: 1, state: "completed" });
  expect(repositories.assignmentExecution.getResult("assignment_1")?.result).toEqual(validResult());
  expect(calls.filter((args) => args[1] === "submit")).toHaveLength(1);
  expect(calls).toContainEqual(["task", "context", taskId, "--cwd", root, "--read", "artifacts/assignment-result.json", "--format", "json"]);
  expect(repositories.listCompanyEventsForCompany("company_1")).toEqual(expect.arrayContaining([
    expect.objectContaining({ type: "assignment_result_accepted", businessPayload: { assignmentId: "assignment_1" } }),
  ]));
  expect(wakeCount).toBe(1);

  repositories.updateCompanyStatus("company_1", "paused", at);
  await runAssignmentCoordinatorOnce({ repositories, cordantryProjectRoot: root, mahProjectRoot: root, command, createTaskId: () => { throw new Error("Restart must reuse the binding."); } });
  expect(calls.filter((args) => args[1] === "submit")).toHaveLength(1);
  database.close();
});

it("recovers an ambiguous admission with the same Task identity after two missing confirmations", async () => {
  const root = mkdtempSync(join(tmpdir(), "cordantry-assignment-reconcile-"));
  roots.push(root);
  const database = createDatabaseClient(":memory:");
  migrate(database);
  const repositories = createRepositories(database);
  const at = "2026-11-10T00:00:00.000Z";
  repositories.createCompany({ id: "company_1", name: "Studio", founderVision: "Help creators.", locale: "en", selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null, executionMode: "mah", mahConfig: null, status: "active", createdAt: at, updatedAt: at });
  repositories.createObjective({ id: "objective_1", companyId: "company_1", title: "Validate demand", status: "active", priority: 0 });
  repositories.createDepartment({ id: "department_1", companyId: "company_1", name: "Research", responsibility: "Validate demand.", leadAgentId: "mah", memoryPath: "memory.md" });
  repositories.createDepartmentAssignment({ id: "assignment_1", companyId: "company_1", departmentId: "department_1", objectiveId: "objective_1", title: "Interview creators", expectedOutcome: "A ranked problem list.", dependsOnAssignmentIds: [], route: { kind: "ordinary_task", rationale: "Research." }, order: 0, stage: "research", status: "ready" });

  const taskId = "stable-recovery-task";
  let submits = 0;
  const command: MahCommand = async (args) => {
    if (args[1] === "show") return submits >= 2
      ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: taskId, status: "running" } }), stderr: "" }
      : { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" };
    if (args[1] === "submit") {
      submits += 1;
      return submits === 1
        ? { exitCode: 1, stdout: "", stderr: "connection closed before acknowledgement" }
        : { exitCode: 0, stdout: JSON.stringify({ task_id: taskId }), stderr: "" };
    }
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  const run = () => runAssignmentCoordinatorOnce({ repositories, cordantryProjectRoot: root, mahProjectRoot: root, command, createTaskId: () => taskId });
  await run();
  await run();
  await run();

  expect(submits).toBe(2);
  expect(repositories.assignmentExecution.getBinding("assignment_1")).toMatchObject({ mahTaskId: taskId, submitCount: 2, state: "admitted" });
  expect(repositories.listDepartmentAssignments("company_1")[0]).toMatchObject({ status: "in_progress" });
  database.close();
});

it.each([
  ["malformed result", async (args: string[]) => args.includes("artifacts/assignment-result.json")
    ? { exitCode: 0, stdout: JSON.stringify({ content: "not json" }), stderr: "" }
    : { exitCode: 0, stdout: JSON.stringify({ content: "evidence" }), stderr: "" }],
  ["missing evidence", async (args: string[]) => args.includes("artifacts/assignment-result.json")
    ? { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(validResult()) }), stderr: "" }
    : { exitCode: 1, stdout: JSON.stringify({ error: { code: "document_not_found" } }), stderr: "" }],
])("stops an Assignment safely for a %s", async (_label, contextResponse) => {
  const fixture = singleAssignmentFixture();
  let submitted = false;
  const command: MahCommand = async (args) => {
    if (args[1] === "show") return submitted
      ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: "result-task", status: "completed" } }), stderr: "" }
      : { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" };
    if (args[1] === "submit") { submitted = true; return { exitCode: 0, stdout: JSON.stringify({ task_id: "result-task" }), stderr: "" }; }
    if (args[1] === "context") return contextResponse(args);
    throw new Error(`Unexpected command: ${args.join(" ")}`);
  };

  await runAssignmentCoordinatorOnce({ repositories: fixture.repositories, cordantryProjectRoot: fixture.root, mahProjectRoot: fixture.root, command, createTaskId: () => "result-task" });
  expect(fixture.repositories.listDepartmentAssignments("company_1")[0]).toMatchObject({ status: "stopped", stage: "acceptance" });
  expect(fixture.repositories.assignmentExecution.getBinding("assignment_1")).toMatchObject({ state: "failed" });
  fixture.database.close();
});

it.each([
  ["missing", { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" }],
  ["unknown", { exitCode: 1, stdout: "not json", stderr: "temporary CLI failure" }],
])("stops %s admission after the persisted reconciliation deadline", async (_kind, observation) => {
  const fixture = singleAssignmentFixture();
  const at = "2026-11-10T00:00:00.000Z";
  fixture.repositories.updateDepartmentAssignment("assignment_1", { status: "in_progress", stage: "delivery" });
  fixture.repositories.assignmentExecution.saveBinding({
    assignmentId: "assignment_1", companyId: "company_1", mahTaskId: "missing-task", projectRoot: fixture.root,
    requestDigest: "digest", state: "unknown", submitCount: 2, taskNotFoundCount: 2,
    reconciliationDeadline: at, detail: "Waiting.", createdAt: at, updatedAt: at,
  });
  await runAssignmentCoordinatorOnce({
    repositories: fixture.repositories, cordantryProjectRoot: fixture.root, mahProjectRoot: fixture.root,
    now: () => new Date("2026-11-10T00:10:01.000Z"),
    command: async () => observation,
  });
  expect(fixture.repositories.listDepartmentAssignments("company_1")[0]).toMatchObject({ status: "stopped" });
  expect(fixture.repositories.assignmentExecution.getBinding("assignment_1")).toMatchObject({ state: "failed" });
  fixture.database.close();
});

it.each([
  ["missing", { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" }],
  ["unknown", { exitCode: 1, stdout: "not json", stderr: "temporary CLI failure" }],
])("keeps an admitted Assignment in progress after a later %s observation", async (_kind, laterObservation) => {
  const fixture = singleAssignmentFixture();
  const at = "2026-11-10T00:00:00.000Z";
  fixture.repositories.updateDepartmentAssignment("assignment_1", { status: "in_progress", stage: "delivery" });
  fixture.repositories.assignmentExecution.saveBinding({
    assignmentId: "assignment_1", companyId: "company_1", mahTaskId: "running-task", projectRoot: fixture.root,
    requestDigest: "digest", state: "submitted", submitCount: 1, taskNotFoundCount: 0,
    reconciliationDeadline: at, detail: "Waiting.", createdAt: at, updatedAt: at,
  });
  let observationCount = 0;
  const command: MahCommand = async () => {
    observationCount += 1;
    return observationCount === 1
      ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: "running-task", status: "running" } }), stderr: "" }
      : laterObservation;
  };

  const run = () => runAssignmentCoordinatorOnce({
    repositories: fixture.repositories, cordantryProjectRoot: fixture.root, mahProjectRoot: fixture.root,
    now: () => new Date("2026-11-10T00:10:01.000Z"), command,
  });
  await run();
  await run();

  expect(fixture.repositories.listDepartmentAssignments("company_1")[0]).toMatchObject({ status: "in_progress" });
  expect(fixture.repositories.assignmentExecution.getBinding("assignment_1")).toMatchObject({ state: "admitted", submitCount: 1 });
  fixture.database.close();
});

function singleAssignmentFixture() {
  const root = mkdtempSync(join(tmpdir(), "cordantry-assignment-fixture-"));
  roots.push(root);
  const database = createDatabaseClient(":memory:");
  migrate(database);
  const repositories = createRepositories(database);
  const at = "2026-11-10T00:00:00.000Z";
  repositories.createCompany({ id: "company_1", name: "Studio", founderVision: "Help creators.", locale: "en", selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null, executionMode: "mah", mahConfig: null, status: "active", createdAt: at, updatedAt: at });
  repositories.createObjective({ id: "objective_1", companyId: "company_1", title: "Validate demand", status: "active", priority: 0 });
  repositories.createDepartment({ id: "department_1", companyId: "company_1", name: "Research", responsibility: "Validate demand.", leadAgentId: "mah", memoryPath: "memory.md" });
  repositories.createDepartmentAssignment({ id: "assignment_1", companyId: "company_1", departmentId: "department_1", objectiveId: "objective_1", title: "Interview creators", expectedOutcome: "A ranked problem list.", dependsOnAssignmentIds: [], route: { kind: "ordinary_task", rationale: "Research." }, order: 0, stage: "research", status: "ready" });
  return { root, database, repositories };
}

function validResult() {
  return {
    schemaVersion: 1 as const, kind: "assignment_result" as const, assignmentId: "assignment_1",
    resultSummary: "Creators repeat the same crop for each platform.", keyFindings: ["Multi-format work is repeated."],
    completedOutcome: "A ranked problem list.", limitations: ["Five creators were interviewed."],
    downstreamFacts: [{ key: "top_problem", value: "Repeated multi-format cropping" }], recommendedNextAction: "Test an automatic crop flow.",
    judgment: { decision: "accepted" as const, rationale: "The result meets the assignment.", satisfiedObligations: ["Rank the problems."], unsatisfiedObligations: [], evidenceReferences: ["artifacts/interview-notes.md"], agentId: "research-agent", modelId: "model-1" },
  };
}
