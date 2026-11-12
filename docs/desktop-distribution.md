# Desktop distribution

Cordantry ships as a self-contained desktop application. People using a release do not need Node.js,
pnpm, or a source checkout. They need MAH installed and ready with at least one supported Agent.

## First launch

1. Install and open Cordantry.
2. Choose the local project directory the company may operate on.
3. Cordantry starts its local MAH-only runtime and opens the dashboard.
4. Use **Cordantry → Open Project…** to change projects later.

The selected project is remembered. Runtime state and generated work remain inside that project under
`.cordantry/`. Desktop logs use the operating system's standard application log directory.

## Build locally

```bash
pnpm install
pnpm build
pnpm test
pnpm dist
```

Installers are written to `apps/desktop/release/`. The configured targets are:

- macOS: DMG and ZIP, arm64 or x64.
- Windows: NSIS installer.
- Linux: AppImage.

The desktop shell bundles the production dashboard and the Node runtime supplied by Electron. It
uses the MAH installation and runtime configuration already present on the machine.

## GitHub Releases

Pushing a tag such as `v0.1.0` runs `.github/workflows/release-desktop.yml`. It builds each operating
system on its native runner, uploads the installers, and creates a GitHub Release.

Unsigned builds are suitable for local testing. Frictionless public installation requires platform
signing. Configure `CSC_LINK` and `CSC_KEY_PASSWORD` for macOS/Windows signing. For Apple notarization,
also configure `APPLE_API_KEY`, `APPLE_API_KEY_ID`, and `APPLE_API_ISSUER` as repository secrets.

## Security boundary

The dashboard and API bind to a random loopback port. The Electron renderer has Node integration off,
context isolation on, and Chromium sandboxing on. Agent execution is delegated to MAH; Cordantry does
not launch Codex or Claude Code directly.
