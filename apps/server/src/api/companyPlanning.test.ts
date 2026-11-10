import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../db/client";
import { createRepositories } from "../db/repositories";
import { migrate } from "../db/schema";
import type { MahCommand } from "../adapters/mahCli";
import type { AgentAdapter, AgentRunRequest } from "../adapters/types";
import { createMahCompanyPlanProvider } from "../runtime/mahCompanyPlan";
import { createApiServer } from "./routes";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("MAH-owned company planning API", () => {
  it("submits one stable MAH Planning Task and recovers its public Company Plan artifact", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-mah-company-planning-"));
    temporaryRoots.push(projectRoot);
    const database = createDatabaseClient(":memory:");
    migrate(database);
    const repositories = createRepositories(database);
    const mahTaskId = "8d49f0b6-c884-4a67-a44f-a7fe0e8403f4";
    const calls: string[][] = [];
    let submitted = false;
    const command: MahCommand = async (args) => {
      calls.push(args);
      if (args[0] === "task" && args[1] === "show") {
        return submitted
          ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: mahTaskId, status: "completed" } }), stderr: "" }
          : { exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "task_not_found" } }), stderr: "" };
      }
      if (args[0] === "task" && args[1] === "submit") {
        submitted = true;
        return {
          exitCode: 1,
          stdout: JSON.stringify({ error: { code: "task_submit_failed", message: "attempt to write a readonly database" } }),
          stderr: "",
        };
      }
      if (args[0] === "task" && args[1] === "context") {
        return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(validCompanyPlan()) }), stderr: "" };
      }
      throw new Error(`Unexpected MAH command: ${args.join(" ")}`);
    };
    const provider = createMahCompanyPlanProvider({
      repositories,
      mahProjectRoot: projectRoot,
      command,
      createTaskId: () => mahTaskId,
      pollMs: 0,
    });
    const server = createApiServer({ projectRoot, repositories, agents: [], companyPlanProvider: provider });
    await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address.");
    const baseUrl = `http://127.0.0.1:${address.port}`;

    try {
      const response = await fetch(`${baseUrl}/api/companies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founderVision: "Help independent creators crop videos faster." }),
      });
      expect(response.status).toBe(202);
      const created = await response.json() as { company: { id: string } };
      await waitForActiveCompany(baseUrl, created.company.id);

      expect(repositories.mahCompanyPlanning.get(created.company.id)).toMatchObject({
        companyId: created.company.id,
        mahTaskId,
        state: "completed",
      });
      expect(calls.filter((args) => args[0] === "task" && args[1] === "submit")).toHaveLength(1);
      const submit = calls.find((args) => args[0] === "task" && args[1] === "submit")!;
      expect(submit).toEqual(expect.arrayContaining([
        "--cwd", realpathSync(projectRoot),
        "--task-id", mahTaskId,
        "--description-file", expect.any(String),
        "--meta-file", expect.any(String),
        "--attach", expect.any(String),
        "--no-write",
        "--format", "json",
      ]));
      expect(submit).not.toContain("--write");
      expect(submit).not.toContain("--personal-os-slot");
      expect(calls).toContainEqual([
        "task", "context", mahTaskId,
        "--cwd", realpathSync(projectRoot),
        "--read", "artifacts/company-plan.json",
        "--format", "json",
      ]);

      const recoveredProvider = createMahCompanyPlanProvider({
        repositories,
        mahProjectRoot: projectRoot,
        command,
        createTaskId: () => { throw new Error("Recovery must reuse the persisted MAH Task identity."); },
        pollMs: 0,
      });
      await expect(recoveredProvider({
        companyId: created.company.id,
        founderVision: "Help independent creators crop videos faster.",
        projectRoot,
      })).resolves.toEqual(validCompanyPlan());
      expect(calls.filter((args) => args[0] === "task" && args[1] === "submit")).toHaveLength(1);
    } finally {
      await new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
      database.close();
    }
  });

  it("resumes an unresolved MAH Company Planning Task when the API process restarts", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-mah-company-planning-restart-"));
    temporaryRoots.push(projectRoot);
    const database = createDatabaseClient(":memory:");
    migrate(database);
    const repositories = createRepositories(database);
    const companyId = "company_restart";
    const mahTaskId = "4aa8f5ba-68e5-44d2-9bdb-329378d92180";
    const founderVision = "Help independent creators crop videos faster.";
    const timestamp = "2026-11-10T00:00:00.000Z";
    repositories.createCompany({
      id: companyId,
      name: "Planning company",
      founderVision,
      locale: "en",
      selectedCeoAgentId: "mah",
      playbookId: "mah-company-plan",
      permissionMode: null,
      executionMode: "mah",
      mahConfig: null,
      status: "creation_failed",
      createdAt: timestamp,
      updatedAt: timestamp,
    });
    const unresolvedProvider = createMahCompanyPlanProvider({
      repositories,
      mahProjectRoot: projectRoot,
      createTaskId: () => mahTaskId,
      pollMs: 0,
      command: async (args) => args[1] === "submit"
        ? { exitCode: 1, stdout: "", stderr: "Submission result lost." }
        : { exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "task_not_found" } }), stderr: "" },
    });
    await expect(unresolvedProvider({ companyId, founderVision, projectRoot })).rejects.toThrow("Submission result lost");
    expect(repositories.mahCompanyPlanning.get(companyId)).toMatchObject({ mahTaskId, state: "unknown" });

    const recoveryCalls: string[][] = [];
    const recoveryProvider = createMahCompanyPlanProvider({
      repositories,
      mahProjectRoot: projectRoot,
      createTaskId: () => { throw new Error("Recovery must not mint a second MAH Task identity."); },
      pollMs: 0,
      command: async (args) => {
        recoveryCalls.push(args);
        if (args[1] === "show") {
          return { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: mahTaskId, status: "completed" } }), stderr: "" };
        }
        if (args[1] === "context") {
          return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(validCompanyPlan()) }), stderr: "" };
        }
        throw new Error("Recovery must not submit another MAH Task.");
      },
    });
    const server = createApiServer({ projectRoot, repositories, agents: [], companyPlanProvider: recoveryProvider });
    await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address.");

    try {
      await waitForActiveCompany(`http://127.0.0.1:${address.port}`, companyId);
      expect(recoveryCalls.some((args) => args[1] === "submit")).toBe(false);
      expect(repositories.mahCompanyPlanning.get(companyId)).toMatchObject({ mahTaskId, state: "completed" });
    } finally {
      await new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
      database.close();
    }
  });

  it("prepares the stable MAH Task identity after a restart before the planning timer ran", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-mah-company-planning-pre-timer-"));
    temporaryRoots.push(projectRoot);
    const database = createDatabaseClient(":memory:");
    migrate(database);
    const repositories = createRepositories(database);
    const companyId = "company_pre_timer_restart";
    const mahTaskId = "3d0609d2-6670-424d-b62f-7c244374240f";
    const founderVision = "Help independent creators crop videos faster.";
    repositories.createCompany({
      id: companyId, name: "Planning company", founderVision, locale: "en",
      selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null,
      executionMode: "mah", mahConfig: null, status: "creating",
      createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z",
    });
    let submitted = false;
    const provider = createMahCompanyPlanProvider({
      repositories, mahProjectRoot: projectRoot, createTaskId: () => mahTaskId, pollMs: 0,
      command: async (args) => {
        if (args[1] === "show") return submitted
          ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: mahTaskId, status: "completed" } }), stderr: "" }
          : { exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "task_not_found" } }), stderr: "" };
        if (args[1] === "submit") {
          submitted = true;
          return { exitCode: 0, stdout: JSON.stringify({ task_id: mahTaskId }), stderr: "" };
        }
        return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(validCompanyPlan()) }), stderr: "" };
      },
    });
    const server = createApiServer({ projectRoot, repositories, agents: [], companyPlanProvider: provider });
    await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
    const address = server.httpServer.address();
    if (!address || typeof address === "string") throw new Error("Expected TCP server address.");

    try {
      await waitForActiveCompany(`http://127.0.0.1:${address.port}`, companyId);
      expect(repositories.mahCompanyPlanning.get(companyId)).toMatchObject({ mahTaskId, state: "completed" });
    } finally {
      await new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
      database.close();
    }
  });

  it("reuses the pre-minted UUID when the process stopped after claiming submission", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-mah-company-planning-claimed-"));
    temporaryRoots.push(projectRoot);
    const database = createDatabaseClient(":memory:");
    migrate(database);
    const repositories = createRepositories(database);
    const companyId = "company_claimed_restart";
    const mahTaskId = "b7223a48-7a89-41e6-9902-d78de76e88af";
    const founderVision = "Help independent creators crop videos faster.";
    repositories.createCompany({
      id: companyId, name: "Planning company", founderVision, locale: "en",
      selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null,
      executionMode: "mah", mahConfig: null, status: "creation_failed",
      createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z",
    });
    const interruptedProvider = createMahCompanyPlanProvider({
      repositories, mahProjectRoot: projectRoot, createTaskId: () => mahTaskId,
      command: async (args) => {
        if (args[1] === "show") return { exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "task_not_found" } }), stderr: "" };
        throw new Error("Process stopped before the MAH CLI was spawned.");
      },
    });
    await expect(interruptedProvider({ companyId, founderVision, projectRoot }))
      .rejects.toThrow("Process stopped before the MAH CLI was spawned");
    expect(repositories.mahCompanyPlanning.get(companyId)).toMatchObject({ mahTaskId, state: "submitting" });

    const submittedIds: string[] = [];
    let submitted = false;
    const recoveredProvider = createMahCompanyPlanProvider({
      repositories, mahProjectRoot: projectRoot,
      createTaskId: () => { throw new Error("Recovery must not mint a second UUID."); },
      pollMs: 0,
      command: async (args) => {
        if (args[1] === "show") return submitted
          ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: mahTaskId, status: "completed" } }), stderr: "" }
          : { exitCode: 1, stdout: JSON.stringify({ ok: false, error: { code: "task_not_found" } }), stderr: "" };
        if (args[1] === "submit") {
          submittedIds.push(args[args.indexOf("--task-id") + 1]);
          submitted = true;
          return { exitCode: 0, stdout: JSON.stringify({ task_id: mahTaskId }), stderr: "" };
        }
        return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(validCompanyPlan()) }), stderr: "" };
      },
    });
    await expect(recoveredProvider({ companyId, founderVision, projectRoot })).resolves.toEqual(validCompanyPlan());
    expect(submittedIds).toEqual([mahTaskId]);
    database.close();
  });

  it("uses an available local Agent to derive the Company Plan when MAH planning is not configured", async () => {
    const requests: AgentRunRequest[] = [];
    const localAgent: AgentAdapter = {
      id: "codex",
      name: "Codex",
      capabilities: ["research", "writing"],
      async detect() { return true; },
      async availability() { return { state: "ready" }; },
      async run(request) {
        requests.push(request);
        return {
          status: "complete",
          exitCode: 0,
          stdout: JSON.stringify(validCompanyPlan()),
          stderr: "",
        };
      },
    };
    const fixture = await startServer(undefined, [localAgent]);

    try {
      const response = await fetch(`${fixture.baseUrl}/api/companies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founderVision: "Help independent creators crop videos faster." }),
      });

      expect(response.status).toBe(202);
      const created = await response.json() as { company: { id: string } };
      const state = await waitForActiveCompany(fixture.baseUrl, created.company.id);

      expect(state.company).toMatchObject({ name: "Creator Validation Studio", status: "active" });
      expect(fixture.repositories.getCompany(created.company.id)).toMatchObject({
        selectedCeoAgentId: "codex",
        executionMode: "direct",
        mahConfig: null,
      });
      expect(fixture.repositories.listDepartments(created.company.id)[0]?.leadAgentId).toBe("codex");
      expect(state.departments).toHaveLength(1);
      expect(state.assignments).toHaveLength(1);
      expect(requests).toHaveLength(1);
      expect(requests[0]).toMatchObject({
        taskId: `${created.company.id}_company_plan`,
        metadata: { phase: "company_plan" },
        grant: { granted: [], withheld: [], id: "none" },
      });
      expect(requests[0]?.outputSchema).toMatchObject({ type: "object", additionalProperties: false });
      expect(JSON.stringify(state)).not.toMatch(/selectedCeoAgentId|executionMode|mahConfig|taskId|workQueue/i);

      const pausedResponse = await fetch(`${fixture.baseUrl}/api/companies/${created.company.id}/pause`, { method: "POST" });
      expect(pausedResponse.status).toBe(200);
      const paused = await pausedResponse.json() as Record<string, unknown>;
      expect(paused).toEqual({ company: expect.objectContaining({ id: created.company.id, status: "paused" }) });
      expect(JSON.stringify(paused)).not.toMatch(/selectedCeoAgentId|executionMode|playbookId|mahConfig|interruptedTasks|unreachableTasks|stoppedSessions/i);

      const conflictResponse = await fetch(`${fixture.baseUrl}/api/companies/${created.company.id}/pause`, { method: "POST" });
      expect(conflictResponse.status).toBe(409);
      const conflict = await conflictResponse.json() as Record<string, unknown>;
      expect(conflict).toEqual({
        error: "A paused company cannot pause.",
        company: expect.objectContaining({ id: created.company.id, status: "paused" }),
      });
      expect(JSON.stringify(conflict)).not.toMatch(/selectedCeoAgentId|executionMode|playbookId|mahConfig/i);
    } finally {
      await fixture.close();
    }
  });

  it("turns a Founder Vision and a valid MAH Company Plan artifact into Departments and Assignments", async () => {
    const companyPlan = {
      schemaVersion: 1,
      company: { name: "Creator Validation Studio" },
      objectives: [
        { id: "objective-validate-demand", title: "Validate demand from independent creators" },
      ],
      departments: [
        {
          id: "department-user-research",
          name: "User Research",
          responsibility: "Learn which cropping workflow creators will pay for.",
        },
      ],
      assignments: [
        {
          id: "assignment-interview-creators",
          departmentId: "department-user-research",
          objectiveId: "objective-validate-demand",
          title: "Interview independent creators",
          expectedOutcome: "A ranked list of painful cropping workflows.",
          dependsOnAssignmentIds: [],
          route: {
            kind: "ordinary_task",
            rationale: "This is business research, not a product capability change.",
          },
        },
      ],
    };
    const providerCalls: Array<Record<string, string>> = [];
    const fixture = await startServer(createCompanyPlanProvider(companyPlan, providerCalls));

    try {
      const response = await fetch(`${fixture.baseUrl}/api/companies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founderVision: "Help independent creators crop videos faster." }),
      });

      expect(response.status).toBe(202);
      const created = await response.json() as { company: { id: string } };
      const state = await waitForActiveCompany(fixture.baseUrl, created.company.id);

      expect(state.company).toMatchObject({
        id: created.company.id,
        name: "Creator Validation Studio",
        founderVision: "Help independent creators crop videos faster.",
        status: "active",
      });
      expect(state.departments).toEqual([
        expect.objectContaining({
          id: "department-user-research",
          name: "User Research",
          responsibility: "Learn which cropping workflow creators will pay for.",
        }),
      ]);
      expect(state.assignments).toEqual([
        expect.objectContaining({
          id: "assignment-interview-creators",
          departmentId: "department-user-research",
          objectiveId: "objective-validate-demand",
          dependsOnAssignmentIds: [],
          route: {
            kind: "ordinary_task",
            rationale: "This is business research, not a product capability change.",
          },
        }),
      ]);
      expect(state.company).not.toHaveProperty("selectedCeoAgentId");
      expect(state.company).not.toHaveProperty("executionMode");
      expect(state.company).not.toHaveProperty("mahConfig");
      expect(state).not.toHaveProperty("tasks");
      expect(providerCalls).toEqual([{
        companyId: created.company.id,
        founderVision: "Help independent creators crop videos faster.",
        projectRoot: fixture.projectRoot,
      }]);
      const listed = await (await fetch(`${fixture.baseUrl}/api/companies`)).json();
      expect(JSON.stringify(listed)).not.toMatch(/selectedCeoAgentId|executionMode|mahConfig|playbookId|taskId|workQueue/i);
    } finally {
      await fixture.close();
    }
  });

  it.each([
    ["a dangling department", (plan: any) => { plan.assignments[0].departmentId = "missing-department"; }],
    ["a dangling objective", (plan: any) => { plan.assignments[0].objectiveId = "missing-objective"; }],
    ["a duplicate assignment identity", (plan: any) => { plan.assignments.push({ ...plan.assignments[0] }); }],
    ["an invalid route", (plan: any) => { plan.assignments[0].route.kind = "direct_agent"; }],
    ["a dependency cycle", (plan: any) => { plan.assignments[0].dependsOnAssignmentIds = [plan.assignments[0].id]; }],
  ])("rejects %s without partially activating the company", async (_label, makeInvalid) => {
    const plan = validCompanyPlan();
    makeInvalid(plan);
    const fixture = await startServer(createCompanyPlanProvider(plan));

    try {
      const response = await fetch(`${fixture.baseUrl}/api/companies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founderVision: "Help independent creators crop videos faster." }),
      });
      expect(response.status).toBe(202);
      const created = await response.json() as { company: { id: string } };
      const state = await waitForCompanyStatus(fixture.baseUrl, created.company.id, "creation_failed");

      expect(state.departments).toEqual([]);
      expect(state.assignments).toEqual([]);
      expect(JSON.stringify(state)).not.toMatch(/selectedCeoAgentId|executionMode|mahConfig|taskId|workQueue/i);
    } finally {
      await fixture.close();
    }
  });

  it("rejects an empty Founder Vision before creating a company", async () => {
    const fixture = await startServer(createCompanyPlanProvider(validCompanyPlan()));
    try {
      const response = await fetch(`${fixture.baseUrl}/api/companies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founderVision: "   " }),
      });
      expect(response.status).toBe(400);
      expect(fixture.repositories.listCompanies()).toEqual([]);
    } finally {
      await fixture.close();
    }
  });

  it("does not accept execution details on the Founder Vision contract", async () => {
    const calls: Array<Record<string, string>> = [];
    const fixture = await startServer(createCompanyPlanProvider(validCompanyPlan(), calls));
    try {
      const response = await fetch(`${fixture.baseUrl}/api/companies`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ founderVision: "Build a useful company.", selectedCeoAgentId: "codex" }),
      });
      expect(response.status).toBe(400);
      expect(calls).toEqual([]);
      expect(fixture.repositories.listCompanies()).toEqual([]);
    } finally {
      await fixture.close();
    }
  });
});

function validCompanyPlan() {
  return {
    schemaVersion: 1,
    company: { name: "Creator Validation Studio" },
    objectives: [{ id: "objective-validate-demand", title: "Validate demand from independent creators" }],
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
      dependsOnAssignmentIds: [] as string[],
      route: { kind: "ordinary_task", rationale: "This is business research, not a product capability change." },
    }],
  };
}

function createCompanyPlanProvider(companyPlan: unknown, calls: Array<Record<string, string>> = []) {
  return async (input: { companyId: string; founderVision: string; projectRoot: string }) => {
    calls.push(input);
    return structuredClone(companyPlan);
  };
}

async function startServer(
  companyPlanProvider?: ReturnType<typeof createCompanyPlanProvider>,
  agents: AgentAdapter[] = [],
) {
  const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-company-planning-"));
  temporaryRoots.push(projectRoot);
  const database = createDatabaseClient(":memory:");
  migrate(database);
  const repositories = createRepositories(database);
  const server = createApiServer({ projectRoot, repositories, agents, companyPlanProvider });
  await new Promise<void>((resolve) => server.httpServer.listen(0, resolve));
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP server address.");

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    projectRoot,
    repositories,
    close: async () => {
      await new Promise<void>((resolve, reject) => {
        server.httpServer.close((error) => error ? reject(error) : resolve());
      });
      database.close();
    },
  };
}

async function waitForActiveCompany(baseUrl: string, companyId: string) {
  return waitForCompanyStatus(baseUrl, companyId, "active");
}

async function waitForCompanyStatus(baseUrl: string, companyId: string, status: string) {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const response = await fetch(`${baseUrl}/api/companies/${companyId}/state`);
    const state = await response.json() as {
      company: Record<string, unknown>;
      departments: unknown[];
      assignments: unknown[];
    };
    if (state.company.status === status) return state;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Company ${companyId} did not become ${status}.`);
}
