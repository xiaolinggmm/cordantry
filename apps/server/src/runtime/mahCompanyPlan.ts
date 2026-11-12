import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, realpathSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { companyPlanSchema, type CompanyPlan } from "@cordantry/core";
import { mahCommand, type MahCommand } from "../adapters/mahCli";
import type { createRepositories } from "../db/repositories";
import { companyPlanOutputSchema } from "./companyPlanContract";

type Repositories = ReturnType<typeof createRepositories>;

export type MahCompanyPlanProviderOptions = {
  repositories: Repositories;
  mahProjectRoot: string;
  command?: MahCommand;
  createTaskId?: () => string;
  pollMs?: number;
  timeoutMs?: number;
  now?: () => Date;
};

type TaskObservation =
  | { kind: "missing" }
  | { kind: "available"; status: string }
  | { kind: "unknown"; detail: string };

type TaskShowBody = {
  ok?: boolean;
  task?: { task_id?: string; status?: string };
  error?: { code?: string };
};

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

export function createMahCompanyPlanProvider(options: MahCompanyPlanProviderOptions) {
  const command = options.command ?? mahCommand();
  const createTaskId = options.createTaskId ?? randomUUID;
  const now = options.now ?? (() => new Date());
  const mahProjectRoot = realpathSync(resolve(options.mahProjectRoot));

  const provide = async (input: { companyId: string; companyName: string; founderVision: string; projectRoot: string }): Promise<CompanyPlan> => {
    const requestDigest = digest({
      companyName: input.companyName,
      founderVision: input.founderVision,
      mahProjectRoot,
      schema: companyPlanOutputSchema,
    });
    let record = options.repositories.mahCompanyPlanning.get(input.companyId);
    if (!record) {
      const timestamp = now().toISOString();
      record = {
        companyId: input.companyId,
        mahTaskId: createTaskId(),
        taskLineage: [],
        correctionCount: 0,
        projectRoot: mahProjectRoot,
        requestDigest,
        state: "prepared",
        detail: "MAH Company Planning Task identity prepared.",
        submitCount: 0,
        taskNotFoundCount: 0,
        reconciliationDeadline: new Date(now().getTime() + (options.timeoutMs ?? 10 * 60_000)).toISOString(),
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      record.activeTaskId = record.mahTaskId;
      record.taskLineage = [record.mahTaskId];
      options.repositories.mahCompanyPlanning.save(record);
    }
    if (record.projectRoot !== mahProjectRoot || record.requestDigest !== requestDigest) {
      throw new Error("MAH Company Planning request conflicts with the persisted Task identity.");
    }

    const activeTaskId = record.activeTaskId ?? record.mahTaskId;
    let observation = await observeTask(command, activeTaskId, mahProjectRoot);
    if (observation.kind === "missing") {
      if ((record.submitCount ?? 0) > 0 && now().getTime() >= new Date(record.reconciliationDeadline).getTime()) {
        const detail = "MAH Company Planning admission deadline expired. Cordantry will only recheck the original Task.";
        options.repositories.mahCompanyPlanning.save({ ...record, state: "unknown", detail, updatedAt: now().toISOString() });
        throw new Error(detail);
      }
      if (!["prepared", "submitting", "unknown"].includes(record.state)) {
        throw new Error("MAH Company Planning submission is unresolved; the stable Task is not resubmitted.");
      }
      if (record.state !== "prepared") {
        record = {
          ...record,
          state: "unknown",
          taskNotFoundCount: (record.taskNotFoundCount ?? 0) + 1,
          detail: "Cordantry is confirming that the original MAH Task does not exist.",
          updatedAt: now().toISOString(),
        };
        options.repositories.mahCompanyPlanning.save(record);
        if (record.taskNotFoundCount < 2) throw new Error(record.detail);
        if ((record.submitCount ?? 0) >= 2) {
          throw new Error("MAH Company Planning reached the submission limit; only the original Task is queried.");
        }
      }
      const requestRoot = join(input.projectRoot, ".cordantry", "mah-company-planning", activeTaskId);
      mkdirSync(requestRoot, { recursive: true });
      const descriptionPath = join(requestRoot, "description.md");
      const metadataPath = join(requestRoot, "metadata.json");
      const schemaPath = join(requestRoot, "company-plan.schema.json");
      writeFileSync(descriptionPath, companyPlanningDescription(input.companyName, input.founderVision, record), "utf8");
      writeFileSync(metadataPath, JSON.stringify({
        cordantry_contract: "company-plan/v1",
        cordantry_company_id: input.companyId,
        ...(activeTaskId === record.mahTaskId ? {} : { cordantry_correction_of: record.mahTaskId }),
      }), "utf8");
      writeFileSync(schemaPath, JSON.stringify(companyPlanOutputSchema), "utf8");
      if (record.state === "prepared") {
        if (!options.repositories.mahCompanyPlanning.claimSubmission(input.companyId)) {
          throw new Error("MAH Company Planning submission claim changed; query the stable Task before retrying.");
        }
        record = options.repositories.mahCompanyPlanning.get(input.companyId)!;
      } else {
        // A pre-minted UUID is MAH's idempotency key. After proving that UUID is absent, a process
        // interrupted before or during submit may invoke submit again with the same identity; MAH's
        // unique Task identity admits it once or reports the already-existing Task.
        record = {
          ...record,
          state: "submitting",
          detail: "Recovering MAH submission with the persisted Task identity.",
          updatedAt: now().toISOString(),
        };
        options.repositories.mahCompanyPlanning.save(record);
      }
      record = {
        ...record,
        submitCount: (record.submitCount ?? 0) + 1,
        state: "submitting",
        updatedAt: now().toISOString(),
      };
      options.repositories.mahCompanyPlanning.save(record);
      const submitted = await command([
        "task", "submit",
        "--cwd", mahProjectRoot,
        "--task-id", activeTaskId,
        "--description-file", descriptionPath,
        "--title", `Plan company ${input.companyId}`,
        "--meta-file", metadataPath,
        "--attach", schemaPath,
        "--no-write",
        "--format", "json",
      ]);
      let response: { task_id?: string; error?: { message?: string } } | null = null;
      try { response = JSON.parse(submitted.stdout) as { task_id?: string; error?: { message?: string } }; } catch { /* recorded below */ }
      const accepted = submitted.exitCode === 0 && response?.task_id === activeTaskId;
      const submissionDetail = response?.error?.message || submitted.stderr || "MAH submission result is ambiguous.";
      record = {
        ...record,
        state: accepted ? "submitted" : "unknown",
        detail: accepted ? "MAH Company Planning Task submitted." : submissionDetail,
        updatedAt: now().toISOString(),
      };
      options.repositories.mahCompanyPlanning.save(record);
      observation = await observeTask(command, activeTaskId, mahProjectRoot);
      if (!accepted && observation.kind === "missing") {
        record = {
          ...record,
          state: "unknown",
          taskNotFoundCount: (record.taskNotFoundCount ?? 0) + 1,
          detail: `${submissionDetail} Cordantry is confirming that the original MAH Task does not exist.`,
          updatedAt: now().toISOString(),
        };
        options.repositories.mahCompanyPlanning.save(record);
        throw new Error(record.detail);
      }
      if (!accepted && observation.kind !== "available") throw new Error(record.detail);
    } else if (observation.kind === "unknown") {
      options.repositories.mahCompanyPlanning.save({
        ...record,
        state: "unknown",
        detail: observation.detail,
        updatedAt: now().toISOString(),
      });
      throw new Error(observation.detail);
    }

    const deadline = new Date(record.reconciliationDeadline).getTime();
    for (;;) {
      if (observation.kind === "available" && observation.status === "completed") {
        const rawPlan = await readCompanyPlanArtifact(command, activeTaskId, mahProjectRoot);
        const parsed = companyPlanSchema.safeParse(rawPlan);
        if (!parsed.success) {
          const correctionCount = record.correctionCount ?? 0;
          if (correctionCount >= 2) {
            const detail = "MAH Company Plan remained structurally invalid after two corrections.";
            options.repositories.mahCompanyPlanning.save({ ...record, state: "failed", detail, updatedAt: now().toISOString() });
            throw new Error(detail);
          }
          const correctionTaskId = createTaskId();
          const detail = parsed.error.issues.map((issue) => `${issue.path.join(".") || "plan"}: ${issue.message}`).join("\n");
          options.repositories.mahCompanyPlanning.save({
            ...record,
            activeTaskId: correctionTaskId,
            taskLineage: [...(record.taskLineage ?? [record.mahTaskId]), correctionTaskId],
            correctionCount: correctionCount + 1,
            state: "prepared",
            detail,
            submitCount: 0,
            taskNotFoundCount: 0,
            reconciliationDeadline: new Date(now().getTime() + (options.timeoutMs ?? 10 * 60_000)).toISOString(),
            updatedAt: now().toISOString(),
          });
          return provide(input);
        }
        options.repositories.mahCompanyPlanning.save({
          ...record,
          state: "completed",
          detail: "MAH Company Plan artifact is ready.",
          updatedAt: now().toISOString(),
        });
        return parsed.data;
      }
      if (observation.kind === "available" && ["failed", "cancelled", "yielded"].includes(observation.status)) {
        const detail = `MAH Company Planning Task ended with status ${observation.status}.`;
        options.repositories.mahCompanyPlanning.save({
          ...record,
          state: "failed",
          detail,
          updatedAt: now().toISOString(),
        });
        throw new Error(detail);
      }
      if (observation.kind !== "available") {
        throw new Error("MAH Company Planning Task readback became unavailable; it is not resubmitted.");
      }
      if (now().getTime() >= deadline) throw new Error(`MAH Company Planning Task remains ${observation.status}; it is not resubmitted.`);
      await new Promise((resolveWait) => setTimeout(resolveWait, options.pollMs ?? 1_000));
      observation = await observeTask(command, activeTaskId, mahProjectRoot);
    }
  };
  return provide;
}

async function observeTask(command: MahCommand, taskId: string, projectRoot: string): Promise<TaskObservation> {
  const result = await command(["task", "show", taskId, "--cwd", projectRoot, "--format", "json"]);
  let body: TaskShowBody | null = null;
  try { body = JSON.parse(result.stdout) as TaskShowBody; } catch { /* classified as unknown below */ }
  if (result.exitCode !== 0 && body?.error?.code === "task_not_found") return { kind: "missing" };
  if (result.exitCode === 0 && body?.ok === true && body.task?.task_id === taskId && typeof body.task.status === "string") {
    return { kind: "available", status: body.task.status };
  }
  return { kind: "unknown", detail: result.stderr || "MAH Task status response is unavailable or invalid." };
}

async function readCompanyPlanArtifact(command: MahCommand, taskId: string, projectRoot: string): Promise<unknown> {
  const result = await command([
    "task", "context", taskId,
    "--cwd", projectRoot,
    "--read", "artifacts/company-plan.json",
    "--format", "json",
  ]);
  let body: { content?: string | null } | null = null;
  try { body = JSON.parse(result.stdout) as { content?: string | null }; } catch { /* reported below */ }
  if (result.exitCode !== 0 || typeof body?.content !== "string") {
    throw new Error(result.stderr || "MAH Company Plan artifact is missing or unreadable.");
  }
  return JSON.parse(body.content) as CompanyPlan;
}

function companyPlanningDescription(companyName: string, founderVision: string, record: { correctionCount?: number; detail: string }): string {
  return [
    "Derive one Cordantry Company Plan from the Founder Vision.",
    "The attached company-plan.schema.json is the required output contract.",
    "Write only the schema-valid JSON artifact to artifacts/company-plan.json in this MAH Task's canonical artifact scope.",
    "Do not expose execution details in the business artifact.",
    ...(record.correctionCount ? ["Correct the previous Company Plan. Keep its valid business meaning and fix these structural errors:", record.detail] : []),
    `Founder Company Name: ${companyName}`,
    `Founder Vision: ${founderVision}`,
  ].join("\n\n");
}
