# Quickstart

This guide is for running Cordantry from a source checkout. For normal use, download a desktop
installer from GitHub Releases and follow [Desktop distribution](desktop-distribution.md); release
users do not need Node.js or pnpm.

## Requirements

- Node.js 24 or newer.
- pnpm 11 or newer.
- Optional: Claude Code and/or Codex installed on the same machine.
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
6. Open CEO Office when the Company becomes active.
7. Use the Plan page to inspect objectives, Departments, Assignments and dependencies.
8. Open a Department to inspect its Assignment Cards.
9. Use Company Status to review waits and available actions.
10. Use Pause Company to stop new Assignment submission. Use Stop Company only when the Company must end.

`CORDANTRY_MAH_PROJECT_ROOT` supplies the MAH project. The company form does not ask for a project path, CLI path, slot or Agent. If MAH is not installed, select Download MAH. It opens `https://mah.bot/download` by default. Install MAH, return to Cordantry and select Recheck. Cordantry continues the same Company creation.

## Troubleshooting

If the Dashboard cannot connect, make sure the local runtime is still running. Confirm that `VITE_CORDANTRY_API_URL` points at the API server URL printed by the CLI.

If Cordantry says that MAH is not installed, use Download MAH and follow the installation steps. If MAH needs setup, finish MAH setup and select Recheck. If MAH is temporarily unavailable, keep the saved Vision and try again later.

## Supported Agents

Built-in adapters:

- Claude Code.
- Codex.
- Mock agent for tests.

Claude Code and Codex build their launch from the run's Agent Capability Grant rather than a fixed template, so a research task gets web search and an engineering task gets a shell, and neither inherits your own `.claude` / `$CODEX_HOME` configuration, skills, hooks, or MCP servers. See ADR 0021.

Custom agents are still represented by command templates with capability tags. Command templates can interpolate:

- `{workspace}`: the task workspace path.
- `{promptPath}`: the prompt file path.

The adapter interface exposes `id`, `name`, `capabilities`, `detect()`, and `run()`.

## Testing

Core test commands:

```bash
pnpm smoke:mock
pnpm test
pnpm typecheck
```

Optional real-agent smoke:

```bash
pnpm smoke:real-agent
```

The real-agent smoke requires a working local agent, defaults to Claude Code, and runs in an isolated temporary workspace. To try Codex:

```bash
CORDANTRY_REAL_AGENT=codex pnpm smoke:real-agent
```

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
