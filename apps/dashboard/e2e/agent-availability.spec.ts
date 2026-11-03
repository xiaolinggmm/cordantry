import { expect, test } from "@playwright/test";

for (const language of ["en", "zh"] as const) {
  test(`agent availability and recovery ${language}`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width: 390, height: 844 });
    let recovered = false;
    await page.route(/^https?:\/\/[^/]+\/api\//, route => route.fulfill({ json: route.request().url().includes("/api/agents") ? { agents: [
      { id: "codex", name: "Codex", capabilities: ["code"], detected: recovered, availability: { installed: true, state: recovered ? "ready" : "quota_exhausted", checkedAt: "2026-11-02T00:00:00Z", ...(recovered ? {} : { retryAt: "2026-11-03T00:00:00Z" }) } },
      { id: "claude-code", name: "Claude Code", capabilities: ["code"], detected: true, availability: { installed: true, state: "ready", checkedAt: "2026-11-02T00:00:00Z" } },
    ] } : { companies: [] } }));
    await page.goto(`/?lang=${language}`);
    await page.getByRole("button", { name: language === "zh" ? "直接创建" : "Create directly", exact: true }).click();
    await expect(page.getByText(language === "zh" ? /Codex: 额度已用尽/ : /Codex: Quota exhausted/)).toBeVisible();
    const selector = page.getByLabel(language === "zh" ? "CEO Agent" : "CEO agent", { exact: true });
    await expect(selector.getByRole("option", { name: "Codex", exact: true })).toHaveCount(0);
    await selector.selectOption("claude-code");
    await page.screenshot({ path: testInfo.outputPath("availability.png"), fullPage: true });
    expect(await page.getByRole("dialog").evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true);
    recovered = true;
    await page.getByRole("button", { name: language === "zh" ? "重新检测 Agent" : "Detect agents again" }).click();
    await expect(selector.getByRole("option", { name: "Codex", exact: true })).toHaveCount(1);
  });
}
