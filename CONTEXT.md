# Project Context

[ADR 0052](docs/adr/0052-mah-owned-company-operations.md) defines the implemented execution boundary:
MAH is Cordantry's only execution plane. Historical ADRs and plans remain decision evidence, not
runtime compatibility requirements. [GLOSSARY.md](GLOSSARY.md) is the vocabulary authority.

## Ownership

Cordantry owns:

- Founder Vision intake and Company Planning request identity.
- The Company, Objective, Department, and Department Assignment business model.
- Structural validation of Company Plans and Assignment Results.
- Business dependency activation through the Workflow Coordinator.
- Stable Assignment Execution Bindings and accepted Assignment Results.
- Founder-facing Company Status, Company Problems, and business projections.

MAH owns:

- Agent and model selection.
- Task scheduling, execution, retries, workspaces, and execution recovery.
- Agent login state and external execution configuration.
- Canonical Task artifacts used at the Cordantry boundary.

## Hard boundary

Cordantry never selects, probes, launches, or falls back to Codex, Claude Code, or another Agent.
Company creation does not accept an execution mode, Agent, model, CLI path, MAH project path, or slot.
The MAH project and executable come from application runtime configuration.

If MAH is unavailable, Cordantry preserves the Founder Vision and reports a typed Company Problem.
It does not activate a local bridge or direct executor.

## Business model

A Company Plan contains Objectives, dynamic Departments, Department Assignments, dependencies, and
an Execution Route. An ordinary Assignment maps to one primary MAH Task through an internal stable
Assignment Execution Binding. Product Direction work is not ordinary work and remains waiting until
its separate Founder/MAH flow is implemented.

MAH Task completion is not business completion. Cordantry accepts only a schema-valid Assignment
Result with an Assignment Result Judgment. The judgment retains the accountable `agentId` and
`modelId` for audit. Those identities are never Cordantry routing inputs.

## Persistence

This pre-production cutover uses a fresh SQLite schema. There is no migration or compatibility path
for legacy Cordantry Task, Run, Agent Session, execution trace, provider selection, or routing fields.
Test databases may be deleted only after verification. MAH project data, Agent login state, external
configuration, and workspaces must not be deleted.

## Founder surface

Use Founder-facing Plain Language. Public state may show Companies, Objectives, Departments,
Assignments, dependencies, stages, statuses, accepted Results, Product Directions, and required
Founder actions. It must not expose MAH Task identity, commands, prompts, governance text, logs,
workspaces, Attempts, Sessions, or legacy Task/Run/Agent objects.

Pause prevents new Assignment admission while admitted work can settle. Stop ends new Company work
and preserves accepted Results.

## Required verification

Execution-boundary changes require:

- full typecheck, tests, and production build;
- a fresh-schema assertion;
- Founder Vision → MAH Company Plan → Assignment → Assignment Result coverage;
- an explicit no-fallback test;
- exact confirmation before deleting any existing Cordantry SQLite test database.
