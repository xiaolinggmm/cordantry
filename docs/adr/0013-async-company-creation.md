# Async Company Creation

Company creation is a durable asynchronous flow. `POST /api/companies` persists a `creating` Company and returns `202 Accepted` with a Company Creation Receipt. The receipt has `schemaVersion: 1`, `kind: company_creation_receipt` and the Company identity, status and creation time. The response `Location` identifies the Company State Snapshot. The receipt does not contain Departments, Assignments or execution objects.

One Founder action has one durable idempotency key. The key and Company ID are saved before planning starts. The same key and Founder Vision return the same Receipt. The same key with different input is a conflict. Network retries and restarts do not create another Company or Company Planning Operation.

Company Planning publishes six durable events: request accepted, plan requested, artifact received, plan validated, organization created and company ready. Each event has an ID, Company ID, monotonic Company sequence, kind, occurrence time and business payload. The events contain safe business fields. They do not contain MAH Task IDs, raw logs or execution configuration. The Company State Snapshot includes `lastEventSequence`. The Dashboard reads the Snapshot after every connection gap and resumes from that Company Event Position.

A successful plan moves the Company to `active`. A confirmed terminal planning failure moves it to `creation_failed`. An unknown MAH submission result starts Company Planning Reconciliation and keeps the Company in `creating` until the bounded reconciliation has a confirmed result.

If Cordantry confirms before submission that MAH is not installed or cannot run, the Company moves directly to `creation_failed`. The Founder Vision remains saved. The Founder UI gives a plain-language retry action. When MAH is not installed, it also gives a download and installation action. After installation, Recheck continues the same Company and Company Planning Operation. It does not create another Company or ask for the Founder Vision again. An ambiguous submit or missing response is not confirmed unavailability and continues through Company Planning Reconciliation.
