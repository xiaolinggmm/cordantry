import { execFile, spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import type { AvailabilityProbe } from "./availability";

type ObjectValue = Record<string, unknown>;
const object = (value: unknown): ObjectValue => value !== null && typeof value === "object" && !Array.isArray(value) ? value as ObjectValue : {};
const unknown = (): AvailabilityProbe => ({ state: "unknown" });

export function mapUsageWindows(windows: Array<{ used: unknown; resetAt?: number }>, now = Date.now()): AvailabilityProbe {
  const valid = windows.filter(w => typeof w.used === "number" && Number.isFinite(w.used) && w.used >= 0 && (w.resetAt === undefined || w.resetAt > now));
  const exhausted = valid.filter(w => (w.used as number) >= 100);
  if (exhausted.length) {
    const reset = exhausted.every(w => w.resetAt !== undefined) ? Math.max(...exhausted.map(w => w.resetAt!)) : undefined;
    return { state: "quota_exhausted", ...(reset !== undefined ? { retryAt: new Date(reset).toISOString() } : {}) };
  }
  return valid.length ? { state: "ready" } : unknown();
}

export async function probeCodexAvailability(rpc?: (method: string) => Promise<unknown>): Promise<AvailabilityProbe> {
  if (!rpc) return readCodexAvailability();
  try {
    const auth = object(await rpc("account/read"));
    if (auth.account === null && auth.requiresOpenaiAuth !== false) return { state: "login_required" };
    if (object(auth.account).type !== "chatgpt") return unknown();
    const response = object(await rpc("account/rateLimits/read"));
    const limits = object(response.rateLimits);
    const credits = object(limits.credits);
    // A full subscription window is not a hard stop when the account already has usable credits.
    if (credits.unlimited === true || (credits.hasCredits === true && Number(credits.balance) > 0)) return { state: "ready" };
    return mapUsageWindows([limits.primary, limits.secondary].map(value => {
      const w = object(value);
      return { used: w.usedPercent, ...(typeof w.resetsAt === "number" && Number.isFinite(w.resetsAt) ? { resetAt: w.resetsAt * 1000 } : {}) };
    }));
  } catch { return unknown(); }
}

function commandOutput(command: string, args: string[], allowNonzero = false): Promise<string> {
  return new Promise((resolve, reject) => execFile(command, args, { timeout: 8000, maxBuffer: 256 * 1024, windowsHide: true }, (error, stdout) => error && !(allowNonzero && stdout && !error.killed) ? reject(new Error("Availability probe failed")) : resolve(stdout)));
}

export async function readCodexAvailability(command = "codex", args = ["app-server"], timeoutMs = 10_000): Promise<AvailabilityProbe> {
  const child = spawn(command, args, { stdio: ["pipe", "pipe", "pipe"], windowsHide: true });
  const closed = new Promise<void>(resolve => child.once("close", () => resolve()));
  let id = 0;
  let buffer = "";
  let failed = false;
  const requests = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  const fail = () => { failed = true; for (const request of requests.values()) request.reject(new Error("Availability RPC unavailable")); requests.clear(); };
  const timer = setTimeout(() => { fail(); child.kill("SIGKILL"); }, timeoutMs);
  child.on("error", fail);
  child.on("close", fail);
  child.stdin.on("error", fail);
  child.stderr.resume();
  child.stdout.on("data", (chunk: Buffer) => {
    buffer += chunk.toString();
    if (buffer.length > 256 * 1024) { fail(); child.kill("SIGKILL"); return; }
    let newline: number;
    while ((newline = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newline); buffer = buffer.slice(newline + 1);
      try {
        const message = JSON.parse(line);
        const request = requests.get(message.id);
        if (!request) continue;
        requests.delete(message.id);
        if (message.error) request.reject(new Error("Availability RPC rejected"));
        else request.resolve(message.result);
      } catch { /* Ignore non-protocol startup output. */ }
    }
  });
  const rpc = (method: string, params: unknown = {}): Promise<unknown> => new Promise((resolve, reject) => {
    if (failed) { reject(new Error("Availability RPC closed")); return; }
    const key = ++id;
    requests.set(key, { resolve, reject });
    child.stdin.write(`${JSON.stringify({ id: key, method, params })}\n`);
  });
  try {
    await rpc("initialize", { clientInfo: { name: "cordantry", version: "0.0.0" } });
    child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
    return await probeCodexAvailability(rpc);
  } catch { return unknown(); }
  finally { clearTimeout(timer); fail(); child.stdin.end(); child.kill("SIGKILL"); await closed; }
}

type ClaudeProbeOptions = {
  auth?: () => Promise<unknown>;
  token?: () => Promise<string | null>;
  fetchUsage?: (token: string) => Promise<unknown>;
};
export async function probeClaudeAvailability(options: ClaudeProbeOptions = {}): Promise<AvailabilityProbe> {
  try {
    const auth = object(await (options.auth ?? (async () => JSON.parse(await commandOutput("claude", ["auth", "status", "--json"], true))))());
    if (auth.loggedIn === false) return { state: "login_required" };
    if (auth.loggedIn !== true || auth.authMethod === "api_key" || (!options.auth && Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL))) return unknown();
    const token = await (options.token ?? readClaudeToken)();
    if (!token) return unknown();
    const data = object(await (options.fetchUsage ?? fetchClaudeUsage)(token));
    const extra = object(data.extra_usage);
    if (extra.is_enabled === true && typeof extra.monthly_limit === "number" && typeof extra.used_credits === "number" && extra.used_credits < extra.monthly_limit) return { state: "ready" };
    return mapUsageWindows([data.five_hour, data.seven_day].map(value => {
      const w = object(value); const reset = typeof w.resets_at === "string" ? Date.parse(w.resets_at) : NaN;
      return { used: w.utilization, ...(Number.isFinite(reset) ? { resetAt: reset } : {}) };
    }));
  } catch (error) { return error instanceof UsageAuthenticationError ? { state: "login_required" } : unknown(); }
}

class UsageAuthenticationError extends Error {}

// Credential contents are consumed only here; callers receive public availability facts.
async function readClaudeToken(): Promise<string | null> {
  if (process.env.CLAUDE_CODE_OAUTH_TOKEN) return process.env.CLAUDE_CODE_OAUTH_TOKEN;
  const sources = [async () => readFile(join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"), ".credentials.json"), "utf8")];
  if (process.platform === "darwin" && !process.env.CLAUDE_CONFIG_DIR) sources.push(() => commandOutput("security", ["find-generic-password", "-s", "Claude Code-credentials", "-w"]));
  for (const source of sources) {
    try {
      const token = object(object(JSON.parse(await source())).claudeAiOauth).accessToken;
      if (typeof token === "string" && token) return token;
    } catch { /* Missing, locked or unsupported credential storage is unknown. */ }
  }
  return null;
}
async function fetchClaudeUsage(token: string): Promise<unknown> {
  const response = await fetch("https://api.anthropic.com/api/oauth/usage", {
    headers: { Authorization: `Bearer ${token}`, "anthropic-beta": "oauth-2025-04-20" },
    signal: AbortSignal.timeout(8000), redirect: "error",
  });
  if (response.status === 401) throw new UsageAuthenticationError();
  if (!response.ok) throw new Error("Usage query unavailable");
  return response.json();
}
