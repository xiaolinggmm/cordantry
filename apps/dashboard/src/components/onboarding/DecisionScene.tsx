import { ArrowDown, Check, CheckCircle2, LoaderCircle, MousePointer2, ShieldCheck, UserRound } from "lucide-react";
import type { StoryCopy } from "./storyCopy";
import "./decision-scene.css";

export function DecisionScene({ elapsed, reduced, c }: { elapsed: number; reduced: boolean; c: StoryCopy }) {
  const time = reduced ? 12 : elapsed;
  const received = time >= 2;
  const selected = time >= 4;
  const approved = time >= 5.8;
  const resumed = time >= 6.4;
  const verifying = time >= 8;
  const done = time >= 9.6;
  const p = c.decision;
  return (
    <div className="decision-scene" data-reduced={reduced} data-approved={approved}>
      <div className="decision-task"><CheckCircle2 aria-hidden="true" /><strong>{p.task}</strong><span>{p.ready}</span></div>
      <div className="decision-transfer" aria-hidden="true"><ArrowDown />{time >= 1.2 && <i />}</div>
      <section className="decision-review" data-visible={received} aria-hidden={!received}>
        <header><UserRound aria-hidden="true" /><strong>{p.inbox}</strong><span>{p.user}</span></header>
        {received && <>
          <p className="decision-question">{p.question}</p>
          <div className="decision-options">
            {p.options.map((option, index) => <div key={option} className="decision-option" data-selected={selected && index === 0}>
              <span className="decision-radio" aria-hidden="true">{selected && index === 0 && <Check />}</span>
              <strong>{option}</strong>
              {index === 0 && <small>{selected ? p.selected : p.recommended}</small>}
              {index === 0 && time >= 3.3 && time < 4.4 && <MousePointer2 className="decision-pointer decision-select-pointer" aria-hidden="true" />}
            </div>)}
          </div>
          <div className="decision-action"><span className="decision-approve" data-ready={selected} data-pressed={time >= 5.4}>
            {approved && <Check aria-hidden="true" />}{approved ? p.approved : "Approve"}
            {time >= 4.8 && !approved && <MousePointer2 className="decision-pointer" aria-hidden="true" />}
          </span></div>
        </>}
      </section>
      <div className="decision-delivery" data-visible={resumed} data-done={done} aria-hidden={!resumed}>
        {resumed && <>
          <span className="decision-result-icon">{done ? <ShieldCheck aria-hidden="true" /> : <LoaderCircle aria-hidden="true" />}</span>
          <div><strong>{done ? p.done : verifying ? p.verifying : p.continue}</strong><p>{done ? p.evidence : p.result}</p></div>
          <div className="decision-progress" aria-hidden="true"><span style={{ width: `${done ? 100 : Math.min(92, (time - 6.4) * 28)}%` }} /></div>
          {done && <CheckCircle2 className="decision-finish" aria-label={p.done} />}
        </>}
      </div>
    </div>
  );
}
