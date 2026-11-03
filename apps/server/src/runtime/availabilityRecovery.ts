import type { Task } from "@cordantry/core";
import type { AgentAdapter } from "../adapters/types";
import { executionCandidates, getAgentAvailability, isRunnable } from "../adapters/availability";
import { resolveLaunchableAdapter } from "../adapters/registry";
import type { createRepositories } from "../db/repositories";
import { applyTaskTransition } from "./taskTransition";
import { isRetryExhausted } from "./boundedRecovery";

type Repositories = ReturnType<typeof createRepositories>;

/** Resume only closed quota/login outages. All ordinary errors and business Holds keep their owners. */
export async function resumeAvailableTasks(input: { repositories: Repositories; adapters: AgentAdapter[]; now?: () => Date }): Promise<void> {
  const { repositories } = input;
  const now = input.now ?? (() => new Date());
  for (const company of repositories.listCompanies()) {
    if (company.status !== "active" || company.executionMode === "mah") continue;
    const events = repositories.listOutboxEvents({ companyId: company.id });
    for (const task of repositories.listTasksForCompany(company.id)) {
      if (!["failed", "blocked"].includes(task.status) || !["agent_quota_exhausted", "agent_unavailable"].includes(task.latestFailureReason ?? "")) continue;
      const runId = repositories.reassignments.latestRunId(task.id);
      const event = events.filter(e => e.runId === runId && e.type === "execution_failed").at(-1);
      if (!event || event.payload.terminationConfirmed !== true) continue;
      const prior = runId ? repositories.getAgentRun(runId) : null;
      if (!prior) continue;
      const candidates = await taskExecutionCandidates(repositories, input.adapters, task, now().getTime());
      if (!(await resolveLaunchableAdapter(candidates)).launchable) continue;
      repositories.transaction(() => {
        repositories.reassignments.lockTask(task.id);
        const current = repositories.getTask(task.id);
        if (!current || current.status !== task.status || current.latestFailureReason !== task.latestFailureReason
          || repositories.getCompany(company.id)?.status !== "active"
          || repositories.reassignments.latestRunId(task.id) !== runId || isRetryExhausted(repositories, task.id)
          || repositories.mahExecutions.blocksDispatch(task.id)) return;
        const holds = repositories.listOpenTaskHolds(task.id);
        if (!holds.length || holds.some(h => h.kind !== (task.latestFailureReason === "agent_quota_exhausted" ? "agent_quota_exhausted" : "runtime_interrupted"))) return;
        if (repositories.listRunningAgentRuns(company.id).some(r => r.taskId === task.id)
          || repositories.listTaskLocks().some(l => l.taskId === task.id)
          || repositories.listWorkspaceClaims().some(c => c.taskId === task.id || c.workspacePath === current.workspacePath || c.workspacePath === current.artifactWorkspacePath)) return;
        applyTaskTransition({ repositories, task: current, status: "queued", resolvesHoldKinds: [task.latestFailureReason === "agent_quota_exhausted" ? "agent_quota_exhausted" : "runtime_interrupted"], resolution: "cleared",
          executionSummary: { latestFailureReason: null, latestFailureMessage: null }, now });
      });
    }
  }
}

/** A past observed outage survives process restart; unknown quota cannot erase that evidence. */
export async function taskExecutionCandidates(repositories: Repositories, adapters: AgentAdapter[], task: Task, now = Date.now()): Promise<AgentAdapter[]> {
  const runId = repositories.reassignments.latestRunId(task.id);
  const prior = runId ? repositories.getAgentRun(runId) : null;
  const candidates = executionCandidates(adapters, task.assigneeAgentId, task.requiredCapabilities);
  if (!prior || !["agent_quota_exhausted", "agent_unavailable"].includes(prior.failureReason ?? "")) return candidates;
  const results = await Promise.all(candidates.map(async adapter => {
    if (adapter.id !== prior.agentId) return adapter;
    if (!prior.finishedAt || now - Date.parse(prior.finishedAt) < 60_000) return null;
    const health = await getAgentAvailability(adapter);
    return health.installed && (prior.failureReason === "agent_unavailable" ? isRunnable(health.state) : health.state === "ready") ? adapter : null;
  }));
  return results.filter((adapter): adapter is AgentAdapter => adapter !== null);
}
