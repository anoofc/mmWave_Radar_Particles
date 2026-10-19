# MR60 / Radar Console — Phases 1?3

Local radar firmware, diagnostic dashboard and GPU fluid particle experience for the Seeed MR60BHA2 kit with a XIAO ESP32C6. Includes a hardware-free simulator, JSON/CSV recording, deterministic replay and a normalized interaction API. Phase 2 adds six visual presets, procedural 3D formations, cinematic rendering and fullscreen exhibition mode while retaining Phase 1.

Phase 3 adds Expressive radar response, calibrated world mapping, movement forces, interaction diagnostics, and a sensor-free acceptance sequence. See [Phase 3 interaction guide and diagnosis](docs/phase3.md). In Particle Experience, click **Test interaction** under **Interaction Response** to verify without hardware.

## Start the dashboard

Install Node.js 22.12+ (or Node 24 LTS), then open this folder in VS Code:

```powershell
npm ci
npm run dev
```

Open the printed `http://127.0.0.1:5173` address in Chrome or Edge. Click **Run simulation** to work without hardware. Use **Load sample**, then **Replay**, for the bundled synthetic movement session. All data stays on the PC. Select **Particle Experience** for the 3D renderer; **Run simulation** or **Load & replay sample** works without hardware. Existing bridge firmware 1.0.2 needs no change for Phase 2. See [Phase 2 operator guide](docs/phase2.md).

For hardware, follow [Windows setup](docs/windows.md) and [hardware validation](docs/hardware.md). Build and flash the bridge firmware, close the serial monitor, then choose **Connect USB** and select the XIAO port. No COM port is hardcoded.

Current bridge firmware: **1.0.2**. If upgrading from an older version, disconnect the browser, upload the full firmware again, refresh the dashboard and reconnect. This includes the two-byte presence and output-scheduling fixes from 1.0.1, plus a larger USB transmit buffer and explicit packet-boundary delimiters. Recognized ESP32 startup text is counted separately from protocol errors. If malformed JSON recurs, expand **Last rejected serial packet** under Device & link and use **Download rejected packet** to capture the actual received line for diagnosis.

```powershell
pio run -d firmware -e minimal
pio run -d firmware -e minimal -t upload
# Inspect minimal output before flashing the dashboard firmware:
pio device monitor -b 115200
pio run -d firmware -e xiao_esp32c6
pio run -d firmware -e xiao_esp32c6 -t upload
```

## Repository

| Folder | Purpose |
|---|---|
| `firmware/` | PlatformIO, bounded USB protocol, guarded official Seeed decoder, minimal bring-up |
| `web/src/core/` | Transport, framing, validation, coordinates, filters, tracking, simulation, recording/replay |
| `web/src/components/` | SVG radar plot and dashboard controls |
| `web/src/state/` | Zustand state and source lifecycle |
| `web/src/particles/` | GPU simulation, shaders, formations, input adapter, presets and operator view |
| `shared/` | Versioned TypeScript protocol and examples |
| `tests/` | Unit/integration tests and Playwright browser checks |
| `docs/` | Hardware, calibration, protocol, Windows and troubleshooting |
| `scripts/` | Portable PowerShell launch/build helpers |

## Checks

```powershell
npm test
npm run build
npx playwright install chromium
npm run test:browser
```

`npm run build` checks TypeScript and produces `web/dist`. `npm run preview --workspace web` serves that build locally. Development and preview bind to loopback.

## Reading the data

Presence, targets and link health are independent. An explicit absent report differs from an empty valid target array, an unavailable target report, an unresponsive radar and a lost USB connection. The UI displays each independently. The bridge sends per-measurement uptime timestamps so repeatedly transmitted cached data cannot become fresh again.

Coordinates are preserved in **metres**. Doppler remains an integer; the UI also displays the official conversion `doppler × 17.28 cm/s`. This is the documented index conversion, not a validated world-space velocity. Optional distance remains labeled `sensor_raw`: the inspected library does not establish its units. No confidence value is invented.

The dashboard uses a maximum/default working view of **3 m**, with rings at 0.75, 1.5, 2.25 and 3 m. Smaller 1 m and 2 m views provide zoom. X inversion is enabled by default. View settings affect plotting and normalized screen mapping; raw measurements remain unchanged.

Filters affect the separate interaction stream, never the stored raw packets. Import/export uses the full versioned JSON session; CSV is a flat diagnostic export and cannot be replayed. The recorder caps sessions at 100,000 packets and imports at 30 MB. Trails retain at most 90 points per cluster.

## Interaction boundary

```ts
import { interactionAPI } from './web/src/core/interaction';
const unsubscribe = interactionAPI.subscribe(state => {
  // presence, primary (m), screen ([0,1]), velocity (m/s),
  // movementIntensity, freshness, tracking, timestamp
});
```

`primary` is null for unsafe or unavailable interaction. `freshness` is an age indicator, not confidence. `velocity` derives from filtered positions; it is distinct from radial Doppler speed. Subscribe to this boundary instead of serial JSON. See [architecture](docs/architecture.md).

## Verification limits

Software build/test results are recorded in [validation](docs/validation.md). No successful hardware test is claimed. Physical pin routing, sensor firmware support, coordinate orientation, report cadence and detection coverage must be checked on the actual kit using the documented procedure. Do not update radar-module firmware automatically; this project only flashes the XIAO.

## Particle benchmarks

```powershell
npm.cmd run benchmark:particles
```

This builds the app, opens a separate 1080p browser preview on port 5174, measures 10k/30k/60k/100k particles and writes `docs/benchmarks/results.json`. See [performance report](docs/particles-performance.md) and [visual acceptance checklist](docs/particles-acceptance.md). The 60k / 1080p / 60 FPS RTX 4060 goal is a target, not a guarantee. Software GPU results are not representative of that hardware.

See [interaction coverage diagnosis and controls](docs/interaction-coverage.md) for formation-scaled mapping, local/global fluid response, and validation results.

[Phase 3.1 measured spatial diagnostics](docs/phase31-spatial-diagnostics.md) documents the automatic-visitor correction, GPU coverage measurements, and developer modes (`?particleSpatial=1#particles`).
