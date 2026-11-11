import { expect, it } from "vitest";
import { createDatabaseClient } from "./client";
import { createRepositories } from "./repositories";
import { applyCompanyPlanDataCutover, migrate } from "./schema";

it("clears old operational company data once and preserves data created after the cutover", () => {
  const database = createDatabaseClient(":memory:");
  migrate(database);
  database.prepare("DELETE FROM cordantry_data_format").run();
  const repositories = createRepositories(database);
  repositories.createCompany(company("old_company"));

  applyCompanyPlanDataCutover(database);
  expect(repositories.listCompanies()).toEqual([]);

  repositories.createCompany(company("new_company"));
  applyCompanyPlanDataCutover(database);
  expect(repositories.listCompanies().map((item) => item.id)).toEqual(["new_company"]);
  database.close();
});

function company(id: string) {
  return { id, name: "Test", founderVision: "Test", locale: "en" as const, selectedCeoAgentId: "mah", playbookId: "mah-company-plan", permissionMode: null, executionMode: "mah" as const, mahConfig: null, status: "active" as const, createdAt: "2026-11-10T00:00:00.000Z", updatedAt: "2026-11-10T00:00:00.000Z" };
}
