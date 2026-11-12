import { z } from "zod";

const nonEmptyString = z.string().trim().min(1);
const id = nonEmptyString;

export const companyPlanSchema = z.object({
  schemaVersion: z.literal(1),
  company: z.object({ name: nonEmptyString }).strict(),
  objectives: z.array(z.object({ id, title: nonEmptyString }).strict()).min(1),
  departments: z.array(z.object({ id, name: nonEmptyString, responsibility: nonEmptyString }).strict()).min(1),
  assignments: z.array(z.object({
    id,
    departmentId: id,
    objectiveId: id,
    title: nonEmptyString,
    expectedOutcome: nonEmptyString,
    dependsOnAssignmentIds: z.array(id),
    route: z.object({ kind: z.enum(["ordinary_task", "product_direction"]), rationale: nonEmptyString }).strict(),
    order: z.number().int().nonnegative(),
    stage: z.enum(["research", "delivery", "acceptance", "direction_preparation", "founder_review", "product_delivery"]),
    directionKey: id.optional(),
  }).strict()).min(1),
}).strict().superRefine((plan, context) => {
  const unique = (values: string[], path: string) => {
    const seen = new Set<string>();
    values.forEach((value, index) => {
      if (seen.has(value)) context.addIssue({ code: "custom", path: [path, index, "id"], message: `Duplicate ${path} id: ${value}` });
      seen.add(value);
    });
  };
  unique(plan.objectives.map((item) => item.id), "objectives");
  unique(plan.departments.map((item) => item.id), "departments");
  unique(plan.assignments.map((item) => item.id), "assignments");
  const objectiveIds = new Set(plan.objectives.map((item) => item.id));
  const departmentIds = new Set(plan.departments.map((item) => item.id));
  const assignmentIds = new Set(plan.assignments.map((item) => item.id));
  const orders = new Set<number>();
  plan.assignments.forEach((assignment, index) => {
    if (!departmentIds.has(assignment.departmentId)) context.addIssue({ code: "custom", path: ["assignments", index, "departmentId"], message: `Missing department: ${assignment.departmentId}` });
    if (!objectiveIds.has(assignment.objectiveId)) context.addIssue({ code: "custom", path: ["assignments", index, "objectiveId"], message: `Missing objective: ${assignment.objectiveId}` });
    if (orders.has(assignment.order)) context.addIssue({ code: "custom", path: ["assignments", index, "order"], message: `Duplicate assignment order: ${assignment.order}` });
    orders.add(assignment.order);
    assignment.dependsOnAssignmentIds.forEach((dependencyId, dependencyIndex) => {
      if (!assignmentIds.has(dependencyId)) context.addIssue({ code: "custom", path: ["assignments", index, "dependsOnAssignmentIds", dependencyIndex], message: `Missing assignment dependency: ${dependencyId}` });
    });
    if (assignment.route.kind === "ordinary_task" && !["research", "delivery", "acceptance"].includes(assignment.stage)) context.addIssue({ code: "custom", path: ["assignments", index, "stage"], message: "Ordinary work requires an ordinary Assignment stage." });
    if (assignment.route.kind === "product_direction" && !assignment.directionKey) context.addIssue({ code: "custom", path: ["assignments", index, "directionKey"], message: "Product Direction work requires a direction key." });
  });
  const dependencies = new Map(plan.assignments.map((item) => [item.id, item.dependsOnAssignmentIds]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const cyclic = (assignmentId: string): boolean => {
    if (visiting.has(assignmentId)) return true;
    if (visited.has(assignmentId)) return false;
    visiting.add(assignmentId);
    const found = (dependencies.get(assignmentId) ?? []).some(cyclic);
    visiting.delete(assignmentId);
    visited.add(assignmentId);
    return found;
  };
  if (plan.assignments.some((item) => cyclic(item.id))) context.addIssue({ code: "custom", path: ["assignments"], message: "Assignment dependencies must be acyclic." });
});

export type CompanyPlan = z.infer<typeof companyPlanSchema>;

const evidenceReference = nonEmptyString.refine((value) => value.startsWith("artifacts/") && !value.split("/").includes(".."), "Evidence references must name a file inside artifacts/.");

export const assignmentResultSchema = z.object({
  schemaVersion: z.literal(1),
  kind: z.literal("assignment_result"),
  assignmentId: nonEmptyString,
  resultSummary: nonEmptyString,
  keyFindings: z.array(nonEmptyString),
  completedOutcome: nonEmptyString,
  limitations: z.array(nonEmptyString),
  downstreamFacts: z.array(z.object({ key: nonEmptyString, value: nonEmptyString }).strict()),
  recommendedNextAction: nonEmptyString,
  judgment: z.object({
    decision: z.enum(["accepted", "rejected"]),
    rationale: nonEmptyString,
    satisfiedObligations: z.array(nonEmptyString),
    unsatisfiedObligations: z.array(nonEmptyString),
    evidenceReferences: z.array(evidenceReference),
    agentId: nonEmptyString,
    modelId: nonEmptyString,
  }).strict(),
}).strict();

export type AssignmentResult = z.infer<typeof assignmentResultSchema>;
