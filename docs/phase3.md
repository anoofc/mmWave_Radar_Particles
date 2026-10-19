# Phase 3: responsive radar interaction

Select Particle Experience, leave Interaction preset on **Expressive**, and click **Test interaction** under Interaction Response. No serial connection is required. Enable **Show influence field** to see the amber attractor and teal influence sphere. The test bypasses acquisition and tracking, feeds the existing particle adapter, and leaves transport, recording, replay, and raw radar packets intact. Stop the test to resume the current source.

The 16-second path contains idle (0–2 s), left (2–4), right (4–6), approach (6–8), retreat (8–10), rapid lateral motion (10–12), and stop/settle (12–16). The renderer continues settling afterward. **Compare baseline response** repeats this path with amplification 1; it is a controlled comparison of the new model, not an emulation of the old shader. Save custom response preset stores the complete configuration as “Custom response”, available in Operator configurations. JSON export includes response controls; older version-1 configurations receive Expressive defaults.

## Diagnosis of the previous engine

The inspected path was serial telemetry → Tracker.ingest/state → interactionAPI → InteractionAdapter → sceneInput → GPUSimulation uniforms → velocity shader → position shader → points/post-processing.

- Tracker applied a fixed alpha of 0.3 to position. The adapter then used a second time constant of `0.06 + smoothing * 1.25`, about **0.87 seconds** at the default setting. This delayed both target position and energy.
- Direction used filtered velocity, multiplied it by `movementIntensity` (already speed divided by 2), and reduced repeated stationary samples again. Low-speed directional response was consequently suppressed twice, before the shader multiplied by activity, flow, and 0.65.
- Tracker velocity used host receipt-derived intervals. USB delivery jitter could change velocity for the same physical sensor cadence. It now uses unsigned sensor measurement intervals, while host time remains the freshness clock.
- InteractionState.timestamp is a dashboard evaluation time. Treating changes in it as sensor progress allowed old velocity to persist across dashboard refreshes. The adapter now consumes an explicit confirmed measurement identity/time, ages velocity independently, and processes each measurement once.
- Shape restoration remained fully active (`shape` typically 1.1–2.2), while magnetic and drag accelerations were modest and localized. Compression only changed target scale from 1.12 to 0.82 based on absolute proximity. It did not distinguish approach from retreat.
- Default radar X ±3 m mapped to world X ±4, depth 0.3–3 m mapped to Z ±3, versus a cloud with X radius about 3.125, Y radius 2, Z radius 2.5. Some attractor positions lay beyond the dense field. Fixed radius 2.1 and depth viewed mainly along the camera axis further limited visible displacement.
- Uniforms did update correctly. GPU acceleration and position each used delta time once; there was no double-delta-time bug. Existing exponential damping and bounded fixed-step integration were retained.

## Mapping and forces

Raw coordinates remain metres. The adapter filters the raw primary separately using a time-based adaptive filter, then derives filtered velocity from that same filter using the sensor interval. Primary changes and gaps reset velocity history. Configurable dead zone rejects position jitter. Velocity is bounded to 5 m/s before world conversion; amplified world velocity is bounded to 12 units/s.

Radar X bounds are radar center X ± horizontal half-range. Diagnostic calibration supplies the half-range and inversions when enabled; otherwise Radar mapping supplies them. Near/far Y bounds remain configurable. Coordinates clamp to [0,1], map across configurable world width/depth, and receive world X/Y/Z offsets. Amplification changes force energy rather than enlarging the target path. Set width/depth so the debug attractor traverses the sculpture. Y inversion changes visual direction, while approach continues to mean decreasing measured radar depth.

Expressive uses amplification 4, influence radius 0.90 of the formation's characteristic radius, and active restoration weight 0.4. Dramatic uses 7, 0.9, and 0.2. Subtle uses 1, 0.4, and 0.8. Influence radius now derives from generated target bounds independently of radar mapping scale. Fast movement optionally broadens the field by up to 65%. See [the coverage correction](interaction-coverage.md) for formation-aware mapping, the global flow layer, additional controls, and updated validation.


Within the field, smoothstep falloff weights directional velocity drag, local attraction/expansion, signed vortex flow, and curl disturbance. A broader radial component makes approach compress and retreat expand the sculpture, including when the target is at the edge. Per-particle seeds/depth maintain layered response. Acceleration and velocity caps still apply after summing forces. Position integration follows velocity integration at 1/60 s, with at most four catch-up steps per frame. Slow machines deliberately discard excess simulation time to stay bounded.

Energy normalizes filtered speed between configurable minimum/maximum thresholds. Fast attack and slower release control deformation, brightness, color shift, trails, and turbulence. Pulses require a threshold crossing and a one-second cooldown; an expanding shell applies decaying acceleration, not a newly generated per-frame impulse. Activity fades on held, stale, absent, or missing input. The attractor stays at its last confirmed location while forces fade; full restoration returns as movement subsides. No prediction or fabricated sensor measurements are used. A short world-target interpolation smooths the gap between lower-rate measurements.

## Diagnostics and verification

Interaction Diagnostics exposes raw/filtered metres, normalized coordinates, world attractor, raw/filtered velocity, energy, amplification, effective radius, interaction state, frame age, a raw/filtered speed graph, a calibration plot, and values read from the actual simulation uniforms. CPU fallback is explicitly labeled. Telemetry updates at approximately 2 Hz; measurement ingestion and rendering remain independent. In a sensor-free test, frame age describes the injected 20 Hz test stream and the state is labeled Test.

`npm test` includes numerical deformation, compression, expansion, settling, finite positions, amplification, sensor cadence/jitter, stale data, and configuration compatibility checks. Browser regressions preserve serial mocks, diagnostics, recording/replay, formations/presets, exhibition, context restoration, and CPU fallback. `tests/browser/response.spec.ts` runs the complete adapter test through the compiled GPU shader and checks force uniforms and sampled GPU position statistics. GPU readback is opt-in with `?interactionProbe=1#particles`; normal operation performs no readback.

Run `npm run build`, `npm run test:browser`, and `npm run benchmark:particles` to reproduce. The benchmark records all counts at 1080p in [benchmarks/results.json](benchmarks/results.json). Software-rendered Chromium measurements do not validate the RTX 4060 / 60 FPS target. Physical axis orientation, usable radar zone, noisy measurements, and installation-scale artistic response still need checking on the actual sensor and exhibition GPU. Firmware and the serial protocol were not changed.
