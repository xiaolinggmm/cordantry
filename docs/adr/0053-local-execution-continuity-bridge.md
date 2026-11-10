---
status: accepted
---

# Keep a local execution bridge while MAH-only operations converge

ADR 0052 remains the target: MAH is the sole execution plane and Cordantry presents company operations. Until that end-to-end path is production-validated, Cordantry may use an available local Codex or Claude Code Agent to derive a schema-valid Company Plan from the Founder Vision. This is an execution-continuity bridge, not a second company model: it uses the same Company Plan contract, validation and atomic import, stays invisible in Founder-facing responses, and never silently changes an already-submitted MAH execution into a local execution.

The bridge is removed after the MAH planning, artifact, recovery and real-runtime verification slices are delivered. MAH remains explicit opt-in while that integration is rolled out. MAH 0.1.2132 real smoke Task `2143e87c-3449-46f6-8259-9a984bc38a29` verified pre-minted Task submission, terminal `task show`, canonical `task context --read artifacts/company-plan.json`, and Cordantry schema validation. Its first submit process returned an error after the Task had actually completed, confirming that recovery must query the stable Task identity and must never infer non-submission from the CLI result. The former `execution-carriers` read and `--personal-os-slot` submit option are no longer public and are not part of the planning integration.
