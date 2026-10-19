# Phase 2 — Particle Experience

The existing radar diagnostic application now includes **Particle Experience**. The serial manager, simulator, tracker, recorder and replay remain owned by the Phase 1 application and continue across navigation. No Arduino or radar-module firmware change is required; the working 1.0.2 bridge remains compatible.

## Windows startup

From the repository root in VS Code PowerShell:

```powershell
npm.cmd ci
npm.cmd run dev
```

Open the printed localhost URL in Chrome or Edge. Select **Particle Experience**, then **Run simulation** above the preview to try it without hardware. To use the existing radar, choose **Connect USB** as before. To use a recording, import the session in **Radar Diagnostics → Session recorder**, then select **Replay recorded session** in Particle Experience. **Load & replay sample** uses the existing synthetic session directly.

Production local preview:

```powershell
npm.cmd run build
npm.cmd run preview --workspace web
```

No COM number, cloud account, remote asset, camera permission or model download is required. Dependencies install once via npm. Three.js 0.186.1 is the only added runtime package; `@types/three` 0.186.0 adds compile-time definitions. These are compatible with the retained React 19, Vite 7, TypeScript 5.9 and Zustand 5 setup. The lockfile pins the actual resolved dependency graph. The Three.js code is loaded only when the particle view opens.

## Operating the experience

Choose any of the six presets: Magnetic Fluid, Cosmic Vortex, Energy Burst, Liquid Sculpture, Particle Ocean, or Ambient Galaxy. They configure the same force engine. Preset and formation changes interpolate existing particle positions/velocities toward stable targets; they do not reset simulation state. Manually selecting a formation disables automatic shape cycling. Liquid Sculpture cycles a new formation every 14 simulation seconds.

Available formations are sphere, torus, helix, galaxy, wave and organic cloud. Palettes include glacier, nebula, ember, silver and a custom three-color gradient. Repeat a stop color to make a two-color gradient. Adjust fluid forces, shape restoring force, damping, morph duration, particle size, bloom, trails, exposure and rotation independently. Advanced stability controls bound acceleration, velocity and the soft world-space boundary.

Drag to orbit and scroll to zoom. Camera distance is adjustable; **Reset camera** restores its framing. **Enter exhibition** makes only the rendering surface fullscreen and suppresses captions, control panels and attractor debug geometry. Press **Escape** to return. An invisible focusable **Exit exhibition** button is available to keyboard users. A denied fullscreen request reports a local UI error without affecting the serial transport.

**Show attractor debug** adds a wire sphere centered at the mapped attractor with the force-radius setting. It is always hidden in exhibition. This is radar presence/planar target interaction, not hand, finger or skeletal tracking.

**Save locally** stores a named configuration in this browser origin. **Load saved preset** restores it. **Export configuration / Import configuration** use a versioned `mr60-particles` JSON file so settings can move to another PC. Imports validate enums, finite values, force bounds, color syntax, depth ordering and file size before changing settings. **Reset particle defaults** affects particle settings only, leaving the radar connection and diagnostic calibration intact.

## Coordinates and calibration

| Space | Source and meaning |
|---|---|
| Radar metres | `InteractionState.primary` and `velocity`: original filtered native X/Y in m and m/s |
| Normalized interaction | Horizontal X maps the calibrated ±range to [0,1]; depth maps adjustable near/far metres to [0,1] |
| World 3D | Horizontal becomes world X across 8 units × world scale; depth becomes world Z across 6 units × world scale; attractor Y starts at zero |
| Phase 1 screen | `InteractionState.screen` is retained as the existing normalized screen mapping, separate from world depth |
| Rendered screen | Three.js camera projects world XYZ into canvas pixels; orbiting the camera does not alter radar values |

By default **Use diagnostic calibration** follows Phase 1 X/Y inversion and current horizontal range. The existing 3 m range and X inversion are preserved. Disable it to configure independent inversion and horizontal range for the particle adapter. Near/far depth, world scale, attraction radius, sensitivity, smoothing and movement dead zone remain independently adjustable. These settings do not reconfigure the radar or invent confidence values.

Entry, exit, approach, motion and missing data use exponential interpolation. A fresh tracked/held primary with presence not explicitly false can influence the engine; absent/unavailable/stale/disconnected input fades forces toward idle. A snapshot that stops arriving for 1.5 seconds also fades out. Input receipt uses a monotonic renderer clock, so relative replay timestamps work without being mistaken for old wall-clock dates. Paused replay holds visitor position while motion energy decays. It never pauses rendering. A rapid intensity threshold crossing can emit a bounded pulse with a 900 ms cooldown.

Moving toward the sensor compresses the target sculpture and modestly increases light/attraction. Moving away expands it. Horizontal motion shifts the attractor, steers local flow and creates vortices. Idle remains a softly rotating sculpture with low curl flow. Position and velocity values are never reset because of a missing packet.

## Rendering capability and quality

The renderer requires WebGL2. It tests extension availability **and framebuffer completeness** for floating-point targets. Float32 GPU state is preferred; float16 is used if only that format renders successfully. If neither is supported, an explicit **CPU fallback** uses a reduced 10,000-particle batched simulation. If WebGL2 itself is unavailable, the page reports it and offers retry; Phase 1 diagnostics remain available.

| Profile | Default count | Maximum pixel ratio | Bloom resolution fraction |
|---|---:|---:|---:|
| Low | 10,000 | 0.8 | 0.25 |
| Medium | 30,000 | 1.0 | 0.35 |
| High | 60,000 | 1.25 | 0.5 |
| Ultra | 100,000 | 1.5 | 0.5 |

Actual pixel ratio also respects device DPR and a canvas-width limit. Changing quality chooses that count; count can then be overridden separately. Count changes reallocate simulation buffers and restart the population. Preset/formation changes do not. Automatic adaptation changes resolution only, after sustained load: five seconds below 48 FPS can lower DPR, fifteen seconds above 58 can raise it, with a twelve-second cooldown. It does not change counts every frame. Disable it for reproducible benchmarks.

FPS/frame-time/P95 are host frame measurements. GPU milliseconds appear only when the disjoint timer extension supplies valid results; otherwise the UI explicitly says unavailable. Texture and draw counters come from Three.js. A software GPU such as SwiftShader is reported with a warning. It is not representative of an RTX 4060. Enable browser hardware acceleration and verify the displayed GPU renderer on the exhibition PC.

See [particle architecture](particles-architecture.md), [benchmark results](particles-performance.md) and the [manual visual checklist](particles-acceptance.md).
