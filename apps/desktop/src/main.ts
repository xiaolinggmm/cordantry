import { appendFileSync, existsSync, statSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, dialog, Menu } from "electron";
import { startCordantry, type StartedCordantry } from "../../cli/src/commands/start";
import { agentPath, configuredProjectRoot, loadDesktopSettings, saveDesktopSettings } from "./runtime";

let window: BrowserWindow | null = null;
let runtime: StartedCordantry | null = null;
let shuttingDown = false;
const currentDir = dirname(fileURLToPath(import.meta.url));

function logPath(): string {
  return join(app.getPath("logs"), "cordantry.log");
}

function log(line: string): void {
  const message = `${new Date().toISOString()} ${line}\n`;
  process.stdout.write(message);
  try { appendFileSync(logPath(), message); } catch { /* Console logging remains available. */ }
}

function dashboardRoot(): string {
  return app.isPackaged
    ? join(process.resourcesPath, "dashboard")
    : resolve(currentDir, "../../dashboard/dist");
}

function settingsPath(): string {
  return join(app.getPath("userData"), "settings.json");
}

async function selectProject(force = false): Promise<string | null> {
  const saved = configuredProjectRoot(
    process.env.CORDANTRY_PROJECT_ROOT,
    loadDesktopSettings(settingsPath()).projectRoot,
  );
  if (!force && saved && existsSync(saved) && statSync(saved).isDirectory()) return saved;

  const options = {
    title: "Choose the project Cordantry will operate on",
    buttonLabel: "Use this project",
    properties: ["openDirectory", "createDirectory"] as Array<"openDirectory" | "createDirectory">,
  };
  const selected = window
    ? await dialog.showOpenDialog(window, options)
    : await dialog.showOpenDialog(options);
  const projectRoot = selected.filePaths[0];
  if (selected.canceled || !projectRoot) return null;
  saveDesktopSettings(settingsPath(), { projectRoot });
  return projectRoot;
}

async function startProject(projectRoot: string): Promise<void> {
  await runtime?.close();
  runtime = null;
  process.env.PATH = agentPath(homedir(), process.env.PATH);
  runtime = await startCordantry({
    projectRoot,
    dashboardRoot: dashboardRoot(),
    port: 0,
    mahProjectRoot: process.env.CORDANTRY_MAH_PROJECT_ROOT,
    log,
  });
  if (!window || window.isDestroyed()) {
    window = new BrowserWindow({
      width: 1440,
      height: 960,
      minWidth: 900,
      minHeight: 640,
      title: "Cordantry",
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
  }
  await window.loadURL(runtime.url);
  window.show();
}

async function switchProject(): Promise<void> {
  const projectRoot = await selectProject(true);
  if (!projectRoot) return;
  try {
    await startProject(projectRoot);
  } catch (error) {
    dialog.showErrorBox("Cordantry could not start", `${(error as Error).message}\n\nLogs: ${logPath()}`);
  }
}

function installMenu(): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate([
    {
      label: "Cordantry",
      submenu: [
        { label: "Open Project…", accelerator: "CmdOrCtrl+O", click: () => void switchProject() },
        { type: "separator" },
        { role: "quit" },
      ],
    },
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
  ]));
}

app.on("before-quit", (event) => {
  if (shuttingDown || !runtime) return;
  event.preventDefault();
  shuttingDown = true;
  void runtime.close().finally(() => app.quit());
});

app.on("window-all-closed", () => app.quit());

void (async () => {
  await app.whenReady();
  installMenu();
  const projectRoot = await selectProject();
  if (!projectRoot) {
    app.quit();
    return;
  }
  try {
    await startProject(projectRoot);
  } catch (error) {
    dialog.showErrorBox("Cordantry could not start", `${(error as Error).message}\n\nLogs: ${logPath()}`);
    app.quit();
  }
})().catch((error) => {
  dialog.showErrorBox("Cordantry could not start", (error as Error).message);
  app.quit();
});
