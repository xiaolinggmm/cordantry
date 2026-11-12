import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MahCommand } from "../adapters/mahCli";
import { assignment, createTestRepositories, seedOrganization } from "../test/fixtures";
import { runAssignmentCoordinatorOnce } from "./assignmentCoordinator";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

describe("Assignment coordinator", () => {
  it("delegates only through MAH and persists the selected Agent/model judgment", async () => {
    const { database, repositories } = createTestRepositories();
    seedOrganization(repositories);
    repositories.createDepartmentAssignment(assignment());
    const root = mkdtempSync(join(tmpdir(), "cordantry-assignment-")); roots.push(root);
    let submitted = false;
    const result = {
      schemaVersion: 1, kind: "assignment_result", assignmentId: "assignment-1", resultSummary: "Done", keyFindings: ["Verified"],
      completedOutcome: "Implemented", limitations: [], downstreamFacts: [{ key: "status", value: "ready" }], recommendedNextAction: "Continue",
      judgment: { decision: "accepted", rationale: "Meets the outcome", satisfiedObligations: ["Implemented"], unsatisfiedObligations: [], evidenceReferences: ["artifacts/evidence.txt"], agentId: "codex-agent", modelId: "gpt-codex" },
    };
    const command = vi.fn<MahCommand>(async (args) => {
      if (args[0] === "task" && args[1] === "submit") { submitted = true; return { exitCode: 0, stdout: JSON.stringify({ task_id: "mah-task-1" }), stderr: "" }; }
      if (args[0] === "task" && args[1] === "show") return submitted
        ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: "mah-task-1", status: "completed" } }), stderr: "" }
        : { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" };
      if (args.includes("artifacts/assignment-result.json")) return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(result) }), stderr: "" };
      if (args.includes("artifacts/evidence.txt")) return { exitCode: 0, stdout: JSON.stringify({ content: "evidence" }), stderr: "" };
      return { exitCode: 1, stdout: "", stderr: "unexpected command" };
    });
    await runAssignmentCoordinatorOnce({ repositories, cordantryProjectRoot: root, mahProjectRoot: "/mah-project", command, createTaskId: () => "mah-task-1" });
    expect(repositories.listDepartmentAssignments("company-1")[0].status).toBe("completed");
    expect(repositories.assignmentExecution.getResult("assignment-1")?.result.judgment).toMatchObject({ agentId: "codex-agent", modelId: "gpt-codex" });
    expect(command.mock.calls.some(([args]) => args.slice(0, 2).join(" ") === "task submit")).toBe(true);
    database.close();
  });

  it("stops on a rejected MAH result instead of invoking a direct executor", async () => {
    const { database, repositories } = createTestRepositories();
    seedOrganization(repositories);
    repositories.createDepartmentAssignment(assignment({ status: "in_progress" }));
    repositories.assignmentExecution.saveBinding({ assignmentId: "assignment-1", companyId: "company-1", mahTaskId: "mah-task-1", projectRoot: "/mah-project", requestDigest: "digest", state: "admitted", submitCount: 1, taskNotFoundCount: 0, reconciliationDeadline: "2030-01-01T00:00:00.000Z", detail: "running", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    const command = vi.fn<MahCommand>(async () => ({ exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: "mah-task-1", status: "failed" } }), stderr: "" }));
    await runAssignmentCoordinatorOnce({ repositories, cordantryProjectRoot: "/project", mahProjectRoot: "/mah-project", command });
    expect(repositories.listDepartmentAssignments("company-1")[0].status).toBe("stopped");
    expect(command).toHaveBeenCalledTimes(1);
    database.close();
  });

  it("reconciles a completed MAH Task until its canonical Result becomes readable", async () => {
    const { database, repositories } = createTestRepositories();
    seedOrganization(repositories);
    repositories.createDepartmentAssignment(assignment({ status: "in_progress" }));
    repositories.assignmentExecution.saveBinding({ assignmentId: "assignment-1", companyId: "company-1", mahTaskId: "mah-task-1", projectRoot: "/mah-project", requestDigest: "digest", state: "admitted", submitCount: 1, taskNotFoundCount: 0, reconciliationDeadline: "2030-01-01T00:00:00.000Z", detail: "running", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" });
    let readable = false;
    const result = {
      schemaVersion: 1, kind: "assignment_result", assignmentId: "assignment-1", resultSummary: "Done", keyFindings: [],
      completedOutcome: "Implemented", limitations: [], downstreamFacts: [], recommendedNextAction: "Continue",
      judgment: { decision: "accepted", rationale: "Meets the outcome", satisfiedObligations: [], unsatisfiedObligations: [], evidenceReferences: [], agentId: "codex-agent", modelId: "gpt-codex" },
    };
    const command = vi.fn<MahCommand>(async (args) => {
      if (args[1] === "show") return { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: "mah-task-1", status: "completed" } }), stderr: "" };
      return readable
        ? { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(result) }), stderr: "" }
        : { exitCode: 0, stdout: JSON.stringify({ content: null }), stderr: "" };
    });

    await runAssignmentCoordinatorOnce({ repositories, cordantryProjectRoot: "/project", mahProjectRoot: "/mah-project", command });
    expect(repositories.listDepartmentAssignments("company-1")[0].status).toBe("in_progress");
    expect(repositories.assignmentExecution.getBinding("assignment-1")?.detail).toMatch(/become readable/);

    readable = true;
    await runAssignmentCoordinatorOnce({ repositories, cordantryProjectRoot: "/project", mahProjectRoot: "/mah-project", command });
    expect(repositories.listDepartmentAssignments("company-1")[0].status).toBe("completed");
    database.close();
  });
});
