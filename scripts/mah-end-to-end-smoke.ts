import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { startCordantry } from "../apps/cli/src/commands/start";

const mahProjectRoot = process.env.CORDANTRY_MAH_PROJECT_ROOT?.trim();
if (!mahProjectRoot) throw new Error("Set CORDANTRY_MAH_PROJECT_ROOT to an existing MAH project before running smoke:mah.");

const stateRoot = mkdtempSync(join(tmpdir(), "cordantry-mah-smoke-"));
const timeoutMs = Number(process.env.CORDANTRY_MAH_SMOKE_TIMEOUT_MS ?? 30 * 60_000);
const started = await startCordantry({
  projectRoot: stateRoot,
  mahProjectRoot: resolve(mahProjectRoot),
  coordinatorIntervalMs: 1_000,
  log: (line) => console.log(line),
});

try {
  const create = await fetch(`${started.url}/api/companies`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      companyName: "MAH Research Studio",
      founderVision: "Create a tiny internal market-research company with exactly one ordinary Assignment: write a concise three-point checklist for interviewing one prospective user. Do not create Product Direction work.",
      creationIdempotencyKey: `mah-smoke-${Date.now()}`,
    }),
  });
  if (!create.ok) throw new Error(`Company creation failed (${create.status}): ${await create.text()}`);
  const receipt = await create.json() as { company: { id: string } };
  const deadline = Date.now() + timeoutMs;
  let latest: CompanyState | undefined;

  while (Date.now() < deadline) {
    const response = await fetch(`${started.url}/api/companies/${receipt.company.id}/state`);
    if (!response.ok) throw new Error(`Company state failed (${response.status}): ${await response.text()}`);
    latest = await response.json() as CompanyState;
    if (latest.company.status === "creation_failed") throw new Error(`MAH Company Planning failed: ${latest.problem?.message ?? "unknown problem"}`);
    const ordinary = latest.assignments.filter((assignment) => assignment.route.kind === "ordinary_task");
    if (ordinary.some((assignment) => assignment.status === "stopped")) throw new Error("A MAH Assignment stopped before producing an accepted result.");
    if (ordinary.length > 0 && ordinary.every((assignment) => assignment.status === "completed")) break;
    await new Promise((resolveWait) => setTimeout(resolveWait, 1_000));
  }

  if (!latest) throw new Error("No Company state was returned.");
  const ordinary = latest.assignments.filter((assignment) => assignment.route.kind === "ordinary_task");
  if (latest.company.status !== "active" || ordinary.length === 0 || !ordinary.every((assignment) => assignment.status === "completed" && assignment.result)) {
    throw new Error(`Timed out before Founder → MAH → Assignment → Result completed. Last state: ${JSON.stringify(latest)}`);
  }
  if (/executionMode|selectedCeoAgentId|assigneeAgentId|leadAgentId|mahConfig/.test(JSON.stringify(latest))) {
    throw new Error("The public Company state leaked a deleted direct-routing field.");
  }
  console.log(`MAH end-to-end smoke passed for Company ${receipt.company.id} with ${ordinary.length} accepted Assignment Result(s).`);
} finally {
  await started.close();
  rmSync(stateRoot, { recursive: true, force: true });
}

type CompanyState = {
  company: { id: string; status: string };
  problem: { message?: string } | null;
  assignments: Array<{
    route: { kind: "ordinary_task" | "product_direction" };
    status: string;
    result: { resultSummary: string } | null;
  }>;
};
