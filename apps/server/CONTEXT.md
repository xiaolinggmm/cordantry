# Server Context

The server owns Cordantry's Founder-facing Company model and its projection of MAH facts. System-wide
vocabulary lives in the root `CONTEXT.md` and `GLOSSARY.md`.

## Execution boundary

- MAH is the only execution plane. Server code must never select, launch, probe, or fall back to
  Codex, Claude Code, or another Agent.
- Company Planning and ordinary Department Assignments use MAH's public Task interface.
- Persist an Assignment Execution Binding before submission. Reconciliation reuses its stable MAH
  Task identity.
- Accept only a schema-valid Assignment Result. The Result Judgment retains `agentId` and
  `modelId` for audit; those fields do not become routing inputs.
- MAH unavailability produces a typed Company Problem. It must not activate a direct execution path.

## Persistence

The fresh schema contains Company Planning, Company, Objective, Department, Department Assignment,
Assignment Execution Binding, Assignment Result, Company Problem, and Company Event data. Legacy
Task, Run, Agent Session, direct-provider, execution-mode, slot, and CLI-path fields have no
compatibility contract.

Assignment Result acceptance, Assignment completion, and activation of direct dependents happen in
one transaction. A different digest cannot replace an accepted Result.

## Public API

Company creation accepts only Founder Vision and an optional idempotency key. Public state uses
Founder-facing business language and never exposes MAH Task identity, commands, logs, workspaces,
prompts, or legacy Task/Run/Agent objects.

Pause stops new Assignment admission. Stop prevents new work and preserves accepted Results.

## Verification

Any execution-boundary change needs tests for the fresh schema, Founder Vision API, MAH submission
and result acceptance, and explicit no-fallback behavior.
