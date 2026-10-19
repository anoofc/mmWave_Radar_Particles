# Verified API and hardware bring-up

Sources inspected on 2026-10-18:

- [Official MR60BHA2 kit guide](https://wiki.seeedstudio.com/getting_started_with_mr60bha2_mmwave_kit/)
- [Official library linked by that guide](https://github.com/Seeed-Projects/Seeed-mmWave-library), pinned commit `ade050c62f874c214fe83ebb586d723c46b03226` (v1.0.0 API)
- [Board variant pins](https://github.com/espressif/arduino-esp32/blob/3.3.7/variants/XIAO_ESP32C6/pins_arduino.h)
- [Pinned PlatformIO platform](https://github.com/pioarduino/platform-espressif32/releases/tag/55.03.37), Arduino ESP32 3.3.7, PlatformIO Core >=6.1.18
- [Platform board definition](https://github.com/pioarduino/platform-espressif32/blob/55.03.37/boards/seeed_xiao_esp32c6.json)

The standard PlatformIO `espressif32` 6.12.0 uses Arduino 2.0.17 and is unsuitable for this ESP32-C6 Arduino project. Use the pinned pioarduino platform in `platformio.ini`. Upstream dependencies download automatically. No BH1750 or NeoPixel dependency is needed because neither is used. ArduinoJson is pinned to 6.21.5 for bounded `StaticJsonDocument` allocation.

## Serial routing

| Connection | Implementation |
|---|---|
| PC USB | `Serial`, native USB Serial/JTAG CDC, `ARDUINO_USB_MODE=1`, `ARDUINO_USB_CDC_ON_BOOT=1` |
| Radar UART | `HardwareSerial(0)`, 115200, 8N1 |
| XIAO receive | GPIO17 / D7 / RX, connected to radar TX |
| XIAO transmit | GPIO16 / D6 / TX, connected to radar RX |
| Power | Official assembled kit, USB 5 V input; common ground |

The kit guide uses UART0; the board variant defines TX=16 and RX=17. `SeeedmmWave::begin()` calls `_serial->begin(baud)` internally. Our initialization reapplies explicit RX/TX pins after the library's begin. Never put binary radar bytes onto the USB JSON stream. Don't substitute `Serial` for the hardware UART. Do not rewire the assembled kit unless inspecting its actual connector/schematic with power removed. The routing above follows the guide and board variant; physical continuity has not been measured here.

## API details that affect correctness

`getPeopleCountingTargetInfo(PeopleCounting&)` is the correct spelling in the source (the wiki API prose contains a typo). A successful getter consumes its validity flag and moves the vector; a valid empty vector is a real zero-target report. `x_point` and `y_point` are metres according to the guide. `dop_index` and `cluster_index` are signed 32-bit fields. `RANGE_STEP` is 17.28f; the guide specifies cm/s for its Doppler conversion.

`isHumanDetected()` consumes a validity flag but returns false both when absent and when no report is available. `Radar.h` overrides the public virtual `handleType`, validates payloads, delegates to `SEEED_MR60BHA2::handleType`, and consumes `isHumanDetected()` only after a genuine human report. It timestamps presence and target reports independently. No private members or invented APIs are used.

Bridge 1.0.1 accepts both a one-byte boolean and a two-byte little-endian 0/1 presence payload. The Arduino decoder reads byte zero, while the [Seeed-linked ESPHome implementation](https://github.com/limengdu/MR60BHA2_ESPHome_external_components/blob/main/components/seeed_mr60bha2/seeed_mr60bha2.cpp) reads a uint16 for this report. The original exact one-byte length check incorrectly rejected the latter format. Unknown values and unsupported lengths remain invalid. `PresencePayloadChecks.h` contains compile-time regression checks for both formats and invalid inputs.

The upstream decoder reads payloads without checking their size and reserves memory using a payload target count. The adapter checks sizes and restricts both target and point-cloud reports to the documented three-target limit before delegation. This bounds that allocation. An unsupported larger point-cloud report is rejected and increments the adapter error count. The library itself uses dynamic vectors and a capped frame queue, a 32 KB UART RX buffer and a 512-byte payload limit; this project does not claim a heap-free library. Its checksum failures are not exposed through the public API; the UI error count covers adapter payload rejection and host protocol/transport errors, not every possible UART failure.

`update(0)` executes a nonblocking fetch pass and processes at most one queued frame in this pinned version. It is polled continuously. Neither this parameter nor the USB output interval is a sensor frame rate. Frame-rate telemetry derives from actual accepted frame counters. Counts exclude unsupported message types and invalid checksums/payloads. Under very heavy bursts the upstream capped queue may discard older frames without reporting it.

`getDistance()` returns a floating-point range when its flag is set; units could not be established from the source/guide with enough certainty. Preserve it as `sensor_raw`. `getFirmwareInfo()` is used opportunistically; no undocumented query commands are sent to the module.

## Initial physical test

1. Install the PlatformIO VS Code extension. Connect the assembled kit using a data USB cable. Verify a new serial device appears in Device Manager. Close other serial clients.
2. Build and upload the **minimal** environment. Upload selection is automatic when unambiguous; otherwise pass `--upload-port` with the port actually listed by `pio device list`.
3. Open a 115200 serial monitor. Confirm accepted frame counts increase. Move through the field of view and compare target coordinates. Wait outside the room and verify explicit presence transitions. Unknown is an honest initial state.
4. If there are frames but no targets, confirm the radar module's firmware supports human/target reporting. The official guide says older module firmware may lack these reports. Follow only the vendor's procedure if upgrading is necessary. This repository does not update the radar module.
5. Upload `xiao_esp32c6`, close the monitor, launch the web app and connect. Confirm valid JSON status, independent presence and target timestamps, and coordinate motion.
6. Check absence versus zero targets versus report loss. Disconnect USB: interaction must become disconnected with no primary target. Reconnect explicitly. Use **Recover UART** if the bridge remains connected but radar frames stop.
7. With power removed, inspect connectors if the radar remains unresponsive. Never disconnect live power/signal connectors as a software test. A powered bridge cannot distinguish a physically disconnected radar from an unresponsive one; both are reported as unresponsive.

Recovery reinitializes only the UART every 10 seconds when no accepted frames have arrived for at least 3 seconds. It never resets the XIAO or reflashes/power-cycles the radar. If valid frames resume, normal reporting resumes automatically.
