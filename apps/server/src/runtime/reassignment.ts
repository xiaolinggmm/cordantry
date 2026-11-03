import { availableCandidates, selectAvailableAgent } from "../adapters/availability";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { type Task, type TaskHoldKind } from "@cordantry/core";
import type { AgentAdapter } from "../adapters/types";
import type { createRepositories } from "../db/repositories";
import type { ReassignmentDecision } from "../db/reassignments";
import { resetTaskAttempts } from "./boundedRecovery";
import { noToolGrant } from "../policies/capabilityGrant";
import { defaultAgentSessionManager } from "./agentSessions";
import { executorRefusalMarker } from "./executionBackend";
import { resolveReplanBasis, resolveStuckContext } from "./replanContext";
import { applyTaskTransition } from "./taskTransition";
import { createProjectRuntimeActionChannel } from "./runtimeActionChannel";
import { createCompanyWorkspace } from "./workspace";

const REASSIGNMENT_LIMIT = 2;
const REASSIGNABLE_HOLDS: TaskHoldKind[] = ["runtime_interrupted", "agent_quota_exhausted", "needs_replan", "recovery_exhausted", "invalid_business_artifact"];
type Repositories = ReturnType<typeof createRepositories>;
export type CeoReassignmentInput = {
  repositories: Repositories;
  projectRoot: string;
  taskId: string;
  requestId: string;
  note?: string;
  agents: AgentAdapter[];
  now?: () => Date;
};

function basis(repositories: Repositories, task: Task): string {
  return JSON.stringify({ task, state: resolveReplanBasis(repositories, task),
    revisions: repositories.listReplanProposalsForTask(task.id).filter(p => p.status === "confirmed").map(p => p.id) });
}
function assertSafe(repositories: Repositories, task: Task): void {
  const launchRefused = task.status === "queued" && repositories.listTaskEventsForCompany(task.companyId)
    .some(e => e.taskId === task.id && e.type === "task_warning" && e.message.includes(executorRefusalMarker(task.assigneeAgentId, repositories.getTaskExecutionEpoch(task.id))));
  const holds = repositories.listOpenTaskHolds(task.id);
  if (holds.some(hold => !REASSIGNABLE_HOLDS.includes(hold.kind))) throw new Error("Protected Hold must be resolved before reassignment");
  const blockedExecution = task.status === "blocked" && holds.length > 0;
  if (!["failed", "needs_replan"].includes(task.status) && !launchRefused && !blockedExecution) {
    throw new Error("Reassignment requires a failed execution or refused launch");
  }
  if (repositories.listRunningAgentRuns(task.companyId).some(run => run.taskId === task.id)
      || repositories.listTaskLocks().some(lock => lock.taskId === task.id)) {
    throw new Error("Previous execution is not closed; reassignment is fenced until it is resolved");
  }
  if (repositories.listWorkspaceClaims().some(claim => claim.taskId === task.id || claim.workspacePath === task.workspacePath || claim.workspacePath === task.artifactWorkspacePath)) {
    throw new Error("Previous workspace ownership must be resolved before reassignment");
  }
}

/** The caller requests consideration, never a target. Only the configured CEO's parsed decision selects it. */
export async function requestCeoReassignment(input: CeoReassignmentInput): Promise<ReassignmentDecision> {
  if (!input.requestId.trim() || input.requestId.length > 160 || (input.note?.length ?? 0) > 4000) throw new Error("Invalid reassignment request");
  const { repositories } = input;
  const task = repositories.getTask(input.taskId);
  if (!task) throw new Error("Task not found");
  const company = repositories.getCompany(task.companyId)!;
  const ceo = await selectAvailableAgent(input.agents, company.selectedCeoAgentId);
  if (!ceo) throw new Error("No planning agent is available; try again after an agent becomes available");
  const requestDigest = createHash("sha256").update(JSON.stringify({ taskId: task.id, note: input.note ?? "" })).digest("hex");
  let created = false;
  const decision = repositories.transaction(() => {
    repositories.reassignments.lockTask(task.id);
    const existing = repositories.reassignments.get(task.id, input.requestId);
    if (existing) {
      if (existing.requestDigest !== requestDigest) throw new Error("Reassignment request content conflict");
      return existing;
    }
    const current = repositories.getTask(task.id)!;
    assertSafe(repositories, current);
    const history = repositories.reassignments.list(task.id);
    if (history.some(d => d.status === "pending")) throw new Error("A CEO reassignment decision is already pending; resolve it before requesting another");
    const applied = history.filter(d => d.status === "applied");
    if (applied.length >= REASSIGNMENT_LIMIT) throw new Error("Task reassignment budget exhausted");
    const pending: ReassignmentDecision = {
      id: input.requestId, taskId: task.id, companyId: task.companyId, requestDigest,
      ceoAgentId: ceo.id, previousAssigneeAgentId: current.assigneeAgentId, assigneeAgentId: null,
      previousRunId: repositories.reassignments.latestRunId(task.id), previousDecisionId: applied.at(-1)?.id ?? null,
      revision: applied.length + 1, status: "pending", reason: "", basis: basis(repositories, current),
      createdAt: (input.now?.() ?? new Date()).toISOString(),
    };
    repositories.reassignments.save(pending);
    created = true;
    return pending;
  });
  if (!created) return decision;

  try {
    const choices = await availableCandidates(input.agents.filter(agent => agent.id !== task.assigneeAgentId && task.requiredCapabilities.every(c => agent.capabilities.includes(c))));
    if (!choices.length) throw new Error("No eligible replacement executor is configured");
    const workspace = createCompanyWorkspace(input.projectRoot, company.id).companyRoot;
    const promptPath = `${workspace}/reassignment-${createHash("sha256").update(task.id + decision.id).digest("hex")}-prompt.md`;
    const prompt = ["You are the company's selected CEO. Decide whether to reassign this failed task.",
      "Return strict JSON with assigneeAgentId (one allowed ID, or null to decline) and a non-empty reason.",
      "Do not execute work. No other task, requirement, dependency or permission may change.",
      JSON.stringify({ task, stuck: resolveStuckContext(repositories, task), allowedAgentIds: choices.map(a => a.id), note: input.note ?? "", remainingReassignments: REASSIGNMENT_LIMIT - decision.revision + 1 }),
    ].join("\n");
    writeFileSync(promptPath, prompt, "utf8");
    const run = await defaultAgentSessionManager.run({ adapter: ceo, sessionKey: null, request: {
      taskId: `${task.id}_reassignment`, workspacePath: workspace, promptPath, prompt, grant: noToolGrant,
      timeoutMs: 60_000, metadata: { companyId: company.id, purpose: "ceo_reassignment" },
      outputSchema: { type: "object", additionalProperties: false, required: ["assigneeAgentId", "reason"], properties: {
        assigneeAgentId: { anyOf: [{ type: "string", enum: choices.map(a => a.id) }, { type: "null" }] }, reason: { type: "string", minLength: 1 },
      } },
    } });
    if (run.result.status !== "complete") throw new Error("CEO reassignment planning failed");
    const parsed: unknown = JSON.parse(run.result.stdout);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid CEO decision");
    const answer = parsed as Record<string, unknown>;
    if (Object.keys(answer).some(key => !["assigneeAgentId", "reason"].includes(key)) || typeof answer.reason !== "string" || !answer.reason.trim()
      || (answer.assigneeAgentId !== null && !choices.some(a => a.id === answer.assigneeAgentId))) throw new Error("Invalid CEO decision");
    const authority = repositories.reassignments.get(task.id, decision.id)!;
    if (authority.status !== "pending") return authority;
    const committed = repositories.transaction(() => {
      repositories.reassignments.lockTask(task.id);
      const authority = repositories.reassignments.get(task.id, decision.id)!;
      if (authority.status !== "pending") return authority;
      const current = repositories.getTask(task.id)!;
      if (repositories.getCompany(task.companyId)?.selectedCeoAgentId !== company.selectedCeoAgentId || basis(repositories, current) !== decision.basis) throw new Error("Stale CEO reassignment decision");
      assertSafe(repositories, current);
      const resolved: ReassignmentDecision = { ...decision, status: answer.assigneeAgentId === null ? "declined" : "applied", assigneeAgentId: answer.assigneeAgentId as string | null, reason: answer.reason as string };
      if (resolved.assigneeAgentId !== null) {
        repositories.reassignments.setAssignee(task.id, current.assigneeAgentId, resolved.assigneeAgentId);
        // Fence all earlier run epochs; the ordinary scheduler will allocate the successor Run.
        repositories.nextExecutionEpoch(task.id);
        resetTaskAttempts(repositories, task.id, (input.now?.() ?? new Date()).toISOString());
        applyTaskTransition({ repositories, task: task.id, status: "queued", resolvesHoldKinds: REASSIGNABLE_HOLDS, resolution: "superseded", executionSummary: { latestFailureReason: null, latestFailureMessage: null }, now: input.now });
        repositories.appendTaskEvent({ id: `reassignment_${createHash("sha256").update(task.id + decision.id).digest("hex")}`, companyId: company.id, taskId: task.id,
          type: "task_replanned", message: `CEO reassignment ${decision.id}: ${current.assigneeAgentId} → ${resolved.assigneeAgentId}. ${resolved.reason}`,
          status: "queued", createdAt: (input.now?.() ?? new Date()).toISOString(), failureReason: null, failureMessage: null,
          executionProfileName: null, requestedTimeoutMs: null, effectiveTimeoutMs: null, dependencyNote: null, artifactWorkspacePath: current.artifactWorkspacePath ?? null });
      }
      repositories.reassignments.save(resolved);
      return resolved;
    });
    // The main-DB epoch is the atomic business fence. Revoke only after commit so
    // a rejected or rolled-back decision cannot invalidate recoverable evidence.
    if (committed.status === "applied" && committed.previousRunId) {
      createProjectRuntimeActionChannel(input.projectRoot).revokeRun({ companyId: task.companyId, taskId: task.id, runId: committed.previousRunId });
    }
    return committed;
  } catch (error) {
    const failed: ReassignmentDecision = { ...decision, status: "failed", reason: error instanceof Error ? error.message : String(error) };
    return repositories.transaction(() => {
      repositories.reassignments.lockTask(task.id);
      const current = repositories.reassignments.get(task.id, decision.id)!;
      if (current.status !== "pending") return current;
      repositories.reassignments.save(failed);
      return failed;
    });
  }
}

/** Withdraws planning authority, not provider termination. A late no-tool CEO answer cannot apply. */
export function withdrawCeoReassignment(repositories: Repositories, taskId: string, requestId: string): ReassignmentDecision {
  return repositories.transaction(() => {
    repositories.reassignments.lockTask(taskId);
    const current = repositories.reassignments.get(taskId, requestId);
    if (!current) throw new Error("Reassignment request not found");
    if (current.status !== "pending") return current;
    const withdrawn: ReassignmentDecision = { ...current, status: "withdrawn", reason: "Planning authority explicitly withdrawn; a late CEO answer cannot apply." };
    repositories.reassignments.save(withdrawn);
    return withdrawn;
  });
}
