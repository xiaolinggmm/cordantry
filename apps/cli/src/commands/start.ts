import { mkdirSync } from "node:fs";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createId } from "@cordantry/core";
import {
  createApiServer,
  createDatabaseClient,
  createMahCompanyPlanProvider,
  mahCommand as createMahCommand,
  createRepositories,
  migrate,
  runAssignmentCoordinatorOnce,
  type MahCommand,
  type CoordinatorWakeReason,
} from "@cordantry/server";

export type StartCordantryOptions = {
  dashboardRoot?: string;
  projectRoot: string;
  host?: string;
  port?: number;
  coordinatorIntervalMs?: number;
  log?: (line: string) => void;
  mahCommand?: MahCommand;
  /** Explicit MAH project used for Company Planning; when omitted, creation asks the Founder to install or configure MAH. */
  mahProjectRoot?: string;
};

export type StartedCordantry = {
  url: string;
  close(): Promise<void>;
};

export async function startCordantry(options: StartCordantryOptions): Promise<StartedCordantry> {
  const host = options.host ?? "127.0.0.1";
  const port = options.port ?? 0;
  const log = options.log ?? console.log;
  const coordinatorIntervalMs = options.coordinatorIntervalMs ?? Number(process.env.CORDANTRY_COORDINATOR_INTERVAL_MS ?? 5_000);
  const stateDir = join(options.projectRoot, ".cordantry");
  mkdirSync(stateDir, { recursive: true });

  const database = createDatabaseClient(join(stateDir, "state.sqlite"));
  migrate(database);
  const repositories = createRepositories(database);
  const mahProjectRoot = options.mahProjectRoot ?? process.env.CORDANTRY_MAH_PROJECT_ROOT;
  const companyPlanProvider = mahProjectRoot
    ? createMahCompanyPlanProvider({
        repositories,
        mahProjectRoot,
        ...(options.mahCommand ? { command: options.mahCommand } : {}),
      })
    : undefined;

  let coordinator: ReturnType<typeof startAssignmentCoordinatorLoop> | undefined;
  const apiServer = createApiServer({
    dashboardRoot: options.dashboardRoot,
    projectRoot: options.projectRoot,
    repositories,
    ...(companyPlanProvider ? { companyPlanProvider } : {}),
    log,
    createId,
    requestCoordinatorWake: (reason) => coordinator?.requestWake(reason),
  });
  coordinator = startAssignmentCoordinatorLoop({
    intervalMs: coordinatorIntervalMs,
    log,
    projectRoot: options.projectRoot,
    repositories,
    mahCommand: options.mahCommand,
    mahProjectRoot,
  });

  await new Promise<void>((resolve) => {
    apiServer.httpServer.listen(port, host, resolve);
  });

  const address = apiServer.httpServer.address();

  if (!address || typeof address === "string") {
    throw new Error("Unable to determine local server address.");
  }

  const url = `http://${host}:${(address as AddressInfo).port}`;
  log(`Dashboard: ${url}`);

  return {
    url,
    async close(): Promise<void> {
      await new Promise<void>((resolve, reject) => {
        apiServer.httpServer.close((error) => (error ? reject(error) : resolve()));
      });
      coordinator.stop();
      database.close();
    },
  };
}

export function startAssignmentCoordinatorLoop(input: {
  intervalMs: number;
  log: (line: string) => void;
  projectRoot: string;
  repositories: ReturnType<typeof createRepositories>;
  mahCommand?: MahCommand;
  mahProjectRoot?: string;
}) {
  let running = false;
  let stopped = false;
  let wakePending = false;
  let wakeTimer: ReturnType<typeof setTimeout> | null = null;

  async function tick() {
    if (running || stopped) {
      return;
    }

    running = true;
    wakePending = false;
    try {
      if (!input.mahProjectRoot) {
        return;
      }
      await runAssignmentCoordinatorOnce({
        repositories: input.repositories,
        cordantryProjectRoot: input.projectRoot,
        mahProjectRoot: input.mahProjectRoot,
        command: input.mahCommand ?? createMahCommand(),
        requestCoordinatorWake: () => requestWake("dependency_cascade_queued"),
      });
    } catch (error) {
      input.log(`MAH assignment coordinator failed: ${(error as Error).message}`);
    } finally {
      running = false;
      if (wakePending && !stopped) {
        scheduleWakeTick();
      }
    }
  }

  function scheduleWakeTick() {
    if (stopped || wakeTimer) {
      return;
    }

    wakeTimer = setTimeout(() => {
      wakeTimer = null;
      void tick();
    }, 0);
  }

  const interval = setInterval(() => void tick(), input.intervalMs);
  void tick();
  input.log(`MAH assignment coordinator: running every ${input.intervalMs}ms`);

  function requestWake(reason: CoordinatorWakeReason) {
    if (stopped) {
      return;
    }

    input.log(`MAH assignment coordinator wake requested: ${reason}`);
    wakePending = true;
    if (!running) {
      scheduleWakeTick();
    }
  }

  return {
    requestWake,
    stop() {
      stopped = true;
      clearInterval(interval);
      if (wakeTimer) {
        clearTimeout(wakeTimer);
        wakeTimer = null;
      }
    },
  };
}
