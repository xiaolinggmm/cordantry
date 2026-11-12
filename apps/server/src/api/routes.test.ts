import { afterEach, describe, expect, it } from "vitest";
import type { AddressInfo } from "node:net";
import { createApiServer, type CompanyPlanProvider } from "./routes";
import { createTestRepositories } from "../test/fixtures";

const servers: Array<ReturnType<typeof createApiServer>["httpServer"]> = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => new Promise<void>((resolve) => server.close(() => resolve()))));
});

async function start(provider?: CompanyPlanProvider) {
  const { database, repositories } = createTestRepositories();
  const api = createApiServer({ repositories, projectRoot: "/project", companyPlanProvider: provider, createId: (() => { let value = 0; return (prefix) => `${prefix}-${++value}`; })() });
  await new Promise<void>((resolve) => api.httpServer.listen(0, "127.0.0.1", resolve));
  servers.push(api.httpServer);
  const address = api.httpServer.address() as AddressInfo;
  return { database, repositories, url: `http://127.0.0.1:${address.port}` };
}

const plan = {
  schemaVersion: 1 as const, company: { name: "MAH Company" },
  objectives: [{ id: "objective-1", title: "Launch" }],
  departments: [{ id: "department-1", name: "Product", responsibility: "Deliver" }],
  assignments: [{ id: "assignment-1", departmentId: "department-1", objectiveId: "objective-1", title: "Build", expectedOutcome: "Built", dependsOnAssignmentIds: [], route: { kind: "ordinary_task" as const, rationale: "Execution" }, order: 0, stage: "research" as const }],
};

describe("MAH-only company API", () => {
  it("accepts only Founder Vision and materializes a MAH plan", async () => {
    const runtime = await start(async () => plan);
    const response = await fetch(`${runtime.url}/api/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ founderVision: "Build it" }) });
    expect(response.status).toBe(202);
    const receipt = await response.json() as { company: { id: string } };
    await expect.poll(() => runtime.repositories.getCompany(receipt.company.id)?.status).toBe("active");
    const state = await fetch(`${runtime.url}/api/companies/${receipt.company.id}/state`).then((value) => value.json()) as Record<string, unknown> & { assignments: Array<Record<string, unknown>> };
    expect(state.assignments).toHaveLength(1);
    expect(state.assignments[0]).not.toHaveProperty("companyId");
    expect(JSON.stringify(state)).not.toMatch(/executionMode|selectedCeoAgentId|assigneeAgentId|leadAgentId/);
    runtime.database.close();
  });

  it("rejects legacy routing input and exposes no Agent endpoint", async () => {
    const runtime = await start(async () => plan);
    const legacy = await fetch(`${runtime.url}/api/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ founderVision: "Build it", executionMode: "codex" }) });
    expect(legacy.status).toBe(400);
    expect((await fetch(`${runtime.url}/api/agents`)).status).toBe(404);
    runtime.database.close();
  });

  it("fails explicitly when MAH is unavailable and never falls back", async () => {
    const runtime = await start();
    const response = await fetch(`${runtime.url}/api/companies`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ founderVision: "Build it" }) });
    expect(response.status).toBe(503);
    const body = await response.json() as { category: string; company: { status: string } };
    expect(body).toMatchObject({ category: "installation_required", company: { status: "creation_failed" } });
    expect(runtime.repositories.listDepartmentAssignments(body.company.status)).toEqual([]);
    runtime.database.close();
  });
});
