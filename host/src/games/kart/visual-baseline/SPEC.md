# Mario Kart 8 Deluxe race HUD baseline

Source of truth for visual parity. Do not edit the reference screenshot to make diffs pass.

## Reference artifact

- `mk8-reference-splitscreen.png` — two-player vertical split, Royal Raceway (Mario Kart 8 Deluxe).
- Wiki confirmation (Mario Kart Racing Wiki): in local split-screen with the map on, there is one shared transparent white map in the center of the screen, not one map per player.

## Layout contract (per player pane)

Percentages are of that player's viewport, not the full TV.

| Element | Placement | Look |
|---|---|---|
| Primary item slot | Top-left | Large circle, thick yellow rim |
| Secondary item slot | Overlaps primary at ~10 o'clock, smaller | Empty or held item |
| Place rank | Bottom-right | Huge outlined ordinal (`1st`, `12th`), place-tinted |
| Coins | Bottom-left | Gold coin glyph + two-digit count (`00`–`10`) |
| Laps | Bottom-left, right of coins | Checkered flag + `current / total` |
| Shared minimap | Center of full screen (not per pane) | Semi-transparent white track outline; character dots; human dots larger with color rings |

No colored name-pill strip across the top of each pane. Pane borders are thin/dark or absent, not thick colored frames.

## Camera contract (chase cam)

- Third-person, behind and slightly above the kart.
- Kart sits in the lower-center ~20% of its pane.
- Look-at is ahead of the kart along the heading, not only at the body center.
- FOV mid-50s; distance close enough that track edges and nearby scenery read clearly.
- Soft camera bank on steer is optional polish; keep framing stable first.

## World / track contract (this project)

The course is Luigi Circuit from Mario Kart Wii, at arcade scale. Match that silhouette and its surfaces. Match MK8 feel for the HUD and camera, not Royal Raceway geometry.

- Road: gray asphalt with variable width, and white edges.
- Tan sand inside the turns and across the shortcut fills.
- Bright green grass disc. Saturated sunny sky.
- Orange dash panels on the outside of the final turn.
- Checkered start stripe and a painted starting grid.
- No hedges or grandstands. A few low-poly trees or one pipe are allowed as visual-only props.
- Soft directional sun shadows when practical.
- Kart: low body, visible wheels, seated driver with hat/skin colors from the roster. Tire contact is the sampled surface, and mesh-local y = 0 is at the tires. No floating name billboard over the kart during race.
- Target art direction is Mario Kart Wii Luigi Circuit. Prefer textured surfaces and readable outdoor light over flat prototype colors. Modest course props are allowed when they improve recognition; do not ship Nintendo ripped binaries.

## HUD data

Race snapshot must expose enough for the overlay without inventing place from DOM order alone:

- `place`, `lap`, `coins` (0–10), `itemPrimary`, `itemSecondary` (nullable ids for empty slots).
- Kart world `x`/`z`/`progress` (or equivalent) for the shared minimap.

Empty item slots still render the yellow rings. Coins may start at `0` until pickup logic exists.

## Verification

Pixel-zero match to the Royal Raceway reference is out of scope. The course is Luigi Circuit. Parity is the layout and camera contracts above.

1. Keep `mk8-reference-splitscreen.png` and this SPEC frozen. Do not edit them to make a check pass.
2. Drive a 2-player race and screenshot into `current/race-2p-after.png`.
3. Run `check-layout.mjs` against the live host (needs `playwright-core`). Exit 0 means item slots, place, coins/laps, and the shared minimap sit inside the SPEC regions.
4. Unit tests in `race.test.mjs` cover `placeLabel` and snapshot HUD fields.
