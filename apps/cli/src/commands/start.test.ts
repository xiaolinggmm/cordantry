import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { startCordantry } from "./start";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("startCordantry", () => {
  it("does not register Codex or Claude Code as direct runtime agents", async () => {
    const projectRoot = createTempProjectRoot();
    const logs: string[] = [];

    const started = await startCordantry({
      projectRoot,
      coordinatorIntervalMs: 60_000,
      log: (line) => logs.push(line),
    });

    try {
      const response = await fetch(`${started.url}/api/agents`);

      expect(response.status).toBe(404);
      expect(logs.some((line) => line.startsWith("Agent Codex:"))).toBe(false);
      expect(logs.some((line) => line.startsWith("Agent Claude Code:"))).toBe(false);
    } finally {
      await started.close();
    }
  });

  it("starts the MAH assignment coordinator instead of the direct execution scheduler", async () => {
    const projectRoot = createTempProjectRoot();
    const logs: string[] = [];

    const started = await startCordantry({
      projectRoot,
      mahProjectRoot: projectRoot,
      coordinatorIntervalMs: 60_000,
      mahCommand: async () => ({ exitCode: 0, stdout: JSON.stringify({ ok: true, tasks: [] }), stderr: "" }),
      log: (line) => logs.push(line),
    });

    try {
      await waitFor(() => logs.some((line) => line === "MAH assignment coordinator: running every 60000ms"));
      expect(logs.some((line) => line.startsWith("Scheduler:"))).toBe(false);
      expect(logs.some((line) => line.startsWith("Scheduler tick:"))).toBe(false);
    } finally {
      await started.close();
    }
  });

  it("starts the API even if an obsolete global MAH configuration is unavailable", async () => {
    const projectRoot = createTempProjectRoot();
    const options = {
      projectRoot,
      executionBackend: "mah",
      mahProjectRoot: projectRoot,
      mahSlotClass: "background",
      mahCommand: async () => ({
        exitCode: 0,
        stdout: JSON.stringify({ ok: true, agent_slots: { interactive: 1, background: 0, review: 0 } }),
        stderr: "",
      }),
      log: () => undefined,
    } as unknown as Parameters<typeof startCordantry>[0];

    const started = await startCordantry(options);
    try { expect((await fetch(`${started.url}/api/companies`)).status).toBe(200); } finally { await started.close(); }
  });

  it("does not use global MAH slot settings at startup", async () => {
    const projectRoot = createTempProjectRoot();
    const calls: string[][] = [];
    const options = {
      projectRoot,
      coordinatorIntervalMs: 60_000,
      executionBackend: "mah",
      mahProjectRoot: projectRoot,
      mahSlotClass: "interactive",
      mahCommand: async (args: string[]) => {
        calls.push(args);
        return {
          exitCode: 0,
          stdout: JSON.stringify({ ok: true, agent_slots: { interactive: 1, background: 0, review: 0 } }),
          stderr: "",
        };
      },
      log: () => undefined,
    } as unknown as Parameters<typeof startCordantry>[0];

    const started = await startCordantry(options);
    try {
      expect(calls).toEqual([]);
    } finally {
      await started.close();
    }
  });

  it("uses an explicitly configured MAH project for Founder Vision planning", async () => {
    const projectRoot = createTempProjectRoot();
    const calls: string[][] = [];
    let submittedTaskId: string | undefined;
    const started = await startCordantry({
      projectRoot,
      mahProjectRoot: projectRoot,
      coordinatorIntervalMs: 60_000,
      mahCommand: async (args) => {
        calls.push(args);
        if (args[0] === "task" && args[1] === "show") {
          return submittedTaskId
            ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: submittedTaskId, status: "completed" } }), stderr: "" }
            : { exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "task_not_found" } }), stderr: "" };
        }
        if (args[0] === "task" && args[1] === "submit") {
          submittedTaskId = args[args.indexOf("--task-id") + 1];
          return { exitCode: 0, stdout: JSON.stringify({ task_id: submittedTaskId }), stderr: "" };
        }
        if (args[0] === "task" && args[1] === "context") {
          return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(companyPlan()) }), stderr: "" };
        }
        throw new Error(`Unexpected MAH command: ${args.join(" ")}`);
      },
      log: () => undefined,
    });

    try {
      const created = await postJson<{ company: { id: string } }>(`${started.url}/api/companies`, {
        founderVision: "Help independent creators crop videos faster.",
      });
      const state = await waitForCompanyState(started.url, created.company.id, "active");

      expect(state.company.status).toBe("active");
      expect(calls.filter((args) => args[0] === "task" && args[1] === "submit")).toHaveLength(1);
      expect(calls.some((args) => args.includes("--personal-os-slot"))).toBe(false);
    } finally {
      await started.close();
    }
  });

  it("serves a production dashboard and keeps API routes on the same origin", async () => {
    const projectRoot = createTempProjectRoot();
    const dashboardRoot = join(projectRoot, "dashboard");
    mkdirSync(join(dashboardRoot, "assets"), { recursive: true });
    writeFileSync(join(dashboardRoot, "index.html"), "<main>Cordantry Desktop</main>");
    writeFileSync(join(dashboardRoot, "assets", "app.js"), "console.log('desktop');");
    const started = await startCordantry({
      projectRoot,
      dashboardRoot,
      coordinatorIntervalMs: 60_000,
      log: () => undefined,
    });

    try {
      const home = await fetch(started.url);
      expect(home.status).toBe(200);
      expect(home.headers.get("content-type")).toContain("text/html");
      expect(await home.text()).toContain("Cordantry Desktop");

      const asset = await fetch(`${started.url}/assets/app.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toContain("text/javascript");
      expect(await asset.text()).toContain("desktop");

      const spaRoute = await fetch(`${started.url}/company/example`);
      expect(spaRoute.status).toBe(200);
      expect(await spaRoute.text()).toContain("Cordantry Desktop");

      const legacyAgentsApi = await fetch(`${started.url}/api/agents`);
      expect(legacyAgentsApi.status).toBe(404);
    } finally {
      await started.close();
    }
  });

});

function createTempProjectRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), "cordantry-cli-"));
  createdDirs.push(dir);
  return dir;
}
function companyPlan() {
  return {
    schemaVersion: 1,
    company: { name: "Creator Validation Studio" },
    objectives: [{ id: "objective-validate-demand", title: "Validate creator demand" }],
    departments: [{
      id: "department-user-research",
      name: "User Research",
      responsibility: "Learn which cropping workflow creators will pay for.",
    }],
    assignments: [{
      id: "assignment-interview-creators",
      departmentId: "department-user-research",
      objectiveId: "objective-validate-demand",
      title: "Interview independent creators",
      expectedOutcome: "A ranked list of painful cropping workflows.",
      dependsOnAssignmentIds: [],
      route: { kind: "ordinary_task", rationale: "This is ordinary business research." },
      order: 0,
      stage: "research",
    }],
  };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Request failed with ${response.status}: ${await response.text()}`);
  }

  return (await response.json()) as T;
}

async function waitForCompanyState(
  baseUrl: string,
  companyId: string,
  status: string,
): Promise<{
  company: { id: string; status: string };
  creationEvents: Array<{ type: string }>;
}> {
  let latestState:
    | {
        company: { id: string; status: string };
        creationEvents: Array<{ type: string }>;
      }
    | undefined;

  await waitFor(async () => {
    const response = await fetch(`${baseUrl}/api/companies/${companyId}/state`);
    if (!response.ok) {
      return false;
    }
    latestState = (await response.json()) as typeof latestState;
    return latestState?.company.status === status;
  });

  return latestState!;
}

async function waitFor(check: () => boolean | Promise<boolean>): Promise<void> {
  const startedAt = Date.now();

  while (!(await check())) {
    if (Date.now() - startedAt > 2_000) {
      throw new Error("Timed out waiting for condition.");
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}
