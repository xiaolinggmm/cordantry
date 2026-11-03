import { describe, expect, it } from "vitest";
import { createMockAgentAdapter } from "./mockAgent";
import { getAgentAvailability, recordAgentOutcome, selectAvailableAgent } from "./availability";
import { mapUsageWindows, probeClaudeAvailability, probeCodexAvailability, readCodexAvailability } from "./availabilityProbes";

describe("availability", () => {
  it("coalesces probes and prefers verified capacity to an unknown preferred executor", async () => {
    const preferred = createMockAgentAdapter({ id: "a", name: "A", capabilities: ["code"] });
    const other = createMockAgentAdapter({ id: "b", name: "B", capabilities: ["code"] });
    let probes = 0;
    preferred.availability = async () => { probes++; return { state: "unknown" }; };
    other.availability = async () => ({ state: "ready" });
    await Promise.all([getAgentAvailability(preferred), getAgentAvailability(preferred)]);
    expect(probes).toBe(1);
    expect((await selectAvailableAgent([preferred, other], "a", ["code"]))?.id).toBe("b");
  });
  it("runtime quota failure overrides cached readiness, then a fresh probe can recover", async () => {
    const adapter = createMockAgentAdapter({ id: "a", name: "A", capabilities: ["code"] });
    adapter.availability = async () => ({ state: "ready" });
    expect((await getAgentAvailability(adapter, 1000)).state).toBe("ready");
    recordAgentOutcome(adapter, { status: "failed", exitCode: 1, stdout: "", stderr: "", failureReason: "agent_quota_exhausted" }, 1000);
    expect((await getAgentAvailability(adapter, 1001)).state).toBe("quota_exhausted");
    expect((await getAgentAvailability(adapter, 62000)).state).toBe("ready");
  });
  it("contains detection errors and never routes to a known signed-out executor", async () => {
    const a = createMockAgentAdapter({ id: "a", name: "A", capabilities: ["code"] });
    a.detect = async () => { throw new Error("private details"); };
    expect(JSON.stringify(await getAgentAvailability(a))).not.toContain("private details");
    const b = createMockAgentAdapter({ id: "b", name: "B", capabilities: ["code"] });
    b.availability = async () => ({ state: "login_required" });
    expect(await selectAvailableAgent([b], "b")).toBeUndefined();
  });
  it("preserves unknown usage and uses the latest exhausted reset", () => {
    expect(mapUsageWindows([]).state).toBe("unknown");
    expect(mapUsageWindows([{ used: NaN }]).state).toBe("unknown");
    expect(mapUsageWindows([{ used: 100, resetAt: 1000 }, { used: 100, resetAt: 2000 }], 0)).toEqual({ state: "quota_exhausted", retryAt: new Date(2000).toISOString() });
    expect(mapUsageWindows([{ used: 100, resetAt: 1000 }], 2000).state).toBe("unknown");
  });
  it("Codex checks account then quotas without starting a model turn", async () => {
    const calls: string[] = [];
    const result = await probeCodexAvailability(async method => {
      calls.push(method);
      return method === "account/read" ? { account: { type: "chatgpt" } } : { rateLimits: { primary: { usedPercent: 100, resetsAt: 4102444800 } } };
    });
    expect(calls).toEqual(["account/read", "account/rateLimits/read"]);
    expect(result).toEqual({ state: "quota_exhausted", retryAt: "2100-01-01T00:00:00.000Z" });
    expect(await probeCodexAvailability(async () => ({ account: null }))).toEqual({ state: "login_required" });
  });
  it("Claude separates auth, exhausted quota, unknown errors and API-key usage", async () => {
    const auth = async () => ({ loggedIn: true, authMethod: "oauth_token" });
    expect(await probeClaudeAvailability({ auth, token: async () => "test-token", fetchUsage: async () => ({ five_hour: { utilization: 100, resets_at: "2100-01-01T00:00:00Z" } }) })).toEqual({ state: "quota_exhausted", retryAt: "2100-01-01T00:00:00.000Z" });
    expect(await probeClaudeAvailability({ auth: async () => ({ loggedIn: false }) })).toEqual({ state: "login_required" });
    expect(await probeClaudeAvailability({ auth, token: async () => null })).toEqual({ state: "unknown" });
    expect(await probeClaudeAvailability({ auth, token: async () => "test-token", fetchUsage: async () => { throw new Error("test-token"); } })).toEqual({ state: "unknown" });
  });
});

describe("Codex probe transport", () => {
  it("handles fragmented RPC responses and ignores notifications", async () => {
    const script = `const rl = require('readline').createInterface({input:process.stdin});
      rl.on('line', line => { const m=JSON.parse(line); if (!m.id) return;
        const result=m.method==='initialize'?{}:m.method==='account/read'?{account:{type:'chatgpt'}}:{rateLimits:{primary:{usedPercent:25}}};
        const text=JSON.stringify({id:m.id,result})+String.fromCharCode(10);
        process.stdout.write(text.slice(0,5)); setTimeout(()=>process.stdout.write(text.slice(5)),1);
      });`;
    expect(await readCodexAvailability(process.execPath, ["-e", script], 1000)).toEqual({state: "ready"});
  });
  it("bounds a silent child and suppresses raw RPC errors", async () => {
    const start = Date.now();
    expect(await readCodexAvailability(process.execPath, ["-e", "setInterval(()=>{},1000)"], 50)).toEqual({state: "unknown"});
    expect(Date.now() - start).toBeLessThan(2000);
    expect(await readCodexAvailability(process.execPath, ["-e", "process.stdout.write(JSON.stringify({id:1,error:{message:'private-data'}})+String.fromCharCode(10))"], 100)).toEqual({state: "unknown"});
  });
});
