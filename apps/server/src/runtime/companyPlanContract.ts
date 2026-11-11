const nonEmptyString = { type: "string", minLength: 1 } as const;

function strictObject(properties: Record<string, unknown>, required = Object.keys(properties)) {
  return { type: "object", properties, required, additionalProperties: false };
}

function nonEmptyArray(items: Record<string, unknown>) {
  return { type: "array", items, minItems: 1 };
}

const assignment = strictObject({
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
    order: { type: "integer", minimum: 0 },
    stage: { enum: ["research", "delivery", "acceptance", "direction_preparation", "founder_review", "product_delivery"] },
    directionKey: nonEmptyString,
  }, ["id", "departmentId", "objectiveId", "title", "expectedOutcome", "dependsOnAssignmentIds", "route", "order", "stage"]);

export const companyPlanOutputSchema: Record<string, unknown> = strictObject({
  schemaVersion: { const: 1 },
  company: strictObject({ name: nonEmptyString }),
  objectives: nonEmptyArray(strictObject({ id: nonEmptyString, title: nonEmptyString })),
  departments: nonEmptyArray(strictObject({
    id: nonEmptyString,
    name: nonEmptyString,
    responsibility: nonEmptyString,
  })),
  assignments: nonEmptyArray(assignment),
});
