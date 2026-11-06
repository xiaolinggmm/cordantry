---
status: superseded by ADR-0052
---

# Choose execution mode when creating a company

This body records the former Direct Dispatch and MAH Coordination product decision. [ADR 0052](0052-mah-owned-company-operations.md) removes that mode choice and makes MAH the only execution plane.

Founders choose Direct Dispatch or MAH Coordination when starting company creation; leaving the selection unchanged means Direct Dispatch. This confirmed product decision scopes execution mode to each company, rather than the application runtime, so MAH setup does not prevent founders from trying the existing direct workflow and different companies can use different modes.

Both modes retain Cordantry's CEO planning, department/Agent responsibility and business validation. Direct Dispatch preserves the existing direct execution workflow; MAH Coordination preserves ADR 0050's delegation boundary, under which MAH coordinates a delegated execution rather than taking over company planning.

Execution mode cannot be changed after company creation. If MAH is not ready during creation, preserve the founder's input and block creation until configuration is corrected or the founder explicitly selects Direct Dispatch. Never silently substitute a mode.

If MAH becomes unavailable after creation, affected MAH-company tasks wait for resolution without blocking Direct Dispatch companies. Recovery retains existing delegation records and must not create duplicate execution or automatically fall back to Direct Dispatch.

Restore the real company-creation flow as part of this work. Direct Dispatch must allow creation, department/task generation and execution with an available local Agent, without requiring MAH installation or connection.

Each MAH Coordination company binds to an existing MAH project selected during creation. Installation detection may be shared, but the target project is company-specific. Automatically creating MAH projects is outside this first release.

Legacy-company mode migration is out of scope: existing data is test data, not production data. This scope decision does not authorize deleting that data.

Connection configuration may be repaired after creation, for example when the MAH installation or original project moves. Repair must retain the same MAH project and execution mode. Unresolved delegations must be reconciled against their original execution records before any replacement dispatch.

Both modes share one creation form, with the mode selector at the beginning and Direct Dispatch selected by default. Name, vision and CEO Agent selection are shared; MAH Coordination additionally exposes project selection and readiness checks. Switching the selection before creation preserves entered form values. Both modes require a CEO Agent because business planning remains with Cordantry.

MAH Coordination defaults to the background slot class. Advanced configuration permits an explicit interactive-slot selection; validate the selected class and never silently substitute one for the other. Quota-management UI is outside this scope.

## Acceptance boundaries

- With MAH absent and a usable local Agent, a founder can create a Direct Dispatch company, generate departments/tasks and execute them through the existing direct workflow.
- Choosing MAH Coordination requires an existing target project and readiness of the selected slot class before creation begins. Failed checks preserve the form and provide actionable reasons.
- Different companies can use different modes and MAH target projects. Runtime dispatch respects each company's saved selection rather than a global execution-mode switch.
- A later MAH outage does not prevent application startup or Direct Dispatch company execution. Affected delegated work waits for resolution without automatic direct fallback or duplicate dispatch.
- No UI or API permits changing a created company's execution mode. Connection repair does not change the bound MAH project.
- Existing test-data migration, automatic MAH project creation and quota management are excluded. No test-data deletion is authorized by these decisions.

The founder confirmed the complete requirements and shared understanding on 2026-10-26. This ADR records the accepted design; it does not authorize implementation or assert that company-scoped execution is already implemented.
