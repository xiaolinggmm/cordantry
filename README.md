# Cordantry

Cordantry is an open-source company operations interface backed by MAH.

You give Cordantry a Founder Vision. Cordantry asks MAH to produce a company plan, projects that plan as departments and assignments, and submits ready work back to MAH. MAH selects and runs Codex, Claude Code, or another available Agent. Cordantry checks business results and asks for your decision when human judgment is required.

Cordantry runs on your computer. It works inside a project that you select.

- [Website](https://xiaolinggmm.github.io/cordantry/)
- [Desktop app](https://github.com/xiaolinggmm/cordantry/releases/latest)
- [Source code](https://github.com/xiaolinggmm/cordantry)

![Cordantry CEO Office with company progress and founder actions](docs/assets/readme/workbench-overview.png)

## How It Works

1. State the Founder Vision.
2. Cordantry submits Company Planning to MAH.
3. A MAH-selected Agent produces the company plan.
4. Cordantry validates the plan and shows its departments and assignments.
5. Cordantry submits ready assignments to MAH.
6. MAH-selected Agents submit results and evidence.
7. Cordantry checks the results and dependencies.
8. You review important decisions and outcomes.

Cordantry stores the plan, work, evidence, and review history. You can add direction, pause the company, or stop it at any time.

![A department task with its submitted files, checks, and review controls](docs/assets/readme/task-execution-and-evidence.png)

Cordantry returns strategic choices to you. It shows the available options, tradeoffs, and affected work.

![A founder decision with two pricing options and a recommendation](docs/assets/readme/founder-decision.png)

## Install the Desktop App

Use the desktop app for normal use.

1. Download the [latest release](https://github.com/xiaolinggmm/cordantry/releases/latest).
2. Install and set up MAH.
3. Make at least one MAH-supported Agent available on the machine.
4. Start Cordantry.
5. Select the local project that Cordantry may use.

The desktop app includes the runtime and dashboard. It does not include Claude Code or Codex.

## Configure a Company

The setup form asks only for the Founder Vision.

State the result that you want. Include the target user, the required outcome, and important limits.

Example:

> Build a local web tool for freelance designers. The tool must turn a project brief into a client proposal. Deliver a working prototype and a validation report. Do not publish the tool or use paid services without my approval.

Company creation does not ask for an execution mode, Agent, CLI path, or project path. Set `CORDANTRY_MAH_PROJECT_ROOT` in the application runtime. Cordantry never falls back to direct Codex or Claude Code execution when MAH is unavailable.

## Run From Source

Requirements:

- Node.js 24 or newer
- pnpm 11 or newer
- Git
- MAH, with at least one supported Agent ready for real runs

Install the project:

```bash
git clone https://github.com/xiaolinggmm/cordantry.git
cd cordantry
pnpm install
```

Run the checks:

```bash
pnpm test
pnpm typecheck
pnpm build
```

Start Cordantry for a local project:

```bash
INIT_CWD=/absolute/path/to/your/project \
CORDANTRY_MAH_PROJECT_ROOT=/absolute/path/to/your/mah-project \
CORDANTRY_PORT=8787 \
pnpm --filter @cordantry/cli start
```

For a browser preview that starts both the local runtime and the product dashboard:

```bash
pnpm preview:product
```

Start the dashboard in another terminal:

```bash
VITE_CORDANTRY_API_URL=http://127.0.0.1:8787 \
pnpm --filter @cordantry/dashboard dev
```

Open the URL that Vite prints. The default URL is `http://127.0.0.1:5173/`.

## Local Data

Cordantry writes state and work files inside the selected project:

```text
.cordantry/
  state.sqlite
  mah-company-planning/
  mah-assignments/
```

Use version control before you start a company. Do not select a project unless you accept local file changes in that project.

## Documentation

- [Quick start](docs/quickstart.md)
- [Architecture](docs/architecture.md)
- [Desktop installation](docs/desktop-distribution.md)
- [MAH-owned company operations](docs/mah-owned-company-operations.md)
- [Project terms](GLOSSARY.md)

## License

Cordantry uses the [MIT License](LICENSE). It is made by [MAH](https://mah.bot/).
