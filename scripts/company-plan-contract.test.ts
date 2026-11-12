import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { createApiServer, createDatabaseClient, createRepositories, migrate } from "@cordantry/server";
import { createApiClient } from "../apps/dashboard/src/api/client";

const roots: string[] = [];
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })));

it("serves the receipt and public Company Plan snapshot through the real Dashboard client", async () => {
  const projectRoot = mkdtempSync(join(tmpdir(), "cordantry-company-contract-"));
  roots.push(projectRoot);
  const database = createDatabaseClient(":memory:");
  migrate(database);
  const repositories = createRepositories(database);
  const server = createApiServer({
    projectRoot,
    repositories,
    companyPlanProvider: async () => ({
      schemaVersion: 1,
      company: { name: "Creator Studio" },
      objectives: [{ id: "objective_1", title: "Validate demand" }],
      departments: [{ id: "department_1", name: "Research", responsibility: "Learn what creators need." }],
      assignments: [{ id: "assignment_1", departmentId: "department_1", objectiveId: "objective_1", title: "Interview creators", expectedOutcome: "A ranked problem list.", dependsOnAssignmentIds: [], route: { kind: "ordinary_task", rationale: "Business research." }, order: 0, stage: "research" }],
    }),
  });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  const address = server.httpServer.address();
  if (!address || typeof address === "string") throw new Error("Expected TCP address.");
  const client = createApiClient(`http://127.0.0.1:${address.port}`);

  try {
    const receipt = await client.createCompany({ founderVision: "Help creators crop video faster.", creationIdempotencyKey: "contract-test" });
    if (!("kind" in receipt) || receipt.kind !== "company_creation_receipt") throw new Error("Expected a creation receipt.");
    let snapshot = await client.getCompanyState(receipt.company.id);
    for (let attempt = 0; attempt < 30 && (!("kind" in snapshot) || snapshot.company.status !== "active"); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 5));
      snapshot = await client.getCompanyState(receipt.company.id);
    }
    expect(snapshot).toMatchObject({
      schemaVersion: 1,
      kind: "company_state",
      company: { id: receipt.company.id, status: "active" },
      objectives: [{ id: "objective_1" }],
      departments: [{ id: "department_1" }],
      assignments: [{ id: "assignment_1", status: "ready" }],
    });
    expect(JSON.stringify({ receipt, snapshot })).not.toMatch(/taskId|executionMode|mahConfig|Work Queue|rawLog|stderr|stdout/);
  } finally {
    await new Promise<void>((resolve, reject) => server.httpServer.close((error) => error ? reject(error) : resolve()));
    database.close();
  }
});
