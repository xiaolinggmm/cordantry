# Cordantry Company Operations

This context defines how Cordantry represents a company, its plan, its departments, and its business work. MAH is the execution plane; Cordantry does not assign execution providers.

## Company Planning

**Founder Vision**:
The founder's statement of who the company should help and what outcome the company should achieve.
_Avoid_: Prompt, task description, roadmap

**Company Plan**:
The current business structure derived from the Founder Vision. It contains objectives, departments, Department Assignments, and their business dependencies.
_Avoid_: MAH Roadmap, execution plan, task queue

**Company Planning Operation**:
One logical planning lifecycle that derives and validates a Company Plan. It has one initial Company Planning Task and up to two linked correction Tasks.
_Avoid_: Company Planning Task, creation attempt, plan revision

**Company Planning Task**:
One MAH Task in a Company Planning Operation. It asks a MAH-selected Agent to derive or correct a Company Plan under the Cordantry-owned output schema.
_Avoid_: Company Planning Operation, Company Plan, Founder approval

**Company Creation Receipt**:
The public acknowledgment that Cordantry accepted one asynchronous company creation. It contains the Company's stable identity and creation status, but no Company Plan, Department, Assignment or execution object.
_Avoid_: Company State Snapshot, creation result, company blueprint

**Company Planning Reconciliation**:
The bounded recovery of one Company Planning Task when its submission result is unknown. It keeps the same Task identity and keeps the Company in creation until planning has a confirmed result.
_Avoid_: New planning task, creation retry, duplicate submission

**Company Planning Event**:
One durable, ordered business event in asynchronous company creation. It reports safe planning progress and never contains a MAH Task identity or raw execution data.
_Avoid_: MAH event, execution log, SSE message

**Company Event Position**:
The latest durable Company event sequence included in a Company State Snapshot. The Dashboard uses it to detect and repair an event gap.
_Avoid_: Timestamp, SSE cursor, Task revision

**Plan Revision**:
An immutable successor to a Company Plan. It changes future company structure or work while preserving earlier plans and historical ownership.
_Avoid_: Retry, replacement plan, overwritten plan

## Organization

**Department**:
A dynamically planned area of business responsibility within one company. A Department is not an Agent or an execution provider.
_Avoid_: Agent team, model group, fixed department template

**Department Assignment**:
A unit of business work owned by one Department and linked to one company objective or result.
_Avoid_: MAH Task, Agent session, Work Queue item

**Assignment Business Status**:
The Founder-facing lifecycle of a Department Assignment: waiting, ready, in progress, needs Founder, completed or stopped. It does not expose a MAH execution state.
_Avoid_: Task status, Agent status, carrier status

**Assignment Stage**:
The route-specific business phase of a Department Assignment. It gives ordinary work and Product Direction work different progress language without exposing MAH phases.
_Avoid_: Assignment Business Status, MAH phase, execution step

**Execution Route**:
The Company Plan classification that sends a Department Assignment either to an ordinary MAH Task or to Product Direction formation. The planning Agent supplies the classification and rationale; Cordantry validates the structure and applies the route.
_Avoid_: Agent selection, keyword routing, Roadmap status

**Workflow Coordinator**:
The Cordantry responsibility that activates a Department Assignment when its business dependencies are satisfied. It does not select or operate Agents.
_Avoid_: Scheduler, Agent dispatcher, execution engine

**Assignment Result**:
A schema-valid business result accepted by Cordantry for one Department Assignment. It can satisfy dependencies and become bounded input to downstream work.
_Avoid_: Agent output, Task log, MAH completion

**Assignment Result Judgment**:
The accountable Agent's machine-readable decision about whether an Assignment Result satisfies its business obligations. It preserves rationale, obligations, evidence and runtime identity.
_Avoid_: Schema validation, completion flag, numeric score

**Direction Group Key**:
The stable Company Plan key that groups related Product Direction Assignments into one Product Direction. Cordantry never infers it from titles or keywords.
_Avoid_: Direction title, route rationale, inferred group

**Assignment Execution Binding**:
The internal stable link between one ordinary Department Assignment and its primary MAH Task identity. It is persisted before submission and is never a Founder-facing object.
_Avoid_: Department Assignment, MAH Task, execution mode

## Execution Boundary

**Execution Plane**:
The MAH-owned boundary for Agent selection, scheduling, execution, retries, workspaces, acceptance, and execution recovery.
_Avoid_: Cordantry scheduler, Direct Dispatch

**MAH Task**:
A governed MAH execution record. A MAH Task can execute a Department Assignment, but it is not the Department Assignment itself.
_Avoid_: Department Assignment, department task

**Product Direction**:
A coherent product-capability or product-architecture choice that requires human review before it can enter the Product Roadmap. One Product Direction can be supported by multiple related Department Assignments.
_Avoid_: Founder Vision, Company Plan, ordinary business task

**Product Roadmap**:
The MAH evolution model for approved product-capability and product-architecture work. MAH decomposes an approved Product Direction into Roadmap rows and Slices. The Product Roadmap does not contain general market, sales, pricing, or operations work.
_Avoid_: Company Plan, OKR list, department backlog

## Founder Experience

**Founder-facing Plain Language**:
The clear business language used in every Founder UI surface. It uses short sentences, common words, specific facts and fixed product terms, and it never displays an internal code or execution object.
_Avoid_: Engineering copy, raw code, technical summary

**Business Projection**:
The Founder-facing company or product statement rendered from schema-valid business fields and deterministic Cordantry templates. Raw MAH content is not a Business Projection.
_Avoid_: Agent output, execution trace, technical summary

**Company State Snapshot**:
The Founder-facing current state of one Company, its objectives, Departments and Department Assignments. It does not contain MAH Tasks or legacy Cordantry Tasks.
_Avoid_: Company Creation Receipt, blueprint cache, task snapshot

**Company Status**:
The Founder page that shows whether the Company can move forward, what is waiting and what needs the Founder. It contains business explanations and actions, not execution diagnostics.
_Avoid_: Operations Diagnostics, health dashboard, debug page

**Company Problem**:
The public business description of a condition that stops a Founder action. It gives a plain-language message and available actions without internal execution data.
_Avoid_: raw error, exception, diagnostic record

**Pause Company**:
The reversible Founder action that stops new Assignment submission. Work already accepted by MAH can finish and settle.
_Avoid_: Cancel work, stop company, pause MAH

**Stop Company**:
The final Founder action that ends new company work while preserving accepted results. Cordantry requests cancellation of active MAH Tasks and reconciles their confirmed terminal state.
_Avoid_: Pause company, kill process, delete company

**Founder Inbox**:
The Cordantry projection of existing business decisions, information requests and recovery obligations. An action resolves or advances its original source object; Founder Inbox is not a separate approval system.
_Avoid_: MAH Work Queue, notification feed, second approval database
