# Validation report — 2026-10-18

## Completed

| Check | Result |
|---|---|
| Official API and UART review | Inspected pinned Seeed headers/implementations, kit guide, Arduino 3.3.7 variant and PlatformIO board definition |
| Minimal firmware | `pio run -d firmware -e minimal` — compiled and linked for XIAO ESP32C6 |
| Full JSON bridge | `pio run -d firmware -e xiao_esp32c6` — compiled and linked for XIAO ESP32C6 |
| TypeScript + production web build | `npm run build` — passed |
| Automated unit/integration tests | `npm test` — 34 tests passed in five files |
| Chromium browser tests | `npm run test:browser` — two tests passed |
| Dependency audit | Installation after updating Vitest reported zero npm vulnerabilities |
| Visual inspection | Inspected captured desktop dashboard; automated 390 px layout check confirms no horizontal overflow |

Firmware build environment: PlatformIO Core 6.1.19, pioarduino 55.03.37, Arduino ESP32 3.3.7, RISC-V GCC 14.2.0, pinned Seeed commit `ade050c62f874c214fe83ebb586d723c46b03226`, ArduinoJson 6.21.5. The full bridge links at approximately 18,660 bytes static RAM and 263,024 bytes flash (20.1% of the default 1,310,720-byte application partition). These RAM figures exclude runtime heap allocation by the upstream library and core. The upstream `FirmwareInfo` typedef emits a compiler warning; compilation succeeds.

This PC's shared PlatformIO Python environment was incomplete, and the system Python 3.14 was unsupported by the pinned platform. Verification used a project-local Python 3.13 environment in ignored `.tools/` and reused downloaded platform packages. The project configuration does not depend on those machine-specific verification paths. A normal PlatformIO IDE installation or Python 3.10–3.13 Core environment can use the checked-in `platformio.ini`.

Tests cover valid and malformed JSON, unexpected versions, missing fields, zero/unavailable targets, invalid coordinates, partial/multiple serial lines, line limits, serial unplug notification, stale/cached measurements, target hold/switching, sticky/nearest selection, duplicate candidates, smoothing/dead zone/velocity, device uptime rollover/restart, coordinate mapping, recording import/export/replay consistency and seeking, simulator states, and the bundled synthetic recording.

Browser checks exercise actual React controls for simulation and presence changes, duplicate reports, recording, JSON download, sample loading, replay, pause, speed selection and restart. They also check that no browser runtime error occurs during that flow and that the mobile page fits its viewport. Screenshots are generated under ignored `test-results/` by those tests.

## Requires the actual kit

No hardware was flashed or physically tested. Acceptance still requires the minimal firmware procedure in `hardware.md`, followed by full firmware upload and browser serial connection. Verify physical kit routing, actual module firmware support, coordinate signs/scale, actual report cadence, Doppler interpretation, stationary targets, presence transitions, disconnect/reconnect and recovery. Optional distance remains labeled sensor-native units until independently verified. The dashboard's sector boundary is a visual reference rather than validated coverage.

Compile success verifies API/toolchain compatibility, not sensor response, physical wiring, USB behavior on a particular unit or detection accuracy. The Web Serial integration test uses a fake byte stream; the browser checks use simulation and synthetic recording data.

## Bridge 1.0.1 follow-up

A user-provided screenshot showed responsive radar telemetry, a tracked target, unknown presence, a ROM startup line parsed as JSON, and accumulated error/sequence-gap counts. This is user-provided evidence of operation, not a hardware test performed by this agent.

The update classifies recognized ROM startup lines separately, accepts both supported boolean presence widths, and defers telemetry while a status/ack occupies the transmit slot. The dashboard now separates host/protocol errors, device rejections, USB output drops and startup-line counts. The one-byte-only presence check was inconsistent with the Seeed-linked ESPHome decoder's uint16 report; actual improvement on the user's kit still requires flashing 1.0.1.

Validation after these changes: 36 automated tests, three Chromium checks, TypeScript/production build, and both PlatformIO firmware environments passed. Ten compile-time assertions cover valid one-/two-byte presence payloads, invalid values, unsupported lengths and null/empty input. The browser USB test uses a fake port that emits boot text, an acknowledgement and telemetry, verifies no protocol alert and zero host errors, then disconnects. Full firmware links at 18,660 bytes static RAM and 263,060 bytes application flash.

## Bridge 1.0.2 serial JSON investigation

The user reported a JSON syntax error at character 521. No raw rejected line was supplied, so the underlying cause is not confirmed. The host now preserves and exports the latest rejected line rather than relying on the parser message alone. Genuine malformed data continues to be rejected; the next valid line still processes. Oversized diagnostics are bounded at 8192 characters.

The firmware now adds an LF before every JSON document, increases its USB transmit ring to 2048 bytes, writes at most 64 bytes per pump call, and checks serialized output length before queueing. These changes improve packet-boundary recovery after interrupted transmission; they cannot reconstruct missing data and are not a confirmed resolution of the user's specific line.

Validation: 39 automated tests passed across six files; all three Chromium tests passed, including export and exact-content verification of a rejected packet with a syntax failure near character 521. Long valid packets across 64-byte read chunks and subsequent-line recovery are covered. Production TypeScript/Vite build and firmware 1.0.2 compile/link passed (18,660 bytes static RAM, 263,112 bytes application flash). Hardware confirmation and inspection of the user's actual failed line remain outstanding.

## Phase 2 addition

The additive Particle Experience retains the Phase 1 source lifecycle and interaction interface. No firmware files were modified for Phase 2. Three.js 0.186.1 and its type definitions were added; the particle code is lazy loaded separately from diagnostics.

The combined unit/integration suite passes 71 tests across seven files. The six browser tests cover the four original Phase 1 flows plus particle rendering/preset switching/input/replay/navigation and fullscreen/fallback/context restoration. They also verify continued rendering and fading interaction after simulation input stops. Production TypeScript/Vite build passes. A separate production 1920×1080 benchmark rendered all four requested particle counts; see [performance report](particles-performance.md) and `benchmarks/results.json` for exact software-GPU measurements. No RTX 4060 performance or live Phase 2 radar test is claimed. A manual [exhibition acceptance checklist](particles-acceptance.md) covers artistic and hardware-dependent checks.

### Particle navigation follow-up

A user reported that clicking Particle Experience made no visible change while USB was connected. The exact failure was not reproduced in the initial streaming test. Navigation now commits the selected view synchronously, handles direct `#particles` changes, exposes lazy-module loading/failure/retry states, and defers GPU construction until the selected view has painted. Failed module loading does not tear down the source lifecycle. A full application reload remains an explicit operator action and requires reconnecting USB.

Two new browser regressions cover a delayed first module load with continuous 50 Hz fake USB packets, native hash navigation while connected, and an intentionally failing graphics module with usable diagnostics/recovery controls. Together with the existing browser coverage, the suite now contains eight checks. Production build passes. The actual user-side cause, such as stale dependency optimization or an extension/browser condition, has not been confirmed; the troubleshooting guide includes a forced Vite dependency refresh procedure.
