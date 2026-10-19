# Particle interaction coverage

The correction keeps the GPU ping-pong engine, fixed-step integration, acceleration/velocity limits, Phase 1 acquisition, recording/replay, and Arduino firmware.

## Root cause verified in the existing code

The default cloud targets have approximate half-extents X 3.125, Y 2, Z 2.5 world units. The old mapping used X +/-4 and Z +/-3, independent of the formation. The built-in visitor swept radar X +/-1.8 m against a default calibrated half-range of 3 m: only 60% of the configured lateral interval, producing attractor X +/-2.4 world units. This was neither a full-field test nor a failure of uniform delivery.

The old Expressive radius was `3.125 * .65 = 2.03125` world units at rest, expanding at most to 3.352 during motion. It was further multiplied by worldScale and mapping.radius/2.1. At half that radius smoothstep influence was already 0.5; at 75% it was 0.15625, reaching zero at the radius. The far side of the sculpture often received no lateral movement force. Directional drag, movement turbulence, and movement vortex all shared this localized envelope. There was no broad lateral fluid field; existing global forces were depth compression/expansion and pulses.

Shape restoration already relaxed from 1.1 to 0.44 at full movement energy with the default Expressive preset. It resisted deformation but was not the primary missing-coverage cause. Increasing amplification alone could not affect particles outside the local envelope. Shader distances, attractor, and positions were already in the same simulation units, with inverse scene rotation correctly applied; the defect was mismatched spatial spans and force support, rather than a metres-versus-world-units shader error.

## Corrected model

Target bounds and characteristic radius (maximum target distance from the sculpture origin) now come from the generated XYZ arrays. Bounds are scanned on creation or formation changes, not per frame. During morphs, smoothly interpolated endpoint AABBs/radii conservatively enclose the intermediate targets; they need not be tight bounds. Rotation-aware world bounds map the physical calibrated region into the visual sculpture. Debug boxes remain in simulation coordinates and rotate with the sculpture.

Normalized X 0..1 maps across the generated X bounds. Normalized depth maps across Z bounds, with the existing depth orientation/inversion preserved. Phase 1 calibration or independent calibration supplies radar half-range/inversions; radar center and near/far depth remain configurable. World-space movement range and worldScale multiply this span; the previous width/depth controls remain as span calibration multipliers, with their historical defaults 8 and 6 meaning 100%. Offsets remain in world units. Velocity conversion uses the same spatial factors. The built-in test now scales its path across the selected calibration. Physical sensor/recording data is unchanged.

`world influence radius = generated characteristic radius * response.radius`. A value of .25, .65, .90, or 1.20 means 25%, 65%, 90%, or 120% of the radius, not diameter. Mapping scale does not change force radius. The legacy mapping.radius field remains readable for configuration compatibility but no longer changes the radius or appears as a competing control. Existing explicit response.radius values remain honored on import.

Local smoothstep influence has a configurable exponent. Local, Wide, and Full Field select progressively softer profiles and global envelope radii of 1, 1.75, and 2.5 times sculpture radius. The exponent is bounded to preserve a continuous zero-slope local boundary, even at maximum softness. The global envelope is Gaussian and has no finite cutoff. The blue debug sphere marks one Gaussian radius, not its outer boundary (weight there is about 0.607).

The local layer keeps attraction/repulsion, drag, vortices, and turbulence. The global layer adds weaker velocity-driven flow throughout the sculpture with sinusoidal speed variation and transverse eddies. Global velocity is capped at 3 world units/s before this layer is applied, preventing amplified depth flow from overwhelming compression. Global fluid influence controls its strength separately; local-to-global balance adjusts the local envelope gain and global gain. Default balance .5 retains local gain 1 and global gain .35. CPU fallback follows the same added envelope and flow equations; its pre-existing reduced ambient field remains simpler than the GPU field.

Optional dynamic expansion adds up to 65% radius at full movement energy. Radius follows a 0.3-second smoothing time; existing energy attack/release smooths expansion and contraction. Global flow fades with movement and presence; full shape restoration returns at rest. Existing pulse cooldown, stale-data handling, damping, and stability caps remain active.

## Operator controls and diagnostics

Start with Wide coverage, radius 90%, global influence .35, balance .5, softness 1, dynamic expansion enabled, and movement range 1. These are visual calibration starting values. Existing saved settings remain honored; use Reset interaction settings to apply the new defaults to a saved configuration.

Use Test interaction for a calibrated sweep, depth motion, rapid motion, and settling. Show influence field adds the teal local radius, blue global reference sphere, amber attractor, and formation box. Diagnostics display raw/filtered radar coordinates, normalized coordinates, world attractor, world formation bounds, characteristic radius, effective local/global radii, world movement spans, and actual shader uniforms. Radius .90 is near-global relative to the sculpture radius, but does not imply the opposite edge receives local force when the attractor is at an edge; the global layer supplies that coverage.

## Validation (2026-10-19)

- Production TypeScript/Vite build passes; the existing Three.js chunk-size advisory remains.
- 88 unit/integration tests pass, including all formation endpoints, rotation, morph bounds, falloff continuity, configuration migration, and movement-responsive radius.
- The isolated coverage test moves more than 800/1024 particles by over .1 world units beyond a .2-unit local field. Displacements vary spatially; after movement stops the formation error falls below 1% of its active value.
- Chromium checks cover GPU texture finiteness/deformation, full-width traversal, dynamic radius, global uniforms, serial mocks, diagnostics, recording/replay, presets, fullscreen, context recovery, and CPU fallback.
- 1080p benchmark: approximately 10.98 / 10.80 / 10.05 / 9.06 FPS for 10k / 30k / 60k / 100k on SwiftShader. Full metrics are in benchmarks/results.json. No native RTX 4060 or physical radar acceptance is claimed. The 60k / 60 FPS target still requires the intended GPU and a sustained exhibition test.
