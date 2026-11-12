import { expect, test } from "@playwright/test";

test("creates a company from Founder Vision without direct Agent routing", async ({ page }) => {
  const requests: unknown[] = [];
  const company = { id: "company-1", name: "MAH Company", founderVision: "Help creators", status: "active", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z" };
  await page.route(/^http:\/\/127\.0\.0\.1:5175\/api\//, async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === "/api/events") return route.abort();
    if (request.method() === "POST" && path === "/api/companies") {
      requests.push(request.postDataJSON());
      return route.fulfill({ json: { schemaVersion: 1, kind: "company_creation_receipt", company, createdAt: company.createdAt } });
    }
    if (path === "/api/companies/company-1/state") return route.fulfill({ json: {
      schemaVersion: 1, kind: "company_state", lastEventSequence: 6, company, problem: null,
      objectives: [{ id: "objective-1", title: "Validate demand", status: "active", priority: 0 }],
      departments: [{ id: "department-1", name: "Research", responsibility: "Learn what creators need" }],
      assignments: [{ id: "assignment-1", departmentId: "department-1", objectiveId: "objective-1", title: "Interview creators", expectedOutcome: "Ranked needs", dependsOnAssignmentIds: [], route: { kind: "ordinary_task", rationale: "Research" }, order: 0, stage: "research", status: "ready", result: null }],
    } });
    return route.fulfill({ json: { companies: [] } });
  });

  await page.goto("/");
  await page.getByRole("button", { name: "Create directly" }).click();
  await page.getByLabel("Company name").fill("Creator Studio");
  await page.getByLabel("Founder vision").fill("Help creators");
  await page.getByRole("button", { name: "Create Company" }).click();
  await expect(page.getByRole("heading", { name: "MAH Company" })).toBeVisible();
  await expect(page.getByText("Interview creators")).toBeVisible();
  expect(requests).toHaveLength(1);
  expect(requests[0]).toMatchObject({ companyName: "Creator Studio", founderVision: "Help creators" });
  expect(JSON.stringify(requests[0])).not.toMatch(/executionMode|agentId|mahConfig|slot|cliPath/i);
});
