# Dashboard Context

The Dashboard is a Founder-facing projection of the Company model. It does not configure or display
an execution provider.

- Company creation asks only for Founder Vision.
- Do not add Agent, model, execution mode, MAH path, CLI path, or slot selectors.
- Render Objectives, Departments, Department Assignments, business dependencies, stages, statuses,
  and accepted Results.
- Product Direction remains visibly waiting until its separate Founder/MAH flow exists; never route
  it through ordinary Assignment execution.
- Show typed Company Problems in plain language. Never display commands, raw logs, MAH Task IDs,
  prompts, governance text, workspaces, or execution traces.
- Pause, Resume, and Stop are Company actions. The browser does not derive execution eligibility.

Use the existing language provider and generic UI primitives. New behavior requires an accessible
component test; the creation flow also has one browser E2E contract.
