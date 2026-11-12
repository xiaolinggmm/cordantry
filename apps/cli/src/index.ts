#!/usr/bin/env node

import { startCordantry } from "./commands/start";
import { resolveProjectRoot } from "./projectRoot";

const [, , command] = process.argv;

if (command === "start") {
  let running: Awaited<ReturnType<typeof startCordantry>> | undefined;
  const stop = () => void running?.close().finally(() => process.exit(0));
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  try {
    running = await startCordantry({
      projectRoot: resolveProjectRoot(),
      port: Number(process.env.CORDANTRY_PORT ?? 0),
    });
  } catch (error) {
    console.error((error as Error).message);
    process.exitCode = 1;
  }
} else {
  console.log("Usage: cordantry start");
  process.exitCode = 1;
}

export { startCordantry };
