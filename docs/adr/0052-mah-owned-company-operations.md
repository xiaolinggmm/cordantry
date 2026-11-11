---
status: accepted
date: 2026-11-06
---

# MAH owns planning execution and Cordantry projects company operations

Cordantry will remove its direct Codex and Claude Code dispatch layer. MAH is the only execution plane. MAH selects Agents and models, schedules Tasks, manages workspaces and retries, and owns Direction, Roadmap, Slice, Change Request, Work and Help Case execution objects. Cordantry owns the Founder-facing company model and translates MAH facts into company language.

This decision supersedes ADR 0050, both ADR 0051 files, and the direct-execution boundary retained from ADR 0049. It does not claim that the target is implemented. The existing code and historical documents remain migration evidence until the replacement is delivered.

## Decision

Cordantry submits the Founder Vision as a MAH Company Planning Task. A MAH-selected Agent derives a Company Plan that conforms to a Cordantry-owned schema. The Agent decides the plan's business content. Cordantry validates identities, references and structure. It does not replace the Agent's business judgment.

The Company Plan contains objectives, dynamic Departments, Department Assignments, business dependencies and one Execution Route for each Assignment. Departments are not a fixed catalog. A later immutable Plan Revision can add, merge, rename or retire Departments and future Assignments while preserving history.

Cordantry retains a small Workflow Coordinator. It activates an Assignment only after its business dependencies are satisfied, submits it once through the selected route, and stores stable cross-system references. It does not select an Agent or model, operate a workspace, schedule Attempts, or implement execution retry.

The Workflow Coordinator prepares and submits every ready ordinary Assignment. Independent Assignments can proceed in parallel. MAH owns execution order and capacity.

An ordinary Assignment maps to one primary MAH Task. MAH can use internal continuations, Attempts and Sessions without creating new Cordantry work. An Assignment that is too broad for one primary Task must become multiple Assignments through planning or a Plan Revision.

A product-capability or product-architecture Assignment does not enter the Roadmap directly. Each such Assignment carries a Direction Group Key. Related Assignments with the same key support one coherent Product Direction. Cordantry never infers the group from titles or keywords. Founder approval of that Direction allows MAH to create or update Roadmap rows and Slices. Implementation Tick can then create Change Requests and Work. Ordinary market, sales, pricing and operations Assignments never enter the Product Roadmap or Work Queue.

All relationships use stable IDs and source references. Cordantry does not infer lineage from titles. It stores Assignment-to-Task and Assignment-to-Direction references. It also retains the Direction-to-Roadmap-to-Slice-to-Change-Request-to-Work lineage needed for status projection and audit.

MAH Task completion is not Cordantry business completion. Cordantry accepts only a schema-valid Assignment Result with an accountable Agent's Assignment Result Judgment. Cordantry validates structure, identities and references. It does not replace the Agent's semantic decision. An accepted Assignment Result can satisfy dependencies and become bounded input to downstream Tasks. Raw logs and unvalidated output are never downstream business input.

Assignment Result acceptance and direct dependent activation are one transaction. Cordantry cannot expose a completed Assignment before its accepted result and resulting dependency changes are durable.

Assignment Result acceptance is idempotent by Assignment identity and result digest. A completed Assignment cannot accept different result content. A late result cannot replace an accepted result.

Product Assignments move from Direction review to product delivery after Founder approval. Cordantry projects the status of their related Slices. The Assignment completes only when its mapped product outcome is delivered and accepted.

Significant new evidence does not overwrite the current Company Plan. A changed Founder Vision, a result that refutes a planning assumption, or an Agent recommendation can create a Founder attention item. Founder confirmation starts a new Company Planning Task and produces an immutable Plan Revision. An Agent cannot silently delete active or completed company work.

## Founder experience

Cordantry shows only company and product language. It does not expose MAH Task, Work, Attempt, Session, Work Queue, raw log, governance text, prompt or technical state as a user-facing object. The product surface shows Departments, Assignments, expected outcomes, accepted results, Product Directions, product delivery stages and required Founder actions.

MAH outputs must contain schema-valid business projection fields. Cordantry combines those fields with deterministic status templates. It never falls back to raw MAH content when a business projection is missing.

Founder Inbox is a projection, not a second approval system. It aggregates pending Directions, Help Cases, Tasks waiting for business input, failed Company Planning, re-planning suggestions and other high-impact choices. A Founder action is written back to the original MAH or Cordantry source object.

One Company Planning Operation gets at most two automatic structural corrections. Each correction uses a linked MAH Task because a terminal MAH Task cannot accept active Task Input. A valid first result uses one Task. Two invalid results can add two correction Tasks. A third invalid result stops the loop. Founder Inbox then offers product actions: regenerate the plan in a new Company Planning Operation, add company information, or continue later. The Founder never edits JSON or repairs schema errors.

## Consequences

- Cordantry removes Direct Dispatch, executor availability routing and company-level execution-mode selection.
- Company creation no longer asks the Founder to choose a CEO Agent or execution provider.
- Company creation does not ask for a MAH project path, CLI path, slot or Agent. Cordantry reads the MAH project from application runtime configuration and validates it before submission.
- The Company Plan cutover removes the local Codex and Claude Code planning bridge. MAH unavailability does not select a second execution plane.
- Company creation returns a Company Creation Receipt. The Company State Snapshot contains objectives, Departments and Department Assignments, not legacy Cordantry Tasks or MAH Tasks.
- An unknown MAH planning submission stays in Company Planning Reconciliation with the same Task identity. It does not become a confirmed creation failure because one command ended.
- Pre-Company-Plan company data is test data and has no migration or compatibility contract. Cutover clears the old Cordantry company operational data. It does not clear MAH project data, Agent login state or application configuration.
- Cutover uses one versioned Cordantry data-format transaction. It clears old operational records once and records the new format version. It does not delete workspace files or run again on later starts.
- Every Assignment has one Assignment Business Status and one route-specific Assignment Stage. Neither field exposes MAH execution state.
- Every ordinary Assignment has one internal Assignment Execution Binding. Cordantry persists it before MAH submission and reuses its stable Task identity during reconciliation.
- Every Founder surface uses Founder-facing Plain Language. The Company Status page replaces Operations Diagnostics and never displays raw execution data.
- Founder-facing failures use a typed Company Problem. They never expose an internal error code, command, path, MAH Task identity or raw log.
- Pause Company stops new Assignment submission but lets admitted MAH work settle. Stop Company is final, stops all new work and reconciles cancellation of active MAH Tasks without treating a cancel request as terminal proof.
- Cordantry must add the Company Plan schema, Plan Revision model, Assignment Result contract, Workflow Coordinator, cross-system reference store, business projection layer and Founder Inbox adapters.
- Existing Cordantry Task, Agent Session, execution trace and direct-provider concepts are migration sources, not the target Founder-facing model.
- MAH does not need a Cordantry-specific Skill. Cordantry supplies task context, schemas and artifact contracts through MAH's public Task interface.
- MAH 0.1.2088 exposes the Task submission and canonical Task-document read capabilities needed for a prototype, but the full Founder Vision-to-result flow has not been validated end to end.

The complete product contract and acceptance scenarios are in [MAH-owned company operations](../mah-owned-company-operations.md).
