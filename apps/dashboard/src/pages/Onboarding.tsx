import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Play,
  ShieldCheck,
  X,
} from "lucide-react";
import { CompanyFlowPage } from "../components/company-flow";
import { Button, Card, Input, Label } from "../components/ui";
import { LanguageSwitch } from "../components/workbench/LanguageSwitch";
import { StoryScene } from "../components/onboarding/StoryScene";
import { storyCopy } from "../components/onboarding/storyCopy";
import { useLanguage } from "../ui/language";
import "./onboarding.css";
import type { AgentSummary, CreateCompanyInput } from "../api/client";

const draftKey = "cordantry.onboardingDraft";
const emptyDraft = { name: "", vision: "", form: false, executionMode: "direct" as "direct" | "mah", selectedCeoAgentId: "", projectRoot: "", cliPath: "", slotClass: "background" as "background" | "interactive" };
function readDraft(): typeof emptyDraft {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) ?? "null");
    if (
      value &&
      typeof value.name === "string" &&
      typeof value.vision === "string"
    )
      return { ...emptyDraft, ...value, form: value.form === true };
  } catch {
    /* Storage can be unavailable; retain input in React for this visit. */
  }
  return { ...emptyDraft };
}

export function Onboarding({
  onCancel,
  review = false,
  agents = [], onCreate, isCreating = false, error, agentLoadState, onDetectAgents,
}: {
  onCancel?(): void;
  review?: boolean;
  agents?: AgentSummary[];
  onCreate?(input: CreateCompanyInput): void;
  isCreating?: boolean;
  error?: string | null;
  agentLoadState?: string;
  onDetectAgents?(): void;
}) {
  const { language, t } = useLanguage();
  const launcher = useRef(
    document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null,
  );
  const modal = useRef<HTMLDivElement>(null);
  const c = storyCopy[language];
  const [draft, setDraft] = useState(readDraft);
  const [form, setForm] = useState(() => (review ? false : readDraft().form));
  const [scene, setScene] = useState(0);
  const [playback, setPlayback] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [reduced, setReduced] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
  );
  const zh = language === "zh";
  const valid = !!draft.name.trim() && !!draft.vision.trim() && agents.some(a => a.id === draft.selectedCeoAgentId && a.detected) && (draft.executionMode === "direct" || (draft.projectRoot.trim().startsWith("/") || /^[a-z]:[\\/]/i.test(draft.projectRoot.trim()) || draft.projectRoot.trim().startsWith("\\\\")));
  const duration = scene === 2 ? 10 : 12;
  const finished = reduced || elapsed >= duration;

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query?.matches ?? false);
    query?.addEventListener("change", update);
    return () => query?.removeEventListener("change", update);
  }, []);
  useEffect(() => {
    if (form || finished) return;
    let frame: number;
    let previous: number | undefined;
    const tick = (now: number) => {
      // Clamp background-tab gaps so returning does not skip the sending action.
      const delta = previous === undefined ? 0 : Math.min((now - previous) / 1000, 0.05);
      previous = now;
      setElapsed((value) => Math.min(duration, value + delta));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [form, finished, scene, duration]);
  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ ...draft, form }));
    } catch {
      /* In-memory retention still works. */
    }
  }, [draft, form]);

  useEffect(() => {
    if (modal.current) modal.current.scrollTop = 0;
  }, [scene, form]);

  function selectScene(index: number) {
    if (modal.current) modal.current.scrollTop = 0;
    setPlayback((value) => value + 1);
    setScene(index);
    setElapsed(0);
  }
  function showForm() {
    setForm(true);
  }

  return (
    <>
      {!review && (
        <CompanyFlowPage
          eyebrow={t("onboarding.eyebrow")}
          title={t("app.title")}
          titleId="onboarding-background-title"
          status={c.policy}
          statusIcon={<ShieldCheck aria-hidden="true" />}
        >
          <Card className="grid gap-4 p-6">
            <h2 className="text-lg font-semibold">{c.formTitle}</h2>
            <p>{c.formDescription}</p>
            <div className="h-24 rounded-[var(--r-reading)] bg-muted" />
          </Card>
        </CompanyFlowPage>
      )}
      <Dialog.Root
        open
        onOpenChange={(open) => {
          if (!open) {
            if (onCancel) onCancel();
            else showForm();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="story-overlay" />
          <Dialog.Content
            ref={modal}
            className="story-modal"
            onCloseAutoFocus={(event) => {
              event.preventDefault();
              if (launcher.current?.isConnected) launcher.current.focus();
            }}
            onPointerDownOutside={(event) => event.preventDefault()}
          >
            <div className="story-top">
              <span className="story-kicker">
                {form ? "Cordantry" : c.example}
              </span>
              <div className="story-top-actions">
                <LanguageSwitch />
                {!form && (
                  <Button variant="ghost" size="sm" onClick={showForm}>
                    {c.skip}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                )}
                {onCancel && (
                  <Button
                    aria-label={c.close}
                    variant="ghost"
                    size="icon"
                    onClick={onCancel}
                  >
                    <X aria-hidden="true" />
                  </Button>
                )}
              </div>
            </div>
            <Dialog.Title className="story-title">
              {form ? c.formTitle : c.titles[scene]}
            </Dialog.Title>
            {form ? (
              <>
                <Dialog.Description className="text-sm text-muted-foreground">
                  {c.formDescription}
                </Dialog.Description>
                <form
                  className="story-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    if (!valid || isCreating || !onCreate) return;
                    onCreate({ companyName: draft.name.trim(), founderVision: draft.vision.trim(), selectedCeoAgentId: draft.selectedCeoAgentId, locale: language, permissionMode: "balanced", assets: [], executionMode: draft.executionMode, ...(draft.executionMode === "mah" ? {mahConfig: {projectRoot: draft.projectRoot.trim(), cliPath: draft.cliPath.trim() || "mah", slotClass: draft.slotClass}} : {}) });
                  }}
                >
                  <fieldset disabled={isCreating} className="contents">
                  <fieldset className="grid gap-2">
                    <legend>{zh ? "执行模式" : "Execution mode"}</legend>
                    <div className="flex gap-6">{(["direct", "mah"] as const).map(mode => <label key={mode} className="flex items-center gap-2"><input type="radio" name="execution-mode" checked={draft.executionMode === mode} onChange={() => setDraft({...draft, executionMode: mode})} />{mode === "direct" ? (zh ? "默认模式 · 直接派发" : "Direct dispatch (default)") : (zh ? "高级模式 · MAH 协调" : "MAH coordination (advanced)")}</label>)}</div>
                    <p className="text-sm text-muted-foreground">{zh ? "CEO 负责规划与决策，部门负责各自任务，Agent 执行工作。默认模式由 cordantry 直接派发；高级模式通过已有 MAH 项目协调。创建后不能切换模式。" : "The CEO plans and decides, departments own tasks, and agents execute them. Direct mode dispatches through cordantry; advanced mode coordinates through an existing MAH project. The mode cannot change after creation."}</p>
                  </fieldset>
                  <div>
                    <Label htmlFor="company-name">{c.name}</Label>
                    <Input
                      id="company-name"
                      autoComplete="organization"
                      placeholder={c.namePlaceholder}
                      value={draft.name}
                      onChange={(event) =>
                        setDraft({ ...draft, name: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="founder-vision">{c.goal}</Label>
                    <textarea
                      id="founder-vision"
                      className="story-vision"
                      placeholder={c.goalPlaceholder}
                      value={draft.vision}
                      onChange={(event) =>
                        setDraft({ ...draft, vision: event.target.value })
                      }
                    />
                  </div>
                  <div>
                    <Label htmlFor="ceo-agent">{zh ? "CEO Agent" : "CEO agent"}</Label>
                    <select id="ceo-agent" className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm" value={draft.selectedCeoAgentId} onChange={event => setDraft({...draft, selectedCeoAgentId: event.target.value})}>
                      <option value="">{zh ? "选择已检测到的 Agent" : "Choose a detected agent"}</option>
                      {agents.filter(agent => agent.detected).map(agent => <option key={agent.id} value={agent.id}>{agent.name}</option>)}
                    </select>
                    <p className="text-sm text-muted-foreground">{zh ? "首选 Agent 不可用时，会自动使用其他可用 Agent；全部不可用时等待恢复。" : "We automatically use another available agent if your preferred agent is unavailable, and wait if none can run."}</p>
                    <ul className="text-sm text-muted-foreground" aria-label={zh ? "Agent 可用状态" : "Agent availability"}>
                      {agents.filter(agent => agent.availability).map(agent => {
                        const health = agent.availability!;
                        const labels = zh
                          ? {ready: "可用", not_installed: "未安装或版本不兼容，请安装或更新", login_required: "需要重新登录", quota_exhausted: "额度已用尽，等待恢复", unknown: "额度状态未知"}
                          : {ready: "Available", not_installed: "Not installed or incompatible; install or update", login_required: "Sign in again", quota_exhausted: "Quota exhausted; waiting for recovery", unknown: "Quota unknown"};
                        return <li key={agent.id}>{agent.name}: {labels[health.state]}{health.retryAt && Number.isFinite(Date.parse(health.retryAt)) ? ` · ${zh ? "预计恢复" : "Resets"} ${new Date(health.retryAt).toLocaleString()}` : ""}</li>;
                      })}
                    </ul>
                    {!agents.some(agent => agent.detected) && <p role="status">{zh ? "两种模式均需要本机可用的 Agent。安装并登录后重新检测。" : "Both modes require an available local agent. Install and sign in, then detect again."}</p>}
                    {onDetectAgents && <Button type="button" variant="ghost" disabled={agentLoadState === "loading"} onClick={onDetectAgents}>{zh ? "重新检测 Agent" : "Detect agents again"}</Button>}
                  </div>
                  {draft.executionMode === "mah" && <div className="grid gap-3">
                    <div><Label htmlFor="mah-root">{zh ? "MAH 项目根目录" : "MAH project root"}</Label><Input id="mah-root" placeholder="/absolute/path/to/existing-project" value={draft.projectRoot} onChange={event => setDraft({...draft, projectRoot: event.target.value})} /></div>
                    <div><Label htmlFor="mah-cli">{zh ? "MAH 可执行文件" : "MAH executable"}</Label><Input id="mah-cli" placeholder="mah" value={draft.cliPath} onChange={event => setDraft({...draft, cliPath: event.target.value})} /></div>
                    <p className="text-sm text-muted-foreground">{zh ? "填写已有 MAH 项目的绝对路径。提交时先验证连接，验证通过才会创建公司。" : "Enter the absolute path to an existing MAH project. The connection is validated before the company is created."}</p>
                    <details><summary>{zh ? "高级设置" : "Advanced"}</summary><Label htmlFor="mah-slot">{zh ? "执行槽位" : "Slot class"}</Label><select id="mah-slot" className="ml-3 rounded-md border border-input bg-background px-3 py-2 text-sm" value={draft.slotClass} onChange={event => setDraft({...draft, slotClass: event.target.value as "background" | "interactive"})}><option value="background">background</option><option value="interactive">interactive</option></select></details>
                  </div>}
                  {error && <div className="story-note" role="alert">{error}</div>}
                  <div className="story-form-actions">
                    <Button
                      type="button"
                      variant="ghost"
                      onClick={() => {
                        selectScene(0);
                        setForm(false);
                      }}
                    >
                      <Play aria-hidden="true" />
                      {c.watch}
                    </Button>
                    <Button type="submit" disabled={!valid || isCreating || !onCreate}>
                      {isCreating ? (zh ? "验证并创建中…" : "Validating and creating…") : c.generate}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                  <p className="story-fine">{c.draft}</p>
                  </fieldset>
                </form>
              </>
            ) : (
              <>
                <StoryScene
                  key={playback}
                  scene={scene}
                  elapsed={elapsed}
                  reduced={reduced}
                  c={c}
                />
                <Dialog.Description className="story-description">
                  {c.descriptions[scene]}
                </Dialog.Description>
                <nav
                  className="story-progress"
                  aria-label={language === "zh" ? "演示章节" : "Demo chapters"}
                >
                  {c.steps.map((label, index) => (
                    <button
                      key={label}
                      aria-current={index === scene ? "step" : undefined}
                      onClick={() => selectScene(index)}
                    >
                      <span className="story-progress-track">
                        <span
                          style={{
                            width:
                              index < scene
                                ? "100%"
                                : index === scene
                                  ? `${finished ? 100 : (elapsed / duration) * 100}%`
                                  : "0%",
                          }}
                        />
                      </span>
                      {index + 1} · {label}
                    </button>
                  ))}
                </nav>
                <div className="story-navigation">
                  <Button
                    variant="ghost"
                    disabled={scene === 0}
                    onClick={() => selectScene(scene - 1)}
                  >
                    <ArrowLeft aria-hidden="true" />
                    {c.back}
                  </Button>
                  <Button
                    onClick={() =>
                      scene === 3 ? showForm() : selectScene(scene + 1)
                    }
                  >
                    {scene === 3 ? c.create : c.next}
                    <ArrowRight aria-hidden="true" />
                  </Button>
                </div>
                <p className="story-fine">{c.disclaimer}</p>
              </>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  );
}
