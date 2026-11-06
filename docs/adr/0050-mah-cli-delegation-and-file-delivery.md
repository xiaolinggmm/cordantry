# MAH Owns Executor Selection; Cordantry Receives Files And Settles Business Outcomes

Status: superseded by [ADR 0052](0052-mah-owned-company-operations.md). This body remains the historical contract for the existing delegation implementation; its durable Candidate, explicit identity and single-writer business-settlement principles remain useful during migration.

Cordantry delegates an execution attempt to one MAH Task through the installed public CLI. MAH chooses providers/models and owns its internal invocations, worktrees and permission enforcement. Cordantry retains planning, Task/Key Result identity, approval gates, delivery validation and business settlement. A Task Assignee is business responsibility, not a claim that a particular Claude/Codex process executes the MAH Task. Direct business reassignment remains CEO-owned; availability-based executor routing follows ADR 0051; MAH internal routing does not consume that budget. There is no Claude/Codex-only restriction or special AGY MCP requirement on this file interface.

## Why this changes the previous decision

Installed MAH CLI 0.1.1896 supports submit, show, execution-carriers, cancel and task-context artifact reads. It does not expose ADR 0049's binding/receipt protocol. The user accepted MAH's routing authority rather than requesting a commercial-product source change. No private distribution module is imported and `/Applications/MAH.app` is never modified.

`--task-id` is not a documented safe retry key: inspected installed code can re-enqueue an existing task. Cordantry records a preallocated UUID, content digest and one-time submission claim before launching the CLI. After the claim, even a nonzero exit or missing task query is ambiguous; Cordantry only queries that UUID. Worker restart, backend changes and user recovery cannot silently create a replacement while external execution or delivery remains unresolved.

## File delivery and lessons retained

- ADR 0028: malformed JSON must not force repeating research. Publish with a serializer and atomic rename; retain raw rejected files. An explicit receive operation rereads the original MAH Task after file correction, without calling submit, run, input, resume or follow-up. There is no heuristic JSON repair or automatic provider repair invocation.
- ADR 0041: an envelope is a Candidate, never an accepted Business Artifact. Keep the same envelope parser, report requirements, permitted Proof Reference types and founder-decision/action rules. stdout is diagnostic only. The file wrapper must match the runtime's company/task/run/MAH Task identities.
- ADR 0008: read controlled paths, not arbitrary workspace output. MAH changes worktrees; use its Task-scope `artifacts/` and public `task context --read`, not the caller's `--cwd` as an assumed output directory.
- ADR 0035: capture files before settlement; business records remain under the first-write/epoch transaction. Immutable snapshot references survive rollback. Handoff publication remains after commit. Candidate recovery cannot replace an existing frozen valid Candidate, reopen provider admission, override revocation or settle an old epoch.

MAH's public artifact read currently accepts flat UTF-8 files of at most 2,000,000 bytes. The first transport supports `artifacts/delivery.json` and explicitly referenced flat files. Nested output trees and binary output require a future supported export transport. Accepted upstream handoff packages and verification snapshots are attached as a bounded, hashed input bundle; Cordantry does not scan the whole project or assume MAH can read its absolute workspace paths.

## Lifecycle and limits

A delegated Run spans one MAH Task lifecycle, including MAH-owned provider choices and internal continuations. `completed` means eligible to inspect delivery, not Cordantry business success. Both task and carrier projections must agree before receiving files; unknown/conflicting states remain blocked. Metadata closure is not physical process-termination evidence. Cancellation acknowledgement never sets `terminationConfirmed`; existing isolated workspace/confirmation gates remain in force.

MAH has no external settlement receipt in this interface. Cordantry's durable Candidate disposition is the local settlement boundary; MAH can already be terminal while business validation is pending. No fallback from MAH to direct adapters is allowed. Direct execution remains the default; explicit MAH configuration opts into delegated permission enforcement. Tasks with withheld required capabilities are refused because the CLI cannot enforce that narrower grant.

Implementation, configuration, recovery operations and acceptance evidence: [MAH CLI delegation plan](../mah-cli-delegation-plan.md).
