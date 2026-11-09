# Item boxes and items in Kart Racer

Rows of item boxes sit on the track (the first row 80 m past the start piece, four boxes across). Driving through a box breaks it and rolls an item into the racer's main slot: the phone's ITEM button (`#btn-item`) shows a rolling state, the TV pane's main slot (`.kart-item-slot.main`) cycles icons, and about 1.6 s later both show the landed item. Tapping ITEM uses it: a mushroom boosts, a banana drops behind, a green or red shell fires. A kart hit by a banana or shell spins out or tumbles (`hit`) and is then briefly invulnerable (`invuln`). The stick Y only aims the throw.

## Sub-features

- `pickup`: driving Ada through the first box row breaks a box (`boxes[].ready` false, `box_break` and `pickup` events) and sets `karts[0].item.main`.
- `roulette`: right after the pickup `#btn-item` has class `rolling` and the TV main slot has `data-rolling="1"`.
- `ready`: `#btn-item` has class `ready` within about 2 s of the pickup (the check allows 3 s) and the TV main slot shows `data-kind` equal to the item with an inline `svg` icon.
- `use-item`: one ITEM tap sends exactly one `use_item` frame, empties the main slot (the reserve moves up) and has its effect: mushroom `boost` and `mushroom` above 0; banana or shell an entity owned by Ada in `entities` (or a `hit` by it).
- `hit`: when Ada's banana or shell hits a kart, that kart's snapshot shows `hit`, then `hit` null with `invuln` above 0. Checked only when a hit actually happens in the run.
- `drive-frames`: the phone's `drive` frames carry `steer`, `aimY` and `drift` (no `brake`, no `gas`).

## How to get to it (user POV)

- Join two phones to the lobby, press `Select Game`, choose the Kart Racer card. After GO drive through a box in the first row, watch the ITEM button roll and land, tap ITEM.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The host viewport is 1280x720. Phones are 844x390 landscape with `hasTouch` and `isMobile`. `Ada` (slot 0, `window.__kartState.karts[0]`) is the only phone that touches anything; `Bo` is the rival and drives straight.

Run it (about 30 s):

```bash
node .claude/skills/verify/scripts/drive.mjs kart-items
```

Steps the script performs, through one CDP session on Ada's page with `Input.dispatchTouchEvent` (stick id 1, ITEM id 3):

- Join Ada and Bo, press `Select Game`, click the Kart Racer card, wait for `phase === 'racing'`.
- A closed-loop controller (the same `driftSteer` as `kart-drift`) holds Ada's stick to aim at lateral 1.5 m from 45 m before the first row (`window.__kartTrack.itemRows[0].s`) to 20 m past it. It reads `window.__kartState` and the live `window.__kartRace` (events) and never writes them.
- Wait for `karts[0].item.main` to be set. Expect at least one `boxes[].ready` false. Poll `#btn-item` for `rolling` (`phone-item-rolling`, `host-item-rolling`) and the TV main slot for `data-rolling`, then for `ready` (`phone-item-ready`, `host-item-ready`), and read the TV slot until `data-kind` is the item and the `svg` is there.
- Touch `#btn-item` for 60 ms. Expect `pressed`, then the effect for the item kind, the main slot empty (or the reserve moved up), one `use_item` frame out of Ada and one into the host (`phone-after-item`, `host-after-item`).
- If a `hit` event came from Ada's item, sample the victim for 2.8 s and expect `hit` then `invuln` (a banana dropped beside Bo often hits him within one tick).
- Check the `drive` frame shape.

Evidence in `artifacts/kart-items/`: the `.png` and `.aria.txt` pairs above, `frames.jsonl`, `result.json` and `items-summary.json` (item kind, pickup, before and after snapshots, per-tick trail after the tap, hit samples).

## Gotchas

- The item kind is random (the race seed is random), so the run takes whichever of mushroom, banana, green or red lands. Check the effect by kind, never a fixed one.
- A banana dropped 2 m behind Ada can hit Bo, who drives beside her, before the next sample, so the entity may never be seen. The `use` event plus the `hit` event stand in for it.
- The TV HUD repaints at about 10 Hz, so the TV slot can lag the phone by a tick. The script re-reads it for up to about 1 s before judging.
- The race is not finished; only the first row and the item are exercised, and a second row (`back`, 90 m into the back straight) is not driven.
- Stacked boxes (an extra reserve item) depend on which box the seed stacks. The reserve is only recorded, not required.
- The red shell warning (`incoming`), banana arcs thrown forward (`aimY` up) and shell bounces are not driven here.
