# Drift, boost, brake and reverse in Kart Racer

On a landscape phone the Kart Racer controls have a free stick (`#kart-zone`: X steers, pushing down brakes and then reverses), a hold DRIFT button (`#btn-drift`) and a placeholder USE ITEM button (`#btn-item`). There is no GAS button: the kart always accelerates. Holding DRIFT while steering at speed slides the kart and charges a mini-turbo (level 1 after 1 s of sliding, blue sparks; level 2 after 2 s, orange; level 3 after 3 s, purple). Releasing DRIFT fires a boost that grows with the level, and the boost flames take the level colour. Pushing the stick down during a slide cancels it with no boost. ITEM sends `use_item` to the host, which ignores it.

## Sub-features

- `controls`: the phone shows `#btn-drift` and `#btn-item` and no `#btn-gas`.
- `auto-gas`: with no touch after GO the kart passes 10 m/s within 3 s.
- `slide`: DRIFT held while steering into a corner sets `drift.sliding` with `dir` equal to the steer side.
- `charge-levels`: one slide reaches `drift.level` 1, 2, 3 in order at about 1, 2, 3 s of sliding, staying inside the corridor.
- `boost-on-release`: releasing DRIFT at level N sets `boostLevel` N and `boost` above 0; level 3 takes the speed past 22 m/s.
- `brake-cancel`: the stick pushed down during a charged slide ends it with `boost` 0 and `boostLevel` 0.
- `reverse`: the stick held down from a slow speed takes the speed below 0 (down to -6), and releasing it brings the speed back above 0.
- `use-item`: one ITEM tap sends exactly one `use_item` frame to the host and leaves speed, drift and boost alone.
- `drive-frames`: the phone's `drive` frames carry `steer`, `brake` and `drift`, with `drift: true` while DRIFT is held.

## How to get to it (user POV)

- Join two phones to the lobby, press `Select Game` on the host, choose the Kart Racer card.
- Turn the phone to landscape. After GO the kart drives itself. Steer with the left stick, hold DRIFT (right thumb) in a corner, release it to boost, push the stick down to brake or reverse, tap ITEM.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The host viewport is 1280x720. Phones are 844x390 landscape with `hasTouch` and `isMobile`. `Ada` joins first (slot 0, left pane, `window.__kartState.karts[0]`) and is the only phone that touches anything. `Bo` is the rival so the race has two karts; his kart drives straight and ends on the grass.

Run it (about 1.5 minutes):

```bash
node .claude/skills/verify/scripts/drive.mjs kart-drift
```

Steps the script performs, all through one CDP session on Ada's page with `Input.dispatchTouchEvent` (stick id 1, DRIFT id 2, ITEM id 3; `touchEnd` lists only the point that lifts, an empty list lifts all):

- Join Ada and Bo, press `Select Game`, click the Kart Racer card. Check `#btn-drift` and `#btn-item` are visible and `#btn-gas` does not exist. Capture `phone-idle`.
- No touch: wait for `window.__kartState.phase === 'racing'` and read `karts[0].speed` until it passes 10 m/s (`host-no-touch`). Expect it within 3 s of GO, and every drive frame so far neutral.
- Reverse: touch the stick at the zone centre, move it straight down (brake 1). Expect `speed` below 0 and at least -6 (`host-reversing`). Lift the stick; expect `speed` above 0 again.
- Phone shot: stick down-left (steer -0.5, brake 0.7) plus DRIFT held for 450 ms. Capture `phone-stick-down-left-drift`. Expect `drift: true`, `steer` below 0 and `brake` above 0 in the frames and no slide (braking blocks it). Lift all.
- A closed-loop controller steers the kart around the lap by moving the stick touch to an x offset (aim at `frameAt(s + 5 + 0.4 * speed)`, steer = 2.2 * heading error, inverted through the 0.12 dead zone and the knob radius). On the back straight it aims at lateral 6 so the kart misses the boost pads. It reads `window.__kartState` and `window.__kartTrack` and never writes them.
- Drift A, the `t1` right-hander: at 3 m into the piece press DRIFT with a steer of at least 0.45, hold to level 1 and 1.2 s, lift DRIFT. Expect `boostLevel` 1 and `boost` above 0 (`host-boost-level1`).
- Drift B, `sRight`: press DRIFT at the piece start, hold to level 1 and 1.2 s, then push the stick down (steer limited to 0.5, brake 1) with DRIFT still held. Expect `sliding` false within 3 samples and `boost` 0 and `boostLevel` 0 in every sample after (`host-brake-cancel`). Then lift DRIFT and the stick.
- Drift C, the `sweeper` (180 degree, 268 m): at 8 m into the piece press DRIFT. Capture `host-drift-level0` (charge at least 0.5 s), `host-drift-level1`, `host-drift-level2`, `host-drift-level3` (each 0.2 s after the level is reached). Hold to level 3 and 3.5 s, lift DRIFT. Expect `boostLevel` 3, `boost` above 0 and speed above 22 m/s within 2.5 s (`host-boost-level3` 0.4 s after the release).
- ITEM: on a straight at 22 m/s with no boost, lift the stick, wait 350 ms, touch `#btn-item` for 60 ms. Capture `phone-after-item`, then `host-after-item`. Expect one `use_item` frame out of Ada and one into the host in `frames.jsonl`, and speed, `sliding` and `boost` unchanged.
- Checks, with observed values in `result.json`: one per sub-feature above, with the slide direction, the first-seen time and charge of each level, the largest `|lateral|` and corridor overshoot during the sweeper drift, `boost` and `boostLevel` at the first sample after each release, the speeds, and the frame counts.

Evidence in `artifacts/kart-drift/`: the `.png` and `.aria.txt` pairs named above, `frames.jsonl`, `result.json`, `drift-summary.json` (the per-drift record) and `drift-trace.jsonl` (one controller sample per line: stage, race time, progress, lateral, speed, boost, boostLevel, sliding, dir, charge, level).

## Gotchas

- The slide only starts with `|steer|` at least 0.3, speed at least 8 m/s and no brake. The script presses DRIFT and steers inward (at least 0.45) in the same tick. A drift started with the stick centred does nothing.
- Once the slide runs the controller steers on the heading error. The kart body points 30 degrees past its travel direction, so the controller steers outward and the sweeper drift stays within about 1 m of the centre line.
- A boost pad running when a drift ends would make `boostLevel` read 0 and `boost` read above 0 for the wrong reason. The back straight aim keeps the kart off the pads, and every drift waits for `boost` 0 before it counts.
- After a brake cancel DRIFT is still held, which would start a new slide once the stick leaves the brake. The script lifts DRIFT while the stick is still down.
- The level screenshots fire without awaiting, so each lands a few frames after the trigger. The sparks are in the left pane around the red kart's rear wheels: level 0 is a few tiny white flecks, 1 blue, 2 orange, 3 purple.
- `#btn-item.pressed` lasts 150 ms and the phone screenshot takes longer, so `phone-after-item.png` shows the button back at rest. The check reads the class right after the touch.
- Reversing from 10 m/s near the start crosses the finish line backward and back again. The lap counters tolerate that. It also raises WRONG WAY briefly, which this feature does not check.
- The race is not finished here, only driven for about 70 s, so there is no results card. Bo's kart is left wherever it ends up.
- Chrome is the only browser used. Real iOS orientation lock, multi-touch and Pointer Events behaviour are not exercised.
