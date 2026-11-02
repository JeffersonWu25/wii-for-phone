# Evaluations

## P3 Renderer look (evaluator brief 06, Sonnet, read-only)

Verdict: **A (textured sprites) is the base, 805 vs 660.** Graft B's gravity streaks. Fix A's sprite count, road clipping, level-3 glow wash and frame-rate flicker.

Evaluator report, unedited:

All 15 screenshots viewed for both candidates and compared in pairs against ref-sparks.jpg. Both driftSparks.js and kartMesh.js read in full. No files edited.

### 1. Score table (rubric "P3 Renderer look")

| # | Criterion | Wt | A | B | A wtd | B wtd | Reason |
|---|---|---|---|---|---|---|---|
| 1 | Matches reference | 25 | 8 | 5 | 200 | 125 | A: additive ground glow plus white-hot core plus colored halo bolts plus streaks, at both rear wheels, close to the reference's glowing arcs. B: flat jagged ribbons with a thin colored fringe. Little glow, reads as paper-cut zigzags, not light. |
| 2 | Growth | 20 | 8 | 7 | 160 | 140 | A: size, opacity, bolt count, glow and streak length all step up, and L0 is tiny and faint. B: arc count and length grow clearly, but L0 and L1 look similar and its glow barely registers. |
| 3 | Color | 15 | 9 | 5 | 135 | 75 | A: blue, orange and purple read clearly. B: the white core dominates, so L1 looks near-white, L2 peach-white and L3 pink-white. Boost flames are identical and correct in both (blue, orange, purple cones). |
| 4 | Motion | 10 | 8 | 9 | 80 | 90 | A: arcs re-roll on dt timers and streaks are dt-driven, but glow flicker uses per-frame Math.random. B: all dt-driven, with streaks under gravity and a bounce plus sin flicker. The 100 ms shots differ in both. |
| 5 | Drift body | 10 | 8 | 9 | 80 | 90 | Both yaw and lean, ease through DRIFT_EASE, and mirror for dir=-1. B sets rotation.order='YXZ' so the yaw and lean compose cleanly. A uses the default order. |
| 6 | Visible in play | 10 | 9 | 5 | 90 | 50 | A: clearly purple and glowing in the chase and the 4-up. B: small, thin, pale pink lines that are easy to miss in the 4-up. |
| 7 | Hygiene | 10 | 6 | 9 | 60 | 90 | A: each kart builds 34 sprites with 34 SpriteMaterials, about 136 draws in a 4-kart game. onBeforeRender is hooked on every sprite, and it hides on no-drift. B: one dynamic BufferGeometry (1 draw) plus one glow mesh per kart, shared materials, and a no-alloc rewrite of preallocated buffers. Neither disposes its textures (the scene-wide traverse disposes geometry and materials, so that is fine). |
| | **Total (max 1000)** | | | | **805** | **660** | |

### 2. Verdict

A is the base. It is the only candidate that actually looks like the reference: glowing, saturated, level-colored electric arcs with a hot core. They stay visible from the chase camera and in the 4-up. B is cheaper and has nicer motion, but its colors wash out to white and the effect is too thin to read at gameplay distance. Those are rubric criteria 1, 3 and 6, which carry 50 of the 100 weight points.

### 3. Graft plan (from B into A)

- **Gravity streaks.** B's `launchStreak` and its streak loop, `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a5dc0ee0da23fba7b/host/src/games/kart/scene/driftSparks.js` lines 240-253 and 290-322. They give velocity, GRAVITY=9 and a ground bounce, so streaks arc and fall like real sparks. A's streaks are straight, constant-speed sprites (A lines 213-237). This raises criterion 4 and a little of 1. Port it as per-streak position and velocity state on A's sprite pool. Do not port the ribbon geometry.
- **Optional hygiene graft, only if the fix in section 4 is judged too costly.** B's design of one preallocated BufferGeometry, vertex colors and shared materials (B lines 49-99, 171-213). It would lift criterion 7, but it means rewriting A's art, so prefer the section 4 fix.
- No other grafts. B's color ramp (`writeColors`, hot to level) is no better than A's halo/core tint.

### 4. Fixes A needs (A scores below 7 only on criterion 7)

1. **Cut sprite and material count.** In `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a8a8f93332db70de8/host/src/games/kart/scene/driftSparks.js`, lines 144-155 build a pool for each of the two wheels: 4 arcs at 2 sprites each, 7 streaks, plus glow and flash, giving 34 sprites and 34 materials per kart. Options:
   - merge halo and core into one texture per bolt, using white core plus colored halo via the color tint, which drops the 8 core sprites;
   - cut STREAK_POOL from 7 to 5, or build only the pool the level needs;
   - skip updates for karts outside any camera.
   This brings A close to 20 sprites per kart.
2. **Hard horizontal clip at the road.** `drift3-rear-100ms.png` (A) shows bolts and glow sliced flat around y=650. The bolt halos (made with makeSprite(..., true), lines 145-146) depth-test against the asphalt because a sprite centered at py=0.28+ can dip below y=0 on the tall halo texture. Fix by raising py (line 202) by `len*0.25`, or set depthTest false on the arc halos like the glow, or use a small polygonOffset.
3. **Level 3 glow washes the tires and body to purple.** The no-depth-test glow at GLOW_OP[3]=1 (line 15) draws over the tire in the `quarter` and `left-rear` shots. Lower GLOW_OP and GLOW_SIZE at level 3 (for example 0.7 and 2.4), or keep depthTest on for the glow and fix its hard-cut edge by raising it slightly. Both fixes are small constant edits in the `GLOW_OP`/`GLOW_SIZE` tables (lines 14-15).
4. **Glow flicker is not dt-driven.** `updateWheel` lines 165-168 call Math.random every frame, so flicker speed follows the frame rate. Drive it from an accumulated time, or hold the random value on the same dt timer as the arcs.

## P2 Physics (evaluator brief 07, Sonnet, read-only)

Verdict: **B (slip-angle) is the base, 895 vs 855.** No code grafts from A. B needs its drift turn range widened so a drift can follow every corner on the real track, including the R85 sweeper. The orchestrator added that as a must-have to the build brief, because a drift that can't be held through the real corners fails the user's goal even when the flat-road probe passes.

Evaluator report, unedited:

**Verdict: B (slip-angle) is the base, 895 to 855.** Both pass all their tests and the flat-road probe. B wins on correctness: A has a boost bug and a pad rule that breaks the rubric. A's drift is a little easier to control on the real track. I edited no repo file; my scratch scripts are `corners.mjs`, `corners2.mjs` and `speedout.mjs` in the scratchpad folder.

### 1. Score table

Tests: A 61/61 pass, B 60/60 pass. `grep` for `gas`, `respawn`, `stuck` and `lastCheckpointIndex` in `physics.js`, `race.js` and `autopilot.js` returns nothing in either candidate.

| # | Criterion | Wt | A | B | A wtd | B wtd | Reason |
|---|---|---|---|---|---|---|---|
| 1 | Contract | 15 | 10 | 9 | 150 | 135 | Both match the contract. B adds an extra `kart.slip` field, which is harmless but not in the contract. |
| 2 | Drift rules | 20 | 8 | 9 | 160 | 180 | A: if speed drops below 8 while drift is still held, `endDrift(kart, brake === 0)` fires the boost. I confirmed it by running it: the slide ends with boost 1.48 and level 2. A's own test is named "no boost" but only covers an uncharged slide. A also restarts a fresh slide right after a wall cancel if drift is still held. B grants a boost only on a real button release. |
| 3 | Charge and boost | 20 | 8 | 10 | 160 | 200 | Both hit levels at 1, 2 and 3 s, with time and top speed rising strictly. A's pad logic keeps `boostLevel` when a pad tops up a running drift boost. Hitting a pad during a level-1 boost then gives top 1.3 instead of the pad's 1.45, and `boostLevel` is not 0. B sets level 0 when a pad takes over and never shortens a running boost. |
| 4 | Feel | 20 | 8 | 8 | 160 | 160 | See below. |
| 5 | Reverse | 10 | 10 | 10 | 100 | 100 | The probes are identical: -6 m/s, then 17.53 m/s after release. |
| 6 | Race | 10 | 10 | 10 | 100 | 100 | The stuck timer and both respawn paths are gone. `wrongWay` still sets. Finished karts get `throttle: 0`. The 3-lap autopilot race passes. |
| 7 | Code quality | 5 | 5 | 4 | 25 | 20 | A is a compact, in-place edit with one `endDrift` helper. B adds `updateDrift` and a second integration branch inside `stepKart`, which is bigger and duplicates some code. |
| | **Total** | | | | **855** | **895** | |

Criterion 4 detail:
- **Probe on a flat road:**
  - A: slip 25°, radius 13.3 m against 17.95 m for plain steering, speed ratio 0.93.
  - B: slip 29.8°, radius 11.6 m, speed ratio 1.06.
  - Both clear the rubric bars.
- **On the real track:** neither can hold a drift all the way through the real corners. B is tighter and more aggressive; A is gentler.

### 2. Track measurements

Setup: the kart starts at the start of each corner piece at 20 m/s on the centerline. The autopilot steers, with drift held on top of it. In the `drift` mode, drift is held the whole corner. In the `tap` mode, drift is held only while |lateral| is under 0.7 of the half-width, and it re-engages under 0.3. Time is measured from the start to the end of the piece. `maxLat` is |lateral| divided by the road half-width, so anything above 1.0 is off the road. A "hit" is a single-step speed drop over 0.6 m/s. The plain row is identical for both candidates.

| Piece | Mode | A time / exit m/s | A maxLat / offroad / maxSlip / lvl | B time / exit m/s | B maxLat / offroad / maxSlip / lvl |
|---|---|---|---|---|---|
| t1 (R40) | plain | 3.08 / 21.2 | 0.12 / 0% / 3° / 0 | same | same |
| t1 | drift (held) | 2.83 / 13.1 | 1.38 / 24% / 15° / 2 | 3.00 / 10.9 | 1.72 / 38% / 30° / 2 |
| t1 | tap | 2.68 / 28.6 | 0.95 / 0% / 15° / 1 | 2.63 / 21.8 | 0.92 / 0% / 30° / 1 |
| sLeft (R50) | plain | 1.92 / 21.5 | 0.15 | same | same |
| sLeft | drift (held) | 1.90 / 21.5 | 0.99 / 0% / 14° / 1 | 1.87 / 15.4 | 1.38 / 20% / 30° / 1 |
| sLeft | tap | 1.88 / 25.1 | 0.96 / 0% | 1.77 / 26.1 | 1.02 / 10% |
| sRight (R50) | drift (held) | 1.90 / 21.5 | 1.00 / 1% | 1.85 / 16.0 | 1.37 / 19% |
| sRight | tap | 1.88 / 25.2 | 0.97 / 0% | 1.77 / 26.5 | 1.04 / 15% |
| hill (R30) | plain | 2.37 / 20.7 | 0.13 | same | same |
| hill | drift (held) | 2.25 / 21.4 | 0.69 / 0% / 17° / 2 | 2.10 / 21.5 | 0.51 / 0% / 30° / 2 |
| sweeper (R85) | plain | 12.37 / 22.0 | 0.09 | same | same |
| sweeper | drift (held) | 42.9 / 2.3 | 2.72 / 96% off, 22 wall hits | 45.6 / 2.3 | 2.72 / 97% off, 23 wall hits |
| sweeper | tap | 12.37 | never engages, same as plain | 12.37 | never engages, same as plain |

Lap times:

| Lap | A | B |
|---|---|---|
| Plain autopilot, 3 laps | 36.88 / 36.42 / 36.42 | 36.88 / 36.42 / 36.42 |
| Tap-drift bot (drifts the arcs), 3 laps | 39.12 / 38.68 / 38.65 | 37.98 / 37.38 / 37.40 |

Reading the numbers:
- **Walls:** neither drift hits a wall in a held drift on any corner below R85.
- **Held drift:** neither can hold a full drift through t1 (R40) or the sweeper (R85). Both leave the road.
- **Why B is worse on t1:** its minimum turn rate while sliding is about 0.66 rad/s, which is R30 at 20 m/s. The cause is that its steer-out factor is `1 + 0.4*steer*dir`, so the 0.2 floor in the code is never reached.
- **Why A is worse on the sweeper:** its minimum turn rate is roughly 0.55 rad/s, so it also cannot widen enough.
- **Tap lines:** A stays on the road everywhere. B clips the edge on the S-bends, with 10 to 15% of time off-road and maxLat 1.02 to 1.04.
- **Laps:** neither candidate beats plain steering for this bot. The bot is crude, so this says little about a human.

### 3. Verdict

B is the base. It has no boost bug, its pad rule matches the rubric exactly, and its drift boost is granted only on a real button release. A is easier to control on tight S-bends and writes less code, but its speed-out boost and pad rules are wrong. They are two small fixes, but together with the pad rule they cost 40 points.

### 4. Graft plan

None qualifies as a code graft.
- A's wall-cancel (`DRIFT_WALL_CANCEL`, `endDrift` in the wall block) is not in the rubric, and it makes drifting harsher.
- A's gentler turning is not separable from its grip model.
- B's own tests already cover the same behaviors.

### 5. Fixes the base (B) needs

1. **Tighter-than-track drift (physics.js, `DRIFT_TURN` and `DRIFT_STEER_MOD`, about lines 26 to 29 and 143).**
   - Steering fully out cannot drop below about 0.66 rad/s, so a held drift on t1 reaches lateral 1.72 and spends 38% of the corner off-road.
   - Make the steer-out floor reachable by raising `DRIFT_STEER_MOD` to about 0.7 to 0.8, so the 0.2 floor is hit at full steer-out. Alternatively lower `DRIFT_TURN` to about 0.9.
   - Re-run the track script afterwards. Aim for maxLat of 1.0 or less on the S-bends in tap mode, while keeping the flat-road radius within 1.3x plain, slip over 15° and a speed ratio of at least 0.8.
2. **`DRIFT_SLIP` is 30° (`DRIFT_SLIP = 0.52`).** Consider 22 to 25° if the S-bend edge clipping persists. This is optional.
3. **`kart.slip`** is an extra kart field outside the contract. Add it to the contract notes in `RUN.md`, or keep it private to physics. The renderer must not depend on it.

I found no NaN risk in either candidate. `drift` undefined, `steer`/`brake` undefined and `dt` safety all behave. Drift state on finish is fine: `throttle: 0` and `drift` undefined end the slide and coast. B also grants a boost on that forced release, which is harmless.
