import { useEffect, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { ArrowRight, X } from "lucide-react";
import { Button, Label } from "../components/ui";
import { LanguageSwitch } from "../components/workbench/LanguageSwitch";
import { useLanguage } from "../ui/language";
import type { AgentSummary, CreateCompanyInput } from "../api/client";
import "./onboarding.css";

const draftKey = "cordantry.onboardingDraft";

function readVision(): string {
  try {
    const value = JSON.parse(sessionStorage.getItem(draftKey) ?? "null") as { vision?: unknown } | null;
    return typeof value?.vision === "string" ? value.vision : "";
  } catch {
    return "";
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
  agents?: AgentSummary[];
  onCreate?(input: CreateCompanyInput): void;
  isCreating?: boolean;
  error?: string | null;
  agentLoadState?: string;
  onDetectAgents?(): void;
}) {
  const { language } = useLanguage();
  const zh = language === "zh";
  const [vision, setVision] = useState(readVision);

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey, JSON.stringify({ vision }));
    } catch {
      // React state keeps the draft for this visit when storage is unavailable.
    }
  }, [vision]);

  return <Dialog.Root open onOpenChange={(open) => { if (!open && onCancel) onCancel(); }}>
    <Dialog.Portal>
      <Dialog.Overlay className="story-overlay" />
      <Dialog.Content className="story-modal" onPointerDownOutside={(event) => event.preventDefault()}>
        <div className="story-top">
          <span className="story-kicker">Cordantry</span>
          <div className="story-top-actions">
            <LanguageSwitch />
            {onCancel && <Button aria-label={zh ? "关闭" : "Close"} variant="ghost" size="icon" onClick={onCancel}><X aria-hidden="true" /></Button>}
          </div>
        </div>
        <Dialog.Title className="story-title">{zh ? "创建你的公司" : "Create your company"}</Dialog.Title>
        <Dialog.Description className="text-sm text-muted-foreground">
          {zh ? "说明你想帮助谁，以及你想验证什么。" : "Describe who you want to help and what you want to validate."}
        </Dialog.Description>
        <form className="story-form" onSubmit={(event) => {
          event.preventDefault();
          if (!vision.trim() || isCreating || !onCreate) return;
          onCreate({ founderVision: vision.trim() });
        }}>
          <fieldset disabled={isCreating} className="contents">
            <div>
              <Label htmlFor="founder-vision">{zh ? "创始人愿景" : "Founder vision"}</Label>
              <textarea id="founder-vision" className="story-vision" value={vision} onChange={(event) => setVision(event.target.value)} placeholder={zh ? "例如：帮助独立内容创作者更快完成视频画面裁剪，并验证他们是否愿意付费。" : "For example: Help independent creators crop videos faster and learn whether they will pay."} />
            </div>
            <p className="text-sm text-muted-foreground">{zh ? "Cordantry 使用 MAH 制定公司计划。你不需要选择执行模式或 Agent。" : "Cordantry uses MAH to prepare the company plan. You do not need to choose an execution mode or Agent."}</p>
            {error && <div className="story-note" role="alert">{error}</div>}
            <div className="story-form-actions">
              <Button type="submit" disabled={!vision.trim() || isCreating || !onCreate}>
                {isCreating ? (zh ? "正在创建…" : "Creating…") : (zh ? "创建公司" : "Create Company")}
                <ArrowRight aria-hidden="true" />
              </Button>
            </div>
          </fieldset>
        </form>
      </Dialog.Content>
    </Dialog.Portal>
  </Dialog.Root>;
}
