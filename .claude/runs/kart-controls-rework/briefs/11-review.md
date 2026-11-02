# Brief 11: code review of the kart controls rework

You are the code reviewer. You did not write any of this code. You only review; you edit no files.

What the change is for: the Kart Racer phone controls now work like Mario Kart. The phone has no GAS button (the kart always accelerates), a 2D free stick (X steers, pushing down brakes then reverses), a hold DRIFT button and a placeholder USE ITEM button. Holding drift while steering at speed slides the kart and charges a mini-turbo in three levels (1, 2, 3 s). Releasing fires a level-based boost. Pushing the stick down cancels the drift. While charging, electric sparks flicker at the rear wheels, colored per level. Boost flames take the level color. Respawns were removed; the WRONG WAY banner stays. The contract between parts is in `.claude/runs/kart-controls-rework/RUN.md`.

Diff to review, in the main checkout `/Users/jeffersonwu/Desktop/projects/wii-for-phone`:
`git diff feat/kart-split-screen...feat/kart-controls-rework -- host phone relay`
Read every changed file in full, not only the hunks, so you see the surrounding style.

Look for, in order of importance:
1. Bugs: wrong behavior against the description above, state that can get stuck (a drift or brake that never releases, a pointer that never frees, a boost level that never resets), NaN or undefined paths, races between the 20 Hz stream and immediate sends, split-screen or multi-kart problems, anything that breaks when `kart.drift` is missing, disposal or memory leaks in the renderer.
2. Dead code and leftovers: unused exports, constants, parameters or branches; anything still referencing `gas`, `respawn`, `stuck`, `lastCheckpointIndex`, `#btn-gas`; leftover debug hooks or logging. The preview poses (`?drift=`, `?boost=`) and the `driftRear`/`driftQuarter` shots are intentional dev tooling; judge whether they are clean, not whether they exist.
3. Missing tests for behavior the code claims (pure functions in `physics.js`, `race.js`, `joystick.js`).
4. Style that doesn't match the surrounding code: comment density, naming, section banners, idioms.

Run the unit tests: `node --test host/src/games/kart/*.test.mjs phone/src/games/kart/*.test.mjs` and `cd relay && node --test`.

Report: a numbered list of findings, most severe first. Each finding has: severity (bug, cleanup, test, style), file and line, what is wrong, a concrete failure scenario for bugs, and the fix you suggest. Say plainly when you checked an area and found nothing. Do not pad the list.

---

## Final report (unedited)

Review of `feat/kart-controls-rework` against `feat/kart-split-screen` (host, phone, relay). I read every changed file in full. Tests: `node --test host/src/games/kart/*.test.mjs phone/src/games/kart/*.test.mjs` passes 70/70, and `cd relay && node --test` passes 11/11. I edited no files; my repro script is in the scratchpad.

Findings, most severe first:

1. **bug** `host/src/games/kart/physics.js:85-88` (`updateDrift`). A drift release can downgrade a boost that is already running.
   - On release at level >= 1, `kart.boost = Math.max(kart.boost, ...)` keeps the longer timer. But `kart.boostLevel = d.level` is set unconditionally. So a lower-level release during a longer or higher boost lowers the level for the rest of that boost.
   - Failure scenario, which I reproduced: `boost=1.9, boostLevel=3`, then a level-1 slide releases. Result is `boost=1.88, boostLevel=1`.
   - Effects: top speed drops from `DRIFT_BOOST_TOP[2]` (1.6) to `[0]` (1.3), and the flames recolor from purple to blue mid-boost.
   - The same thing happens after a boost pad: pad boost 1.2 s (top 1.45), then a level-1 release gives top 1.3 and blue flames. That is the "pad never shortens" rule broken in the other direction.
   - Fix: only set `boostLevel` when the new boost wins. For example, `const t = DRIFT_BOOST_TIME[d.level-1]; if (t >= kart.boost) { kart.boost = t; kart.boostLevel = d.level; }`. If you want the best top speed, compare the top multipliers instead.
   - The test at `physics.test.mjs:280` does not catch this. Its first half sets `boostLevel = 2` with `boost = 0`, so it checks nothing. Its second half only covers a pad against a level-3 boost.

2. **test** `host/src/games/kart/physics.test.mjs:280-291`. Add a test for finding 1: a drift release while a longer or higher boost runs must keep that boost's level and timer. Also fix or drop the first half of the existing test, which is vacuous.

3. **cleanup** `host/src/games/kart/race.js:11,106`. `MAX_JUMP` and the comment "teleport: no gates, no progress" are leftovers from respawn.
   - Nothing can teleport a kart now. The guard still protects against `track.project` wrapping, so I would keep it but reword the comment.
   - The test `race.test.mjs:64` ("teleporting past checkpoints") only exercises it by hand-editing `kart.s`.
   - Also in `race.js:75-80`, the `moved` array holds `prevS` values. Rename it to `prevS` or inline it.

4. **cleanup** `host/src/games/kart/physics.js:71,90`. `kart.airborne` is created `false` and read in `updateDrift`, but nothing in `host/src` ever sets it. The `!kart.airborne` check is dead, and the field is a stale leftover. Remove both, or set it where it is meant to be set.

5. **cleanup** `host/src/games/kart/scene/driftSparks.js:143-144,169-171,192`.
   - Arc pools start with `len: 0`, no `shape`, and `d.dx/dy/dz = 0`, so the defensive `arc.shape ?? 0` and `arc.len || ARC_LEN[level]` paper over a first frame that draws an undirected bolt (arc timers start at `rnd()*0.08`).
   - Fix: initialize each arc with `t: 0` so the first update rolls a bolt, then drop the two fallbacks.
   - `makeSprite` takes a `depthTest` parameter and the comment about billboards through the road is duplicated, once at `:114` and once at `:123`.

6. **cleanup** `host/src/games/kart/scene/driftSparks.js:113-124`. Math.random and a seeded `rnd` are mixed. `rnd` drives textures and initial timers, and `Math.random` drives live effects. That is fine, but a one-line comment at `rnd` saying it is for textures only would help.

7. **cleanup** `phone/src/games/kart/index.js:63`. `moveStick` clamps with `clampToRadius`, and then `stickFromOffset` clamps again internally. This is harmless duplication. `stickFromOffset` could take the raw offset, with only the knob position clamped.

8. **cleanup** `phone/src/games/kart/index.js:97-99,150-152`. `lostpointercapture` is not handled for the stick, drift or item pointers. Pointer capture plus `pointerup`/`pointercancel` is enough on modern browsers, and the portrait branch releases drift and stick. I found no stuck state: a drift, a brake or a pointer cannot persist past `pointerup`, `pointercancel` or a rotation to portrait.
   - Nit: `releaseStick` does not send immediately, so the neutral state reaches the host up to 50 ms later, on the next 20 Hz tick. `setDrift` does send immediately. This is not harmful.

9. **bug (minor)** `host/src/games/kart/KartApp.jsx:75-80,193-198`. `phoneInputs[id]` keeps the last `drive` packet forever. A phone that stops sending without disconnecting (backgrounded tab, frozen browser) leaves the kart steering, braking or drifting at the last values until the relay reports a disconnect. This was the same with `gas` before the rework, but a held drift now charges and then boosts on its own.
   - A cheap fix is to timestamp packets and fall back to `IDLE` after about 500 ms of silence.

10. **style/cleanup** `host/src/games/kart/physics.js:188`. After a wall hit, `kart.speed` is recomputed as the projection of velocity on the heading. While sliding, the heading is up to 30 degrees off the velocity, so one wall hit costs an extra `1 - cos(slip)`, about 13%, of speed. `slideHeading` then reuses `kart.speed` as the velocity magnitude. If you want it exact, use `Math.hypot(vx, vz)` while `kart.drift.sliding`.

11. **test** Missing coverage. These are claimed behaviors with no tests:
    - `autopilot.js` has no test of the new input shape.
    - Keyboard and phone input mapping in `KartApp` (clamping of `brake` and `steer`, `drift === true`) is untested. That is acceptable for a React effect, but the clamping could be a pure function.
    - Nothing exercises `createKartMesh`/`updateKartMesh` with `kart.drift` missing (the `IDLE_DRIFT` path). It reads correctly: `kart.drift ?? IDLE_DRIFT`, and `drift.level | 0` guards `NaN`.

12. **style** Minor items.
    - `KartApp.jsx:17` has a comment, "Gas is always on...", that is useful, but the word "Gas" is now a stray concept. Reword it to "The kart always accelerates".
    - `kartMesh.js:7-8` module-level `let flameGeo` and `shadowMat` caches are fine. `flameGeo` is shared across karts, and the scene `dispose` traversal disposes it per kart. Three.js re-uploads on reuse, so this is harmless.
    - Section banners match the surrounding style.

Areas checked with nothing found:
- **Leftover references:** a grep for `gas`, `respawn`, `stuck`, `lastCheckpointIndex` and `btn-gas` over `host/src`, `phone/src` and `relay` finds nothing live. The only hits are the two test names in `race.test.mjs` ("a stuck kart stays where it is: no respawn", "never respawns"), which are intentional. Stale GAS references remain in `.claude/skills/verify/SKILL.md:73` (`#btn-gas`) and in old verify artifacts (`artifacts/kart-split/frames.jsonl`). The harness brief (10) covers these.
- **Debug logging:** no stray `console.*` in the kart code. Relay logging is pre-existing.
- **Relay:** `use_item` and `drive` are in the `PHONE_TO_HOST` allowlist (`relay/server.js:8`), and the host ignores `use_item`.
- **Drift state machine:** release, brake cancel, speed drop and re-grab all reset `{sliding, dir, charge, level}`. A finished kart gets `{steer:0, throttle:0}`, so its drift ends and it coasts. `boostLevel` resets to 0 whenever `boost` reaches 0. I found no stuck drift, brake or boost level.
- **NaN paths:** physics, joystick and sparks clamp their inputs. The `slideHeading` fallback heading covers a velocity below 0.5 m/s.
- **Split screen:** `aimAtCamera` runs per draw, so each camera gets its own sprite rotation. Each kart owns its own sprites and materials. The scene dispose traversal frees them. The module-level canvas textures are cached across scenes and not disposed, which is fine because they are shared and tiny.
- **Preview poses and shots:** `?drift=`, `?boost=`, `driftRear` and `driftQuarter` are clean. The pose freezes the race step, and the helper lives only in the preview.
- **Phone CSS:** the `#btn-drift` and `#btn-item` styles are consistent, and the old gas rules are gone.
