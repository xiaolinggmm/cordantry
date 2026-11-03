import type { AgentAdapter, AgentRunResult } from "./types";

export type AvailabilityState = "ready" | "not_installed" | "login_required" | "quota_exhausted" | "unknown";
export type AvailabilityProbe = { state: AvailabilityState; retryAt?: string };
export type AgentAvailability = AvailabilityProbe & { checkedAt: string; installed: boolean };
const cache = new WeakMap<AgentAdapter, { expires: number; value: AgentAvailability }>();
const pending = new WeakMap<AgentAdapter, Promise<AgentAvailability>>();
const cooldown = new WeakMap<AgentAdapter, { until: number; value: AgentAvailability }>();
const TTL = 30_000;

export function isRunnable(state: AvailabilityState): boolean { return state === "ready" || state === "unknown"; }

export async function getAgentAvailability(adapter: AgentAdapter, now = Date.now()): Promise<AgentAvailability> {
  const blocked = cooldown.get(adapter);
  if (blocked && blocked.until > now) return blocked.value;
  const cached = cache.get(adapter);
  if (cached && cached.expires > now) return cached.value;
  const active = pending.get(adapter);
  if (active) return active;
  const probe = (async (): Promise<AgentAvailability> => {
    let installed = false;
    let result: AvailabilityProbe = { state: "unknown" };
    try {
      installed = await adapter.detect();
      result = installed ? await adapter.availability?.() ?? { state: "unknown" } : { state: "not_installed" };
    } catch { /* Public projection deliberately contains no raw provider errors. */ }
    const value = { ...result, installed, checkedAt: new Date(now).toISOString() };
    cache.set(adapter, { expires: now + (adapter.availability ? TTL : 0), value });
    // A runtime failure can arrive while an older probe is in flight.
    const observed = cooldown.get(adapter);
    return observed && observed.until > now ? observed.value : value;
  })();
  pending.set(adapter, probe);
  try { return await probe; } finally { pending.delete(adapter); }
}

export function recordAgentOutcome(adapter: AgentAdapter, result: AgentRunResult, now = Date.now()): void {
  const state = result.failureReason === "agent_quota_exhausted" ? "quota_exhausted" : result.availabilityFailure;
  if (!state) return;
  cache.delete(adapter);
  cooldown.set(adapter, { until: now + 60_000, value: { state, installed: state !== "not_installed", checkedAt: new Date(now).toISOString() } });
}

/** Technical execution preference; business responsibility remains on the task/company. */
export function executionCandidates(adapters: AgentAdapter[], preferred: string, required: string[] = []): AgentAdapter[] {
  return [...adapters.filter(a => a.id === preferred), ...adapters.filter(a => a.id !== preferred && required.every(c => a.capabilities.includes(c)))];
}

export async function availableCandidates(candidates: AgentAdapter[]): Promise<AgentAdapter[]> {
  const entries = await Promise.all(candidates.map(async adapter => ({ adapter, health: await getAgentAvailability(adapter) })));
  return entries.filter(({ health }) => health.installed && isRunnable(health.state))
    .sort((a, b) => Number(b.health.state === "ready") - Number(a.health.state === "ready"))
    .map(({ adapter }) => adapter);
}

export async function selectAvailableAgent(adapters: AgentAdapter[], preferred: string, required: string[] = []): Promise<AgentAdapter | undefined> {
  return (await availableCandidates(executionCandidates(adapters, preferred, required)))[0];
}
