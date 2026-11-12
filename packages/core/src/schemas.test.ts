import { describe, expect, it } from "vitest";
import { assignmentResultSchema, companyPlanSchema } from "./schemas";

describe("MAH boundary contracts", () => {
  it("rejects Agent routing fields in a company plan", () => {
    const plan = {
      schemaVersion: 1, company: { name: "Company" }, objectives: [{ id: "o", title: "Objective" }],
      departments: [{ id: "d", name: "Department", responsibility: "Deliver" }],
      assignments: [{ id: "a", departmentId: "d", objectiveId: "o", title: "Work", expectedOutcome: "Done", dependsOnAssignmentIds: [], route: { kind: "ordinary_task", rationale: "Work" }, order: 0, stage: "research", assigneeAgentId: "codex" }],
    };
    expect(companyPlanSchema.safeParse(plan).success).toBe(false);
  });

  it("requires the MAH Assignment judgment to retain Agent and model identity", () => {
    const result = {
      schemaVersion: 1, kind: "assignment_result", assignmentId: "a", resultSummary: "Done", keyFindings: [],
      completedOutcome: "Done", limitations: [], downstreamFacts: [], recommendedNextAction: "Continue",
      judgment: { decision: "accepted", rationale: "Valid", satisfiedObligations: [], unsatisfiedObligations: [], evidenceReferences: [] },
    };
    expect(assignmentResultSchema.safeParse(result).success).toBe(false);
    expect(assignmentResultSchema.safeParse({ ...result, judgment: { ...result.judgment, agentId: "codex", modelId: "gpt" } }).success).toBe(true);
    expect(assignmentResultSchema.safeParse({ ...result, judgment: { ...result.judgment, agentId: "codex", modelId: "gpt", evidenceReferences: ["/tmp/evidence.txt"] } }).success).toBe(false);
  });
});
