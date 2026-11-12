import { createId as defaultCreateId, companyPlanSchema, type Company } from "@cordantry/core";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { createRepositories, StoredCompanyProblem } from "../db/repositories";
import { EventStream } from "../events/sse";
import { serveDashboardFile } from "./staticDashboard";

export type CompanyPlanProvider = (input: { companyId: string; founderVision: string; projectRoot: string }) => Promise<unknown>;
export type CoordinatorWakeReason = "dependency_cascade_queued" | "company_resumed";

export type ApiServerOptions = {
  dashboardRoot?: string;
  companyPlanProvider?: CompanyPlanProvider;
  projectRoot: string;
  repositories: ReturnType<typeof createRepositories>;
  log?: (line: string) => void;
  now?: () => Date;
  createId?: (prefix: string) => string;
  requestCoordinatorWake?: (reason: CoordinatorWakeReason) => void;
};

export type ApiServer = { httpServer: Server; events: EventStream };

export function createApiServer(options: ApiServerOptions): ApiServer {
  const events = new EventStream();
  const httpServer = createServer(async (request, response) => {
    try {
      applyCors(response);
      if (request.method === "OPTIONS") {
        response.writeHead(204);
        response.end();
        return;
      }
      await routeRequest(request, response, options, events);
    } catch (error) {
      options.log?.(`Request failed: ${(error as Error).message}`);
      sendJson(response, 500, { error: "The request could not be completed." });
    }
  });
  resumeInterruptedPlanning(options);
  return { httpServer, events };
}

async function routeRequest(request: IncomingMessage, response: ServerResponse, options: ApiServerOptions, events: EventStream) {
  const url = new URL(request.url ?? "/", "http://localhost");
  const method = request.method ?? "GET";

  if (method === "GET" && url.pathname === "/api/events") {
    const companyId = url.searchParams.get("companyId");
    if (!companyId) return sendJson(response, 400, { error: "companyId is required for event streams." });
    events.connect(companyId, response);
    return;
  }

  if (method === "GET" && url.pathname === "/api/companies") {
    sendJson(response, 200, { companies: options.repositories.listCompanies().map(publicCompany) });
    return;
  }

  if (method === "POST" && url.pathname === "/api/companies") {
    const body = await readJson(request);
    if (Object.keys(body).some((key) => !["founderVision", "creationIdempotencyKey"].includes(key))) {
      sendJson(response, 400, { error: "Company creation accepts only Founder Vision and an optional idempotency key." });
      return;
    }
    await acceptCompanyPlanning(response, options, body);
    return;
  }

  const stateMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/state$/);
  if (method === "GET" && stateMatch) {
    const company = options.repositories.getCompany(stateMatch[1]);
    if (!company) return sendJson(response, 404, { error: "Company not found." });
    sendJson(response, 200, companyState(company, options.repositories));
    return;
  }

  const retryMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/retry-creation$/);
  if (method === "POST" && retryMatch) {
    const company = options.repositories.getCompany(retryMatch[1]);
    if (!company) return sendJson(response, 404, { error: "Company not found." });
    if (!options.companyPlanProvider) return sendProblem(response, company, options, "installation_required");
    options.repositories.clearCompanyProblem(company.id);
    options.repositories.updateCompanyStatus(company.id, "creating", now(options));
    schedulePlanning(options, { ...company, status: "creating" });
    sendJson(response, 202, { schemaVersion: 1, kind: "company_creation_receipt", company: publicCompany({ ...company, status: "creating" }), createdAt: company.createdAt });
    return;
  }

  const operationMatch = url.pathname.match(/^\/api\/companies\/([^/]+)\/(pause|resume|stop)$/);
  if (method === "POST" && operationMatch) {
    const company = options.repositories.getCompany(operationMatch[1]);
    if (!company) return sendJson(response, 404, { error: "Company not found." });
    const operation = operationMatch[2];
    const status = operation === "pause" ? "paused" : operation === "resume" ? "active" : "stopped";
    options.repositories.transaction(() => {
      options.repositories.updateCompanyStatus(company.id, status, now(options));
      if (status === "stopped") {
        for (const assignment of options.repositories.listDepartmentAssignments(company.id)) {
          if (["waiting", "ready"].includes(assignment.status)) options.repositories.updateDepartmentAssignment(assignment.id, { status: "stopped", stage: assignment.stage });
        }
      }
    });
    if (status === "active") options.requestCoordinatorWake?.("company_resumed");
    sendJson(response, 200, companyState({ ...company, status, updatedAt: now(options) }, options.repositories));
    return;
  }

  if (method === "GET" && options.dashboardRoot && await serveDashboardFile(response, options.dashboardRoot, url.pathname)) return;
  sendJson(response, 404, { error: "Not found" });
}

async function acceptCompanyPlanning(response: ServerResponse, options: ApiServerOptions, body: Record<string, unknown>) {
  const founderVision = typeof body.founderVision === "string" ? body.founderVision.trim() : "";
  if (!founderVision) return sendJson(response, 400, { error: "Founder vision is required." });
  const creationIdempotencyKey = typeof body.creationIdempotencyKey === "string" && body.creationIdempotencyKey.trim()
    ? body.creationIdempotencyKey.trim() : id(options, "creation_key");
  const existing = options.repositories.getCompanyByCreationIdempotencyKey(creationIdempotencyKey);
  if (existing) {
    if (existing.founderVision !== founderVision) return sendJson(response, 409, problem("plan_needs_new_attempt"));
    if (!options.companyPlanProvider && existing.status !== "active") return sendProblem(response, existing, options, "installation_required");
    sendJson(response, 202, { schemaVersion: 1, kind: "company_creation_receipt", company: publicCompany(existing), createdAt: existing.createdAt });
    return;
  }
  const timestamp = now(options);
  const company: Company = {
    id: id(options, "company"), name: "Planning company", founderVision, status: "creating",
    creationIdempotencyKey, creationInput: { founderVision }, createdAt: timestamp, updatedAt: timestamp,
  };
  options.repositories.createCompany(company);
  appendEvent(options, company, "creation_request_accepted", "Your vision is saved.");
  if (!options.companyPlanProvider) return sendProblem(response, { ...company, status: "creation_failed" }, options, "installation_required");
  schedulePlanning(options, company);
  sendJson(response, 202, { schemaVersion: 1, kind: "company_creation_receipt", company: publicCompany(company), createdAt: company.createdAt });
}

function schedulePlanning(options: ApiServerOptions, company: Company) {
  const provider = options.companyPlanProvider;
  if (!provider) return;
  setTimeout(() => void completePlanning(options, company, provider).catch((error) => {
    options.log?.(`MAH Company Planning failed for ${company.id}: ${error instanceof Error ? error.message : String(error)}`);
    const planning = options.repositories.mahCompanyPlanning.get(company.id);
    const category = planning?.state === "failed" || (planning?.correctionCount ?? 0) >= 2 ? "plan_needs_new_attempt" : "try_again_later";
    options.repositories.saveCompanyProblem(company.id, problem(category));
    options.repositories.updateCompanyStatus(company.id, "creation_failed", now(options));
  }), 0);
}

async function completePlanning(options: ApiServerOptions, company: Company, provider: CompanyPlanProvider) {
  appendEvent(options, company, "plan_requested", "Cordantry is preparing your company plan.");
  const plan = companyPlanSchema.parse(await provider({ companyId: company.id, founderVision: company.founderVision, projectRoot: options.projectRoot }));
  appendEvent(options, company, "artifact_received", "Cordantry received your company plan.");
  appendEvent(options, company, "plan_validated", "Cordantry confirmed the plan content.");
  const activatedAt = now(options);
  options.repositories.transaction(() => {
    options.repositories.clearCompanyProblem(company.id);
    plan.objectives.forEach((objective, priority) => options.repositories.createObjective({ ...objective, companyId: company.id, status: "active", priority }));
    plan.departments.forEach((department) => options.repositories.createDepartment({ ...department, companyId: company.id }));
    plan.assignments.forEach((assignment) => options.repositories.createDepartmentAssignment({
      ...assignment, companyId: company.id,
      status: assignment.route.kind === "ordinary_task" && assignment.dependsOnAssignmentIds.length === 0 ? "ready" : "waiting",
      directionKey: assignment.directionKey ?? null,
    }));
    appendEvent(options, company, "organization_created", "Cordantry created the departments and work plan.");
    options.repositories.activatePlannedCompany(company.id, plan.company.name, activatedAt);
    appendEvent(options, { ...company, status: "active" }, "company_ready", "Your company is ready.");
  });
  options.requestCoordinatorWake?.("dependency_cascade_queued");
}

function resumeInterruptedPlanning(options: ApiServerOptions) {
  if (!options.companyPlanProvider) return;
  for (const company of options.repositories.listCompanies()) {
    const planning = options.repositories.mahCompanyPlanning.get(company.id);
    if (!["creating", "creation_failed"].includes(company.status) || (planning && ["completed", "failed"].includes(planning.state))) continue;
    options.repositories.updateCompanyStatus(company.id, "creating", now(options));
    schedulePlanning(options, { ...company, status: "creating" });
  }
}

function appendEvent(options: ApiServerOptions, company: Company, kind: string, message: string) {
  const existing = options.repositories.listCompanyEventsForCompany(company.id);
  if (existing.some((event) => event.kind === kind)) return;
  const occurredAt = now(options);
  options.repositories.appendCompanyEvent({
    id: id(options, "company_event"), companyId: company.id, type: kind, kind,
    sequence: Math.max(0, ...existing.map((event) => event.sequence)) + 1,
    occurredAt, createdAt: occurredAt, message,
    status: kind === "company_ready" ? "active" : "creating", businessPayload: { companyId: company.id },
  });
}

function companyState(company: Company, repositories: ReturnType<typeof createRepositories>) {
  return {
    schemaVersion: 1, kind: "company_state",
    lastEventSequence: Math.max(0, ...repositories.listCompanyEventsForCompany(company.id).map((event) => event.sequence)),
    company: publicCompany(company), problem: repositories.getCompanyProblem(company.id),
    objectives: repositories.listObjectives(company.id).map(({ id: objectiveId, title, status, priority }) => ({ id: objectiveId, title, status, priority })),
    departments: repositories.listDepartments(company.id).map(({ id: departmentId, name, responsibility }) => ({ id: departmentId, name, responsibility })),
    assignments: repositories.listDepartmentAssignments(company.id).map((assignment) => {
      const { companyId: _companyId, ...publicAssignment } = assignment;
      const result = repositories.assignmentExecution.getResult(assignment.id)?.result;
      return { ...publicAssignment, result: result ? {
        resultSummary: result.resultSummary, keyFindings: result.keyFindings, completedOutcome: result.completedOutcome,
        limitations: result.limitations, recommendedNextAction: result.recommendedNextAction,
      } : null };
    }),
  };
}

const publicCompany = (company: Company) => ({ id: company.id, name: company.name, founderVision: company.founderVision, status: company.status, createdAt: company.createdAt, updatedAt: company.updatedAt });

function sendProblem(response: ServerResponse, company: Company, options: ApiServerOptions, category: StoredCompanyProblem["category"]) {
  const value = problem(category);
  options.repositories.updateCompanyStatus(company.id, "creation_failed", now(options));
  options.repositories.saveCompanyProblem(company.id, value);
  sendJson(response, 503, { ...value, company: publicCompany({ ...company, status: "creation_failed" }) });
}

function problem(category: StoredCompanyProblem["category"]): StoredCompanyProblem {
  const values = {
    installation_required: { message: "Cordantry needs MAH to create your company plan. Download and install MAH first.", availableActions: [{ kind: "download_mah" as const, url: trustedInstallUrl() }, { kind: "recheck" as const }] },
    setup_required: { message: "MAH needs setup before company planning can continue.", availableActions: [{ kind: "recheck" as const }] },
    try_again_later: { message: "Company planning is temporarily unavailable. Your vision is saved.", availableActions: [{ kind: "try_again" as const }] },
    plan_needs_new_attempt: { message: "The company plan could not be validated. Start a new planning attempt when ready.", availableActions: [{ kind: "new_attempt" as const }] },
    work_stopped: { message: "Company planning stopped.", availableActions: [] },
  };
  return { schemaVersion: 1, kind: "company_problem", category, ...values[category] };
}

function trustedInstallUrl() {
  const configured = process.env.CORDANTRY_MAH_INSTALL_URL?.trim();
  if (!configured) return "https://mah.bot/download";
  try { const value = new URL(configured); return value.protocol === "https:" ? value.toString() : "https://mah.bot/download"; }
  catch { return "https://mah.bot/download"; }
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  if (chunks.length === 0) return {};
  const parsed = JSON.parse(Buffer.concat(chunks).toString("utf8"));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON body must be an object.");
  return parsed as Record<string, unknown>;
}

function sendJson(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

function applyCors(response: ServerResponse) {
  response.setHeader("access-control-allow-origin", "*");
  response.setHeader("access-control-allow-headers", "content-type");
  response.setHeader("access-control-allow-methods", "GET,POST,OPTIONS");
}

const now = (options: ApiServerOptions) => (options.now ?? (() => new Date()))().toISOString();
const id = (options: ApiServerOptions, prefix: string) => options.createId?.(prefix) ?? defaultCreateId(prefix);
