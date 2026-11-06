import { describe, expect, it } from "vitest";

import { createProductPreviewPlan } from "./product-preview";

describe("createProductPreviewPlan", () => {
  it("starts the local API and opens the product dashboard through its proxy", () => {
    const plan = createProductPreviewPlan("/project/cordantry");

    expect(plan.runtime).toEqual({
      command: "pnpm",
      args: ["--filter", "@cordantry/cli", "start"],
      cwd: "/project/cordantry",
      env: {
        CORDANTRY_PORT: "8787",
        INIT_CWD: "/project/cordantry",
      },
    });
    expect(plan.dashboard).toEqual({
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
      cwd: "/project/cordantry",
      env: {
        CORDANTRY_API_PROXY: "http://127.0.0.1:8787",
      },
    });
  });
});
