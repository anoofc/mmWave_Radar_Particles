# USB protocol v1

UTF-8 newline-delimited JSON, one compact object plus LF per packet. CRLF input is accepted. Radar UART binary data never appears on this stream. Host serial configuration is 115200 8N1; native USB CDC transport is separate from the sensor UART.

All objects carry `type` and integer `v: 1`. Device-to-host packets additionally contain uint32 `seq` (global across packet types) and `ts` (XIAO uptime milliseconds). `seq` and `ts` wrap modulo 2³²; reboot restarts them. Host command correlation uses an `id` string of at most 64 bytes. Examples are in `shared/examples.ndjson`; canonical TypeScript shapes are in `shared/protocol.ts`.

## Telemetry

| Field | Meaning |
|---|---|
| `radar` | `responsive` if a recognized valid frame arrived within 3000 ms; otherwise `unresponsive` |
| `units` | Always `m` for original X/Y |
| `presence` | `true`, `false`, or `null` when no recent explicit presence report |
| `presence_at` | Last valid presence measurement uptime, or null when unavailable |
| `report` | `valid` or `unavailable`, independent of presence |
| `target_at` | Last valid target-report measurement uptime, or null when unavailable |
| `targets` | Zero to three `{x,y,doppler,cluster}` objects; empty when unavailable |
| `distance` | Null or `{value,unit:"sensor_raw",at}`; unverified units deliberately preserved |
| `sensor_frames` | Accepted, recognized radar frames since bridge startup |
| `target_frames` | Accepted target-info frames, including zero-target reports |
| `errors` | Adapter payload-validation failures plus command-parse errors |

Individual measurements expire in the bridge after 2500 ms. Telemetry continues at the configured USB interval even when values are unavailable. Host default stale threshold is 2200 ms, based on sensor measurement timestamps, not arrival of cached USB copies. A present/absent report can coexist with unavailable coordinates. `report:valid,targets:[]` is a genuine zero-target report. No confidence is provided.

Finite X/Y are guarded on the bridge and host. The host rejects coordinates beyond ±100 m as an input sanity limit rather than a detector range assumption. Doppler and cluster are signed 32-bit indices. `doppler × 17.28` is the documented cm/s conversion; UI divides by 100 for m/s. Position-derived planar velocity is a separate interaction output.

## Status

Sent approximately once per second and on hello/status/ping. Includes bridge `firmware`, `board`, `sensor`, `sensor_firmware` (null until reported), `radar`, `doppler_step_cm_s`, `interval_ms`, `sensor_frames`, `target_frames`, `errors`, and `tx_dropped`. The firmware string describes this XIAO application; it is not the radar-module firmware version.

`tx_dropped` counts output packets not queued because the bounded USB transmit slot is occupied or a packet is too large. Such attempts consume a sequence number and can cause host gap counters. Host gap counts are diagnostic and do not guarantee detection of every sensor-side drop. The official library does not expose checksum-rejection counters.

## Commands and acknowledgements

```json
{"type":"command","v":1,"id":"request-42","command":"hello"}
```

| Command | Behavior |
|---|---|
| `hello` | Ack plus status / capability constants |
| `ping` | Ack plus status; does not query or refresh radar measurements |
| `status` | Ack plus status |
| `set_interval` | Require integer `interval_ms` from 50 through 1000; change USB telemetry only |
| `recover` | Reinitialize radar UART, ack and status; no module reset or reflash |

Responses use `type:ack,v:1,seq,ts,id,ok,message`. Unknown commands and versions produce `ok:false`. Configuration is volatile and resets on reboot. No invented radar configuration commands are sent. The dashboard maintains a three-second ack timeout and displays failures.

The command line buffer is 256 bytes; excess input is discarded through the next newline. Host parser limit is 8192 characters per line. Recognized ESP32 ROM startup lines are classified separately and counted under ESP startup lines; they are not application packets, recorded telemetry or protocol errors. Arbitrary application text and malformed JSON still produce errors. There is no unbounded log stream. Output uses a fixed 1536-byte pending slot and is pumped only as USB write space permits; commands are processed when that slot is free. In bridge 1.0.1, periodic telemetry waits for that slot instead of attempting a packet while a status/ack is pending, which avoids artificial sequence gaps. Disconnect discards partial output. Missing radar data triggers an automatic UART restart every 10 seconds after a 3-second frame timeout.

USB disconnection is a host transport state, not a packet emitted by a disconnected device. `unresponsive` cannot distinguish an unplugged radar module from a silent or incompatible one. Neither state means human absent.

Bridge 1.0.2 configures a 2048-byte USB TX ring buffer, limits each pump write to at most 64 bytes, and places an LF before as well as after each JSON document. Blank lines are allowed and ignored. The extra delimiter isolates a truncated preceding line if transmission was interrupted. Serialization length is checked against `measureJson` before queueing. This improves framing recovery but cannot repair a packet with missing bytes. Genuine malformed lines remain errors.

The dashboard retains the latest rejected serial line (at most 8192 characters). **Download rejected packet** exports a `mr60-serial-diagnostic` object with `message`, `line`, `receivedAt` and `bridgeFirmware`. Overlong input captures only a bounded prefix. These diagnostics are separate from valid recorded telemetry and are cleared on source changes. The supplied parser position refers to a character offset in `line` and does not by itself diagnose the cause.

## Recording format

```json
{"format":"mr60-session","version":1,"started":"2026-10-18T09:00:00Z","events":[{"at":0,"packet":{"type":"telemetry","v":1,"seq":0,"ts":0,"units":"m","radar":"responsive","presence":false,"presence_at":0,"report":"valid","target_at":0,"targets":[],"distance":null,"sensor_frames":1,"target_frames":1,"errors":0}}]}
```

`at` is a nondecreasing host-relative offset in milliseconds. All original packet fields are preserved. Imports validate the envelope, ordered timestamps and each packet before changing sources. Maximum 100,000 packets / 30 MB import. JSON is the replay exchange format; CSV is a one-row-per-target export with blank target columns for empty/unavailable reports and nontelemetry markers. The bundled 12-second sample is synthetic, explicitly not hardware-captured data.
