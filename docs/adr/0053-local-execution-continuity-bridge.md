---
status: accepted
---

# Keep a local execution bridge while MAH-only operations converge

ADR 0052 remains the target: MAH is the sole execution plane and Cordantry presents company operations. Until that end-to-end path is production-validated, Cordantry may use an available local Codex or Claude Code Agent to derive a schema-valid Company Plan from the Founder Vision. This is an execution-continuity bridge, not a second company model: it uses the same Company Plan contract, validation and atomic import, stays invisible in Founder-facing responses, and never silently changes an already-submitted MAH execution into a local execution.

The bridge is removed after the MAH planning, artifact, recovery and real-runtime verification slices are delivered. MAH remains explicit opt-in until its current public CLI integration passes a real smoke; simulated CLI tests alone do not make it production-ready. The installed MAH 0.1.2132 still supports Task submission, status and canonical document reads, but the former `execution-carriers` read and `--personal-os-slot` submit option are no longer public, so the historical adapter cannot be treated as a compatible fallback without a new bounded integration slice.
