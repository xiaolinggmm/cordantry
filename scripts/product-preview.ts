import { spawn, type ChildProcess } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

interface CommandPlan {
  command: string;
  args: string[];
  cwd: string;
  env: Record<string, string>;
}

export function createProductPreviewPlan(projectRoot: string): {
  runtime: CommandPlan;
  dashboard: CommandPlan;
} {
  return {
    runtime: {
      command: "pnpm",
      args: ["--filter", "@cordantry/cli", "start"],
      cwd: projectRoot,
      env: {
        CORDANTRY_PORT: "8787",
        INIT_CWD: projectRoot,
      },
    },
    dashboard: {
      command: "pnpm",
      args: [
        "--filter",
        "@cordantry/dashboard",
        "dev",
        "--host",
        "127.0.0.1",
        "--port",
        "5173",
        "--open",
      ],
      cwd: projectRoot,
      env: {
        CORDANTRY_API_PROXY: "http://127.0.0.1:8787",
      },
    },
  };
}

function launch(command: CommandPlan): ChildProcess {
  return spawn(command.command, command.args, {
    cwd: command.cwd,
    env: { ...process.env, ...command.env },
    stdio: "inherit",
  });
}

async function waitForApi(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      // The local runtime is still starting.
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, 150));
  }
  throw new Error("Cordantry local API did not become ready within 30 seconds.");
}

async function main(): Promise<void> {
  const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const plan = createProductPreviewPlan(projectRoot);
  const runtime = launch(plan.runtime);
  let dashboard: ChildProcess | undefined;

  const stop = () => {
    dashboard?.kill("SIGTERM");
    runtime.kill("SIGTERM");
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);

  try {
    await waitForApi("http://127.0.0.1:8787/api/companies", 30_000);
    dashboard = launch(plan.dashboard);
  } catch (error) {
    stop();
    throw error;
  }

  runtime.once("exit", (code) => {
    dashboard?.kill("SIGTERM");
    process.exitCode = code ?? 1;
  });
  dashboard.once("exit", (code) => {
    runtime.kill("SIGTERM");
    process.exitCode = code ?? 1;
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  void main().catch((error) => {
    console.error((error as Error).message);
    process.exitCode = 1;
  });
}
