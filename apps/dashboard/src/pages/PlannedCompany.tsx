import type { CompanyProblem, CompanyStateResponse, DepartmentAssignmentSummary } from "../api/client";
import { LanguageSwitch } from "../components/workbench/LanguageSwitch";
import { useLanguage } from "../ui/language";

const progress = {
  en: [
    "Your vision is saved",
    "Preparing your company plan",
    "Company plan received",
    "Plan content confirmed",
    "Departments and work created",
    "Company ready",
  ],
  zh: [
    "已保存你的愿景",
    "正在制定公司计划",
    "已收到公司计划",
    "已确认计划内容",
    "已建立部门和工作安排",
    "公司已准备好",
  ],
} as const;

const statusText = {
  en: { waiting: "Waiting for earlier work", ready: "Ready to start", in_progress: "In progress", needs_founder: "Needs your decision", completed: "Completed", stopped: "Stopped" },
  zh: { waiting: "正在等待前一项工作", ready: "可以开始", in_progress: "正在进行", needs_founder: "需要你决定", completed: "已完成", stopped: "已停止" },
} as const;

const stageText = {
  en: { research: "Learning what is needed", delivery: "Preparing the result", acceptance: "Confirming the result", direction_preparation: "Preparing the product direction", founder_review: "Waiting for your decision", product_delivery: "Delivering the product direction" },
  zh: { research: "正在了解需求", delivery: "正在准备结果", acceptance: "正在确认结果", direction_preparation: "正在准备产品方向", founder_review: "等待你的决定", product_delivery: "正在交付产品方向" },
} as const;

export function PlannedCompany({ state, busy, problem, onPause, onResume, onStop, onRecheck }: {
  state: CompanyStateResponse;
  busy: boolean;
  problem?: CompanyProblem | null;
  onPause(): void;
  onResume(): void;
  onStop(): void;
  onRecheck(): void;
}) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const activeProblem = problem ?? state.problem ?? null;
  if (state.company.status === "creating") {
    return <main className="min-h-screen bg-background p-6 text-foreground">
      <section className="mx-auto grid max-w-2xl gap-6" aria-live="polite">
        <header className="flex items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">Cordantry</p><h1 className="text-3xl font-semibold">{zh ? "正在创建公司" : "Creating your company"}</h1></div><LanguageSwitch /></header>
        <ol className="grid gap-3">
          {progress[language].map((label, index) => {
            const complete = index < state.lastEventSequence;
            const current = index === state.lastEventSequence;
            return <li key={label} className="rounded-xl border bg-card p-4" aria-current={current ? "step" : undefined}>
              <span aria-hidden="true">{complete ? "✓" : current ? "●" : "○"}</span> {label}
            </li>;
          })}
        </ol>
      </section>
    </main>;
  }

  if (state.company.status === "creation_failed") {
    const download = activeProblem?.availableActions.find((action): action is { kind: "download_mah"; url: string } => action.kind === "download_mah");
    const copy = problemCopy(activeProblem?.category, zh);
    return <main className="min-h-screen bg-background p-6 text-foreground">
      <section className="mx-auto grid max-w-2xl gap-5" role="alert">
        <div className="flex items-start justify-between gap-4"><p className="text-sm text-muted-foreground">Cordantry</p><LanguageSwitch /></div>
        <h1 className="text-3xl font-semibold">{copy.title}</h1>
        <p>{copy.body}</p>
        <div className="flex gap-3">
          {download && <a href={download.url} target="_blank" rel="noreferrer">{zh ? "下载 MAH" : "Download MAH"}</a>}
          {activeProblem?.availableActions.some((action) => action.kind !== "download_mah") && <button disabled={busy} onClick={onRecheck}>{copy.action}</button>}
        </div>
      </section>
    </main>;
  }

  return <main className="min-h-screen bg-background p-6 text-foreground">
    <div className="mx-auto grid max-w-6xl gap-8">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><LanguageSwitch /><p className="mt-3 text-sm text-muted-foreground">{zh ? "公司状态" : "Company Status"}</p><h1 className="text-3xl font-semibold">{state.company.name}</h1><p>{state.company.status === "active" ? (zh ? "公司可以继续工作。" : "The company can continue its work.") : state.company.status === "paused" ? (zh ? "新工作已暂停。当前工作仍可完成。" : "New work is paused. Current work can finish.") : (zh ? "公司已停止。已完成的结果仍会保留。" : "The company is stopped. Completed results remain available.")}</p></div>
        <div className="flex gap-2">
          {state.company.status === "active" && <button disabled={busy} onClick={onPause}>{zh ? "暂停公司" : "Pause Company"}</button>}
          {state.company.status === "paused" && <button disabled={busy} onClick={onResume}>{zh ? "继续公司" : "Resume Company"}</button>}
          {state.company.status !== "stopped" && <button disabled={busy} onClick={onStop}>{zh ? "停止公司" : "Stop Company"}</button>}
        </div>
      </header>

      <section aria-labelledby="plan-heading" className="grid gap-4">
        <h2 id="plan-heading" className="text-2xl font-semibold">{zh ? "公司计划" : "Company Plan"}</h2>
        <div className="grid gap-3 md:grid-cols-2">{state.objectives.map((objective) => <article key={objective.id} className="rounded-xl border bg-card p-4"><h3 className="font-medium">{objective.title}</h3></article>)}</div>
      </section>

      {state.departments.map((department) => {
        const assignments = state.assignments.filter((assignment) => assignment.departmentId === department.id).sort((a, b) => a.order - b.order);
        return <section key={department.id} aria-labelledby={`department-${department.id}`} className="grid gap-4">
          <header><h2 id={`department-${department.id}`} className="text-2xl font-semibold">{department.name}</h2><p className="text-muted-foreground">{department.responsibility}</p></header>
          <div className="grid gap-4 md:grid-cols-2">{assignments.map((assignment) => <AssignmentCard key={assignment.id} assignment={assignment} all={state.assignments} language={language} />)}</div>
        </section>;
      })}
    </div>
  </main>;
}

function problemCopy(category: CompanyProblem["category"] | undefined, zh: boolean) {
  if (category === "installation_required") return zh
    ? { title: "需要安装 MAH", body: "你的愿景已保存。请安装 MAH，然后返回这里重新检查。", action: "重新检查" }
    : { title: "MAH is required", body: "Your vision is saved. Install MAH, then return here and recheck.", action: "Recheck" };
  if (category === "setup_required") return zh
    ? { title: "请先完成 MAH 设置", body: "你的愿景已保存。完成 MAH 设置后，请重新检查。", action: "重新检查" }
    : { title: "Finish MAH setup", body: "Your vision is saved. Finish MAH setup, then recheck.", action: "Recheck" };
  if (category === "plan_needs_new_attempt") return zh
    ? { title: "公司计划需要重新制定", body: "现有计划未通过检查。你的愿景已保存，可以开始一次新的规划。", action: "重新制定" }
    : { title: "The company plan needs a new attempt", body: "The current plan did not pass its checks. Your vision is saved.", action: "Start New Attempt" };
  return zh
    ? { title: "暂时无法完成规划", body: "你的愿景已保存。请稍后再试。", action: "再试一次" }
    : { title: "Planning is temporarily unavailable", body: "Your vision is saved. Try again later.", action: "Try Again" };
}

function AssignmentCard({ assignment, all, language }: { assignment: DepartmentAssignmentSummary; all: DepartmentAssignmentSummary[]; language: "en" | "zh" }) {
  const zh = language === "zh";
  const dependencies = assignment.dependsOnAssignmentIds.map((id) => all.find((candidate) => candidate.id === id)?.title).filter(Boolean);
  return <article className="rounded-xl border bg-card p-5" aria-label={assignment.title}>
    <h3 className="font-semibold">{assignment.title}</h3>
    <p>{assignment.expectedOutcome}</p>
    <dl className="mt-4 grid gap-2 text-sm">
      <div><dt className="text-muted-foreground">{zh ? "状态" : "Status"}</dt><dd>{statusText[language][assignment.status as keyof typeof statusText.en] ?? (zh ? "状态暂不可用" : "Status is not available")}</dd></div>
      <div><dt className="text-muted-foreground">{zh ? "当前阶段" : "Current stage"}</dt><dd>{stageText[language][assignment.stage as keyof typeof stageText.en] ?? (zh ? "阶段暂不可用" : "Stage is not available")}</dd></div>
      {dependencies.length > 0 && <div><dt className="text-muted-foreground">{zh ? "等待" : "Waiting for"}</dt><dd>{dependencies.join(zh ? "、" : ", ")}</dd></div>}
    </dl>
    {assignment.route.kind === "product_direction" && <p className="mt-4 text-sm text-muted-foreground">{zh ? "产品方向已记录。当前版本还不能开始产品交付。" : "The product direction is recorded. This version cannot start product delivery yet."}</p>}
    {assignment.result && <section className="mt-4 border-t pt-4"><h4 className="font-medium">{zh ? "结果" : "Result"}</h4><p>{assignment.result.resultSummary}</p><ul>{assignment.result.keyFindings.map((finding) => <li key={finding}>{finding}</li>)}</ul>{assignment.result.limitations.length > 0 && <p className="text-sm text-muted-foreground">{zh ? "限制：" : "Limitations: "}{assignment.result.limitations.join(zh ? "；" : "; ")}</p>}<p className="text-sm">{zh ? "下一步：" : "Next: "}{assignment.result.recommendedNextAction}</p></section>}
  </article>;
}
