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
- All five subagents stopped early on an API rate limit (5-hour limit, reset 21:00). Their work was kept in their worktrees.
- 22:37 Found that four of the five worktrees were cut from `main` (07f8950) rather than this branch. Every file the agents own is identical on `main` and this branch, so the work stands. Look A had copied split-screen files and the run folder in by hand. It was told to undo every edit outside its owned files and merge `feat/kart-controls-rework` instead. The others were told to merge the run branch. All five resumed with SendMessage after the limit reset.
- 22:38 P1 phone finished (Sonnet, worktree agent-a960…). Orchestrator reviewed the diff: GAS gone, radial clamp and radial dead zone, `stickFromOffset` pure and tested, DRIFT hold with pointer capture, ITEM one message per press, ids kept. The screenshot shows the clamped knob, a lit DRIFT and ITEM above-inward. Its note that `instance.mjs` lacks `VERIFY_PORT_OFFSET` is explained by the main-based worktree. Folded in by cherry-picking 21e4201 (as 22d13a6). Unit tests pass (51). Worktree removed.
- 22:39 P2 candidate A (grip model) finished at 66b7905. Probe: slip 25°, drift radius 13.3 m vs plain 18.0 m, speed kept 0.93 (plain 0.96), boost peaks 28.5 / 31.9 / 35.2 m/s for levels 1 to 3. 65 tests pass. Waiting for candidate B before the evaluator runs.
- 22:40 P3 candidate A (textured sprites) finished at 5dbb40b, only its two owned files plus evidence changed. Orchestrator looked at the four rear shots: levels grow clearly, colors right, white cores present.
- 22:41 P3 candidate B (procedural geometry) finished at 7533d62. Both look candidates are in; starting the look evaluator.
- 22:41 Started P3 look evaluator (Sonnet, read-only, no worktree): brief 06.
- 22:41 P2 candidate B (slip-angle) finished at 161b75f. Orchestrator re-ran the probe on both candidates; outputs saved to evidence/p2/probe-a.json and probe-b.json. Both pass their own tests. Starting the physics evaluator.
- 22:42 Started P2 physics evaluator (Sonnet, read-only, no worktree): brief 07.
- 22:44 P3 evaluation recorded in evaluation.md: A is the base (805 vs 660). Created worktree `.claude/worktrees/look-build` (branch `build/look`) from this branch myself and cherry-picked A's commit 5dbb40b (as d1b3f53), so the build starts on the right base. Started the look build (Sonnet, brief 08).
- 22:46 P2 evaluation recorded: B is the base (895 vs 855), no grafts. Kept the evaluator's real-track script as `tools/track-drift.mjs` for acceptance. Created worktree `.claude/worktrees/physics-build` (branch `build/physics`) and committed B's five files from 161b75f onto this branch (as 086bb17). 68 tests pass there. Started the physics build (Sonnet, brief 09). Decision: a held drift that can't follow the real corners is a must-fix, not optional tuning, because it is the core of what the user asked for.
- 22:46 Look build finished at 18b448f: gravity streaks grafted, YXZ order, 34 to 20 sprites per kart, no road clip, softer level-3 glow, time-driven flicker. The subagent had not viewed 9 of its 15 shots, so the orchestrator viewed the rear 0 to 3, quarter, left-rear and boost shots. Levels read clearly, colors match, no clipping, the body is no longer washed. Noted as rough: the existing boost flame cones look like downward fangs from the close rear camera (pre-existing geometry, only recolored here). Cherry-picked d1b3f53 and 18b448f onto this branch. Tests pass. Look worktrees can go.
- 22:48 Physics build finished at 63a2a43. The orchestrator re-ran the tests (70 pass) and `track-drift.mjs`: every held-drift corner stays on the road (maxLatFrac 0.09 to 0.13, no hits, sweeper reaches level 3). The diff review found the refactor kept behavior, and the steer range is 0.15 to 1.9 rad/s. Cherry-picked 086bb17 and 63a2a43 (as aa187fb, 5b628b2). Relay tests pass (11). All candidate and build worktrees removed; candidate branches kept locally for the record.
- 22:49 All parts assembled on the branch. Started P5 harness (Sonnet, brief 10, worktree `.claude/worktrees/harness-build`, branch `build/harness`, port offset 400) and the code reviewer (Sonnet, brief 11, read-only) in parallel.
- 22:53 Code review finished: 12 findings (2 bugs). The orchestrator fixed 1, 2, 3, 4, 5, 6, 9, 10 and 12, fixed part of 8, and left 7 and 11 with reasons. All recorded in review.md. Tests 71/71, relay 11/11, host build passes. The harness worktree was cut before these fixes; it will be rebased on them before its drives count.
- 23:11 Harness finished at 1e41614: kart-race and kart-split no longer use GAS, new `kart-drift` feature (drive entry, `features/kart-drift.md`, `artifacts/kart-drift/`), README and SKILL.md updated. Cherry-picked onto this branch on top of the review fixes (as 77fe8cf). Harness worktree removed.
- 23:11 Validation on the final branch: the orchestrator relaunched the offset-0 instance and ran all six drives, all exit 0. join-lobby 11 PASS, select-game 4, bowling-throw 9, kart-race 28, kart-split 63, kart-drift 20, with 0 FAIL. The orchestrator also viewed the kart-drift host shots: the sparks show from the gameplay camera at every level, small and faint at 0, then blue, orange and purple, though small in the 2-player split. The boost flames read small. Brake-cancel and reversing frames look right. Unit tests 71/71, relay 11/11.
- Harness cleanup: no throwaway scripts were added to the harness. The preview poses and the `driftRear`/`driftQuarter` shots stay as documented dev tooling (the reviewer judged them clean). The shared evidence tools stay in the run folder so the evaluations can be rerun. A grep for GAS and respawn finds only deliberate "no GAS / no respawn" checks and docs. No stale artifacts: every file under `artifacts/` was rewritten this run.
