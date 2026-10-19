# Manual exhibition acceptance checklist

Perform these checks on the intended Windows PC, GPU, browser and display. Automated shader/smoke checks do not establish artistic quality or a 60 FPS hardware guarantee.

## Visual quality

- [ ] Each of sphere, torus, helix, galaxy, wave and organic cloud reads clearly in idle.
- [ ] Particles are round with soft luminous edges, no visible square sprites or broken shader output.
- [ ] Glacier, nebula, ember, silver and custom gradients remain colored and retain internal detail; bloom does not create a white featureless core.
- [ ] Streamlines form smooth curls and coherent local vortices. Lower shape force and raise fluid speed briefly to confirm flowing motion, then restore the chosen sculpture balance.
- [ ] Slow rotation, orbit drag, camera distance and reset are smooth. Texture aspect and camera framing remain correct after resize and fullscreen.
- [ ] Trails fade shortly after motion; idle does not accumulate a persistent bright smear. Turning trails off clears history immediately on subsequent frames.
- [ ] Quickly switching all six presets and formations morphs from current state without positions snapping or returning to an initial seed.

## Interaction

- [ ] Test simulation first, then live USB with one visitor at measured locations, then a real recorded session.
- [ ] Verify X inversion against physical left/right and near/far depth against the current 3 m installation calibration.
- [ ] Debug attractor follows visitor position with correct force radius; it disappears in exhibition even when enabled in operator view.
- [ ] Entry increases activity gently; stationary input reforms the sculpture; walking laterally steers currents; approach compresses; retreat expands.
- [ ] A quick move gives a controlled pulse and temporary extra turbulence rather than a numerical explosion or permanent brightness increase.
- [ ] Presence exit, report loss, stale data and physical USB disconnection all fade toward idle without freezing rendering or jumping particle positions.
- [ ] Replay speed, pause, seek and restart work; pausing visitor input does not freeze the renderer.
- [ ] Switch between diagnostics and particles during USB streaming. Only one port reader remains active, and recording/replay controls still work.

## Performance and reliability

- [ ] Confirm the actual renderer name is the NVIDIA GPU and not SwiftShader/software. Use laptop AC power and intended display resolution.
- [ ] Run 10k, 30k, 60k and 100k through the benchmark command. Measure frame-time distribution and watch for sustained stalls or thermal throttling over at least 15 minutes.
- [ ] With adaptive resolution enabled, verify changes happen only after sustained slow/fast intervals, with no rapid profile oscillation.
- [ ] With adaptive disabled, record actual canvas pixel dimensions, DPR, bloom/trails and active input source alongside FPS.
- [ ] Test CPU fallback via `http://127.0.0.1:5173/?particleBackend=cpu#particles`; it should say CPU fallback and cap at 10k. Test a browser with hardware acceleration disabled separately if needed.
- [ ] Switch tabs for a minute, return, and confirm no catch-up jump. Resize/reconnect the display and confirm the canvas fits.
- [ ] In developer tools, lose/restore context using `WEBGL_lose_context` and verify status/recovery. Context restoration may restart the population.
- [ ] Repeat navigation and count changes. After cleanup/settling, GPU resources should remain bounded rather than accumulating on every preset selection.
- [ ] Save/reload a local preset, export/import it on another browser profile, reject invalid configuration files, then reset defaults.
- [ ] Enter and exit exhibition repeatedly, test Escape, and verify no dashboard overlay or debug sphere is visible in exhibition.

Record the operator, date, GPU/driver/browser versions, display resolution, module mounting and any acceptance exceptions. Live Phase 2 hardware interaction has not been exercised by the agent unless an explicit hardware-test report says otherwise.
