import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { assignmentResultSchema, type DepartmentAssignment } from "@cordantry/core";
import type { MahCommand } from "../adapters/mahCli";
import type { createRepositories } from "../db/repositories";
import type { AssignmentExecutionBinding } from "../db/assignmentExecution";

type Repositories = ReturnType<typeof createRepositories>;

export async function runAssignmentCoordinatorOnce(input: {
  repositories: Repositories;
  cordantryProjectRoot: string;
  mahProjectRoot: string;
  command: MahCommand;
  createTaskId?: () => string;
  now?: () => Date;
  reconciliationTimeoutMs?: number;
  requestCoordinatorWake?: () => void;
}): Promise<void> {
  const now = input.now ?? (() => new Date());
  for (const company of input.repositories.listCompanies()) {
    if (!["active", "paused", "stopped"].includes(company.status)) continue;
    const assignments = input.repositories.listDepartmentAssignments(company.id);
    for (const assignment of assignments) {
      if (assignment.route.kind !== "ordinary_task") continue;
      if (assignment.status === "ready" && company.status === "active") {
        await admitAndObserveAssignment(input, company.id, assignment, now);
      } else if (assignment.status === "in_progress") {
        await observeAdmittedAssignment(input, assignment, now);
      }
    }
  }
}

async function admitAndObserveAssignment(
  input: Parameters<typeof runAssignmentCoordinatorOnce>[0],
  companyId: string,
  assignment: DepartmentAssignment,
  now: () => Date,
): Promise<void> {
  const requestDigest = digest({
    assignment: {
      id: assignment.id,
      companyId: assignment.companyId,
      departmentId: assignment.departmentId,
      objectiveId: assignment.objectiveId,
      title: assignment.title,
      expectedOutcome: assignment.expectedOutcome,
      dependsOnAssignmentIds: assignment.dependsOnAssignmentIds,
      route: assignment.route,
      order: assignment.order,
      directionKey: assignment.directionKey,
    },
    upstream: upstreamResults(input.repositories, assignment),
  });
  let binding = input.repositories.assignmentExecution.getBinding(assignment.id);
  if (!binding) {
    const timestamp = now().toISOString();
    binding = {
      assignmentId: assignment.id,
      companyId,
      mahTaskId: (input.createTaskId ?? randomUUID)(),
      projectRoot: input.mahProjectRoot,
      requestDigest,
      state: "prepared",
      submitCount: 0,
      taskNotFoundCount: 0,
      reconciliationDeadline: new Date(now().getTime() + (input.reconciliationTimeoutMs ?? 10 * 60_000)).toISOString(),
      detail: "Assignment identity prepared.",
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    input.repositories.assignmentExecution.saveBinding(binding);
  }
  if (binding.requestDigest !== requestDigest || binding.projectRoot !== input.mahProjectRoot) {
    throw new Error(`Assignment ${assignment.id} conflicts with its persisted execution identity.`);
  }

  let observation = await observe(input.command, binding);
  if (observation.kind === "missing") {
    if (binding.state !== "prepared") {
      binding = { ...binding, state: "unknown", taskNotFoundCount: binding.taskNotFoundCount + 1, detail: "Confirming whether Assignment work started.", updatedAt: now().toISOString() };
      input.repositories.assignmentExecution.saveBinding(binding);
      if (binding.taskNotFoundCount < 2 || binding.submitCount >= 2) return;
    }
    binding = { ...binding, state: "submitting", submitCount: binding.submitCount + 1, updatedAt: now().toISOString() };
    input.repositories.assignmentExecution.saveBinding(binding);
    const paths = writeAssignmentRequest(input.cordantryProjectRoot, binding, assignment, upstreamResults(input.repositories, assignment));
    const submitted = await input.command([
      "task", "submit", "--cwd", input.mahProjectRoot, "--task-id", binding.mahTaskId,
      "--description-file", paths.description, "--title", assignment.title,
      "--meta-file", paths.metadata, "--attach", paths.schema, "--no-write", "--format", "json",
    ]);
    let body: { task_id?: string } | null = null;
    try { body = JSON.parse(submitted.stdout) as { task_id?: string }; } catch { /* classified below */ }
    const accepted = submitted.exitCode === 0 && body?.task_id === binding.mahTaskId;
    binding = { ...binding, state: accepted ? "submitted" : "unknown", detail: accepted ? "Assignment work started." : "Confirming whether Assignment work started.", updatedAt: now().toISOString() };
    input.repositories.assignmentExecution.saveBinding(binding);
    input.repositories.updateDepartmentAssignment(assignment.id, { status: "in_progress", stage: "delivery" });
    observation = await observe(input.command, binding);
    if (!accepted && observation.kind === "missing") {
      input.repositories.assignmentExecution.saveBinding({ ...binding, taskNotFoundCount: binding.taskNotFoundCount + 1, updatedAt: now().toISOString() });
      return;
    }
  }
  await settleObservation(input, { ...assignment, status: "in_progress", stage: "delivery" }, binding, observation, now);
}

async function observeAdmittedAssignment(
  input: Parameters<typeof runAssignmentCoordinatorOnce>[0],
  assignment: DepartmentAssignment,
  now: () => Date,
): Promise<void> {
  const binding = input.repositories.assignmentExecution.getBinding(assignment.id);
  if (!binding) {
    input.repositories.updateDepartmentAssignment(assignment.id, { status: "stopped", stage: assignment.stage });
    return;
  }
  const observation = await observe(input.command, binding);
  if (observation.kind === "missing") {
    if (binding.state === "admitted") return;
    const missing = {
      ...binding,
      state: "unknown" as const,
      taskNotFoundCount: binding.taskNotFoundCount + 1,
      detail: "Confirming whether Assignment work started.",
      updatedAt: now().toISOString(),
    };
    input.repositories.assignmentExecution.saveBinding(missing);
    if (now().getTime() >= new Date(missing.reconciliationDeadline).getTime()) {
      stopAssignment(input.repositories, assignment, missing, "Assignment admission could not be confirmed before its deadline.", now());
      return;
    }
    if (missing.taskNotFoundCount >= 2 && missing.submitCount < 2) {
      input.repositories.updateDepartmentAssignment(assignment.id, { status: "ready", stage: assignment.stage });
      await admitAndObserveAssignment(input, assignment.companyId, { ...assignment, status: "ready" }, now);
    }
    return;
  }
  if (observation.kind === "unknown" && binding.state === "admitted") return;
  if (observation.kind === "unknown" && now().getTime() >= new Date(binding.reconciliationDeadline).getTime()) {
    stopAssignment(input.repositories, assignment, binding, "Assignment admission could not be confirmed before its deadline.", now());
    return;
  }
  await settleObservation(input, assignment, binding, observation, now);
}

async function settleObservation(
  input: Parameters<typeof runAssignmentCoordinatorOnce>[0],
  assignment: DepartmentAssignment,
  binding: AssignmentExecutionBinding,
  observation: Awaited<ReturnType<typeof observe>>,
  now: () => Date,
): Promise<void> {
  if (observation.kind !== "available") return;
  if (["failed", "cancelled", "yielded"].includes(observation.status)) {
    input.repositories.transaction(() => {
      input.repositories.assignmentExecution.saveBinding({ ...binding, state: "failed", detail: `MAH work ended with ${observation.status}.`, updatedAt: now().toISOString() });
      input.repositories.updateDepartmentAssignment(assignment.id, { status: "stopped", stage: assignment.stage });
    });
    return;
  }
  if (observation.status !== "completed") {
    const observedAt = now();
    if (binding.state !== "admitted") {
      input.repositories.assignmentExecution.saveBinding({
        ...binding,
        state: "admitted",
        detail: "Assignment work is in progress.",
        reconciliationDeadline: new Date(observedAt.getTime() + (input.reconciliationTimeoutMs ?? 10 * 60_000)).toISOString(),
        updatedAt: observedAt.toISOString(),
      });
    }
    return;
  }

  const response = await input.command(["task", "context", binding.mahTaskId, "--cwd", binding.projectRoot, "--read", "artifacts/assignment-result.json", "--format", "json"]);
  let context: { content?: string | null } | null = null;
  try { context = JSON.parse(response.stdout) as { content?: string | null }; } catch { /* handled below */ }
  if (response.exitCode !== 0 || typeof context?.content !== "string") {
    const observedAt = now();
    if (observedAt.getTime() >= new Date(binding.reconciliationDeadline).getTime()) {
      stopAssignment(input.repositories, assignment, binding, "Assignment result is missing or unreadable.", observedAt, "acceptance");
    } else {
      input.repositories.assignmentExecution.saveBinding({ ...binding, state: "admitted", detail: "Waiting for the completed Assignment result to become readable.", updatedAt: observedAt.toISOString() });
    }
    return;
  }
  let result;
  try {
    result = assignmentResultSchema.parse(JSON.parse(context.content));
  } catch {
    stopAssignment(input.repositories, assignment, binding, "Assignment result is not valid.", now(), "acceptance");
    return;
  }
  if (result.assignmentId !== assignment.id) {
    stopAssignment(input.repositories, assignment, binding, "Assignment result does not match its work item.", now(), "acceptance");
    return;
  }
  for (const reference of result.judgment.evidenceReferences) {
    const evidence = await input.command(["task", "context", binding.mahTaskId, "--cwd", binding.projectRoot, "--read", reference, "--format", "json"]);
    let evidenceBody: { content?: string | null } | null = null;
    try { evidenceBody = JSON.parse(evidence.stdout) as { content?: string | null }; } catch { /* handled below */ }
    if (evidence.exitCode !== 0 || typeof evidenceBody?.content !== "string") {
      const observedAt = now();
      if (observedAt.getTime() >= new Date(binding.reconciliationDeadline).getTime()) {
        stopAssignment(input.repositories, assignment, binding, "Assignment evidence is missing or unreadable.", observedAt, "acceptance");
      } else {
        input.repositories.assignmentExecution.saveBinding({ ...binding, state: "admitted", detail: "Waiting for completed Assignment evidence to become readable.", updatedAt: observedAt.toISOString() });
      }
      return;
    }
  }
  const resultDigest = digest(result);
  const existing = input.repositories.assignmentExecution.getResult(assignment.id);
  if (existing && existing.digest !== resultDigest) throw new Error("A different Assignment Result was already accepted.");

  input.repositories.transaction(() => {
    if (!existing) input.repositories.assignmentExecution.saveResult({ assignmentId: assignment.id, digest: resultDigest, result, acceptedAt: now().toISOString() });
    const accepted = result.judgment.decision === "accepted";
    input.repositories.updateDepartmentAssignment(assignment.id, { status: accepted ? "completed" : "stopped", stage: "acceptance" });
    input.repositories.assignmentExecution.saveBinding({ ...binding, state: accepted ? "completed" : "failed", detail: accepted ? "Assignment result accepted." : "Assignment result rejected.", updatedAt: now().toISOString() });
    if (accepted) {
      activateDirectDependents(input.repositories, assignment);
      const events = input.repositories.listCompanyEventsForCompany(assignment.companyId);
      const occurredAt = now().toISOString();
      input.repositories.appendCompanyEvent({
        id: randomUUID(), companyId: assignment.companyId, type: "assignment_result_accepted",
        kind: "assignment_result_accepted", sequence: Math.max(0, ...events.map((event) => event.sequence ?? 0)) + 1,
        occurredAt, createdAt: occurredAt, message: `Result accepted for ${assignment.title}.`,
        status: input.repositories.getCompany(assignment.companyId)?.status ?? null,
        businessPayload: { assignmentId: assignment.id },
      });
    }
  });
  if (result.judgment.decision === "accepted") input.requestCoordinatorWake?.();
}

function stopAssignment(
  repositories: Repositories,
  assignment: DepartmentAssignment,
  binding: AssignmentExecutionBinding,
  detail: string,
  at: Date,
  stage = assignment.stage,
): void {
  repositories.transaction(() => {
    repositories.assignmentExecution.saveBinding({ ...binding, state: "failed", detail, updatedAt: at.toISOString() });
    repositories.updateDepartmentAssignment(assignment.id, { status: "stopped", stage });
  });
}

function activateDirectDependents(repositories: Repositories, completed: DepartmentAssignment): void {
  const assignments = repositories.listDepartmentAssignments(completed.companyId);
  for (const candidate of assignments) {
    if (candidate.status !== "waiting" || !candidate.dependsOnAssignmentIds.includes(completed.id) || candidate.route.kind !== "ordinary_task") continue;
    const ready = candidate.dependsOnAssignmentIds.every((id) => assignments.find((item) => item.id === id)?.status === "completed");
    if (ready) repositories.updateDepartmentAssignment(candidate.id, { status: "ready", stage: candidate.stage });
  }
}

function upstreamResults(repositories: Repositories, assignment: DepartmentAssignment) {
  return assignment.dependsOnAssignmentIds.map((id) => repositories.assignmentExecution.getResult(id)?.result).filter(Boolean);
}

async function observe(command: MahCommand, binding: AssignmentExecutionBinding): Promise<{ kind: "missing" } | { kind: "unknown" } | { kind: "available"; status: string }> {
  const response = await command(["task", "show", binding.mahTaskId, "--cwd", binding.projectRoot, "--format", "json"]);
  let body: { ok?: boolean; task?: { task_id?: string; status?: string }; error?: { code?: string } } | null = null;
  try { body = JSON.parse(response.stdout); } catch { /* classified below */ }
  if (response.exitCode !== 0 && body?.error?.code === "task_not_found") return { kind: "missing" };
  if (response.exitCode === 0 && body?.ok === true && body.task?.task_id === binding.mahTaskId && typeof body.task.status === "string") return { kind: "available", status: body.task.status };
  return { kind: "unknown" };
}

function writeAssignmentRequest(root: string, binding: AssignmentExecutionBinding, assignment: DepartmentAssignment, upstream: unknown[]) {
  const requestRoot = join(root, ".cordantry", "mah-assignments", binding.mahTaskId);
  mkdirSync(requestRoot, { recursive: true });
  const description = join(requestRoot, "description.md");
  const metadata = join(requestRoot, "metadata.json");
  const schema = join(requestRoot, "assignment-result.schema.json");
  writeFileSync(description, [
    `Complete this Department Assignment: ${assignment.title}`,
    `Expected outcome: ${assignment.expectedOutcome}`,
    "Write the canonical business result to artifacts/assignment-result.json.",
    "Every judgment.evidenceReferences item must be a Task artifact path beginning with artifacts/. Never cite an absolute path, .mah path, context attachment, prompt, or governance file. Use an empty array when no additional artifact evidence is needed.",
    `Assignment ID: ${assignment.id}`,
    upstream.length ? `Accepted upstream results: ${JSON.stringify(upstream)}` : "There are no upstream results.",
  ].join("\n\n"), "utf8");
  writeFileSync(metadata, JSON.stringify({ cordantry_contract: "assignment-result/v1", cordantry_assignment_id: assignment.id }), "utf8");
  writeFileSync(schema, JSON.stringify(assignmentResultOutputSchema), "utf8");
  return { description, metadata, schema };
}

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

const assignmentResultOutputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["schemaVersion", "kind", "assignmentId", "resultSummary", "keyFindings", "completedOutcome", "limitations", "downstreamFacts", "recommendedNextAction", "judgment"],
  properties: {
    schemaVersion: { const: 1 }, kind: { const: "assignment_result" }, assignmentId: { type: "string", minLength: 1 },
    resultSummary: { type: "string", minLength: 1 }, keyFindings: { type: "array", items: { type: "string", minLength: 1 } }, completedOutcome: { type: "string", minLength: 1 }, limitations: { type: "array", items: { type: "string", minLength: 1 } },
    downstreamFacts: { type: "array", items: { type: "object", additionalProperties: false, required: ["key", "value"], properties: { key: { type: "string", minLength: 1 }, value: { type: "string", minLength: 1 } } } },
    recommendedNextAction: { type: "string", minLength: 1 },
    judgment: { type: "object", additionalProperties: false, required: ["decision", "rationale", "satisfiedObligations", "unsatisfiedObligations", "evidenceReferences", "agentId", "modelId"], properties: { decision: { enum: ["accepted", "rejected"] }, rationale: { type: "string", minLength: 1 }, satisfiedObligations: { type: "array", items: { type: "string", minLength: 1 } }, unsatisfiedObligations: { type: "array", items: { type: "string", minLength: 1 } }, evidenceReferences: { type: "array", items: { type: "string", minLength: 1, pattern: "^artifacts/(?!.*(?:^|/)\\.\\.(?:/|$)).+" } }, agentId: { type: "string", minLength: 1 }, modelId: { type: "string", minLength: 1 } } },
  },
};
