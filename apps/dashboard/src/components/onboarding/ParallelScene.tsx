import { ArrowDown, CheckCircle2, Network, LoaderCircle, MessageSquare, MessageCircleQuestion } from "lucide-react";
import { AgentIcon } from "../workbench/AgentIcon";
import type { StoryCopy } from "./storyCopy";
import "./parallel-scene.css";

const tasks = [
  { id: 1, role: 1, tool: "claude-code", name: "Claude Code" },
  { id: 3, role: 1, tool: "codex", name: "Codex" },
  { id: 2, role: 3, tool: "claude-code", name: "Claude Code" },
];

export function ParallelScene({ elapsed, reduced, c }: { elapsed: number; reduced: boolean; c: StoryCopy }) {
  const time = reduced ? 10 : elapsed;
  const p = c.parallel;
  const arrivals = [4.4, 5.8, 7.4];
  const messages = [p.result, p.progress, p.issue];
  return (
    <div className="parallel-scene" data-reduced={reduced}>
      <p className="sr-only">{p.independence}</p>
      <div className="parallel-tasks">
        {tasks.map(({ id, tool, name }, index) => {
          const state = index === 0 && time >= 3.6 ? "complete" : index === 2 && time >= 6.6 ? "question" : "running";
          const Icon = state === "complete" ? CheckCircle2 : state === "question" ? MessageCircleQuestion : LoaderCircle;
          const progress = Math.min(index === 1 ? 68 : 85, Math.floor(12 + (state === "question" ? 6.6 : time) * (index === 0 ? 20 : 7)));
          return <article className="parallel-task" data-state={state} key={id}>
            <div className="parallel-agent"><AgentIcon agentId={tool} name={name} /><span>{name}</span></div>
            <h3><span>T0{id}</span>{c.foundingPlan.tasks[id - 1]}</h3>
            <div className="parallel-status"><Icon key={state} aria-hidden="true" /><strong>{p[state]}</strong></div>
            <div className="parallel-meter" role={state === "running" ? "progressbar" : undefined}
              aria-label={state === "running" ? c.foundingPlan.tasks[id - 1] : undefined}
              aria-valuenow={state === "running" ? progress : undefined}
              aria-valuemin={state === "running" ? 0 : undefined} aria-valuemax={state === "running" ? 100 : undefined}>
              <span style={{ width: `${state === "complete" ? 100 : progress}%` }} />
            </div>
          </article>;
        })}
      </div>
      <div className="parallel-transfer" aria-hidden="true">
        {tasks.map((task, index) => <div key={task.id}><ArrowDown />{time >= arrivals[index]! - .7 && <i key={`message-${index}`}><MessageSquare /></i>}</div>)}
      </div>
      <section className="parallel-inbox" aria-label={p.inbox}>
        <header><Network aria-hidden="true" /><strong>{p.inbox}</strong></header>
        {time < arrivals[0]! && <div className="parallel-waiting"><span className="sr-only">{p.waiting}</span><i /><i /><i /></div>}
        <ol>
          {tasks.map((task, index) => time >= arrivals[index]! && <li key={task.id} data-kind={index}>
            <span className="parallel-message-id">T0{task.id}</span>
            {index === 0 ? <CheckCircle2 aria-label={p.complete} /> : index === 1 ? <LoaderCircle aria-label={p.running} /> : <MessageCircleQuestion aria-label={p.question} />}
            <p>{messages[index]}</p>
          </li>)}
        </ol>
      </section>
    </div>
  );
}
