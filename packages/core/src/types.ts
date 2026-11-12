export type CompanyStatus = "creating" | "creation_failed" | "active" | "paused" | "stopped";

export type Company = {
  id: string;
  name: string;
  founderVision: string;
  status: CompanyStatus;
  creationIdempotencyKey?: string | null;
  creationInput?: { companyName?: string; founderVision: string } | null;
  createdAt: string;
  updatedAt: string;
};

export type Objective = {
  id: string;
  companyId: string;
  title: string;
  status: "active" | "complete" | "paused";
  priority: number;
};

export type Department = {
  id: string;
  companyId: string;
  name: string;
  responsibility: string;
};

export type CompanyPlanRoute = { kind: "ordinary_task" | "product_direction"; rationale: string };
export type AssignmentBusinessStatus = "waiting" | "ready" | "in_progress" | "needs_founder" | "completed" | "stopped";
export type AssignmentStage = "research" | "delivery" | "acceptance" | "direction_preparation" | "founder_review" | "product_delivery";

export type DepartmentAssignment = {
  id: string;
  companyId: string;
  departmentId: string;
  objectiveId: string;
  title: string;
  expectedOutcome: string;
  dependsOnAssignmentIds: string[];
  route: CompanyPlanRoute;
  order: number;
  stage: AssignmentStage;
  status: AssignmentBusinessStatus;
  directionKey?: string | null;
};

export type CompanyEvent = {
  id: string;
  companyId: string;
  type: string;
  message: string;
  createdAt: string;
  status?: CompanyStatus | null;
  sequence: number;
  kind: string;
  occurredAt: string;
  businessPayload: Record<string, unknown>;
};
