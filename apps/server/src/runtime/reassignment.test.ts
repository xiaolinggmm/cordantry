import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openState } from "./fixtures/budgetState";
import { createMockAgentAdapter } from "../adapters/mockAgent";
import { applyTaskTransition } from "./taskTransition";
import { createProjectRuntimeActionChannel } from "./runtimeActionChannel";
import { executorRefusalMarker } from "./executionBackend";
import { requestCeoReassignment, withdrawCeoReassignment } from "./reassignment";

const cleanups: Array<() => void> = [];
afterEach(() => { for (const cleanup of cleanups.splice(0)) cleanup(); });
function fixture() {
  const projectRoot = mkdtempSync(join(tmpdir(), "reassignment-"));
  mkdirSync(join(projectRoot, ".cordantry"));
  const { repositories, client } = openState(projectRoot);
  cleanups.push(() => { client.close(); rmSync(projectRoot, { recursive: true, force: true }); });
  const fail = () => applyTaskTransition({ repositories, task: "task_1", status: "failed", executionSummary: { latestFailureReason: "agent_failed", latestFailureMessage: "Executor failed" } });
  fail();
  let calls = 0;
  let target = "claude-code";
  const ceo = createMockAgentAdapter({ id: "codex", name: "CEO", capabilities: ["code"] });
  ceo.run = async () => { calls++; return { status: "complete", exitCode: 0, stdout: JSON.stringify({ assigneeAgentId: target, reason: "Use the other executor after this failure." }), stderr: "" }; };
  const alternate = createMockAgentAdapter({ id: "claude-code", name: "Claude", capabilities: ["code"] });
  const input = { repositories, projectRoot, taskId: "task_1", agents: [ceo, alternate], requestId: "decision-1" };
  return { ...input, input, fail, ceo, client, calls: () => calls, target: (value: string) => { target = value; } };
}

describe("CEO reassignment", () => {
  it.each(["rollback", "stale"])("preserves the old candidate when reassignment fails: %s", async failure => {
    const f = fixture();
    f.repositories.createAgentRun({ id: "old-run", taskId: "task_1", agentId: "codex", status: "failed", logPath: "log", startedAt: "2020-01-01T00:00:00.000Z", finishedAt: "2020-01-01T00:01:00.000Z" });
    const context = { companyId: "company_1", taskId: "task_1", runId: "old-run" };
    const channel = createProjectRuntimeActionChannel(f.projectRoot);
    expect(channel.submitArtifactEnvelope(context, { artifact_kind: "deliverable", artifact_role: "implementation", artifact_subtype: "preserved", task_type: "engineering.implementation", payload: {}, lineage: {} })).toMatchObject({ ok: true });
    if (failure === "rollback") f.repositories.appendTaskEvent = () => { throw new Error("interrupted"); };
    else {
      const run = f.ceo.run;
      f.ceo.run = async request => {
        applyTaskTransition({ repositories: f.repositories, task: "task_1", status: "needs_replan" });
        return run(request);
      };
    }
    expect(await requestCeoReassignment(f.input)).toMatchObject({ status: "failed" });
    expect(f.repositories.getTask("task_1")?.assigneeAgentId).toBe("codex");
    expect(createProjectRuntimeActionChannel(f.projectRoot).selectRunSubmission(context).envelope?.artifactSubtype).toBe("preserved");
  });

  it("uses only the selected CEO, preserves Task/KR identity, and applies an identical request once", async () => {
    const f = fixture();
    const before = f.repositories.getTask("task_1")!;
    const decision = await requestCeoReassignment(f.input);
    expect(decision).toMatchObject({ status: "applied", previousAssigneeAgentId: "codex", assigneeAgentId: "claude-code", revision: 1 });
    expect(f.repositories.getTask("task_1")).toMatchObject({ id: before.id, keyResultId: before.keyResultId, assigneeAgentId: "claude-code", status: "queued" });
    expect(await requestCeoReassignment(f.input)).toEqual(decision);
    expect(f.calls()).toBe(1);
    await expect(requestCeoReassignment({ ...f.input, note: "different content" })).rejects.toThrow(/conflict/i);
  });

  it("enforces the lifetime budget independently of ordinary execution counters", async () => {
    const f = fixture();
    await requestCeoReassignment(f.input);
    f.fail(); f.target("codex");
    await requestCeoReassignment({ ...f.input, requestId: "decision-2" });
    f.fail(); f.target("claude-code");
    await expect(requestCeoReassignment({ ...f.input, requestId: "decision-3" })).rejects.toThrow(/budget/i);
    expect(f.calls()).toBe(2);
    expect(f.repositories.reassignments.list("task_1").filter(d => d.status === "applied")).toHaveLength(2);
  });

  it("links successor runs to the applied decision and rolls the whole change back on a failed event write", async () => {
    const f = fixture();
    const original = f.repositories.appendTaskEvent;
    f.repositories.appendTaskEvent = () => { throw new Error("event write interrupted"); };
    expect(await requestCeoReassignment(f.input)).toMatchObject({ status: "failed" });
    expect(f.repositories.getTask("task_1")?.assigneeAgentId).toBe("codex");
    f.repositories.appendTaskEvent = original;
    await requestCeoReassignment({ ...f.input, requestId: "decision-2" });
    f.repositories.createAgentRun({ id: "successor", taskId: "task_1", agentId: "claude-code", status: "running", logPath: "log", startedAt: new Date().toISOString(), finishedAt: null });
    expect(f.repositories.reassignments.runLineage("successor")).toEqual({ taskId: "task_1", decisionId: "decision-2" });
  });

  it("replays a concurrent pending request without a second CEO invocation", async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const run = f.ceo.run;
    f.ceo.run = async request => { await gate; return run(request); };
    const first = requestCeoReassignment(f.input);
    expect(await requestCeoReassignment(f.input)).toMatchObject({ status: "pending" });
    release();
    expect(await first).toMatchObject({ status: "applied" });
    expect(f.calls()).toBe(1);
  });

  it("withdraws an interrupted planning request without letting its late answer change assignment", async () => {
    const f = fixture();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const run = f.ceo.run;
    f.ceo.run = async request => { await gate; return run(request); };
    const first = requestCeoReassignment(f.input);
    await vi.waitFor(() => expect(f.repositories.reassignments.get("task_1", "decision-1")?.status).toBe("pending"));
    expect(withdrawCeoReassignment(f.repositories, "task_1", "decision-1")).toMatchObject({ status: "withdrawn" });
    release();
    expect(await first).toMatchObject({ status: "withdrawn" });
    expect(f.repositories.getTask("task_1")?.assigneeAgentId).toBe("codex");
    expect(await requestCeoReassignment({ ...f.input, requestId: "decision-2" })).toMatchObject({ status: "applied" });
  });

  it("does not reuse an old executor's launch refusal for the next reassignment", async () => {
    const f = fixture();
    f.repositories.writeTaskStatusUnchecked("task_1", "queued");
    f.repositories.appendTaskEvent({ id: "refusal", taskId: "task_1", companyId: "company_1", type: "task_warning",
      message: executorRefusalMarker("codex", f.repositories.getTaskExecutionEpoch("task_1")), createdAt: new Date().toISOString(), status: null,
      failureReason: null, failureMessage: null, executionProfileName: null, requestedTimeoutMs: null, effectiveTimeoutMs: null, dependencyNote: null, artifactWorkspacePath: null });
    expect(await requestCeoReassignment(f.input)).toMatchObject({ status: "applied" });
    f.target("codex");
    await expect(requestCeoReassignment({ ...f.input, requestId: "decision-2" })).rejects.toThrow(/failed execution|refused launch/i);
    expect(f.calls()).toBe(1);
  });

  it("reassigns an execution-recovery ceiling as a CEO revision without bypassing protected Holds", async () => {
    const f = fixture();
    for (let n = 0; n < 3; n++) f.repositories.createAgentRun({ id: `failed-${n}`, taskId: "task_1", agentId: "codex", status: "failed", logPath: "log", startedAt: "2020-01-01T00:00:00.000Z", finishedAt: "2020-01-01T00:01:00.000Z" });
    applyTaskTransition({ repositories: f.repositories, task: "task_1", status: "blocked", executionSummary: { latestFailureReason: "retry_exhausted" } });
    expect(await requestCeoReassignment(f.input)).toMatchObject({ status: "applied" });
    expect(f.repositories.countAgentRunsForTask("task_1")).toBe(0);
    expect(f.repositories.countAllAgentRunsForTask("task_1")).toBe(3);
    applyTaskTransition({ repositories: f.repositories, task: "task_1", status: "failed", executionSummary: { latestFailureReason: "termination_unconfirmed" } });
    await expect(requestCeoReassignment({ ...f.input, requestId: "blocked" })).rejects.toThrow(/Hold/i);
  });

  it("uses an available executor for the CEO decision without changing company ownership", async () => {
    const f = fixture();
    const alternative = f.input.agents.find(a => a.id === "claude-code")!;
    alternative.run = f.ceo.run;
    const decision = await requestCeoReassignment({ ...f.input, agents: [alternative] });
    expect(decision).toMatchObject({ status: "applied", ceoAgentId: "claude-code" });
    expect(f.repositories.getCompany("company_1")?.selectedCeoAgentId).toBe("codex");
  });

  it("does not apply a stale decision when the task changes during planning", async () => {
    const f = fixture();
    const run = f.ceo.run;
    f.ceo.run = async request => { applyTaskTransition({ repositories: f.repositories, task: "task_1", status: "cancelled" }); return run(request); };
    expect(await requestCeoReassignment(f.input)).toMatchObject({ status: "failed" });
    expect(f.repositories.getTask("task_1")?.assigneeAgentId).toBe("codex");
  });

  it("refuses isolated workspace ownership before asking the CEO", async () => {
    const f = fixture();
    const task = f.repositories.getTask("task_1")!;
    f.repositories.acquireWorkspaceClaim({ workspacePath: task.workspacePath!, taskId: task.id, runId: "old-run", ownerId: "old", ownerEpoch: null, acquiredAt: new Date().toISOString(), leaseExpiresAt: "2099-01-01T00:00:00.000Z", now: new Date().toISOString() });
    await expect(requestCeoReassignment(f.input)).rejects.toThrow(/workspace/i);
    expect(f.calls()).toBe(0);
  });
});
