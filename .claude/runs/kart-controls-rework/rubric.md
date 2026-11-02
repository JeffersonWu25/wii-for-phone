# Rubrics

Written before the competing runs start. Each criterion is scored 0 to 10, then multiplied by its weight. Weights sum to 100 per part, so the maximum is 1000.

## P2 Physics, race state, autopilot

Evidence: the candidate's diff, `node --test host/src/games/kart/*.test.mjs` output, and the shared probe script `.claude/runs/kart-controls-rework/probe-physics.mjs` run against the candidate's worktree.

| # | Criterion | Weight | How to check |
|---|---|---|---|
| 1 | Contract: input is `{ steer, brake, drift, throttle }` (`throttle` defaults to 1). No `gas` remains in physics, race or autopilot. Kart carries `drift = { sliding, dir, charge, level }` and `boostLevel`. | 15 | grep for `gas`; read `createKart`; probe prints the fields |
| 2 | Drift rules: a slide starts only with drift held, `|steer|` past a threshold and speed above a minimum. Direction locks at the start. Releasing ends it. `brake > 0` cancels it with no boost. Holding drift with no steer, or at low speed, does not slide. | 20 | tests plus probe cases |
| 3 | Charge and boost: levels at 1.0, 2.0 and 3.0 s of sliding. Level 0 release gives no boost. Boost duration and top speed rise strictly with level. `boostLevel` is set on release and returns to 0 when the boost ends. Boost pads still work and set `boostLevel` 0. | 20 | tests plus probe |
| 4 | Feel: while sliding, the velocity visibly lags the heading (max slip angle over 15 degrees in a held drift, clearly more than plain steering), the drift path radius is no larger than 1.3x the plain-steering radius at the same entry speed and full throttle, and speed stays at least 80% of entry speed through a 2 s drift (more than plain steering keeps). | 20 | probe `drift2s` vs `plain2s` |
| 5 | Reverse: `brake` slows the kart, stops it, then reverses up to `REVERSE_TOP`. Releasing brake resumes forward acceleration. | 10 | tests plus probe |
| 6 | Race: the stuck timer and both respawn paths are gone. The WRONG WAY flag still sets. Finished karts coast (throttle 0). Autopilot laps the track with the new input. | 10 | tests, grep `respawn` |
| 7 | Code quality: new tunables in the Tunables block with comments in the existing style, physics stays pure, no dead code, tests pass. | 5 | read diff |

## P3 Renderer look: charge sparks, drift lean, boost flames

Evidence: the same screenshots for both candidates, taken with `.claude/runs/kart-controls-rework/pose-shots.mjs` from the preview's fixed poses: `drift=0..3` at `shot=driftRear` and `shot=driftQuarter`, `drift=3&dir=-1&shot=driftRear`, `boost=1..3&shot=driftRear`, and `drift=3` in the default chase view. Compare against `ref-sparks.jpg`.

| # | Criterion | Weight | How to check |
|---|---|---|---|
| 1 | Matches the reference: electric sparks sit under and beside both rear wheels, with a bright near-white core, jagged arcs or streaks flying back and outward, and additive glow. Reads as sparks, not as a flat colored blob or smoke. | 25 | rear and quarter screenshots next to the reference |
| 2 | Growth: level 0 is small and faint. Each level is visibly bigger and more intense than the one before (size, count, length of streaks, glow). The four levels can be told apart without the color. | 20 | the four rear screenshots side by side |
| 3 | Color: level 0 faint warm white, level 1 blue `#2f8cff`, level 2 orange `#ff8a1f`, level 3 purple `#c040ff`. Boost flames use the same color for their level. | 15 | screenshots |
| 4 | Motion: sparks animate every frame (flicker, new arcs, streaks moving back). Not a static decal. Driven by `dt`. | 10 | two screenshots 100 ms apart differ, read code |
| 5 | Drift body: the kart yaws into the drift and leans, mirrored for `dir = -1`, eased in and out through `steerVis` or a similar smoother. | 10 | `dir=1` vs `dir=-1` screenshots |
| 6 | Visible in play: in the default chase view at level 3, the sparks are clearly visible from the gameplay camera, including in the 4-way split screen. | 10 | chase screenshot |
| 7 | Hygiene: no geometry or material created per frame, effects hidden when not drifting or boosting, disposal handled where the mesh is disposed, cost stays small with 4 karts. | 10 | read diff |
