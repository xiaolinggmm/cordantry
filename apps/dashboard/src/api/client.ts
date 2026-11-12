export type CompanySummary = {
  id: string;
  name: string;
  founderVision: string;
  status: "creating" | "creation_failed" | "active" | "paused" | "stopped";
  createdAt: string;
  updatedAt: string;
};

export type CompanyProblem = {
  schemaVersion: 1;
  kind: "company_problem";
  category: "installation_required" | "setup_required" | "try_again_later" | "plan_needs_new_attempt" | "work_stopped";
  message: string;
  availableActions: Array<{ kind: "download_mah"; url: string } | { kind: "recheck" | "try_again" | "new_attempt" }>;
};

export type CompanyCreationReceipt = { schemaVersion: 1; kind: "company_creation_receipt"; company: CompanySummary; createdAt: string };
export type DepartmentAssignmentSummary = {
  id: string;
  departmentId: string;
  objectiveId: string;
  title: string;
  expectedOutcome: string;
  dependsOnAssignmentIds: string[];
  route: { kind: "ordinary_task" | "product_direction"; rationale: string };
  order: number;
  stage: string;
  status: string;
  directionKey?: string | null;
  result?: { resultSummary: string; keyFindings: string[]; completedOutcome: string; limitations: string[]; recommendedNextAction: string } | null;
};

export type CompanyStateResponse = {
  schemaVersion: 1;
  kind: "company_state";
  lastEventSequence: number;
  company: CompanySummary;
  problem: CompanyProblem | null;
  objectives: Array<{ id: string; title: string; status: string; priority: number }>;
  departments: Array<{ id: string; name: string; responsibility: string }>;
  assignments: DepartmentAssignmentSummary[];
};

export type CreateCompanyInput = { founderVision: string; creationIdempotencyKey?: string };
export type ServerEvent = { type: string; companyId?: string; message: string; status?: string };

export type ApiClient = {
  listCompanies(): Promise<{ companies: CompanySummary[] }>;
  createCompany(input: CreateCompanyInput): Promise<CompanyCreationReceipt>;
  retryCompanyCreation(companyId: string): Promise<CompanyCreationReceipt>;
  getCompanyState(companyId: string): Promise<CompanyStateResponse>;
  pauseCompany(companyId: string): Promise<CompanyStateResponse>;
  resumeCompany(companyId: string): Promise<CompanyStateResponse>;
  stopCompany(companyId: string): Promise<CompanyStateResponse>;
  subscribeEvents(companyId: string, handler: (event: ServerEvent) => void, onOpen?: () => void): () => void;
};

export class CompanyProblemError extends Error {
  constructor(public readonly problem: CompanyProblem, public readonly company?: CompanySummary) { super(problem.message); }
}

export function createApiClient(baseUrl = "", options: { requestTimeoutMs?: number } = {}): ApiClient {
  const timeout = options.requestTimeoutMs ?? 10_000;
  return {
    listCompanies: () => request(`${baseUrl}/api/companies`, timeout),
    createCompany: (input) => request(`${baseUrl}/api/companies`, timeout, input),
    retryCompanyCreation: (id) => request(`${baseUrl}/api/companies/${id}/retry-creation`, timeout, {}),
    getCompanyState: (id) => request(`${baseUrl}/api/companies/${id}/state`, timeout),
    pauseCompany: (id) => request(`${baseUrl}/api/companies/${id}/pause`, timeout, {}),
    resumeCompany: (id) => request(`${baseUrl}/api/companies/${id}/resume`, timeout, {}),
    stopCompany: (id) => request(`${baseUrl}/api/companies/${id}/stop`, timeout, {}),
    subscribeEvents(companyId, handler, onOpen) {
      const source = new EventSource(`${baseUrl}/api/events?companyId=${encodeURIComponent(companyId)}`);
      source.onopen = () => onOpen?.();
      source.onmessage = (event) => handler(JSON.parse(event.data) as ServerEvent);
      for (const type of ["creation_request_accepted", "plan_requested", "artifact_received", "plan_validated", "organization_created", "company_ready", "assignment_result_accepted"]) {
        source.addEventListener(type, (event) => handler(JSON.parse((event as MessageEvent).data) as ServerEvent));
      }
      return () => source.close();
    },
  };
}

async function request<T>(url: string, timeout: number, body?: unknown): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { method: body === undefined ? "GET" : "POST", headers: body === undefined ? undefined : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body), signal: controller.signal });
    const value = await response.json() as T | CompanyProblem;
    if (!response.ok) {
      if (isCompanyProblem(value)) throw new CompanyProblemError(value);
      throw new Error((value as { error?: string }).error ?? `Request failed with ${response.status}.`);
    }
    return value as T;
  } finally { clearTimeout(timer); }
}

const isCompanyProblem = (value: unknown): value is CompanyProblem => Boolean(value && typeof value === "object" && (value as { kind?: unknown }).kind === "company_problem");
