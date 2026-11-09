# Cordantry Company Operations

This context defines how Cordantry represents a company, its plan, its departments, and its business work. MAH is the execution plane; Cordantry does not assign execution providers.

## Company Planning

**Founder Vision**:
The founder's statement of who the company should help and what outcome the company should achieve.
_Avoid_: Prompt, task description, roadmap

**Company Plan**:
The current business structure derived from the Founder Vision. It contains objectives, departments, Department Assignments, and their business dependencies.
_Avoid_: MAH Roadmap, execution plan, task queue

**Company Planning Task**:
A MAH Task that asks a MAH-selected Agent to derive a Company Plan from the Founder Vision, company context, constraints, and the Cordantry-owned output schema. Cordantry validates the result but does not replace the Agent's business judgment.
_Avoid_: Company Plan, Founder approval, Cordantry planning engine

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

**Execution Route**:
The Company Plan classification that sends a Department Assignment either to an ordinary MAH Task or to Product Direction formation. The planning Agent supplies the classification and rationale; Cordantry validates the structure and applies the route.
_Avoid_: Agent selection, keyword routing, Roadmap status

**Workflow Coordinator**:
The Cordantry responsibility that activates a Department Assignment when its business dependencies are satisfied. It does not select or operate Agents.
_Avoid_: Scheduler, Agent dispatcher, execution engine

**Assignment Result**:
A schema-valid business result accepted by Cordantry for one Department Assignment. It can satisfy dependencies and become bounded input to downstream work.
_Avoid_: Agent output, Task log, MAH completion

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

**Business Projection**:
The Founder-facing company or product statement rendered from schema-valid business fields and deterministic Cordantry templates. Raw MAH content is not a Business Projection.
_Avoid_: Agent output, execution trace, technical summary

**Founder Inbox**:
The Cordantry projection of existing business decisions, information requests and recovery obligations. An action resolves or advances its original source object; Founder Inbox is not a separate approval system.
_Avoid_: MAH Work Queue, notification feed, second approval database
