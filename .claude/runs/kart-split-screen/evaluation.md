# Evaluation: split-screen HUD, B1 (HTML + CSS container queries) vs B2 (SVG + per-pane `--u`)

Evidence: every `n1..n5` racing/countdown screenshot of both candidates, the three references, `result.json` (both `passed: true`), and both host diffs.

## Scores (0-5, weighted total out of 100)

| # | Criterion (weight) | B1 | B2 |
|---|---|---|---|
| 1 | Placement (25) | 5 | 4 |
| 2 | Minimap (20) | 4 | 4 |
| 3 | Styling fidelity (20) | 4 | 4 |
| 4 | Scales with pane (15) | 4 | 3 |
| 5 | Contract and harness (10) | 5 | 5 |
| 6 | Code quality (10) | 4 | 3 |
| | **Weighted total** | **87** | **77** |

### Evidence

**1 Placement.**
- B1 5: every layout matches the references. Items sit in the top outer corner with the main slot inside and the reserve toward the edge: n1 top-left, n2 left pane top-left and right pane top-right mirrored, n3/n4 the same. 1p/2p have pills bottom-left and place bottom-right. 3p/4p have place stacked above the pills on the outer edge. Quit is parked top-centre (on the divider), clear of every pane element.
- B2 4: same placement everywhere, but Quit is placed inside pane 0 right beside the item slots. In n1 it sits against the main slot (about 1px gap), in n3/n4 it sits on the floodlight next to the slots, which no reference has.

**2 Minimap.** Both are tall/upright in 1p (middle of the right edge) and 2p, centred on the cross in 4p, large in the bottom-right quadrant in 3p. No opaque box, one lettered marker per racer, and you see the track through the outline in both.
- B1 4: thin translucent outline, good see-through. In 3p the outline is thin and faint against the light-blue quadrant. In 2p the outline is wide and tall (about 58vh), crossing both karts' view, and the markers cluster over the right pane's kart.
- B2 4: a grey road band with a darker rim reads more clearly in 3p/4p, but it is slightly more filled than "outline" and a little heavier over the scene.

**3 Styling.** Both have dark translucent rounded pills, a coin and a checkered flag, `00` and `1/3` with a smaller `/3`. Both have italic bold place numbers with a gradient and outline, in gold, blue, pink and green by slot, with a smaller suffix. Both have rounded framed item boxes.
- B1 4: pills and place are chunkier and closer to the reference weight. The flag icon is a clear flag-on-pole. In 1p the pills (about 8.6% of height) are slightly bigger than the reference (about 5.8%). Main slot proportion (about 17% of height) matches the reference.
- B2 4: cleaner, smaller pills that match the 2p and 4p references well, and a flag chequer that is neat. In 1p the main slot (about 14%) and place number (about 12.5%) come out smaller than the reference's 17% and 14%. The reserve slot looks a touch dark and flat.

**4 Scaling.**
- B1 4: pure CSS with `cqmin` units, so the HUD scales per pane by construction. Same proportions in 1p, 2p and 4p, nothing overlaps. The 1p place "1st" sits close to the bottom edge, and in 3p the `3rd` hugs the left edge.
- B2 3: proportions are consistent, but item slots and place number are visibly small in 1p. Quit crowds the item slots in all layouts. Scaling depends on a JS-computed `--u` that is only right after a React resize re-render.

**5 Contract and harness.** Both `result.json` report `passed: true` for `kart-split`. Both report `kart-race` HUD reads passing in their reports, but I did not re-run them.

**6 Code quality.**
- B1 4: scaling is in plain CSS, which is less code and no plumbing. `Hud.jsx` is small. `splitLayout` gains a tested `mapTall` field. It also fixes `ordinal` for 11-13 and tests it. `hudSnapshot()` removes duplicated HUD-state building and seeds it before the first frame. Minor: some redundant `left:auto; right:auto` rules for 3p/4p, and the CSS carries a long selector pile.
- B2 3: `paneUnit()` plus a `screen` state and resize listener in `KartApp` for something CSS can do natively. `DIGIT_WIDTH`/`SUFFIX_WIDTH` magic numbers. Gradient defs repeated per pane. Slot-0-only Quit couples the HUD to the app. Plus: better test coverage (rotated map, start-tick, `paneUnit`), `hud.total` dropped cleanly.

## Verdict

Base: **B1** (87 vs 77). The decisive difference is criteria 1 and 4: B1's Quit placement and its larger 1p slots and place number track the references better, and CSS container units are the more robust scaling mechanism.

## Graft plan (into B1)

1. **3p minimap legibility from B2.** Files: `host/src/style.css` (`.kart-minimap`, `.kart-map-outline`). B2 draws the track as a grey road band with a darker rim (`kart-map-shade` + `kart-map-road`) that reads well in the large 3p quadrant and over busy scenery in 4p. Port that two-path treatment to B1's `Minimap` in `host/src/games/kart/Hud.jsx`, keeping it translucent (about 0.6 opacity) so the track stays visible through it. Keep B1's thin look for 1p/2p if the band feels heavy there.
2. **Extra tests from B2.** File: `host/src/games/kart/hud.test.mjs`. Add a bounds assertion for the rotated map (all points inside the padded box), and B2's "start tick stays perpendicular on a rotated map" case, which uses a real `fitMinimap` rather than a hand projection. Do not import `paneUnit`.
3. **B2's neater pill proportions in 2p/4p.** File: `host/src/style.css` (`--pill-h`, `.kart-pill`). B2's pills are about 5.3% of height in 2p, closer to the reference's 6%. In 1p, B1's 8.6% is too big (the reference is about 5.8%). Reduce `--pill-h` and the pill font a notch (for example 9cqmin to 7.5cqmin) so 1p/2p are nearer the reference, and keep B1's item-slot and place sizes.
4. **Fix in the base: 2p minimap size.** `host/src/style.css` (`.kart-app[data-players="2"] .kart-minimap`). At 58vh it covers a lot of both views and the markers pile onto the right pane's kart. Drop to about 46vh, like B2's smaller map.
5. **Fix in the base: bottom and edge clearance.** `host/src/style.css`. The 1p "1st" nearly touches the bottom edge, and in 3p the "3rd" touches the left edge. Raise `--edge` slightly or add `padding-bottom` for the place, and give the place number a bit of left inset in 3p/4p.
6. **Fix in the base: redundant CSS.** Collapse the `left:auto; right:auto` reset and the side-specific `:is(...)` rules for 3p/4p into one rule per side.

## Issues common to both

- The 3p map quadrant is a flat sky-blue fill (renderer clear colour) rather than a dark panel. It reads fine but looks unfinished against the dark divider. A subtle dark tint behind the quadrant would help, though the brief says no box on the other layouts.
- The 2p/4p minimap covers part of the divider and of the kart views (2p right pane in particular). The references do this too, but the markers hide the kart there.
- Countdown "3" renders per pane and, in 2p, lands partly under the minimap.
- Neither re-ran the `kart-race` HUD checks in this evaluation. Both report passing.
- Item slots are empty with no icon, as specified.
