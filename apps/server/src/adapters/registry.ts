import { availableCandidates, getAgentAvailability } from "./availability";
import { unavailableLaunchSupport, type AdapterLaunchSupport } from "./launchPolicy";
import type { AgentAdapter } from "./types";

export type AgentRegistry = {
  list(): AgentAdapter[];
  selectByCapabilities(requiredCapabilities: string[]): Promise<AgentAdapter>;
};

export function createAgentRegistry(adapters: AgentAdapter[]): AgentRegistry {
  return {
    list(): AgentAdapter[] {
      return [...adapters];
    },

    async selectByCapabilities(requiredCapabilities: string[]): Promise<AgentAdapter> {
      const candidates = adapters.filter(adapter => hasCapabilities(adapter, requiredCapabilities));
      const selected = (await availableCandidates(candidates))[0];
      if (selected) return selected;

      throw new Error(
        `No agent adapter detected with required capabilities: ${requiredCapabilities.join(", ")}`,
      );
    },
  };
}

function hasCapabilities(adapter: AgentAdapter, requiredCapabilities: string[]): boolean {
  const available = new Set(adapter.capabilities);
  return requiredCapabilities.every((capability) => available.has(capability));
}

export type AdapterLaunchResolution =
  | { launchable: true; adapter: AgentAdapter; support: AdapterLaunchSupport | null }
  | { launchable: false; unavailable: AdapterLaunchSupport[] };

/**
 * The first of `candidates` whose launch support is not `unavailable` and that can deliver. An adapter
 * without a launch plan makes no isolation claim and is launchable with no warnings. Dispatch goes
 * through this so a task is never handed to an installed CLI that cannot run Cordantry's launch shape.
 *
 * Delivering means `artifact_envelope`: since ADR 0041 the Runtime Action Channel is the only way a
 * run's delivery reaches the runtime, so an adapter without it would run the work and then settle as a
 * missing delivery every time.
 */
export async function resolveLaunchableAdapter(candidates: AgentAdapter[]): Promise<AdapterLaunchResolution> {
  const unavailable: AdapterLaunchSupport[] = [];
  const ready = await availableCandidates(candidates);
  for (const adapter of candidates.filter(a => !ready.includes(a))) {
    const support = adapter.launchPlan ? await adapter.launchPlan().catch(() => null) : null;
    unavailable.push(support?.support.isolationLevel === "unavailable" ? support.support : unavailableLaunchSupport(adapter.id, `Agent availability: ${(await getAgentAvailability(adapter)).state}`));
  }
  for (const adapter of ready) {
    try {
      const support = adapter.launchPlan ? (await adapter.launchPlan()).support : null;
      if (support?.isolationLevel === "unavailable") {
        unavailable.push(support);
        continue;
      }
      const contractCapabilities = adapter.resolveContractCapabilities
        ? await adapter.resolveContractCapabilities()
        : adapter.contractCapabilities ?? [];
      if (!contractCapabilities.includes("artifact_envelope") && !contractCapabilities.includes("file_delivery")) {
        unavailable.push(unavailableLaunchSupport(
          adapter.id,
          `${adapter.name} cannot submit an Artifact Envelope; it is unavailable for task runs.`,
        ));
        continue;
      }
      return { launchable: true, adapter, support };
    } catch {
      unavailable.push(unavailableLaunchSupport(adapter.id, "Launch readiness could not be verified."));
    }
  }
  return { launchable: false, unavailable };
}
