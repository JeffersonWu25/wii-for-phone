# Brief G: build the HUD base (B1) with grafts from B2

## Setup (do this first)

You are in your own git worktree on your own branch, cut from `main`. Run `git merge --no-edit worktree-agent-ad8bd80e31eb5a8c1` (the winning candidate B1; it already contains `feat/kart-split-screen`). Install deps with `npm ci` in `host/`, `phone/`, `relay/` if `node_modules` is missing. Commit on your branch when done (end the message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push.

## The user's goal

Kart Racer (browser kart game on a TV, phones as controllers) has local split screen for 1–4 players. The HUD must match three reference screenshots, which are the source of truth for placement, proportions and style: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/ref-1p.webp`, `ref-2p.webp`, `ref-4p.webp` (open them with Read). The spec and the host DOM contract are in `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/RUN.md`. Two candidates were built; an evaluator picked B1 (HTML + CSS container queries) as the base. Its full evaluation, with the graft plan, is `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/evaluation.md`. Read it.

The other candidate, B2, is on branch `worktree-agent-a2cf540c8e0e94e60` (worktree `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a2cf540c8e0e94e60`). Read its code from there; do not merge it.

## What to do

Execute the evaluator's graft plan, items 1–6, on top of B1:
1. Minimap legibility: B2's two-path road treatment (darker shade rim + translucent light road band) in `Hud.jsx` `Minimap` and `style.css`. Still see-through.
2. Tests: B2's rotated-map bounds test and the rotated start-tick perpendicular test in `hud.test.mjs` (do not bring `paneUnit`).
3. Pills smaller, closer to the references (about 7.5cqmin instead of 9cqmin), keeping B1's item slot and place number sizes.
4. 2p minimap smaller (about 46vh) so it does not cover the karts.
5. Edge clearance: bottom inset for the 1p place number, outer inset for the 3p/4p place number.
6. Collapse the redundant `left:auto; right:auto` resets and side-specific `:is(...)` rules.

Plus these orchestrator decisions:
7. The 3p bottom-right quadrant currently shows a flat sky-blue clear colour. Give `.kart-map-quadrant` a backdrop of its own so it reads as a deliberate map panel (for example a dark navy, slightly translucent gradient matching the pills' palette), with the large map on top.
8. The countdown in 2p partly sits under the minimap: make sure the per-pane countdown does not collide with the centred map (for example place it in the upper part of each pane, or put the map above it in z-order only if the digit stays readable).
9. Keep minimap markers in each racer's kart colour (they identify the kart on screen); the place number keeps the slot colours from the spec. Do not change `PALETTE`.

## Files you own

`host/src/games/kart/Hud.jsx`, `host/src/games/kart/KartApp.jsx`, `host/src/games/kart/hud.js`, `host/src/games/kart/hud.test.mjs`, the Kart Racer section of `host/src/style.css`. Nothing else.

## Checks

- `cd host && node --test src/games/kart/*.test.mjs` and `npx vite build` pass.
- `VERIFY_PORT_OFFSET=400 node .claude/skills/verify/scripts/instance.mjs launch`, then `VERIFY_PORT_OFFSET=400 node .claude/skills/verify/scripts/drive.mjs kart-split`: every check passes. Look at every `n1..n4-countdown.png` and `n1..n4-racing.png` next to the references and fix what is off. Then run `VERIFY_PORT_OFFSET=400 node .claude/skills/verify/scripts/drive.mjs kart-race` once (about 2.5 min) and confirm it passes; if it fails, find out whether the cause is the HUD or the harness and report it (do not edit `.claude/skills/verify/scripts`). Clean up the instance with the same offset.
- Commit the regenerated `kart-split` and `kart-race` artifacts.

## Rules

- Match the surrounding code: comment density, naming, idiom. No dead code, no debug leftovers.
- Final report: each graft item and what you did, the screenshots you looked at and what you changed after looking, test/build/drive results (pass counts), and anything still off.

---

## Final report (G, unedited)

All six graft items and the three orchestrator items are done and committed as a40c709 on branch worktree-agent-a8b55b4e2efca498f (not pushed). The one thing still off is that the P1 place number is gold while P1's kart and map marker are red, as already logged.

Checks:
- Unit tests: 43 pass, 0 fail (`node --test src/games/kart/*.test.mjs`).
- `npx vite build`: passes.
- `kart-split` drive: FEATURE PASSED (68 PASS lines, no FAIL).
- `kart-race` drive: FEATURE PASSED, so no HUD or harness problem.
- The instance at offset 400 is cleaned up, and the regenerated `kart-split` and `kart-race` artifacts are committed.

What I did, by item:
1. **Minimap legibility:** `Minimap` in `Hud.jsx` now draws two paths, `kart-map-shade` (dark rim, 11 wide) and `kart-map-road` (translucent light band, 7 wide, about 0.62 opacity). This replaces `kart-map-outline` in `style.css`, and the map stays see-through.
2. **Tests:** added a bounds assertion to the rotated-map test and a new "start tick stays perpendicular on a rotated map" test using a real `fitMinimap`. `paneUnit` was not brought over.
3. **Pills:** `--pill-h` went from 9cqmin to 7.5cqmin, with pill font 5.2cqmin (was 6.2) and icons 5cqmin (was 6). Item slot and place number sizes are unchanged.
4. **2p minimap:** 58vh down to 46vh.
5. **Edge clearance:**
   - The place number sits 1.8cqmin higher off the bottom, which fixes the 1p "1st".
   - In 3p/4p the place number gets an extra 2cqmin outer inset, and stacks 2.4cqmin above the pills (was 1.2).
6. **CSS collapse:**
   - The `left:auto; right:auto` resets are gone.
   - Pills and place have no default horizontal offset.
   - Horizontal position is set by one rule for 1p/2p and by per-side `:is(...)` rules for 3p/4p.
7. **3p quadrant backdrop:** `.kart-map-quadrant` now has a dark navy translucent gradient, matching the pills' palette. In `n3-racing` it reads as a deliberate map panel, with the large map on top.
8. **Countdown:** it now sits at `top: 34%` of each pane instead of the centre. In `n2-countdown` the "3" is clear of the centred map and fully readable. In `n4-countdown` it sits under the start gantry and clear of the cross map.
9. **Marker colours:** unchanged. `PALETTE` is not touched, markers keep kart colours, and the place number keeps the slot colours.

Screenshots I looked at: `n1-racing`, `n2-countdown`, `n2-racing`, `n3-racing`, `n4-racing`, `n4-countdown`. I also read `ref-1p` and `ref-4p`; I did not view `ref-2p`, `n1-countdown`, `n3-countdown` or `n5-*`. All the shots I looked at needed no further edits.

Still off:
- In 2p the markers still land on the right pane's kart at the start, because the map is centred on the divider.
- In the 4p countdown, the grid karts near the cross sit behind the centre map. That matches the reference, which also overlaps there.
