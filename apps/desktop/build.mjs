import { build } from "esbuild";

const shared = {
  bundle: true,
  external: ["electron"],
  logLevel: "info",
  platform: "node",
  sourcemap: true,
  target: "node24",
};

await build({ ...shared, entryPoints: ["src/main.ts"], format: "esm", outfile: "dist/main.mjs" });
