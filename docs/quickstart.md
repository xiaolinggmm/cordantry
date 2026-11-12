# Quickstart

This guide is for running Cordantry from a source checkout. For normal use, download a desktop
installer from GitHub Releases and follow [Desktop distribution](desktop-distribution.md); release
users do not need Node.js or pnpm.

## Requirements

- Node.js 24 or newer.
- pnpm 11 or newer.
- MAH installed, configured, and connected to at least one execution Agent.
- Optional for browser E2E: a compatible Playwright Chromium install.

## Clone Setup

```bash
git clone <repo-url>
cd cordantry
pnpm install
pnpm test
pnpm typecheck
```

The SQLite layer uses Node's built-in `node:sqlite` module. On Node 24 this prints an experimental warning during tests and local runs.

## Start The Local Runtime

From the project you want Cordantry to operate on:

```bash
CORDANTRY_MAH_PROJECT_ROOT=/absolute/path/to/your/mah-project \
CORDANTRY_PORT=8787 pnpm --filter @cordantry/cli start
```

The CLI creates `.cordantry/state.sqlite`, starts the local API server, validates MAH and prints the local server URL.

Set `CORDANTRY_MAH_PROJECT_ROOT` to the MAH project root before company creation. Cordantry resolves `mah` from `PATH` unless runtime configuration supplies another executable. Company planning and ordinary Assignment execution use MAH. They do not fall back to a local Codex or Claude Code planning bridge.

Future package usage is intended to be:

```bash
npx cordantry start
```

## Run The Dashboard

To start the local runtime and open the product dashboard together for this source checkout:

```bash
pnpm preview:product
```

The command serves the API at `http://127.0.0.1:8787`, proxies dashboard API requests to it,
and opens the product dashboard at `http://127.0.0.1:5173/`. It does not launch the desktop app
or the public landing page.

During development, run the dashboard separately and point it at the API server:

```bash
VITE_CORDANTRY_API_URL=http://127.0.0.1:8787 pnpm --filter @cordantry/dashboard dev
```

The dashboard also accepts an API URL query parameter:

```text
http://127.0.0.1:5173/?apiUrl=http%3A%2F%2F127.0.0.1%3A8787
```

## Expected UI Flow

1. Start the local runtime.
2. Open the dashboard.
3. Enter the Founder Vision.
4. Select Create Company.
5. Wait while Cordantry shows the six company planning steps.
6. Inspect objectives, Departments, Assignments and dependencies when the Company becomes active.
7. Use Company Status to review progress, results and available actions.
8. Use Pause Company to stop new Assignment submission. Use Stop Company only when the Company must end.

`CORDANTRY_MAH_PROJECT_ROOT` supplies the MAH project. The company form does not ask for a project path, CLI path, slot or Agent. If MAH is not installed, select Download MAH. It opens `https://mah.bot/download` by default. Install MAH, return to Cordantry and select Recheck. Cordantry continues the same Company creation.

## Troubleshooting

If the Dashboard cannot connect, make sure the local runtime is still running. Confirm that `VITE_CORDANTRY_API_URL` points at the API server URL printed by the CLI.

If Cordantry says that MAH is not installed, use Download MAH and follow the installation steps. If MAH needs setup, finish MAH setup and select Recheck. If MAH is temporarily unavailable, keep the saved Vision and try again later.

## Execution ownership

Cordantry submits Company Planning and ordinary Assignments to MAH. MAH selects and runs the configured
Agent, manages its workspace, and returns the canonical artifact. Cordantry stores the Agent and model
identity from MAH's Assignment Result Judgment for audit, but never selects or launches an Agent itself.

## Testing

Core test commands:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Real MAH end-to-end smoke:

```bash
CORDANTRY_MAH_PROJECT_ROOT=/absolute/path/to/your/mah-project pnpm smoke:mah
```

This submits real MAH Tasks for Company Planning and one ordinary Assignment. It uses an isolated
Cordantry state directory and does not delete MAH project data, Agent login state, external
configuration, or MAH workspaces.

Dashboard commands:

```bash
pnpm --filter @cordantry/dashboard test
pnpm --filter @cordantry/dashboard typecheck
```

Browser E2E:

```bash
pnpm --filter @cordantry/dashboard exec playwright install chromium
pnpm --filter @cordantry/dashboard e2e
```

If you already have a compatible Chromium executable:

```bash
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/path/to/chromium pnpm --filter @cordantry/dashboard e2e
```

On some restricted macOS environments, Playwright can fail before running tests with `bootstrap_check_in` permission errors. Use an unrestricted local environment or CI runner for E2E verification.
