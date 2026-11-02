# Run log: kart controls rework

Started 2026-11-02 on branch `feat/kart-controls-rework`, cut from `feat/kart-split-screen` (16f7617). The kart code this run changes lives on that branch. Orchestrator: Opus 5.5. Subagents: Sonnet.

## Scope

- Phone: no GAS button. 2D free stick (X steers, pushing down brakes then reverses). Hold DRIFT button. USE ITEM placeholder that sends a message the host ignores.
- Drift: hold drift while steering at speed to slide. Release for a level-based boost. Pushing the stick down cancels the drift with no boost.
- Charge levels by time held: 0 under 1.0 s, 1 at 1.0 s (blue), 2 at 2.0 s (orange), 3 at 3.0 s (purple). Tunable.
- Charge sparks: electric sparks under and beside the rear wheels, like the reference image (`ref-sparks.jpg`). Small and faint at level 0, then bigger, brighter and recolored per level.
- Boost flames use the boost level's color.
- No respawns: the stuck timer and the wrong-way respawn are removed. The WRONG WAY banner stays.
- Keyboard, autopilot and preview controls use the new input shape.
- Unit tests updated. Verify docs and drives for kart-race and kart-split no longer use GAS.

## Input and state contract (fixed up front so parts build in parallel)

- Phone to host: `{ type: 'drive', steer: -1..1, brake: 0..1, drift: bool }` at 20 Hz. `{ type: 'use_item' }` on tap, accepted and ignored by the host.
- Physics input: `{ steer, brake, drift }`. `gas` is removed. The kart always accelerates unless braking.
- Kart state owned by physics:
  - `kart.drift = { sliding: bool, dir: -1 | 0 | 1, charge: seconds, level: 0..3 }`. `level` is the current charge level while sliding.
  - `kart.boost` stays the boost timer (seconds left). `kart.boostLevel` is 0..3 (0 = boost pad or none).
- The renderer reads only `kart.drift`, `kart.boost`, `kart.boostLevel`, `kart.steerVis`, `kart.speed`.

Colors (shared by sparks and boost flames): level 0 `#fff4d6` faint, level 1 blue `#2f8cff`, level 2 orange `#ff8a1f`, level 3 purple `#c040ff`.

## Plan

| Part | Owner | Mode | Files |
|---|---|---|---|
| P1 Phone controller | 1 Sonnet subagent | single | `phone/src/games/kart/index.js`, `joystick.js`, `joystick.test.mjs`, `phone/src/style.css` |
| P2 Physics, race state, autopilot, tests | 2 competing Sonnet subagents, evaluator, base-build | competing | `host/src/games/kart/physics.js`, `race.js`, `autopilot.js`, `physics.test.mjs`, `race.test.mjs` |
| P3 Renderer look: charge sparks, drift lean, flame colors | 2 competing Sonnet subagents, evaluator, base-build | competing | `host/src/games/kart/scene/kartMesh.js`, new `scene/driftSparks.js`, `shots.js` / preview hooks for screenshots |
| P4 Host input wiring and keyboard | orchestrator or 1 subagent | single | `host/src/games/kart/KartApp.jsx`, `preview.js` |
| P5 Verify drives and docs | 1 Sonnet subagent after P1 to P4 land | single | `.claude/skills/verify/scripts/drive.mjs`, `features/kart-race.md`, `kart-split.md`, new drift feature |

Competing runs: P2 (core physics) and P3 (the look the reference image defines). P1 and P4 are plumbing with one clear approach.

## Timeline

- Branch cut. Run folder created. Plan written.
- Decision: physics input gets `throttle` (default 1) next to `steer`, `brake`, `drift`. Reason: with gas always on, finished karts and disconnected players still need to coast; `throttle: 0` does that without bringing `gas` back. Contract above is amended with it.
- Orchestrator edit: `host/src/games/kart/preview.js` gains fixed poses (`?drift=L&dir=D`, `?boost=L`) that freeze kart p1 on the start straight, and the keyboard map drops gas and adds Space/Shift drift. `shots.js` gains two close camera spots, `driftRear` and `driftQuarter`. Reason: both P3 candidates must be shot from identical spots.
- Orchestrator wrote two shared evidence tools: `probe-physics.mjs` (fixed drift, boost, brake-cancel, direction-lock, reverse and throttle scenarios on a flat stub road, prints JSON) and `pose-shots.mjs` (14 screenshots of the posed kart). Both smoke-tested on the baseline.
- `rubric.md` written before any competing run. Feel criterion 4 was tightened after the baseline probe showed plain steering already turns a 9.4 m radius at 20 m/s.
- 18:08 Briefs 01 to 05 written. Each subagent's prompt points it at its brief file in the main checkout (the brief file is the exact prompt). Starting 5 Sonnet subagents in parallel, each with its own worktree: 01 phone (single), 02 and 03 physics (competing A grip model, B slip-angle model), 04 and 05 look (competing A textured sprites, B procedural lightning geometry). Port offsets: look A 100, look B 200, phone 300.
- 18:09 Orchestrator edit (P4, small, one file): `KartApp.jsx` maps phone `drive` to `{ steer, brake, drift }`, keyboard drops ArrowUp/W gas and adds Down/S brake and Space/Shift drift, a racer with no input yet uses IDLE (drives, since gas is always on) and a disconnected racer uses COAST (`throttle: 0`). Also `relay/server.test.js` drive payload switched from `gas` to `brake`/`drift` (relay passes fields through unchanged; relay tests pass).
- 18:09 Orchestrator edit: `KartApp.jsx` debug snapshot (`window.__kartState.karts[i]`) also carries `vx`, `vz`, `boost`, `boostLevel` and a copy of `drift`, for the verify drives.
