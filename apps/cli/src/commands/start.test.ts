import { mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { Company, Department, KeyResult, Objective, Task } from "@cordantry/core";
import {
  aiSaasPlaybook,
  createDatabaseClient,
  createMockAgentAdapter,
  createRepositories,
  migrate,
  type AgentAdapter,
} from "@cordantry/server";
import { startCordantry, startSchedulerLoop } from "./start";

const createdDirs: string[] = [];

afterEach(() => {
  for (const dir of createdDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("startCordantry", () => {
  it("starts the API even if an obsolete global MAH configuration is unavailable", async () => {
    const projectRoot = createTempProjectRoot();
    const options = {
      projectRoot,
      agents: [],
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
      agents: [],
      schedulerIntervalMs: 60_000,
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
      agents: [],
      schedulerIntervalMs: 60_000,
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

  it("starts the local API server, prints the dashboard URL, and detects configured agents", async () => {
    const projectRoot = createTempProjectRoot();
    const logs: string[] = [];

    const started = await startCordantry({
      projectRoot,
      host: "127.0.0.1",
      port: 0,
      agents: [
        createMockAgentAdapter({
          id: "claude-code",
          name: "Claude Code",
          capabilities: ["writing", "research"],
          detected: false,
        }),
        createMockAgentAdapter({
          id: "codex",
          name: "Codex",
          capabilities: ["code", "frontend"],
          detected: true,
        }),
      ],
      log: (line) => logs.push(line),
    });

    try {
      expect(started.url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
      expect(logs).toContain(`Dashboard: ${started.url}`);
      expect(logs).toContain("Agent Claude Code: unavailable");
      expect(logs).toContain("Agent Codex: available");

      const response = await fetch(`${started.url}/api/agents`);
      const body = (await response.json()) as { agents: Array<{ id: string; detected: boolean }> };
      expect(response.ok).toBe(true);
      expect(body.agents).toContainEqual({
        id: "codex",
        name: "Codex",
        capabilities: ["code", "frontend"],
        detected: true,
        availability: { installed: true, state: "unknown", checkedAt: expect.any(String) },
      });
    } finally {
      await started.close();
    }
  });

  it("reports installed but exhausted agents as unavailable without blocking startup", async () => {
    const agent = createMockAgentAdapter({id: "codex", name: "Codex", capabilities: ["code"]});
    agent.availability = async () => ({ state: "quota_exhausted" });
    const logs: string[] = [];
    const started = await startCordantry({ projectRoot: createTempProjectRoot(), host: "127.0.0.1", port: 0, agents: [agent], log: line => logs.push(line) });
    try {
      expect(logs).toContain("Agent Codex: unavailable");
      const body = await (await fetch(`${started.url}/api/agents`)).json();
      expect(body.agents[0]).toMatchObject({ detected: false, availability: { installed: true, state: "quota_exhausted" } });
    } finally { await started.close(); }
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
      agents: [],
      schedulerIntervalMs: 60_000,
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

      const api = await fetch(`${started.url}/api/agents`);
      expect(api.status).toBe(200);
      expect(await api.json()).toEqual({ agents: [] });
    } finally {
      await started.close();
    }
  });

  it("automatically runs queued tasks through the scheduler loop", async () => {
    const projectRoot = createTempProjectRoot();
    const logs: string[] = [];
    const blueprint = aiSaasPlaybook.createBlueprint({
      companyName: "Pricing Page Studio",
      founderVision: "Build an AI SaaS that creates pricing pages.",
      preferredEngineeringAgentId: "codex",
      preferredStrategyAgentId: "codex",
    });
    const agent = createMockAgentAdapter({
      id: "codex",
      name: "Codex",
      capabilities: ["code", "frontend", "test", "writing", "research", "growth"],
      output: ["## Human CEO Brief", "Validate.", "```json", JSON.stringify({ brief: "Validate.", blueprint }), "```"].join("\n"),
    });

    const started = await startCordantry({
      projectRoot,
      host: "127.0.0.1",
      port: 0,
      agents: [agent],
      schedulerIntervalMs: 25,
      log: (line) => logs.push(line),
    });

    try {
      const response = await fetch(`${started.url}/api/companies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          companyName: "Pricing Page Studio",
          founderVision: "Build an AI SaaS that creates pricing pages.",
          locale: "en",
          selectedCeoAgentId: "codex",
          permissionMode: "balanced",
          assets: [],
        }),
      });

      expect(response.ok).toBe(true);
      // A company runs from creation (ADR 0044): the scheduler picks its work up with no further step.
      await waitFor(() => logs.some((line) => line.includes("Scheduler tick: started=1")));
    } finally {
      await started.close();
    }
  });

  it("uses collision-resistant ids for companies created through CLI startup", async () => {
    const projectRoot = createTempProjectRoot();
    const blueprint = aiSaasPlaybook.createBlueprint({
      companyName: "Vision Studio",
      founderVision: "Build an AI SaaS that turns founder visions into launch plans.",
      preferredEngineeringAgentId: "codex",
      preferredStrategyAgentId: "codex",
    });
    const agent = createMockAgentAdapter({
      id: "codex",
      name: "Codex",
      capabilities: ["code", "frontend", "test", "writing", "research", "growth"],
      output: ["## Human CEO Brief", "Validate.", "```json", JSON.stringify({ brief: "Validate.", blueprint }), "```"].join("\n"),
    });

    const started = await startCordantry({
      projectRoot,
      host: "127.0.0.1",
      port: 0,
      agents: [agent],
      schedulerIntervalMs: 60_000,
      log: () => undefined,
    });

    try {
      const created = await postJson<{
        company: { id: string; status: string };
      }>(`${started.url}/api/companies`, {
        companyName: "Vision Studio",
        founderVision: "Build an AI SaaS that turns founder visions into launch plans.",
        locale: "en",
        selectedCeoAgentId: "codex",
        permissionMode: "balanced",
        assets: [],
      });
      const state = await waitForCompanyState(started.url, created.company.id, "active");
      const database = createDatabaseClient(join(projectRoot, ".cordantry", "state.sqlite"));
      try {
        const repositories = createRepositories(database);
        const creationEvents = repositories.listCompanyEventsForCompany(created.company.id);

        expect(state.company.id).toMatch(/^company_[0-9a-f-]{36}$/);
        expect(state.company.id).not.toMatch(/^company_\d+$/);
        expect(creationEvents).toHaveLength(6);
        expect(new Set(creationEvents.map((event) => event.id)).size).toBe(creationEvents.length);
        expect(creationEvents.every((event) => /^company_event_[0-9a-f-]{36}$/.test(event.id))).toBe(true);
      } finally {
        database.close();
      }
    } finally {
      await started.close();
    }
  });

  it("runs wake-requested queued tasks without waiting for the scheduler interval", async () => {
    const projectRoot = createTempProjectRoot();
    const logs: string[] = [];
    const events: Array<{ type: string; taskId?: string }> = [];
    const client = createDatabaseClient(":memory:");
    migrate(client);
    const repositories = createRepositories(client);
    repositories.createCompany(createCompanyRecord());
    repositories.createDepartment(createDepartmentRecord());
    repositories.createObjective(createObjectiveRecord());
    repositories.createKeyResult(createKeyResultRecord());

    const scheduler = startSchedulerLoop({
      agents: [
        {
          id: "codex",
          name: "Codex",
          capabilities: ["test"],
          contractCapabilities: ["artifact_envelope"],
          detect: async () => true,
          run: async (request) => {
            if (request.metadata.phase === "execution_brief") return createMockAgentAdapter({ id: "planner", name: "Planner", capabilities: [] }).run(request);
            request.runtimeActions!.submitArtifactEnvelope({
                artifact_kind: "deliverable",
                artifact_role: "validation",
                artifact_subtype: "scheduler_wake_validation",
                task_type: "test.scheduler_wake",
                payload: {
                  summary: "Scheduler wake task completed.",
                  execution_report: {
                    work_summary: "Compared the requested inputs and checked the deliverable.",
                    evidence: "Recorded checks support the reported result.",
                    conclusion: "The wake-requested task is complete and validated.",
                    vision_impact: "It keeps the objective on schedule.",
                    remaining_gap: "CEO review before downstream work proceeds remains.",
                    recommendation: "Review the wake-requested task.",
                  },
                  outcome_summary:
                    "The wake-requested task is complete and validated. It keeps the objective on schedule; the remaining gap is CEO review before downstream work proceeds.",
                  recommendation: "Review the wake-requested task.",
                  evidence: ["proof: wake-requested scheduler tick"],
                  risks: [],
                  next_steps: ["CEO review"],
                },
                lineage: { task_id: "task_1" },
              });
            return {
              status: "complete",
              exitCode: 0,
              stdout: "proof: wake-requested scheduler tick",
              stderr: "",
            };
          },
        } satisfies AgentAdapter,
      ],
      intervalMs: 60_000,
      log: (line) => logs.push(line),
      projectRoot,
      repositories,
      publish: (event) => events.push(event),
    });

    try {
      repositories.createTask(createTaskRecord());
      scheduler.requestWake("dependency_cascade_queued");

      await waitFor(() => events.some((event) => event.type === "task_started" && event.taskId === "task_1"));
      await waitFor(() => repositories.getTask("task_1")?.status === "complete");
      expect(logs).toContain("Scheduler wake requested: dependency_cascade_queued");
      expect(repositories.getTask("task_1")?.status).toBe("complete");
    } finally {
      scheduler.stop();
      client.close();
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

function createCompanyRecord(): Company {
  return {
    id: "company_1",
    name: "Pricing Page Studio",
    founderVision: "Build an AI SaaS that creates pricing pages.",
    locale: "en",
    selectedCeoAgentId: "codex",
    playbookId: "ai-saas",
    status: "active",
    createdAt: "2026-08-17T00:00:00.000Z",
    updatedAt: "2026-08-17T00:00:00.000Z",
  };
}

function createDepartmentRecord(): Department {
  return {
    id: "department_1",
    companyId: "company_1",
    name: "Engineering",
    responsibility: "Run local checks.",
    leadAgentId: "codex",
    memoryPath: ".cordantry/companies/company_1/departments/engineering/memory.md",
  };
}

function createObjectiveRecord(): Objective {
  return {
    id: "objective_1",
    companyId: "company_1",
    title: "Validate scheduler wake",
    status: "active",
    priority: 1,
  };
}

function createKeyResultRecord(): KeyResult {
  return {
    id: "key_result_1",
    objectiveId: "objective_1",
    title: "Wake-requested task produced proof",
    metricName: "proof_status",
    targetValue: "proof_received",
    currentValue: "not_started",
    status: "active",
  };
}

function createTaskRecord(): Task {
  return {
    id: "task_1",
    companyId: "company_1",
    departmentId: "department_1",
    keyResultId: "key_result_1",
    title: "Run wake-requested scheduler task",
    description: "Produce command output proof after a scheduler wake request.",
    assigneeAgentId: "codex",
    requiredCapabilities: ["test"],
    proofSchemaId: "test-output",
    workspacePath: null,
    status: "queued",
    riskLevel: "low",
    position: 0,
    latestFailureReason: null,
    latestFailureMessage: null,
    latestExecutionProfileName: null,
    latestRequestedTimeoutMs: null,
    latestEffectiveTimeoutMs: null,
    dependencyNote: null,
    parentTaskId: null,
    taskKind: "parent",
    source: "ceo",
  };
}
