# Phase 3.1: measured spatial diagnosis

## Reproduced defect and correction

The remaining reproducible defect was the **dashboard automatic visitor trajectory**, rather than a GPU coordinate-space mismatch. Run simulation and Test interaction are different sources. The particle-only Test interaction had already been calibrated; Run simulation still generated fixed radar X +/-1.7 m and Y 2.0..3.6 m independently of the selected particle calibration (default X +/-3 m, Y 0.3..3.0 m). A substantial part of its depth trajectory clamped at the far boundary.

With the current defaults, an actual Simulator -> Tracker -> InteractionAdapter -> 60,000-particle GPUSimulation run over 20 simulated seconds measured:

| Measurement | Original automatic path | Calibrated particle-page path |
|---|---:|---:|
| Attractor lateral width / target width | 56.58% | 99.87% |
| Attractor world X min / max | -1.7553 / 1.7546 | -3.0980 / 3.0970 |
| Attractor world Z min / max | -2.4975 / -0.4697 | -2.4958 / 2.4864 |
| Normalized X min / max | 0.2169 / 0.7830 | 0.0002 / 0.9995 |
| Normalized depth min / max | 0.6297 / 1.0000 | 0.0001 / 1.0000 |

The correction adds an optional simulation zone. Particle Experience supplies its calibrated radar center, horizontal half-range and near/far depths while mounted, and restores the previous zone on exit. Manual placement, serial input, filtering, recordings, replay, Phase 1 defaults and firmware are unchanged. The amplitude of the synthetic path now covers the intended calibrated region; force amplification, influence radius, global strength and restoration settings were not increased.

## Coordinate-space audit

| Quantity | Space and units |
|---|---|
| Raw radar X/Y and configured zone | Sensor metres |
| Normalized radar X/depth | Dimensionless [0,1], clamped after center/range/depth calibration and inversion |
| Adapter position and direction | Render-world position and velocity, in sculpture units and units/s; force amplification changes direction energy |
| sceneInput | Inverse Y rotation converts world attractor/direction into sculpture-local simulation coordinates |
| Position RGBA texture | XYZ = sculpture-local simulation units; W = age, not position or UV |
| Velocity RGBA texture | XYZ = sculpture-local units/s; W = persistent seed |
| Formation targets | Same sculpture-local XYZ as the position texture; no hidden -1..1 normalization |
| Texel reference UV | Texture lookup only: (column+.5,row+.5)/textureSide; never used as a physical distance |
| Attractor and radius shader uniforms | Sculpture-local position and scalar radius in identical simulation units |
| Point vertex / rendering | Texture XYZ -> modelViewMatrix -> projectionMatrix; group Y rotation, unit scale; camera perspective affects display only |
| Integration | Velocity: exp(-damping*dt) then bounded acceleration * dt. Position: bounded velocity * dt. Fixed dt=1/60; at most four steps/frame; excess catch-up time discarded |

The group/model scale is (1,1,1). Camera defaults to (0,2.8,13), FOV 42 degrees. Renderer DPR changes raster size, not simulation units. The measured texture is 245x245 Float32 RGBA for 60,000 rendered particles; its 25 padded texels are excluded from diagnostic samples. There is no position wrapping: the modulo operation changes age W only. The optional boundary is a soft restoring acceleration beyond radius 7. Uniform delivery, inverse scene rotation, smoothstep ordering, force signs and once-per-step integration were consistent in the tested defaults.

## Measured geometry and forces

Generated target bounds, scanned from the exact simulation initialization arrays: min [-3.1015422344207764, -1.9942151308059692, -2.497454881668091], max [3.1013541221618652, 1.985253930091858, 2.4879050254821777]. Characteristic radius = **3.111898** units. Influence radius for the controlled five-position test = **2.800708** units (90% of characteristic radius); movement-responsive expansion is held out of this controlled test.

The following values come from 256 stratified GPU samples after 90 integration steps (1.5 simulated seconds) with activity=1, motion=1, lateral direction=(1.5,0,0), no pulse/approach, unchanged Expressive/Wide forces. They are population estimates, not an exhaustive 60,000-particle census. Meaningful interaction means raw interaction acceleration >=0.1 units/s^2, including the existing global layer. Spring/damping acceleration includes the existing compressed spring target; ambient flow is excluded from interaction statistics. Both force magnitudes are measured before the shared total acceleration cap.

| Position / world attractor XYZ | Inside local radius | Meaningful combined interaction | Mean interaction acceleration | Mean restoration acceleration | Mean target displacement |
|---|---:|---:|---:|---:|---:|
| left: (-3.102, 0.000, 0.000) | 27.34% | 100.00% | 1.240 | 0.403 | 0.685 |
| center: (0.000, 0.000, 0.000) | 86.72% | 100.00% | 1.560 | 0.541 | 0.920 |
| right: (3.101, 0.000, 0.000) | 44.14% | 100.00% | 1.508 | 0.507 | 0.849 |
| near: (0.000, 0.000, 2.488) | 31.25% | 100.00% | 1.322 | 0.505 | 0.862 |
| far: (0.000, 0.000, -2.497) | 35.94% | 100.00% | 1.247 | 0.366 | 0.617 |

At the initial center snapshot, the sampled current-particle bounds were approximately (-2.861,-1.779,-2.389) to (2.900,1.870,2.390), with sampled bounding-sphere radius 2.902. The sample underestimates full population extents; the exact generated bounds above must not be confused with sampled live bounds.

Local coverage at an edge is naturally smaller than center coverage. The existing broad field already reached every sampled particle in these moving tests. Therefore the evidence does **not** support claiming that most GPU particles received zero force, that restoration dominated at all five positions, or that there was a UV/world-space mixup. The identified correction fixes the reproducible restricted automatic trajectory. Without the installation's saved browser settings or physical radar, this does not establish a separate root cause for every visually localized effect the operator may see.

The uniform-field diagnostic isolated visitor interaction by disabling ambient/local/global movement forces and adding a bounded acceleration of (0.6,0,0). All 256 active samples received 0.6 units/s^2; mean target displacement reached about 0.353 units after 1.5 seconds. This rules out a permanently frozen texel region in the tested GPU path. Existing GPU/CPU tests additionally verify finite positions, approach/retreat behavior and settling.

## Using the diagnostics

In development, open Particle Spatial Diagnostics and enable it. In a production preview, use `/?particleSpatial=1#particles`. Nothing is enabled or persisted by default. The normal report refresh is 500 ms; spatial readback is limited to once per 2 seconds, two 16x16 Float32 buffers. These small opt-in readbacks can still have driver synchronization cost; normal/exhibition rendering performs none of these diagnostic reads. Readback errors and unsupported Float32 paths show unavailable rather than invented force values. CPU fallback reports exact CPU position bounds and marks GPU force statistics unavailable.

The panel separates generated target geometry, live sampled geometry, calibrated potential travel, observed travel, requested mapped radar position and actual shader attractor. It exposes actual uniforms, texture dimensions/precision, model matrix/scale, camera, raw frame delta, clamped delta, fixed integration timestep and integrated steps. Sampling estimates population counts; the coverage multiplier is never presented as a measured particle percentage.

- Attractor Sweep bypasses radar mapping and traverses the generated visual width in both directions.
- Uniform Field adds a gentle bounded diagnostic force to all active texels, independent of radar presence; normal stability limits still apply.
- Force Visualization renders a full-resolution force texture with the **same velocity shader** in diagnostic-output mode. Blue is <0.1, yellow is 1 and red is 5 units/s^2. It uses current texture positions and the same force expressions, rather than a separate approximate radial coloring formula. This mode costs one extra GPU pass/frame; it does not require per-frame CPU readback.
- Debug overlays show generated bounds and sphere, live sampled bounds (white), actual uniform influence radius and attractor (teal/amber), world-space movement path (orange), and the calibrated world boundary (magenta). The blue global envelope remains an optional reference sphere.

All spatial modes stop in exhibition. Disable or unmount disposes diagnostic render targets/materials; engine disposal releases paths, helpers and geometry. Debug state is session-only and is cleared on unmount. The force overlay follows actual shader uniforms, including frames with zero integration steps. The renderer continues reporting original frame/step timing rather than implying that a slow software frame advances the simulation by its full wall-clock duration.

## Files changed

- `web/src/core/simulation.ts`: optional calibrated synthetic-visitor zone.
- `web/src/particles/ParticleExperience.tsx`: particle-scoped zone lifecycle and developer panel.
- `web/src/particles/shaders.ts`: shared interaction/restoration force outputs, uniform-field diagnostic, force colors.
- `web/src/particles/gpu.ts`: lazy diagnostic targets, stratified samples, full-resolution force texture, cleanup.
- `web/src/particles/engine.ts`: low-frequency measurement scheduling, overlays/path/boundary, actual transforms/timing, exhibition suppression.
- `web/src/particles/adapter.ts`: measured per-frame test travel extrema and optional diagnostic uniform field input.
- `web/src/particles/store.ts`, `SpatialDiagnostics.tsx`, `spatial.ts`: transient developer state, display and measurement aggregation.
- `tests/spatial.test.ts`, `tests/browser/spatial.spec.ts`, `tests/browser/response.spec.ts`: measurement, full-zone, GPU coverage and lifecycle checks; per-frame travel extrema avoid missing a brief edge visit between 500 ms reports.
- `docs/diagnostics/phase31-before.json`, `phase31-gpu.json`: original instrumented run and reproducible legacy/calibrated comparison; documentation and benchmark results updated.

## Validation and limits

Production TypeScript/Vite build passes (existing Three.js chunk advisory). All 90 unit/integration tests pass. All 12 Chromium browser tests pass, covering the original dashboard and the new spatial modes. The hardware-free GPU measurement uses actual shader output and simulation textures, not a CPU replacement force model.

With spatial diagnostics disabled, the short 1080p SwiftShader benchmark measured 9.69 / 10.48 / 9.78 / 9.15 FPS at 10k / 30k / 60k / 100k. Texture count stays 11 in normal rendering. The earlier 60k result was 10.05 FPS; this short software-rendered run cannot attribute that small difference to a particular change. The native RTX 4060 / 60 FPS target and physical installation artistic acceptance remain unverified. No firmware changes were made.
