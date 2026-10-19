# Troubleshooting

If **Particle Experience** does not open, stop the existing Vite terminal with Ctrl+C, then run `npm.cmd run dev --workspace web -- --force` from the repository root. Open the exact URL printed by Vite and hard-refresh with Ctrl+Shift+R. The force option refreshes optimized dependencies after Three.js installation. Reconnect USB after reloading. The view also supports appending `#particles` to the URL. Selection now commits immediately, with visible loading/retry states; a failed graphics-module load leaves the radar lifecycle running and diagnostics accessible. GPU initialization starts after the selected view has painted.

| Symptom | Check |
|---|---|
| USB unavailable in browser | Desktop Chrome/Edge, localhost or HTTPS, top-level page, serial permissions enabled. Simulation works without Web Serial. |
| No selectable USB device | Data-capable cable, Device Manager, powered kit, USB port. Check `pio device list`. |
| Port busy / access denied | Close serial monitor, terminal, other browser tabs and vendor OTA tools. |
| Upload fails | Use PlatformIO's selected port. If needed use XIAO's documented bootloader entry procedure, then select the newly enumerated device. Do not hardcode its COM number in the repository. |
| Arduino ESP32-C6 build unsupported | Keep the pinned pioarduino URL; the standard platform's older Arduino core lacks suitable C6 support. PlatformIO Core >=6.1.18 is required. |
| First build seems slow | Arduino toolchain downloads are large. Check the PlatformIO terminal, network/proxy and available disk space. |
| USB connected, radar unresponsive | Test `minimal`. Confirm UART0 RX17/TX16, physical kit assembly and stable power. An unresponsive radar and an unplugged radar cannot be distinguished electrically here. |
| Frames increase, targets unavailable | Sensor firmware may not support target reporting or may be in another mode. Review Seeed's target-report firmware notes and physical test. Do not interpret as no people. |
| JSON errors after reset | Refresh the updated dashboard: recognized ESP ROM startup messages are counted separately. Other unexpected text, including minimal-test output, still raises errors. Flash the full bridge firmware if needed. |
| Expected comma or closing brace at position 521 (or another position) | The number is a character offset in the received line, not a source-code line number. Refresh the dashboard, then expand **Last rejected serial packet** and download its diagnostic JSON. It includes the raw received line, receive time and reported bridge version. Firmware 1.0.2 increases USB buffering and adds delimiters around packets; the error message alone cannot establish whether bytes were dropped, concatenated, or malformed at the source. |
| Unknown presence | Confirm bridge firmware is 1.0.1 or newer; the original bridge rejected two-byte presence reports. If unknown persists, no recent supported explicit presence frame has been accepted. Do not force unknown into absent. |
| Zero targets while presence is true | Independent report types can disagree temporarily; valid zero-target arrays are preserved. |
| Old targets shown | Inspect measurement age, raw JSON `target_at`, hold timeout and tracking state. Primary interaction is suppressed when stale/unavailable. Raw JSON/table retain the last packet for diagnosis and carry explicit age. |
| Sequence gaps despite live targets | Upload bridge 1.0.1, which defers telemetry while status/ack output is pending. Inspect USB output drops separately from host protocol errors and device rejections. Persistent gaps can still indicate actual transport loss. |
| Reconnect opens no device | Reconnect only works with exactly one authorized device. Use Connect USB to choose otherwise. Browser grants may not survive profile changes. |
| Replay won't start | Stop recording first. Load the sample or import a versioned JSON session. CSV is a diagnostic export, not an import format. |
| Firmware reports rejected payloads | Inspect version compatibility and module output using the minimal reader. Adapter rejects malformed lengths, nonfinite coordinates and counts above three. Check source before widening these bounds. |

**Recover UART** restarts the radar UART without resetting the module. Status and telemetry continue over USB even when no sensor data arrives. Sequence gaps may indicate dropped USB output under backpressure; the bridge counts dropped output packets separately in status. Sequence numbers apply to all packet types, not only telemetry. The sensor's own checksum/queue drop diagnostics are not exposed by the pinned library.
