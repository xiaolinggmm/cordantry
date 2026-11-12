import { Network, Search, Code2, Megaphone, ArrowDown, Check, MousePointer2 } from "lucide-react";
import type { CSSProperties } from "react";
import { AgentIcon } from "../workbench/AgentIcon";
import type { StoryCopy } from "./storyCopy";
import "./coordination-scene.css";

// T04 remains a Founder decision; MAH delegates the other Assignments by specialty.
const groups = [
  { role: 1, ids: [1, 3, 5, 14], tool: "claude-code", name: "Claude Code", Icon: Search },
  { role: 2, ids: [7, 8, 10, 11], tool: "codex", name: "Codex", Icon: Code2 },
  { role: 3, ids: [2, 6, 9, 12, 13], tool: "claude-code", name: "Claude Code", Icon: Megaphone },
];

export function CoordinationScene({ elapsed, reduced, c }: {
  elapsed: number; reduced: boolean; c: StoryCopy;
}) {
  const time = reduced ? 12 : elapsed;
  const sent = time >= 2.6;
  const complete = time >= 6.4;
  const p = c.assignment;
  return (
    <div className="coordination-scene" data-reduced={reduced}>
      <div className="assignment-source">
        <div className="assignment-decision"><Network aria-hidden="true" /><span>{p.decision}</span></div>
        <div className="assignment-dispatch" data-pressed={time >= 2.2} data-sent={sent}>
          {complete ? <Check aria-hidden="true" /> : <ArrowDown aria-hidden="true" />}
          {complete ? p.dispatched : p.dispatch}
          {time >= 1.6 && !sent && <MousePointer2 className="assignment-pointer" aria-hidden="true" />}
        </div>
      </div>
      <div className="assignment-grid">
        {groups.map(({ role, ids, tool, name, Icon }, index) => {
          const assigned = time >= 2.8 + index * 1.3;
          return (
            <section className="assignment-worker" key={role}>
              <header>
                <span className={`story-avatar story-avatar-${role}`}><Icon aria-hidden="true" /></span>
                <div><strong>{c.roles[role]} <span className="assignment-agent-label">Agent</span></strong>
                  <span className="assignment-tool"><AgentIcon agentId={tool} name={name} />{name}</span>
                </div>
              </header>
              <div className="assignment-bundle" data-assigned={assigned} aria-hidden={!assigned}
                style={{ "--origin-x": `${(1 - index) * 100}%` } as CSSProperties}>
                <div className="assignment-category"><strong>{p.categories[index]}</strong><small>{p.counts[index]}</small></div>
                <ol aria-label={c.roles[role]}>
                  {ids.map(id => <li key={id}><span className="assignment-id">T{String(id).padStart(2, "0")}</span><span>{c.foundingPlan.tasks[id - 1]}</span></li>)}
                </ol>
              </div>
            </section>
          );
        })}
      </div>
      <p className="assignment-note">{p.example}</p>
    </div>
  );
}
