# Architecture

Cordantry is a local-first TypeScript company operations system. MAH is its only Agent execution
plane. [ADR 0052](adr/0052-mah-owned-company-operations.md) is the decision authority and
[GLOSSARY.md](../GLOSSARY.md) defines product terms.

## Runtime loop

```text
Founder Vision
  -> MAH Company Planning Task
  -> validated Company Plan
  -> Objectives, Departments, and Department Assignments
  -> Workflow Coordinator activates ready ordinary Assignments
  -> MAH selects an Agent/model and executes its Task
  -> schema-valid Assignment Result and Judgment
  -> accepted Result completes the Assignment and activates dependents
```

Cordantry owns the Company model, structural contracts, business dependencies, stable cross-system
bindings, accepted Results, and Founder-facing projections. MAH owns Agent/model selection, capacity,
execution, retries, workspaces, governance acceptance, and execution recovery.

There is no direct Codex/Claude adapter, provider availability router, local execution scheduler, or
fallback execution plane in Cordantry.

## Packages

- `@cordantry/core`: Company, Objective, Department, Assignment types and Zod boundary schemas.
- `@cordantry/server`: fresh SQLite persistence, MAH CLI boundary, Workflow Coordinator, REST, SSE,
  and static Dashboard serving.
- `@cordantry/cli`: local runtime entrypoint and coordinator loop.
- `@cordantry/dashboard`: Founder Vision onboarding and Company Plan/Assignment status projection.
- `@cordantry/desktop`: Electron shell that starts the same in-process MAH-only runtime.

## Persistence

Cordantry stores local state in:

```text
.cordantry/
  state.sqlite
  mah-company-planning/
  mah-assignments/
```

The fresh schema contains:

- `companies`
- `mah_company_planning`
- `company_problems`
- `company_events`
- `objectives`
- `departments`
- `department_assignments`
- `assignment_execution_bindings`
- `assignment_results`

Legacy Cordantry Task, Run, Agent Session, execution trace, provider-routing, execution-mode, slot,
and CLI-path data has no migration or compatibility path.

## Company Planning

Company creation accepts only Founder Vision and an optional idempotency key. When application
runtime configuration supplies a MAH project, Cordantry:

1. persists the Company and planning identity;
2. pre-mints a stable MAH Task ID;
3. submits the Company Plan schema and planning description;
4. reconciles ambiguous submission by querying that same ID;
5. reads `artifacts/company-plan.json`;
6. validates identities, references, routes, stages, order, and dependency acyclicity;
7. atomically creates the organization and activates the Company.

MAH unavailability produces a typed Company Problem. It never selects a local Agent fallback.

## Assignment coordination

The Workflow Coordinator considers only `ordinary_task` Assignments whose business dependencies are
complete. Before submission it persists an Assignment Execution Binding containing the stable MAH
Task identity, project root, and request digest.

After MAH reports a terminal result, Cordantry reads
`artifacts/assignment-result.json`. Completion requires a schema-valid Assignment Result and an
Assignment Result Judgment. The Judgment preserves `agentId` and `modelId` for audit, but those
values never control routing.

Canonical artifacts can become readable shortly after a Task status update. Cordantry therefore
reconciles an unreadable completed Result or evidence within a bounded deadline, using the same Task
identity. It does not resubmit the Assignment or invoke another execution plane.

Result acceptance, Assignment completion, and activation of direct dependents occur in one SQLite
transaction. A different digest cannot replace an accepted Result.

Product Direction is a distinct route. It remains waiting until its Founder/MAH Direction and
Roadmap flow is implemented; the ordinary coordinator never submits it as ordinary work.

## API

Reads:

- `GET /api/companies`
- `GET /api/companies/:id/state`
- `GET /api/events?companyId=...`

Mutations:

- `POST /api/companies`
- `POST /api/companies/:id/retry-creation`
- `POST /api/companies/:id/pause`
- `POST /api/companies/:id/resume`
- `POST /api/companies/:id/stop`

The public snapshot contains only Company, Objective, Department, Assignment, dependency, business
stage/status, typed Problem, and accepted Result projections. It never exposes MAH Task IDs, commands,
prompts, raw logs, workspaces, or legacy Task/Run/Agent execution objects.

## Company controls

Pause prevents admission of new Assignments. Already admitted MAH work can continue to a confirmed
result. Resume wakes the Workflow Coordinator. Stop prevents new work and preserves accepted Results.

## Verification

Required release checks are:

- `pnpm typecheck`
- `pnpm test`
- `pnpm build`
- Dashboard Playwright E2E
- `CORDANTRY_MAH_PROJECT_ROOT=... pnpm smoke:mah` for a real
  Founder → MAH → Assignment → Result flow

The fresh-schema and no-fallback contracts are pinned by automated tests.

## Known limits

- `node:sqlite` is experimental on Node 24.
- Public macOS releases need signing and notarization.
- Product Direction delivery and the broader Founder Inbox remain future slices.
