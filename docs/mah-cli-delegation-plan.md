# MAH CLI Delegation

Historical implementation plan. [ADR 0052](adr/0052-mah-owned-company-operations.md) replaces its product boundary. This document still describes the current delegation implementation and its migration constraints; it is not the target Cordantry product model.

## Ownership

| Cordantry | MAH |
|---|---|
| CEO planning and business responsibility | Provider/model selection and internal task decomposition |
| Run-to-MAH Task identity and one-time submit claim | Task admission, scheduling, worktrees and tool permissions |
| Accepted input snapshots and delivery requirements | Work execution and Task-scope artifact publication |
| Candidate capture, proof validation and business settlement | Task status and carrier observability |

## Supported CLI contract verified locally

Installed version: **0.1.1896**. Help and installed distribution were inspected read-only; no live task was submitted for validation.

- Submit: `task submit --cwd PROJECT --task-id UUID --description-file FILE --personal-os-slot background --write --format json`, optionally `--attach FILE`. The immediate slot argument is required by the implementation despite the optional-looking help text. Response uses `task_id` and `admission_status`, not `ok` or `status`.
- Query: `task show UUID --cwd PROJECT --format json` returns `{ok:true,task:{task_id,status,...}}`.
- Carriers: `task execution-carriers --task-id UUID --cwd PROJECT --format json`. Require schema version 1, matching project root and exactly one requested Task fact; terminal task/runtime/index/scheduler projections must be consistent, with absent index/scheduler tolerated. Unavailable/unknown facts are not closure evidence.
- Receive: `task context UUID --cwd PROJECT --read artifacts/FILENAME --format json` returns `{content:string|null}`. Flat UTF-8 files only, at most 2,000,000 bytes each.
- Cancel: `task cancel UUID --cwd PROJECT --format json`. Acknowledgement is not process-termination confirmation.

A repeated task UUID may be re-enqueued, so **Cordantry never repeats submit after consuming its local submission claim**. No `run`, `resume`, `follow-up`, forced-agent metadata or global MCP changes are used.

## Configuration

Execution mode is selected when creating each company (ADR 0051), with Direct dispatch selected by default. Select MAH coordination to bind that company to an existing managed MAH project by its absolute path. The project is not automatically the application source directory or generated task workspace; MAH chooses its execution worktrees.

The creation form accepts an explicit MAH executable path; `CORDANTRY_MAH_CLI` supplies the API default when omitted. The slot defaults to `background`, with `interactive` available only through explicit selection. Creation validates project identity and the selected slot before saving the company. Mode and project identity cannot be changed after creation; connection paths may be repaired only to the original project.

Server/worker startup is independent of MAH availability. Background readiness checks do not block Direct companies. Global backend/project/slot environment variables no longer select company execution mode. Failed or unresolved MAH submissions never fall back to Direct and retain their original task UUIDs.

Planning/CEO calls retain their existing adapters. Only scheduler task execution delegates to MAH. The execution brief is synthesized locally without a provider invocation. MAH receives task activity constraints but Cordantry does not claim CLI-enforced tool isolation; required capabilities withheld by company policy cause refusal before submission.

## Delivery

The prompt supplies exact identity values and the existing artifact/report/proof schema. Executor publishes a wrapper in its MAH-provided Task scope:

```json
{
  "schemaVersion": 1,
  "companyId": "<provided>",
  "taskId": "<provided>",
  "runId": "<provided>",
  "mahTaskId": "<provided>",
  "envelope": {
    "artifact_kind": "deliverable",
    "artifact_role": "report",
    "artifact_subtype": "research_report",
    "task_type": "research",
    "payload": {"outcome_summary": "...", "execution_report": {"work_summary":"...", "evidence":"...", "conclusion":"...", "vision_impact":"...", "remaining_gap":"...", "recommendation":"..."}},
    "lineage": {},
    "file_refs": [{"path":"report.md"}],
    "proof_refs": [{"type":"file", "uri":"report.md"}]
  }
}
```

Write `artifacts/report.md` first, then publish `artifacts/delivery.json` by temporary-file rename. The example Proof type is valid only if the particular Task's Proof Schema allows `file`. References use filenames without the `artifacts/` prefix. URLs read for research belong in payload/evidence, not automatically in Proof References.

Raw receives stay under `.cordantry/mah/<UUID>/receive-*`. Accepted snapshots live under `.cordantry/mah/snapshots/` with identity, envelope and per-file SHA-256 manifest. Reopening a snapshot checks integrity; a valid captured snapshot cannot be silently replaced. Failed validation preserves the original files and blocks another execution until delivery is resolved.

Input attachments contain only runtime-selected accepted handoff packages and verification snapshot directories, with relative mount paths, base64 contents and SHA-256 hashes. Limits: 128 files, 2,000,000 bytes per file, 8,000,000 total source bytes. Oversized inputs and symlinks are rejected before external submission. No recursive project scan is performed. The original input bundle is digest-pinned and its files are included in the accepted delivery snapshot, so verification recovery can check exactly the upstream version used during execution.

## Recovery operations

- `GET /api/tasks/:taskId/mah-executions`: inspect stored UUID, state, diagnostic detail and snapshot path.
- `POST /api/tasks/:taskId/mah-executions/:runId/reconcile`: query the same UUID. Never starts or retries execution; a missing task remains unknown.
- `POST /api/tasks/:taskId/mah-executions/:runId/cancel`: request MAH cancellation. Does not clear termination Holds or authorize a new attempt.
- `POST /api/tasks/:taskId/mah-executions/:runId/receive`: explicitly receive/correct files from the same completed MAH Task. Requires the latest Run and epoch, no committed disposition, no active task/workspace ownership and no protected Hold. It stages a validated Candidate and sets the task up for the existing refresh/proof-recovery operation. It does not call a provider or mark business success. Recovery checks snapshot integrity and the current Run/ownership epoch; `command_output` Proof references resolve to actual delivered files, never MAH status logs.

If an execution ended ambiguously, query it first. A termination-unconfirmed Hold must still go through the existing explicit termination confirmation flow after the operator verifies closure; querying metadata alone does not clear it. If delivery JSON is malformed, preserve the work and correct only the original Task artifact, then receive it again. Cordantry does not use MAH follow-up to perform an automatic repair or rerun the research.

No dashboard controls are added in this slice; recovery is exposed through the API. Unsupported/missing files remain an actionable validation error, not a successful Task.

## Acceptance matrix

| Scenario | Required check |
|---|---|
| MAH selected | Direct executor never called; Run agent is `mah`; no provider brief |
| Submit response lost or nonzero | UUID already durable; repeated invocation/new adapter sends zero additional submits |
| Worker restart/backend switch | Unresolved durable record blocks new dispatch |
| Completed but invalid file | No new MAH UUID; explicit receive corrects delivery only |
| Status conflict/project mismatch | No artifact reads or settlement |
| Cancel/timeout | No claim of process termination; no automatic retry |
| Successful file delivery | Same envelope/report/proof validators; snapshot used for proof and handoff |
| Old/mismatched identities, paths/symlinks, oversize files | Reject, preserve original, no accepted business effects |
| Source deleted after capture | Snapshot reopens with hash verification |
| Candidate rejection/settlement failure | Snapshot linkage retained; recovery reads saved provenance |
| Duplicate or late Candidate | Frozen valid Candidate unchanged; revoked Run cannot import |
| Upstream/verification input | Explicit attached snapshots preserve contents and relative paths |

Fake CLI tests verify Cordantry behavior against the inspected wire shapes. They do not establish real-provider compatibility. A real smoke must be run in an explicitly chosen MAH project with one bounded task before treating this backend as production-validated.

## Validation record (2026-10-23)

- Server, CLI and core suite: 69 files / 970 tests passed.
- Recovery coverage includes missing evidence, stale ownership epochs, and receive→Human Action settlement without fabricated Proof.
- MAH adapter suite: 8/8 passed, including reopening the SQLite database after an ambiguous submit with no second submit, and preserving an old unknown observation alongside a newer unresolved Run.
- TypeScript checks passed for server, CLI, core and dashboard; `git diff --check` passed.
- Independent protocol and code-quality reviews completed; both reported recovery issues were fixed and re-reviewed.
- No live MAH/provider task was submitted. Installation contents were not modified.
