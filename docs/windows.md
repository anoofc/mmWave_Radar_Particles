# Windows 11 installation

1. Install VS Code, Git, Node.js 22.12+ or 24 LTS, and the PlatformIO IDE extension for VS Code. Git is needed for the pinned radar library. Allow the first PlatformIO build to finish downloading its toolchain.

The pinned ESP32 platform requires Python 3.10–3.13 when using a standalone PlatformIO installation. Python 3.14 is not supported by that release. Prefer PlatformIO IDE's managed environment or a separate Python 3.13 virtual environment.
2. Copy or clone the entire repository to an ordinary writable folder. Open the root folder in VS Code. Use a PowerShell terminal. No machine-specific paths or COM numbers are stored in configuration.
3. Run `npm.cmd ci` (the `.cmd` suffix avoids restrictive PowerShell script policy). Run `npm.cmd run dev`; open the printed localhost address in current desktop Chrome or Edge. Do not open `index.html` directly. Firefox/Safari do not provide this project's USB connection support.
4. In PlatformIO, open `firmware/platformio.ini` as a project, or run the commands in the root README from a PlatformIO terminal where `pio` is available. Build `minimal` first. Then build/upload `xiao_esp32c6`. Use a USB data cable and a stable USB power source.
5. Close PlatformIO Serial Monitor before connecting in the browser. Click **Connect USB**; select the XIAO's serial device. A previously authorized, single device can be reopened using **Reconnect**. Multiple authorized ports require explicit selection via **Connect USB**.

## Helpers

`scripts/start-dashboard.ps1` installs locked dependencies if absent and starts Vite. `scripts/build-firmware.ps1 -Environment minimal` builds the first test; add `-Upload` only when ready to flash. Scripts resolve their own repository location and accept an optional caller-selected port. If local policy prevents scripts, run the underlying commands directly; do not change system-wide execution policy for this project.

## Production local build

```powershell
npm.cmd run build
npm.cmd run preview --workspace web
```

Use the printed preview URL. Browser storage/authorization belongs to the origin; a new port or browser profile may require selecting the USB device again. Both development and preview bind to 127.0.0.1. Internet access is needed for dependency setup but not for simulation or normal operation after setup. No external fonts or assets are fetched at runtime.

## Verification

```powershell
npm.cmd test
npx.cmd playwright install chromium
npm.cmd run test:browser
```

Browser tests use a mock-free simulation and the bundled recording; the serial integration test supplies a fake transport stream. Neither proves physical sensor behavior.

## Particle Experience (Phase 2)

Use the same `npm.cmd ci` and `npm.cmd run dev` commands from the repository root. Select **Particle Experience** next to Radar Diagnostics. Existing bridge firmware 1.0.2 remains compatible; no firmware reflash is required for Phase 2. Chrome/Edge must expose WebGL2; enable hardware acceleration for the intended NVIDIA GPU. A visible CPU fallback caps simulation at 10,000 particles if float render targets are unavailable. See [Phase 2 operator guide](phase2.md) for presets, fullscreen, mapping and performance controls.
