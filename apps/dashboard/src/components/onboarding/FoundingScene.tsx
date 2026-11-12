import { ArrowUpRight, Check, MousePointer2, Network } from "lucide-react";
import type { StoryCopy } from "./storyCopy";
import "./founding-scene.css";

export function FoundingScene({ elapsed, reduced, c }: {
  elapsed: number; reduced: boolean; c: StoryCopy;
}) {
  const time = reduced ? 12 : elapsed;
  const sent = time >= 4.2;
  const received = time >= 5;
  const planning = time >= 5.6;
  const complete = time >= 8.6;
  const typing = time < 3.4;
  const p = c.foundingPlan;
  const text = c.foundingVision.slice(0, Math.floor(c.foundingVision.length * Math.min(1, time / 3.4)));
  return (
    <div className="founding-scene" data-sent={sent} data-reduced={reduced}>
      <div className="founding-input">
        <div className="founding-input-heading">
          <span className="story-kicker">FirstSearch Studio</span>
          <span className="founding-recipient"><Network aria-hidden="true" /> MAH</span>
        </div>
        <div className="founding-text-layout">
          <span className="founding-text-reserve" aria-hidden="true">{c.foundingVision}</span>
          <div role="textbox" aria-readonly="true" aria-label={c.exampleVision} className="founding-typed">
            {text}{typing && <span className="founding-caret" data-testid="typing-caret" aria-hidden="true" />}
          </div>
        </div>
        <div className="founding-send" data-pressed={time >= 3.9} aria-hidden={sent}>
          {p.send}<ArrowUpRight aria-hidden="true" />
          {!sent && time >= 3.4 && <MousePointer2 className="founding-pointer" aria-hidden="true" />}
        </div>
        <span className="founding-receipt" aria-hidden={!received}><Check aria-hidden="true" />{p.received}</span>
      </div>
      <div className="founding-ceo" data-visible={received} aria-hidden={!received}>
        <span className="story-avatar"><Network aria-hidden="true" /></span>
        <strong>{complete ? p.title : p.planning}</strong>
      </div>
      <div className="founding-plan" data-visible={planning} aria-hidden={!planning}>
        <ol className="founding-task-list">
          {p.tasks.slice(0, 4).map((task, index) => time >= 5.8 + index * 0.55 && (
            <li className="founding-task" key={task}>
              <span className="founding-task-id">T0{index + 1}</span>
              <strong>{task}</strong>
              <span className="founding-dependency">{index < 3 ? p.parallel : p.after}</span>
            </li>
          ))}
        </ol>
        {complete && <div className="founding-remaining">
          <p>{p.remaining}</p>

        </div>}
      </div>
    </div>
  );
}
