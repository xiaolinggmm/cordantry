import type { Company, DepartmentAssignment } from "@cordantry/core";
import { createDatabaseClient } from "../db/client";
import { createRepositories } from "../db/repositories";
import { migrate } from "../db/schema";

export function createTestRepositories() {
  const database = createDatabaseClient(":memory:");
  migrate(database);
  return { database, repositories: createRepositories(database) };
}

export const company: Company = {
  id: "company-1", name: "Example", founderVision: "Build a useful product", status: "active",
  creationIdempotencyKey: "creation-1", creationInput: { founderVision: "Build a useful product" },
  createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
};

export function seedOrganization(repositories: ReturnType<typeof createRepositories>) {
  repositories.createCompany(company);
  repositories.createObjective({ id: "objective-1", companyId: company.id, title: "Ship", status: "active", priority: 0 });
  repositories.createDepartment({ id: "department-1", companyId: company.id, name: "Product", responsibility: "Ship the product" });
}

export function assignment(overrides: Partial<DepartmentAssignment> = {}): DepartmentAssignment {
  return {
    id: "assignment-1", companyId: company.id, departmentId: "department-1", objectiveId: "objective-1",
    title: "Implement the change", expectedOutcome: "The change is verified", dependsOnAssignmentIds: [],
    route: { kind: "ordinary_task", rationale: "Implementation work" }, order: 0, stage: "research", status: "ready",
    directionKey: null, ...overrides,
  };
}
