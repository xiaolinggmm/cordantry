import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { CompanyPlan } from "@cordantry/core";
import type { AgentAdapter } from "../adapters/types";
import { noToolGrant } from "../policies/capabilityGrant";
import { createCompanyWorkspace } from "./workspace";

const nonEmptyString = { type: "string", minLength: 1 } as const;

function strictObject(properties: Record<string, unknown>) {
  return { type: "object", properties, required: Object.keys(properties), additionalProperties: false };
}

function nonEmptyArray(items: Record<string, unknown>) {
  return { type: "array", items, minItems: 1 };
}

export const companyPlanOutputSchema: Record<string, unknown> = {
  type: "object",
  properties: {
    schemaVersion: { const: 1 },
    company: strictObject({ name: nonEmptyString }),
    objectives: nonEmptyArray(strictObject({ id: nonEmptyString, title: nonEmptyString })),
    departments: nonEmptyArray(strictObject({
      id: nonEmptyString,
      name: nonEmptyString,
      responsibility: nonEmptyString,
    })),
    assignments: nonEmptyArray(strictObject({
      id: nonEmptyString,
      departmentId: nonEmptyString,
      objectiveId: nonEmptyString,
      title: nonEmptyString,
      expectedOutcome: nonEmptyString,
      dependsOnAssignmentIds: { type: "array", items: nonEmptyString },
      route: strictObject({
        kind: { enum: ["ordinary_task", "product_direction"] },
        rationale: nonEmptyString,
      }),
    })),
  },
  required: ["schemaVersion", "company", "objectives", "departments", "assignments"],
  additionalProperties: false,
};

export function createLocalCompanyPlanProvider(agent: AgentAdapter) {
  return async (input: { companyId: string; founderVision: string; projectRoot: string }): Promise<CompanyPlan> => {
    const workspace = createCompanyWorkspace(input.projectRoot, input.companyId);
    const prompt = [
      "Derive one Company Plan from the Founder Vision.",
      "Return only the JSON object required by the supplied output schema.",
      "Use stable descriptive IDs. Every Assignment must reference one declared Department and Objective.",
      "Dependencies must be acyclic. Route ordinary business work to ordinary_task and product capability or architecture work to product_direction.",
      `Founder Vision: ${input.founderVision}`,
    ].join("\n\n");
    const promptPath = join(workspace.companyRoot, "company-plan-prompt.md");
    writeFileSync(promptPath, prompt, "utf8");

    const result = await agent.run({
      taskId: `${input.companyId}_company_plan`,
      prompt,
      promptPath,
      workspacePath: workspace.companyRoot,
      metadata: { phase: "company_plan" },
      outputSchema: companyPlanOutputSchema,
      grant: noToolGrant,
    });
    if (result.status !== "complete") {
      throw new Error(result.stderr.trim() || "Local planning Agent failed.");
    }
    return JSON.parse(result.stdout.match(/```(?:json)?\s*([\s\S]*?)```/)?.[1] ?? result.stdout.trim()) as CompanyPlan;
  };
}
