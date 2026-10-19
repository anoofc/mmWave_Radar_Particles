# Particle performance report — 2026-10-19 (Phase 3)

The target is 60,000 particles at 1920×1080 / 60 FPS on an NVIDIA RTX 4060 laptop. **That hardware target has not been verified.** The browser available to this test session used a software GPU, so these measurements establish working render/count paths and a reproducible benchmark, not expected NVIDIA performance.

## Measured environment

- Browser: headless Chromium (exact browser version and timestamp in `benchmarks/results.json`).
- Renderer: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`.
- Backend: GPU float32 ping-pong simulation, executed by SwiftShader software rendering.
- Actual canvas: 1920×1080, DPR 1.0, fullscreen exhibition.
- High quality, adaptive resolution disabled, bloom 0.45, trails 0.25, Magnetic Fluid, simulated visitor input.
- Each count received a three-second warmup, followed by approximately five seconds of measurements. This is a short smoke benchmark, not a sustained thermal test.

| Requested / actual particles | Average FPS | Last reported rolling P95 frame time | GPU timer |
|---:|---:|---:|---|
| 10,000 / 10,000 | 9.69 | 100.1 ms | Unavailable |
| 30,000 / 30,000 | 10.48 | 100.1 ms | Unavailable |
| 60,000 / 60,000 | 9.78 | 116.7 ms | Unavailable |
| 100,000 / 100,000 | 9.15 | 116.7 ms | Unavailable |

All four requested counts were rendered, without a fallback count cap. Texture count remained 11 across measurements. There were up to 14 render/compute draw calls in the reported frames: at most four bounded simulation steps plus the visual/post-processing passes. The GPU timer extension was unavailable, so no GPU millisecond estimates are invented. P95 is the engine's rolling frame-time sample, not a separately instrumented whole-run percentile. Initial shader compilation and very long idle/external interruptions can affect short measurements.

The full JSON contains sample-by-sample metrics, renderer name, exact rendered dimensions, frame time, DPR, counts and backend. The Phase 3 adapter/GPU browser test additionally checks real position-texture samples for finite values and measurable deformation. Fluid movement and artistic acceptance on real radar input still require the target-PC checklist.

## Reproduce on the exhibition PC

```powershell
npm.cmd ci
npx.cmd playwright install chromium
npm.cmd run benchmark:particles
```

This builds production assets, serves a separate preview on port 5174, runs four cases sequentially, and overwrites `docs/benchmarks/results.json`. It does not change firmware or need USB access. Keep port 5174 free. The usual development server may remain on port 5173. The benchmark uses fixed DPR/quality and fullscreen canvas dimensions; actual metrics are saved so software drivers and fallback caps are visible.

Before evaluating the RTX goal, check that the recorded renderer identifies the intended NVIDIA GPU. Run on AC power, enable browser hardware acceleration, select the intended laptop graphics policy, and use the actual exhibition display. Do not infer native GPU results from these software-rendered figures. For release acceptance, repeat a sustained 15-minute run and log thermal throttling, CPU/GPU loads, browser/driver versions, selected preset and quality settings.

## Automated validation

Phase 1, particle, and Phase 3 numerical tests pass together (90 tests). GPU acceptance measures actual texture positions across the deterministic adapter demo. Browser regressions cover serial mocks, diagnostic controls, recording/replay, six visual presets, formation/palette changes, resizing, fullscreen, context restoration, and CPU fallback.

This coverage-correction run used SwiftShader software rendering. Its roughly 10 FPS at 60k/1080p does not meet the exhibition target and cannot establish native NVIDIA performance. Session load prevents attributing differences from earlier software runs to the shader alone. Profile on the actual exhibition GPU before declaring the performance requirement met. Benchmark results use the simulator and no position readback; diagnostic readback is opt-in and excluded from the benchmark. No successful radar or RTX 4060 test is claimed. See [coverage validation](interaction-coverage.md).

Phase 3.1 adds opt-in spatial diagnostics; the measurements above leave them disabled. See [measured diagnosis](phase31-spatial-diagnostics.md).
