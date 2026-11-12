import { useEffect, useMemo, useState } from "react";
import { createApiClient, CompanyProblemError, type ApiClient, type CompanyProblem, type CompanyStateResponse, type CreateCompanyInput } from "./api/client";
import { Onboarding } from "./pages/Onboarding";
import { PlannedCompany } from "./pages/PlannedCompany";
import { LanguageProvider } from "./ui/language";
import "./styles.css";

export type AppProps = { apiClient?: ApiClient };
const currentCompanyKey = "cordantry.currentCompanyId";

export default function App({ apiClient }: AppProps) {
  const client = useMemo(() => apiClient ?? createApiClient(), [apiClient]);
  const [state, setState] = useState<CompanyStateResponse | null>(null);
  const [problem, setProblem] = useState<CompanyProblem | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const saved = localStorage.getItem(currentCompanyKey);
        const companyId = saved || (await client.listCompanies()).companies[0]?.id;
        if (companyId && !cancelled) await load(companyId);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause));
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [client]);

  useEffect(() => {
    if (!state?.company.id) return;
    return client.subscribeEvents(state.company.id, () => void load(state.company.id));
  }, [client, state?.company.id]);

  useEffect(() => {
    if (!state || (state.company.status !== "creating" && !state.assignments.some((assignment) => assignment.status === "in_progress"))) return;
    const timer = window.setInterval(() => void load(state.company.id), 1_000);
    return () => window.clearInterval(timer);
  }, [client, state?.company.id, state?.company.status, state?.assignments]);

  async function load(companyId: string) {
    const next = await client.getCompanyState(companyId);
    localStorage.setItem(currentCompanyKey, companyId);
    setState(next);
    setProblem(next.problem);
  }

  async function create(input: CreateCompanyInput) {
    setBusy(true); setError(null);
    try {
      const receipt = await client.createCompany({ ...input, creationIdempotencyKey: crypto.randomUUID() });
      await load(receipt.company.id);
    } catch (cause) {
      if (cause instanceof CompanyProblemError) setProblem(cause.problem);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  async function operate(operation: "pause" | "resume" | "stop" | "retry") {
    if (!state) return;
    setBusy(true);
    try {
      if (operation === "retry") await client.retryCompanyCreation(state.company.id);
      else if (operation === "pause") setState(await client.pauseCompany(state.company.id));
      else if (operation === "resume") setState(await client.resumeCompany(state.company.id));
      else setState(await client.stopCompany(state.company.id));
      await load(state.company.id);
    } catch (cause) {
      if (cause instanceof CompanyProblemError) setProblem(cause.problem);
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally { setBusy(false); }
  }

  return <LanguageProvider>
    {loading ? <main>Loading Cordantry…</main>
      : state ? <PlannedCompany state={state} busy={busy} problem={problem} onPause={() => void operate("pause")} onResume={() => void operate("resume")} onStop={() => void operate("stop")} onRecheck={() => void operate("retry")} />
      : <Onboarding onCreate={(input) => void create(input)} isCreating={busy} error={error} />}
  </LanguageProvider>;
}
