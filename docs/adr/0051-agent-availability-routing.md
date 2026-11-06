# Agent availability and execution routing

Status: superseded by [ADR 0052](0052-mah-owned-company-operations.md). Cordantry no longer probes, selects or substitutes Codex and Claude Code executors. This body remains a historical record of the former direct-execution design.

## Contract

Task Assignee and selected CEO remain business responsibility and preferred execution provider. Direct execution may choose another configured CLI when the preferred one is unavailable. This is technical routing, not a semantic reassignment of the task. The accountable Agent still makes all planning and acceptance decisions. Task requirements, permissions, approval gates and delivery validation do not change. Every task Run records the actual executor, and a task event exposes switching. Explicit CEO reassignment still changes business ownership with its existing budget and lineage.

One availability snapshot separates installation/launch compatibility from authentication and quota. States are ready, not_installed, login_required, quota_exhausted and unknown. Snapshots contain only public facts and check/reset times. Unknown means unverified, never zero quota. Ready candidates are preferred to unknown candidates; unknown installed candidates may run because API-key accounts and network outages need not expose subscription limits. Known unavailable candidates never run. Built-in Codex and Claude support the same general task skill set; protocol capabilities and launch grants are still checked separately.

Codex checks account/read and account/rateLimits/read via a bounded local app-server RPC session without model turns. Claude checks auth status and, for supported OAuth credentials, the OAuth usage endpoint. Credential access is confined to the probe; tokens, account identifiers, raw errors and payloads never leave it. API-key/custom-provider quota remains unknown. No credentials are refreshed, accounts changed or paid extra usage enabled. Queries use timeouts, bounded output, single-flight caching and short expiry. Runtime quota failures override stale successful probes for a cooldown; repeated scheduler ticks cannot bypass it.

The scheduler checks availability before locking/creating a Run. If all candidates are unavailable it preserves the queued task without spending attempts. Quota/login outages park the task as blocked with a runtime-owned Hold, preserving the failed Run but not spending the work failure allowance. Such a Run may be resumed on a later tick only after confirmed termination, no locks/workspace claims/unresolved delegations, and no other Hold. After a cooldown, the same quota-exhausted provider requires freshly verified capacity; a login/installation outage requires a runnable installation again; persisted failed-Run evidence prevents unknown probes from clearing an outage after restart. Recovery preserves execution budgets, and creates a new Run/epoch through ordinary dispatch. Ordinary errors, unknown termination and protected Holds never trigger automatic retry. Planning calls choose an available executor too; no model call is used solely to test availability.

## Verification

Cover absent binaries, unsupported flags, signed-out accounts, exhausted windows, reset times, missing/malformed usage, query timeouts, probe coalescing, runtime cooldown, preferred-provider order, fallback capability/delivery checks, actual executor records, no candidates, post-quota recovery, and protected ownership. Verify API/UI availability projection with localized status. Never use a real task or paid model turn as a probe.

## References

Orca: src/main/preflight/installed-agent-detection.ts; src/main/rate-limits/codex-rpc-rate-limit-probe.ts; src/main/rate-limits/claude-oauth-usage-request.ts. Codex app-server account APIs: https://learn.chatgpt.com/docs/app-server.
