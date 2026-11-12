import { execFile } from "node:child_process";

export type MahCommandResult = { exitCode: number | null; stdout: string; stderr: string };
export type MahCommand = (args: string[]) => Promise<MahCommandResult>;

export function mahCommand(executable = process.env.CORDANTRY_MAH_CLI?.trim() || "mah"): MahCommand {
  return (args) => new Promise((resolve) => {
    execFile(executable, args, { timeout: 15_000, maxBuffer: 12_000_000, encoding: "utf8" }, (error, stdout, stderr) => {
      resolve({
        exitCode: error ? (typeof error.code === "number" ? error.code : null) : 0,
        stdout,
        stderr: stderr || error?.message || "",
      });
    });
  });
}
