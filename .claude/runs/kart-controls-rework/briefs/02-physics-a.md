# Brief 02: P2 physics, candidate A (grip model)

You are one of two competing candidates for the kart physics. A separate evaluator scores both against `.claude/runs/kart-controls-rework/rubric.md` (section P2). Read it first; it is how you will be judged.

## Shared context (all parts)

User's goal: rework the Kart Racer controls to feel like Mario Kart. The phone loses its GAS button (gas is always on), gets a 2D free stick (X steers, pushing down brakes then reverses), a hold DRIFT button and a USE ITEM placeholder. Holding drift while steering at speed slides the kart and charges a mini-turbo: level 1 after 1.0 s of sliding (blue), level 2 after 2.0 s (orange), level 3 after 3.0 s (purple). Releasing drift fires a boost whose strength and length grow with the level. Pushing the stick down cancels a drift with no boost. While charging, electric sparks flicker under and beside the rear wheels, bigger, more intense and recolored as the level rises, like the reference image `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/ref-sparks.jpg`. Boost flames use the level color. Respawns are removed (stuck timer and wrong-way respawn); the WRONG WAY banner stays.

Fixed contract (other parts are being built in parallel against it, do not change it):
- Phone to host: `{ type: 'drive', steer: -1..1, brake: 0..1, drift: bool }` at 20 Hz, and `{ type: 'use_item' }` on tap. The relay already forwards both.
- Physics input: `{ steer, brake, drift, throttle }`. `throttle` defaults to 1 when missing; 0 means coast (finished karts, disconnected players). `gas` no longer exists.
- Kart state owned by physics: `kart.drift = { sliding: bool, dir: -1|0|1, charge: seconds, level: 0..3 }` (`level` is the current charge level while sliding, 0 when not sliding), `kart.boost` (seconds of boost left, existing), `kart.boostLevel` 0..3 (0 for boost pads or no boost).
- Level colors, used by sparks and boost flames: level 0 faint warm white `#fff4d6`, level 1 blue `#2f8cff`, level 2 orange `#ff8a1f`, level 3 purple `#c040ff`.
- The renderer reads only `kart.drift`, `kart.boost`, `kart.boostLevel`, `kart.steerVis`, `kart.speed`.

Rules:
- You work in your own git worktree on your own branch. Edit only the files you own (listed below). If you believe another file must change, stop and say so in your report instead of editing it.
- Match the surrounding code: comment density, naming, section banners, plain ES modules. No new dependencies.
- Unit tests: `node --test host/src/games/kart/*.test.mjs phone/src/games/kart/*.test.mjs` from the worktree root. Everything must pass.
- Your worktree has no node_modules. Symlink them from the main checkout before running anything that needs them: `for d in host phone relay; do ln -s /Users/jeffersonwu/Desktop/projects/wii-for-phone/$d/node_modules $d/node_modules; done`. Do not commit the symlinks.
- If you need the running app, launch your own verify instance from the worktree root with a port offset (given below): `VERIFY_PORT_OFFSET=<n> node .claude/skills/verify/scripts/instance.mjs launch`, and run `VERIFY_PORT_OFFSET=<n> node .claude/skills/verify/scripts/instance.mjs cleanup` when done. Never touch another instance or kill a process you did not start.
- Commit your work on your branch when done (message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push. Do not merge.
- Final report: the worktree path and branch, the commit sha, every file changed with one line each, every decision you made and why, the evidence (test output, probe or screenshot paths), and anything unfinished or uncertain.

## Your part

Files you own: `host/src/games/kart/physics.js`, `host/src/games/kart/race.js`, `host/src/games/kart/autopilot.js`, `host/src/games/kart/physics.test.mjs`, `host/src/games/kart/race.test.mjs`.

Your approach (A, grip model): keep the existing model where the velocity vector chases the heading (`GRIP_ROAD` catch-up) and make the drift out of it. While sliding, drop the grip to a drift value so the velocity lags the heading, add a yaw bias toward `drift.dir` so the kart keeps rotating into the turn, remap steer inside a drift so pushing into the turn tightens it and pushing out widens it but never reverses it, and cut the slip scrub so the slide keeps its speed.

Build:
1. Throttle: remove `gas`. The kart accelerates by `throttle` (default 1). `brake > 0` overrides throttle: slow down at `BRAKE * brake`, and once stopped reverse up to `REVERSE_TOP`. With `throttle: 0` and no brake the kart coasts as the old no-gas branch did.
2. Drift state on `createKart`: `drift: { sliding: false, dir: 0, charge: 0, level: 0 }` and `boostLevel: 0`.
3. Drift start: `drift` held, `|steer|` at or above a threshold (around 0.3), speed at or above a minimum (around 8 m/s), on the ground, not braking. `dir` = sign of steer at the start, locked until the drift ends. Holding drift without steering does not slide (it may start the slide later if steer is added while still held).
4. While sliding: `charge` += dt; `level` = 1, 2, 3 at 1.0, 2.0, 3.0 s (tunables). Decide and document whether going off-road or hitting a wall cancels or pauses the charge.
5. Drift end: drift released, speed below the minimum, or `brake > 0`. Release with `level >= 1` grants a boost: duration and top-speed multiplier rise strictly with level (tunables per level; the existing pad boost is `BOOST_TIME` 1.2 s at `BOOST_TOP` 1.45 for reference). Set `kart.boostLevel` to the level. Brake cancel and level-0 release grant nothing. Reset `drift` to its idle values.
6. `boostLevel` returns to 0 when `boost` runs out. Boost pads keep working; decide how a pad interacts with a running drift boost and document it (rubric expects pads to read as level 0).
7. All new constants go in the Tunables block with short comments in the existing style.
8. Race (`race.js`): remove the stuck timer, `respawn` and the wrong-way respawn, and their constants. Keep `wrongWayTime` and `wrongWay`. Finished karts get `{ steer: 0, throttle: 0 }`. Update the header comment.
9. Autopilot returns `{ steer }` only.
10. Tests: update existing tests to the new input; add tests for drift start conditions, direction lock, level thresholds, boost per level, brake cancel, reverse and resume, throttle 0 coasting, `boostLevel` reset, and that no respawn happens. Remove respawn tests.

Evidence: run the shared probe from your worktree root and include its full JSON in your report: `node .claude/runs/kart-controls-rework/probe-physics.mjs host/src/games/kart/physics.js`. Tune until your probe numbers meet rubric criterion 4. Also run the unit tests and paste the summary.
