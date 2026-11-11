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

Each Assignment also contains a Company-wide unique non-negative `order` and an initial `stage`. An ordinary Assignment stage is `research`, `delivery` or `acceptance`. A Product Direction Assignment starts at `direction_preparation`. Cordantry validates these values and never infers them from a title.

## Creation and state readback

`POST /api/companies` returns `202 Accepted` with one Company Creation Receipt. The receipt has `schemaVersion: 1`, `kind: company_creation_receipt` and the stable Company identity, `creating` status and creation time. Its `Location` identifies the Company State Snapshot. The receipt does not contain Departments, Assignments, MAH Tasks or legacy Cordantry Tasks.

The Company State Snapshot has `schemaVersion: 1`, `kind: company_state`, `lastEventSequence`, the Company, objectives, Departments and Department Assignments. Each Assignment carries its Assignment Business Status, Assignment Stage, expected outcome, dependencies and Execution Route. The snapshot does not expose a MAH Task ID, execution configuration, Work Queue object or raw log.

A Founder-facing failure returns one Company Problem. It has `schemaVersion: 1`, `kind: company_problem`, a public `category`, one plain-language message and `availableActions`. The public categories are `installation_required`, `setup_required`, `try_again_later`, `plan_needs_new_attempt` and `work_stopped`. The Dashboard maps each category to fixed product text. It never renders the stored category. A Company Problem does not contain an internal error code, command, path, MAH Task identity, execution configuration, stack trace or raw log.

Assignment Business Status uses one lifecycle for both routes: `waiting`, `ready`, `in_progress`, `needs_founder`, `completed` and `stopped`. Assignment Stage uses route-specific business language. Ordinary work shows research, delivery and business acceptance stages. Product Direction work shows direction preparation, Founder review and product delivery stages. MAH queue, retry, Attempt and carrier states stay in internal diagnostics. The first delivery does not use `needs_founder` for Product Direction because it does not yet implement the complete Founder decision and Roadmap action.

Company Planning writes six durable events in order: creation request accepted, plan requested, artifact received, plan validated, organization created and company ready. Each event has `id`, `companyId`, monotonic Company `sequence`, `kind`, `occurredAt` and `businessPayload`. The events contain safe business fields. They do not contain MAH Task IDs, raw logs or execution configuration. The Company State Snapshot remains the final fact after an event gap. The Dashboard compares each event sequence with `lastEventSequence`. A gap stops event application and causes a Snapshot read.

When a MAH submission result is unknown, Cordantry starts Company Planning Reconciliation. It queries the same stable Task identity immediately. Two independent `task_not_found` results admit one recovery submit with the same UUID. One Company Planning operation permits at most two submit calls. It then performs read-only queries until the original ten-minute deadline. A restart preserves the submit count and deadline. A confirmed terminal result or deadline exhaustion ends reconciliation. Deadline exhaustion moves the Company to `creation_failed`.

Company data created before the Company Plan model is test data. Cordantry provides no migration, export or read-only compatibility surface for it. Cutover uses one versioned Cordantry data-format transaction. It clears the old Cordantry Company, Department, Task, Run and related business records and records the new format version. Later starts do not clear data again. The transaction does not clear MAH project data, Agent login state or application configuration. It does not scan or delete workspace files.

Company creation asks only for the Founder Vision. It does not ask for a MAH project path, CLI path, execution slot or Agent. `CORDANTRY_MAH_PROJECT_ROOT` supplies the MAH project root. Cordantry resolves `mah` from the system `PATH` unless runtime configuration supplies another executable. Cordantry validates this setup before submission.

Confirmed MAH unavailability moves the Company to `creation_failed` and preserves the Founder Vision. If MAH is not installed, the UI offers Download MAH and installation guidance. The default download URL is `https://mah.bot/download`. `CORDANTRY_MAH_INSTALL_URL` can replace it with another trusted `https` URL. After installation, Recheck continues the same Company and Company Planning Operation. It preserves the Company ID, Founder Vision and prepared planning identity. If MAH is installed but temporarily unavailable, the UI offers a retry action. An ambiguous submission stays in Company Planning Reconciliation.

The Founder UI uses three MAH availability messages. Not installed says: “Cordantry needs MAH to create your company plan. Download and install MAH first.” Setup required says: “MAH is installed, but it is not ready to work. Finish MAH setup, then recheck.” Temporarily unavailable says: “MAH cannot create your company plan now. Your vision is saved. Try again later.” Chinese copy follows the same meaning and Founder-facing Plain Language rules. Internal codes stay in diagnostic records.

Creation failure actions follow the confirmed cause. Missing installation, incomplete setup and temporary unavailability continue the same Company Planning Operation after Recheck or Retry. Admission deadline exhaustion only permits a read-only recheck of the original Task until its state is confirmed. It cannot create a new Operation. Three invalid plans or an explicitly terminal failed planning Task permit a new Company Planning Operation for the same Company and Founder Vision.

## Initial Assignment activation

Company Plan import computes every initial Assignment Business Status in the same transaction. An ordinary Assignment with no dependencies is `ready`. An Assignment with dependencies is `waiting`. In the first delivery, every Product Direction Assignment is `waiting` with Stage `direction_preparation`, including one with no dependencies. Its card says that the product direction is recorded and that the current version cannot start product delivery. It has no approval action. The Workflow Coordinator submits only `ready` ordinary Assignments. It never submits a Product Direction Assignment as an ordinary MAH Task.

After import and after every accepted result, the Workflow Coordinator prepares a Binding for every ready ordinary Assignment and submits each one. Independent Assignments can proceed in parallel. MAH owns capacity and execution order. Cordantry does not add another execution queue.

## Ordinary work

```text
Department Assignment
    -> one primary MAH Task
    -> schema-valid business result
    -> Assignment Result
    -> dependent Assignments become ready
```

MAH can use many internal Attempts, continuations or Sessions. They remain one Cordantry Assignment. Cordantry passes accepted business artifacts to downstream Tasks. It never passes raw logs as company facts.

Before MAH submission, Cordantry persists one Assignment Execution Binding. The Binding contains the Assignment ID, stable MAH Task UUID, request digest, submit count, reconciliation deadline and internal state. Every retry or restart reuses the same Binding and UUID. The Company State Snapshot never exposes the Binding.

The primary MAH Task writes exactly one canonical Artifact at `artifacts/assignment-result.json`. The document has `schemaVersion: 1`, `kind: assignment_result`, the Assignment ID, result summary, key findings, completed business outcome, limitations, bounded facts for downstream work, recommended next action and Assignment Result Judgment. The Assignment ID must match the Assignment Execution Binding. The document does not contain logs, prompts or MAH Task IDs.

The Assignment Result Judgment contains a decision, rationale, satisfied obligations, unsatisfied obligations, evidence references, Agent identity and model identity. The first delivery permits only `accepted` and `rejected`. An accepted judgment completes the Assignment. A rejected judgment stops it. The first delivery does not use Assignment Result to ask the Founder for input. The MAH-selected Agent decides business meaning. Cordantry validates the strict document structure, binding identity and evidence references. Deterministic code does not invent or replace the judgment.

Assignment admission uses the Company Planning reconciliation policy. It permits at most two submit calls with the same stable UUID. Two independent `task_not_found` results admit the second call. The admission deadline is ten minutes and survives restart. After admission, MAH owns execution time, retries and terminal execution state. Cordantry adds no second execution timeout.

Cordantry accepts the Assignment Result and activates direct dependents in one transaction. The transaction saves the accepted result and its digest, marks the source Assignment `completed`, recalculates direct dependents, moves eligible ordinary Assignments to `ready`, keeps Product Direction Assignments `waiting` in the first delivery, and writes durable business events. After commit, Cordantry notifies the Workflow Coordinator. Repeating the same Assignment ID and digest returns the original acceptance. Different content for a completed Assignment is rejected. A late result cannot replace the accepted result or activate dependents again.

If MAH reaches a terminal end without a valid Assignment Result after its own recovery, Cordantry moves the Assignment to `stopped`. `needs_founder` is used only when a real Founder action can move the Assignment. The Founder UI says that the work did not produce a usable result and offers plan change or later restart actions in Founder-facing Plain Language.

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

A Direction represents one coherent product-capability or product-architecture decision. Every Product Direction Assignment carries a `directionKey`. Assignments with the same key support one Direction. Cordantry never infers this grouping from titles or keywords. MAH creates or changes the Roadmap only after Direction approval.

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

Every Founder surface uses Founder-facing Plain Language. A sentence covers one topic. It uses common words, active voice and specific facts. The UI translates internal status and Stage values into fixed Chinese and English product labels. It never displays a raw enum, error code, MAH object, internal identifier, stack trace or raw log.

The fixed Chinese Assignment status labels are: 正在等待前一项工作, 可以开始, 正在进行, 需要你决定, 已完成 and 已停止. The fixed English labels are: Waiting for earlier work, Ready to start, In progress, Needs your decision, Completed and Stopped. The UI never displays the stored status value.

The fixed Chinese Assignment Stage labels are: 正在了解需求, 正在准备结果, 正在确认结果, 正在准备产品方向, 等待你的决定 and 正在交付产品方向. The fixed English labels are: Learning what is needed, Preparing the result, Confirming the result, Preparing the product direction, Waiting for your decision and Delivering the product direction. The UI never displays the stored Stage value. In the first delivery, Product Direction cards use only 正在准备产品方向 / Preparing the product direction and state that product delivery is not available yet.

The Creation Loading page shows six business steps: 已保存你的愿景, 正在制定公司计划, 已收到公司计划, 已确认计划内容, 已建立部门和工作安排, and 公司已准备好. The English copy has the same meaning. During structural correction, the page says that Cordantry is improving the company plan. During admission reconciliation, it says that Cordantry is confirming whether company planning has started. It never displays Task, Artifact, Schema, submit, UUID or retry.

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

Cordantry returns structural validation errors to the same Company Planning Operation at most twice. A correction uses a linked MAH Task and preserves the Operation identity and Task lineage. A valid first result uses one Task. The first and second invalid results can each add one correction Task. A third invalid result stops correction. The errors can identify missing IDs, invalid references, invalid routes and other schema facts. They cannot rewrite business meaning.

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

## Company controls

Pause Company stops new Assignment submission. Admitted MAH Tasks continue. Valid returned results can settle. Newly ready Assignments stay `ready` until Resume Company. The Founder UI says that current work can finish and new work will not start.

Stop Company is final. Cordantry stops new submission and moves unstarted Assignments to `stopped`. It requests cancellation of active MAH Tasks and then queries their original identities until MAH confirms a terminal result. A cancellation request is not terminal proof. A late result cannot restart the Company. Accepted results remain available. The Founder UI says that the Company is stopped and completed results remain.

## Acceptance scenarios

1. A Founder supplies only a Vision. MAH produces a valid Company Plan. Cordantry creates dynamic Departments and starts ready ordinary Assignments without an executor choice.
2. One ordinary Assignment produces an accepted business result. Cordantry completes it and starts a dependent Assignment with only accepted upstream facts.
3. Several Assignments support one product capability. Cordantry presents one Product Direction. No Roadmap work starts before Founder approval.
4. Direction approval produces Roadmap and Slice progress. Cordantry displays product delivery stages and never displays Work Queue objects.
5. A Task has multiple Attempts or Sessions. Cordantry still displays one Assignment.
6. Company Planning violates the schema twice and then fails again. Automatic correction stops. Founder Inbox offers regenerate, add information and continue later.
7. A business result refutes the plan. Cordantry asks the Founder whether to re-plan. A confirmed revision preserves the old plan and completed work.
8. A MAH record contains technical or governance-heavy text. Cordantry renders only validated business projection fields and never exposes the raw text as product content.
9. The real server and real Dashboard client exchange a Company Creation Receipt and a Company State Snapshot without a contract error. A detected event sequence gap causes one fresh Snapshot read.
10. The Plan page shows objectives, Departments, Assignments, business dependencies, status and Direction grouping. It does not show a MAH Task, Work Queue object or execution trace.

## Validation gap

Installed MAH version 0.1.2132 supports generic Task description submission, attachments, metadata, pre-minted stable Task IDs, Task status reads and canonical Task-document reads. A real Company Planning smoke verified the Founder Vision-to-schema-valid Company Plan artifact half of the prototype through only those public interfaces.

The complete flow is not yet proven. The first delivery closes the core loop through one narrow end-to-end experiment:

```text
Founder Vision
    -> Company Planning Task
    -> schema-valid Company Plan artifact
    -> one ordinary Assignment
    -> accepted Assignment Result
    -> one dependent Assignment
```

The delivery includes the Company Creation Receipt, Company State Snapshot, Company Planning Events, Company Planning Reconciliation, structural correction, Department and Assignment UI, Assignment Execution Binding, one real ordinary MAH execution, Assignment Result acceptance, one dependent activation, restart recovery and real browser verification. The experiment also verifies one failed-schema correction and all stable ID mappings. Product Direction appears as `waiting` at `direction_preparation`. Founder approval into Roadmap and Slice delivery is outside this delivery.

A combined contract test must run the real server response through the real Dashboard client parser. It covers creation, state readback and event-gap recovery. A release cannot rely only on separate server and client unit tests.

The release gate also includes one real MAH 0.1.2132 acceptance run with fresh Cordantry state. The run creates one initial planning Task, executes one ordinary Assignment, accepts its canonical Artifact, activates one dependent Assignment and survives one Cordantry restart. Real browser checks cover the Founder flow and confirm that no Founder surface leaks an internal object or raw log. The source worktree must remain clean except for the intended implementation and test changes.
