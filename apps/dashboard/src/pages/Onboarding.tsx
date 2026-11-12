import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Play, X } from "lucide-react";
import type { CreateCompanyInput } from "../api/client";
import { StoryScene } from "../components/onboarding/StoryScene";
import { storyCopy } from "../components/onboarding/storyCopy";
import { Button, Input, Label } from "../components/ui";
import { LanguageSwitch } from "../components/workbench/LanguageSwitch";
import { useLanguage } from "../ui/language";
import "./onboarding.css";

const draftKey = "cordantry.onboardingDraft";

function readDraft(): { companyName: string; vision: string; form: boolean } {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as { companyName?: unknown; vision?: unknown; form?: unknown } | null;
    return {
      companyName: typeof value?.companyName === "string" ? value.companyName : "",
      vision: typeof value?.vision === "string" ? value.vision : "",
      form: value?.form === true,
    };
  } catch {
    return { companyName: "", vision: "", form: false };
  }
}

export function Onboarding({
  onCancel,
  onCreate,
  isCreating = false,
  error,
}: {
  onCancel?(): void;
  review?: boolean;
  onCreate?(input: CreateCompanyInput): void;
  isCreating?: boolean;
  error?: string | null;
}) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const c = storyCopy[language];
  const modal = useRef<HTMLDivElement>(null);
  const initialDraft = useRef(readDraft()).current;
  const [companyName, setCompanyName] = useState(initialDraft.companyName);
  const [vision, setVision] = useState(initialDraft.vision);
  const [form, setForm] = useState(initialDraft.form || isCreating);
  const [scene, setScene] = useState(0);
  const [playback, setPlayback] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [reduced, setReduced] = useState(() => window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false);
  const duration = scene === 2 ? 10 : 12;
  const finished = reduced || elapsed >= duration;

  useEffect(() => {
    const query = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query?.matches ?? false);
    query?.addEventListener("change", update);
    return () => query?.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (isCreating) setForm(true);
  }, [isCreating]);

  useEffect(() => {
    if (form || finished) return;
    let frame: number;
    let previous: number | undefined;
    const tick = (now: number) => {
      const delta = previous === undefined ? 0 : Math.min((now - previous) / 1000, 0.05);
      previous = now;
      setElapsed((value) => Math.min(duration, value + delta));
      frame = window.requestAnimationFrame(tick);
    };
    frame = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(frame);
  }, [duration, finished, form, scene]);

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ companyName, vision, form }));
    } catch {
      // React state keeps the draft for this visit when storage is unavailable.
    }
  }, [companyName, form, vision]);

  useEffect(() => {
    if (modal.current) modal.current.scrollTop = 0;
  }, [form, scene]);

  function selectScene(index: number) {
    setPlayback((value) => value + 1);
    setScene(index);
    setElapsed(0);
  }

  return (
    <Dialog.Root open onOpenChange={(open) => { if (!open && onCancel) onCancel(); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="story-overlay" />
        <Dialog.Content ref={modal} className="story-modal" onPointerDownOutside={(event) => event.preventDefault()}>
          <div className="story-top">
            <span className="story-kicker">{form ? "Cordantry" : c.example}</span>
            <div className="story-top-actions">
              <LanguageSwitch />
              {!form && <Button variant="ghost" size="sm" onClick={() => setForm(true)}>{c.skip}<ArrowRight aria-hidden="true" /></Button>}
              {onCancel && <Button aria-label={zh ? "关闭" : "Close"} variant="ghost" size="icon" onClick={onCancel}><X aria-hidden="true" /></Button>}
            </div>
          </div>
          <Dialog.Title className="story-title">{form ? (zh ? "创建你的公司" : "Create your company") : c.titles[scene]}</Dialog.Title>

          {form ? (
            <>
              <Dialog.Description className="text-sm text-muted-foreground">
                {zh ? "说明你想帮助谁，以及你想验证什么。" : "Describe who you want to help and what you want to validate."}
              </Dialog.Description>
              <form className="story-form" onSubmit={(event) => {
                event.preventDefault();
                if (!companyName.trim() || !vision.trim() || isCreating || !onCreate) return;
                onCreate({ companyName: companyName.trim(), founderVision: vision.trim() });
              }}>
                <fieldset disabled={isCreating} className="contents">
                  <div>
                    <Label htmlFor="company-name">{zh ? "公司名称" : "Company name"}</Label>
                    <Input id="company-name" autoComplete="organization" value={companyName} onChange={(event) => setCompanyName(event.target.value)} placeholder={zh ? "例如：创作者工作室" : "For example: Creator Studio"} />
                  </div>
                  <div>
                    <Label htmlFor="founder-vision">{zh ? "创始人愿景" : "Founder vision"}</Label>
                    <textarea id="founder-vision" className="story-vision" value={vision} onChange={(event) => setVision(event.target.value)} placeholder={zh ? "例如：帮助独立内容创作者更快完成视频画面裁剪，并验证他们是否愿意付费。" : "For example: Help independent creators crop videos faster and learn whether they will pay."} />
                  </div>
                  <p className="text-sm text-muted-foreground">{zh ? "Cordantry 将愿景交给 MAH；MAH 负责建立任务、选择执行 Agent、管理工作区并回传结果。" : "Cordantry hands the vision to MAH. MAH creates tasks, selects execution Agents, manages workspaces and returns results."}</p>
                  {error && <div className="story-note" role="alert">{error}</div>}
                  <div className="story-form-actions">
                    {!isCreating && <Button type="button" variant="ghost" onClick={() => { selectScene(0); setForm(false); }}><Play aria-hidden="true" />{c.watch}</Button>}
                    <Button type="submit" disabled={!companyName.trim() || !vision.trim() || isCreating || !onCreate}>
                      {isCreating ? (zh ? "正在创建…" : "Creating…") : (zh ? "创建公司" : "Create Company")}
                      <ArrowRight aria-hidden="true" />
                    </Button>
                  </div>
                </fieldset>
              </form>
            </>
          ) : (
            <>
              <StoryScene key={playback} scene={scene} elapsed={elapsed} reduced={reduced} c={c} />
              <Dialog.Description className="story-description">{c.descriptions[scene]}</Dialog.Description>
              <nav className="story-progress" aria-label={zh ? "演示章节" : "Demo chapters"}>
                {c.steps.map((label, index) => (
                  <button key={label} aria-current={index === scene ? "step" : undefined} onClick={() => selectScene(index)}>
                    <span className="story-progress-track"><span style={{ width: index < scene ? "100%" : index === scene ? `${finished ? 100 : (elapsed / duration) * 100}%` : "0%" }} /></span>
                    {index + 1} · {label}
                  </button>
                ))}
              </nav>
              <div className="story-navigation">
                <Button variant="ghost" disabled={scene === 0} onClick={() => selectScene(scene - 1)}><ArrowLeft aria-hidden="true" />{c.back}</Button>
                <Button onClick={() => scene === 3 ? setForm(true) : selectScene(scene + 1)}>{scene === 3 ? c.create : c.next}<ArrowRight aria-hidden="true" /></Button>
              </div>
              <p className="story-fine">{c.disclaimer}</p>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
