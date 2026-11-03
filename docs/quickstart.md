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

The CLI creates `.cordantry/state.sqlite`, starts the local API server, detects Claude Code and Codex adapters, and prints the local server URL.

Agent detection reports installation/compatibility, sign-in and available subscription quota. The creation form shows unavailable agents and reset times when known. Direct execution prefers your selected agent and automatically uses another compatible available agent when needed; task ownership remains unchanged and each run records its actual executor. If none can run, tasks wait. A confirmed quota or login outage can resume once another agent is available and the previous process has stopped, without using the task's failure allowance. Other Holds and execution budgets still apply.

Detection uses short-lived cached status queries, not model turns. API-key/custom-provider accounts, unsupported usage endpoints and network errors show unknown quota; an installed unknown agent can run, but unknown status alone cannot clear its previously observed outage. Rechecking does not sign in, refresh credentials or buy extra usage.

Choose the execution mode when creating a company. Direct dispatch is selected by default and uses the local CEO and scheduler. MAH coordination requires an existing managed project path and a MAH CLI executable; `CORDANTRY_MAH_CLI` supplies the default executable when omitted.

MAH creation checks the project's identity and selected slot before saving. The slot defaults to `background`; explicitly select `interactive` in the advanced options if needed. Company mode and project identity cannot be changed after creation. MAH availability does not block runtime startup or Direct companies, and failed MAH tasks never silently fall back to Direct dispatch.

Future package usage is intended to be:

```bash
npx cordantry start
```

## Run The Dashboard

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
3. Enter a company name and choose Direct dispatch (default) or MAH coordination.
4. Continue to agent detection and choose one detected CEO agent. Claude Code is the recommended first CEO Agent on this machine; Codex may require local permissions.
5. Enter a founder vision.
6. For MAH coordination, provide the managed project and CLI paths, and select a slot if the default background slot is unsuitable.
7. Click Create Company and wait on the CRT-styled creation loading page.
8. Land in the Department Workspace with CEO selected by default.
9. Use the left rail to inspect generated departments and their queued tasks.
10. Use the Work menu to open the operating dashboard for task, proof, review, and event views.
11. Use the kill switch if work must stop immediately.

## Troubleshooting

If the CEO selection step shows `Local API is not connected`, make sure the local runtime is still running and that `VITE_CORDANTRY_API_URL` points at the API server URL printed by the CLI.

If company creation returns a CEO Agent timeout or blueprint error, retry with a smaller founder vision, confirm the selected local agent can run from the terminal, and consider increasing `CORDANTRY_AGENT_TIMEOUT_MS` when starting the runtime.

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
