# MAH-owned company operations

Status: accepted target design. Not yet implemented or validated end to end.

Authority: [ADR 0052](adr/0052-mah-owned-company-operations.md).

## Product boundary

Cordantry is the Founder-facing company operations product. MAH is the execution plane. Cordantry does not run, select or supervise Codex, Claude Code or another execution provider directly.

| Cordantry owns | MAH owns |
|---|---|
| Founder Vision input | Agent and model selection |
| Company Plan schema | Task admission and scheduling |
| Departments and Assignments | Workspaces, Attempts and retries |
| Business dependency activation | Task execution and recovery |
| Assignment Result validation | Direction and Help Case records |
| Product-language projection | Roadmap, Slice and Implementation Tick |
| Founder Inbox projection | Change Request, Work and Work Queue |
| Stable cross-system references | Execution audit and technical state |

## End-to-end flow

```text
Founder Vision
    -> MAH Company Planning Task
    -> MAH-selected Agent
    -> Company Plan artifact
    -> Cordantry schema validation
    -> Departments and Department Assignments
```

The Agent decides the plan's business content. Cordantry defines and validates the data contract.

The Company Plan contains:

- objectives;
- dynamic Departments;
- Department Assignments;
- business dependencies;
- an ordinary-task or product-evolution route with rationale for each Assignment.

## Ordinary work

```text
Department Assignment
    -> one primary MAH Task
    -> schema-valid business result
    -> Assignment Result
    -> dependent Assignments become ready
```

MAH can use many internal Attempts, continuations or Sessions. They remain one Cordantry Assignment. Cordantry passes accepted business artifacts to downstream Tasks. It never passes raw logs as company facts.

## Product evolution

```text
related Department Assignments
    -> one coherent Product Direction
    -> Founder decision
    -> MAH Roadmap row
    -> Slices
    -> Implementation Tick
    -> Change Request
    -> Work Queue Work
```

A Direction represents one coherent product-capability or product-architecture decision. It can cite multiple related Assignments. MAH creates or changes the Roadmap only after Direction approval.

Ordinary research, market, sales, pricing and operations work remains ordinary MAH Tasks. It does not enter the Roadmap or Work Queue.

## Required identities

Cordantry stores explicit references. Titles are not identities.

```text
ordinary Assignment ID
    -> MAH Task ID

product Assignment IDs
    -> Product Direction ID
    -> Roadmap Row ID
    -> Slice IDs
    -> Change Request IDs
    -> Work IDs
```

Attempt, Task and Session identities below Work remain MAH implementation facts. Cordantry can retain them for reconciliation and audit, but it does not display them to the Founder.

## Founder-facing projection

Cordantry renders only schema-valid business fields and deterministic product templates.

It can show:

- `用户研究部门正在验证批量处理需求。`
- `产品团队建议建立批量视频处理能力。`
- `3 个交付阶段中已完成 2 个。`
- `请确认首批客户是个人创作者还是内容团队。`

It does not show:

- Task, Work, Attempt, Session or Work Queue objects;
- raw Agent output, logs, prompts or governance text;
- internal state codes, carrier state or schema errors.

If a valid business projection is absent, the UI shows a bounded neutral status and requests a corrected projection. It does not expose the raw source.

## Founder Inbox

Founder Inbox projects existing decision and recovery obligations. It does not create a parallel approval lifecycle.

Sources include:

- pending Product Directions;
- MAH Help Cases;
- Tasks waiting for business input;
- Company Planning that did not converge;
- recommendations for a Plan Revision;
- other high-impact choices that require Founder authority.

The selected action is applied to the original source object.

## Company Planning recovery

Cordantry returns structural validation errors to the same Company Planning Task at most twice. These errors can identify missing IDs, invalid references, invalid routes and other schema facts. They cannot rewrite business meaning.

If the Task still fails, Founder Inbox offers:

1. **Regenerate plan**: start a new MAH Planning Task with the Vision, context, schema, prior errors and reusable valid facts.
2. **Add company information**: answer the Agent's bounded business questions before planning continues.
3. **Continue later**: preserve the Vision without starting company work.

The Founder never repairs JSON or reads validation diagnostics.

## Plan revisions

A Plan Revision is an immutable successor to a Company Plan. It can add, merge, rename or retire future Departments and Assignments. It preserves completed work and historical ownership.

A Plan Revision can be proposed when:

- the Founder changes the Vision;
- an Assignment Result refutes a planning assumption;
- an Agent recommends a material organization or sequence change.

Material re-planning requires Founder confirmation. Confirmation starts a new Company Planning Task.

## Acceptance scenarios

1. A Founder supplies only a Vision. MAH produces a valid Company Plan. Cordantry creates dynamic Departments and starts ready ordinary Assignments without an executor choice.
2. One ordinary Assignment produces an accepted business result. Cordantry completes it and starts a dependent Assignment with only accepted upstream facts.
3. Several Assignments support one product capability. Cordantry presents one Product Direction. No Roadmap work starts before Founder approval.
4. Direction approval produces Roadmap and Slice progress. Cordantry displays product delivery stages and never displays Work Queue objects.
5. A Task has multiple Attempts or Sessions. Cordantry still displays one Assignment.
6. Company Planning violates the schema twice and then fails again. Automatic correction stops. Founder Inbox offers regenerate, add information and continue later.
7. A business result refutes the plan. Cordantry asks the Founder whether to re-plan. A confirmed revision preserves the old plan and completed work.
8. A MAH record contains technical or governance-heavy text. Cordantry renders only validated business projection fields and never exposes the raw text as product content.

## Validation gap

Installed MAH version 0.1.2132 supports generic Task description submission, attachments, metadata, pre-minted stable Task IDs, Task status reads and canonical Task-document reads. A real Company Planning smoke verified the Founder Vision-to-schema-valid Company Plan artifact half of the prototype through only those public interfaces.

The complete flow is not yet proven. The next implementation slices must extend that verified planning boundary through one narrow end-to-end experiment:

```text
Founder Vision
    -> Company Planning Task
    -> schema-valid Company Plan artifact
    -> one ordinary Assignment
    -> accepted Assignment Result
    -> one dependent Assignment
```

The experiment must also verify one failed-schema correction and the stable ID mappings. Product Direction and Roadmap projection follow only after this core loop works.
