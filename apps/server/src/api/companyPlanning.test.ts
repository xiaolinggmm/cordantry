import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createDatabaseClient } from "../db/client";
import { createRepositories } from "../db/repositories";
import { migrate } from "../db/schema";
import { createApiServer } from "./routes";

const temporaryRoots: string[] = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("MAH-owned company planning API", () => {
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

async function startServer(companyPlanProvider: ReturnType<typeof createCompanyPlanProvider>) {
  const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-company-planning-"));
  temporaryRoots.push(projectRoot);
  const database = createDatabaseClient(":memory:");
  migrate(database);
  const repositories = createRepositories(database);
  const server = createApiServer({ projectRoot, repositories, agents: [], companyPlanProvider });
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
