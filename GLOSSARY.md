# Cordantry Execution Governance

This context defines how Cordantry assigns work, delegates execution and receives governed runtime outcomes. MAH delegation follows ADR 0050; executor-binding terms below describe the historical ADR 0049 proposal.

## Language

**Company Execution Mode**:
The company's choice, made during company creation, of Direct Dispatch or MAH Coordination for task execution; it cannot be changed after creation. Direct Dispatch is the default when the founder makes no other selection.
_Avoid_: Application-wide mode, CEO model, permission mode

**Direct Dispatch**:
The execution mode in which Cordantry's CEO and scheduler retain task planning and department/Agent assignment, and available compatible Agents execute the work directly, preferring the assigned Agent.
_Avoid_: MAH decomposition

**MAH Coordination**:
The execution mode in which Cordantry retains business planning and delegates task execution to MAH, which coordinates its own execution resources.
_Avoid_: MAH as CEO, whole-company delegation

**MAH Delegation**:
One Cordantry execution attempt entrusted to one MAH Task, with MAH responsible for its internal executor choices.
_Avoid_: Fixed executor binding, provider invocation

**File Delivery**:
A Task-scoped envelope and its referenced files offered for Cordantry validation. File publication alone is not business completion.
_Avoid_: Accepted Business Artifact, final response

**Delivery Snapshot**:
The preserved content of a received File Delivery against which validation and recovery are performed.
_Avoid_: Live workspace, latest file

**Unresolved Delegation**:
A delegation whose external execution or business delivery cannot yet be safely closed. It does not authorize a replacement execution.
_Avoid_: Failed submission, retryable timeout

**Task Assignee**:
The Agent selected by the CEO to own a Task's business responsibility. It is the preferred execution provider in Direct Dispatch, not a guarantee of the provider selected for a particular run.
_Avoid_: Executor, model

**Execution Routing**:
Selection of an available execution provider for a run while preserving its Task Assignee and business requirements.
_Avoid_: Business reassignment, hidden retry

**Executor Binding**:
An immutable association between one Agent Run and the required external executor. The binding permits no substitution without a new CEO planning decision.
_Avoid_: Agent preference, routing hint

**Executor Mapping**:
A versioned translation from a Cordantry Task Assignee identity to an execution-plane executor identity.
_Avoid_: Shared Agent ID, inferred mapping

**Executor Substitution**:
Execution by an executor different from the active Executor Binding without a new CEO planning decision.
_Avoid_: Fallback

**Reassignment Decision**:
A CEO planning decision that changes a Task Assignee after an execution admission or runtime failure while preserving the prior decision's lineage.
_Avoid_: Retry, fallback

**Planning Revision**:
A new version of the execution plan for the same Task and Key Result, preserving the lineage of earlier decisions and Agent Runs.
_Avoid_: New Task, retry

**Reassignment Budget**:
The bounded number of Reassignment Decisions permitted for one Task independently of its execution retry allowance.
_Avoid_: Execution retry budget

**Execution Requirements**:
The constraints Cordantry submits for an Agent Run before the execution plane admits and freezes it.
_Avoid_: Frozen Task, execution configuration

**Execution Request**:
An idempotent request to admit one Agent Run under a specific set of Execution Requirements.
_Avoid_: Agent Run, retry

**Execution Binding Receipt**:
The immutable record of the executor, model, Runtime Action Binding, and governance identity frozen for an admitted Agent Run.
_Avoid_: Execution Requirements, launch log

**Execution Fence**:
The authority boundary that prevents a superseded Agent Run from producing an eligible Runtime Action Candidate.
_Avoid_: Process termination, cancellation request

**Runtime Action Channel**:
The governed path through which an Agent Run submits business artifacts or requests human action to Cordantry.
_Avoid_: Agent output, final response

**Runtime Action Binding**:
An immutable association between one Agent Run context and its required Runtime Action Channel.
_Avoid_: MCP configuration, tool preference

**Runtime Action Candidate**:
An immutable valid submission of a business artifact or human-action request staged by one Agent Run for settlement. The latest eligible submission is selected for settlement; earlier submissions remain evidence.
_Avoid_: Completed delivery, final Agent response

**Business Settlement**:
The authoritative transaction that accepts a Runtime Action Candidate and applies the resulting business state transition.
_Avoid_: Candidate acceptance, executor completion

**Runtime Action Settlement Receipt**:
The immutable record of Business Settlement's acceptance or rejection of a Run's delivery, including a rejection when no valid Candidate exists.
_Avoid_: MCP response, executor result

**Agent Run Continuation**:
Continued interaction with the same admitted executor process under the same Agent Run identity and bindings.
_Avoid_: Retry, new Agent Run

**Registered Runtime Action Server**:
A trusted execution surface approved to provide a Runtime Action Channel.
_Avoid_: Arbitrary MCP command, task tool
