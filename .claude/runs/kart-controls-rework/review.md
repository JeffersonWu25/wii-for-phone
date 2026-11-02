# Code review

Reviewer: Sonnet subagent, brief 11, read-only. It wrote none of the code. Diff reviewed: `git diff feat/kart-split-screen...feat/kart-controls-rework -- host phone relay`. Tests at review time: 70/70 kart, 11/11 relay.

Each finding is listed with what was done. All fixes were small, so the orchestrator made them directly. After the fixes: 71/71 kart tests, 11/11 relay tests, and `vite build` of the host passes.

| # | Severity | Finding | Outcome |
|---|---|---|---|
| 1 | bug | `physics.js` `updateDrift`: a drift release set `boostLevel` unconditionally while keeping the longer timer, so a level-1 release during a level-3 boost (or a pad boost) dropped top speed to the level-1 multiplier and recolored the flames blue mid-boost. | **Fixed.** A release now takes over only when its boost time is at least the time left on the running boost, and then sets both timer and level. |
| 2 | test | The pad test's first half was vacuous (`boostLevel = 2` with `boost = 0`), and no test covered finding 1. | **Fixed.** The pad half now starts from a nearly spent level-2 boost and asserts the pad takes over at level 0. New test "a weaker drift release never cuts short or recolors a stronger running boost". It was confirmed to fail on the pre-fix `physics.js` and pass after. |
| 3 | cleanup | `race.js`: `MAX_JUMP` comment and the "teleport" comment were left over from respawn; the `moved` array held previous `s` values. | **Fixed.** Comments reworded (the guard still protects against projection glitches). Array renamed `prevS`. |
| 4 | cleanup | `physics.js`: `!kart.airborne` in the drift start check is dead, since nothing sets `airborne`. | **Fixed** by removing the check and its mention in the comment. The `airborne` field itself predates this change (it is in `createKart` on the base branch), so it stays. |
| 5 | cleanup | `driftSparks.js`: arc pools started without a shape or length, papered over by `?? 0` and `\|\| ARC_LEN[level]`. The billboard comment was duplicated. | **Fixed.** Arcs start with `t: 0, shape: 0`, so the first update rolls a real bolt. Both fallbacks were removed and the comment deduplicated. |
| 6 | cleanup | `driftSparks.js`: the seeded `rnd` and `Math.random` are mixed without explanation. | **Fixed** with a one-line comment on why `rnd` is seeded. |
| 7 | cleanup | `phone/.../index.js`: the stick is clamped in `moveStick` and again inside `stickFromOffset`. | **No change.** `stickFromOffset` stays safe as a pure function for any caller, and `moveStick` needs the clamped point for the knob. The duplicate costs nothing. |
| 8 | cleanup | Phone: no `lostpointercapture` handlers. `releaseStick` waits for the next 20 Hz tick to send neutral. | **Partly fixed.** `releaseStick` now sends immediately, matching `setDrift`. No `lostpointercapture` handlers were added: the reviewer found no stuck state with `pointerup`/`pointercancel`, pointer capture and the portrait release. |
| 9 | bug (minor) | `KartApp.jsx`: a phone that stops streaming without disconnecting leaves its last drive packet applied forever, so a held drift would charge and boost on its own. | **Fixed.** Packets are timestamped, and after 500 ms of silence the racer falls back to `IDLE`. |
| 10 | style | `physics.js` wall hit: speed was recomputed along the heading, which mid-slide is 30° off the velocity, so a wall tap cost about 13% extra speed. | **Fixed.** While sliding, the speed after a wall hit is the velocity magnitude. |
| 11 | test | No tests for the autopilot input shape, `KartApp` input clamping, or the renderer with `kart.drift` missing. | **No change.** The autopilot is exercised by the 3-lap race test, which passes with the new input. `KartApp` mapping is a React effect, covered end to end by the verify drives. The renderer's missing-drift path is a one-line `?? IDLE_DRIFT` the reviewer read as correct, and it runs in the preview and drives. |
| 12 | style | `KartApp.jsx` comment still said "Gas is always on". | **Fixed:** "The kart always accelerates". |

Areas the reviewer checked and found clean: leftover `gas`/`respawn`/`stuck`/`lastCheckpointIndex`/`btn-gas` references in app code (none live), stray logging (none), relay allowlist (`drive` and `use_item` forwarded, host ignores `use_item`), drift state machine resets (no stuck drift, brake or boost level), NaN paths, split-screen sprite aiming and disposal, preview poses and shots, phone CSS.

Reviewer report, unedited:

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
