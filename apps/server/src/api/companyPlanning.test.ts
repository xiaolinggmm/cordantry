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
  it("uses one linked correction Task when the first Company Plan is structurally invalid", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-mah-company-correction-"));
    temporaryRoots.push(projectRoot);
    const database = createDatabaseClient(":memory:");
    migrate(database);
    const repositories = createRepositories(database);
    repositories.createCompany({ id: "company_1", name: "Planning company", founderVision: "Help creators.", locale: "en", selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null, executionMode: "mah", mahConfig: null, status: "creating", createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z" });
    const taskIds = ["planning-task", "correction-task"];
    const submitted = new Set<string>();
    const command: MahCommand = async (args) => {
      const taskId = args.includes("--task-id") ? args[args.indexOf("--task-id") + 1] : args[2];
      if (args[1] === "show") return submitted.has(taskId)
        ? { exitCode: 0, stdout: JSON.stringify({ ok: true, task: { task_id: taskId, status: "completed" } }), stderr: "" }
        : { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" };
      if (args[1] === "submit") { submitted.add(taskId); return { exitCode: 0, stdout: JSON.stringify({ task_id: taskId }), stderr: "" }; }
      if (args[1] === "context") return { exitCode: 0, stdout: JSON.stringify({ content: JSON.stringify(taskId === taskIds[0] ? { ...validCompanyPlan(), departments: [] } : validCompanyPlan()) }), stderr: "" };
      throw new Error(`Unexpected MAH command: ${args.join(" ")}`);
    };
    let idIndex = 0;
    const provider = createMahCompanyPlanProvider({ repositories, mahProjectRoot: projectRoot, command, createTaskId: () => taskIds[idIndex++], pollMs: 0 });

    await expect(provider({ companyId: "company_1", founderVision: "Help creators.", projectRoot })).resolves.toEqual(validCompanyPlan());
    expect([...submitted]).toEqual(taskIds);
    expect(repositories.mahCompanyPlanning.get("company_1")).toMatchObject({
      mahTaskId: taskIds[0], activeTaskId: taskIds[1], taskLineage: taskIds, correctionCount: 1, state: "completed",
    });
    database.close();
  });

  it("only rechecks the stable planning Task after the admission deadline", async () => {
    const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-mah-deadline-"));
    temporaryRoots.push(projectRoot);
    const database = createDatabaseClient(":memory:");
    migrate(database);
    const repositories = createRepositories(database);
    const at = "2026-11-10T00:00:00.000Z";
    repositories.createCompany({ id: "company_1", name: "Planning company", founderVision: "Help creators.", locale: "en", selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null, executionMode: "mah", mahConfig: null, status: "creation_failed", createdAt: at, updatedAt: at });
    const taskId = "stable-deadline-task";
    const first = createMahCompanyPlanProvider({
      repositories, mahProjectRoot: projectRoot, createTaskId: () => taskId, timeoutMs: 1,
      now: () => new Date(at),
      command: async (args) => {
        if (args[1] === "show") return { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" };
        throw new Error("submit interrupted");
      },
    });
    await expect(first({ companyId: "company_1", founderVision: "Help creators.", projectRoot })).rejects.toThrow("submit interrupted");

    let submitCalls = 0;
    const recheck = createMahCompanyPlanProvider({
      repositories, mahProjectRoot: projectRoot, now: () => new Date("2026-11-10T00:00:02.000Z"),
      command: async (args) => {
        if (args[1] === "show") return { exitCode: 1, stdout: JSON.stringify({ error: { code: "task_not_found" } }), stderr: "" };
        if (args[1] === "submit") submitCalls += 1;
        return { exitCode: 1, stdout: "", stderr: "unexpected" };
      },
    });
    await expect(recheck({ companyId: "company_1", founderVision: "Help creators.", projectRoot })).rejects.toThrow("only recheck the original Task");
    expect(submitCalls).toBe(0);
    expect(repositories.mahCompanyPlanning.get("company_1")).toMatchObject({ mahTaskId: taskId, submitCount: 1, state: "unknown" });
    database.close();
  });

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
      const created = await response.json() as { schemaVersion: number; kind: string; createdAt: string; company: { id: string } };
      expect(created).toMatchObject({
        schemaVersion: 1,
        kind: "company_creation_receipt",
        createdAt: expect.any(String),
        company: { status: "creating" },
      });
      expect(created).not.toHaveProperty("departments");
      expect(created).not.toHaveProperty("assignments");
      const state = await waitForActiveCompany(baseUrl, created.company.id);
      expect(state).toMatchObject({
        schemaVersion: 1,
        kind: "company_state",
        lastEventSequence: 6,
      });
      expect(repositories.listCompanyEventsForCompany(created.company.id)).toMatchObject([
        { sequence: 1, kind: "creation_request_accepted" },
        { sequence: 2, kind: "plan_requested" },
        { sequence: 3, kind: "artifact_received" },
        { sequence: 4, kind: "plan_validated" },
        { sequence: 5, kind: "organization_created" },
        { sequence: 6, kind: "company_ready" },
      ]);

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
    await expect(unresolvedProvider({ companyId, founderVision, projectRoot }))
      .rejects.toThrow("confirming that the original MAH Task does not exist");
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
    await expect(recoveredProvider({ companyId, founderVision, projectRoot }))
      .rejects.toThrow("confirming that the original MAH Task does not exist");
    expect(submittedIds).toEqual([]);
    expect(repositories.mahCompanyPlanning.get(companyId)).toMatchObject({
      mahTaskId,
      submitCount: 1,
      taskNotFoundCount: 1,
    });

    await expect(recoveredProvider({ companyId, founderVision, projectRoot })).resolves.toEqual(validCompanyPlan());
    expect(submittedIds).toEqual([mahTaskId]);
    expect(repositories.mahCompanyPlanning.get(companyId)).toMatchObject({ mahTaskId, submitCount: 2 });
    database.close();
  });

  it("does not fall back to a local Agent when MAH planning is not configured", async () => {
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

      expect(response.status).toBe(503);
      const problem = await response.json() as { company: { id: string; status: string } };
      expect(problem).toMatchObject({
        schemaVersion: 1,
        kind: "company_problem",
        category: "installation_required",
        availableActions: [
          { kind: "download_mah", url: "https://mah.bot/download" },
          { kind: "recheck" },
        ],
        company: { status: "creation_failed" },
      });
      expect(fixture.repositories.getCompany(problem.company.id)).toMatchObject({
        founderVision: "Help independent creators crop videos faster.",
        status: "creation_failed",
      });
      expect(await (await fetch(`${fixture.baseUrl}/api/companies/${problem.company.id}/state`)).json()).toMatchObject({
        problem: { category: "installation_required", availableActions: [{ kind: "download_mah" }, { kind: "recheck" }] },
      });
      expect(requests).toHaveLength(0);
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
          order: 0,
          stage: "research",
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
          order: 0,
          stage: "research",
          status: "ready",
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
      expect(state.problem).toMatchObject({ category: "try_again_later", availableActions: [{ kind: "try_again" }] });
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

  it("returns the same Receipt for the same idempotency key and rejects changed input", async () => {
    const fixture = await startServer(createCompanyPlanProvider(validCompanyPlan()));
    const post = (founderVision: string) => fetch(`${fixture.baseUrl}/api/companies`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ founderVision, creationIdempotencyKey: "founder-request-1" }),
    });
    try {
      const first = await post("Help creators crop video faster.");
      const firstReceipt = await first.json() as { company: { id: string } };
      const second = await post("Help creators crop video faster.");
      const secondReceipt = await second.json() as { company: { id: string } };
      expect(first.status).toBe(202);
      expect(second.status).toBe(202);
      expect(secondReceipt.company.id).toBe(firstReceipt.company.id);
      expect(fixture.repositories.listCompanies()).toHaveLength(1);

      const conflict = await post("Build a different company.");
      expect(conflict.status).toBe(409);
      expect(await conflict.json()).toMatchObject({ schemaVersion: 1, kind: "company_problem" });
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
      order: 0,
      stage: "research",
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
      problem?: Record<string, unknown> | null;
    };
    if (state.company.status === status) return state;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error(`Company ${companyId} did not become ${status}.`);
}
