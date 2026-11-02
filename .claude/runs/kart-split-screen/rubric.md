# Rubric: split-screen HUD look (competing run B1 vs B2)

Written before the competing runs started. Evidence: `drive.mjs kart-split` screenshots (`n1..n4-countdown.png`, `n1..n4-racing.png`, 1280x720) for both candidates, plus each candidate's diff. References: `ref-1p.webp`, `ref-2p.webp`, `ref-4p.webp`.

Score each criterion 0–5. Weighted total out of 100 (weight × score / 5 × … summed so that all 5s = 100).

| # | Criterion | Weight | How to check |
|---|---|---|---|
| 1 | **Placement matches the references** for every layout: item slots in the top outer corner (main inside, reserve toward the edge); 1p/2p pills bottom-left and place bottom-right; 3p/4p place stacked above the pills on the outer edge. | 25 | Compare each `n<N>-racing.png` with the matching reference, element by element. |
| 2 | **Minimap**: semi-transparent outline you can see the track through, one coloured marker per racer, no opaque box; 1p middle of the right edge, 2p/4p on the screen centre, 3p large and legible in the bottom-right quadrant. | 20 | Screenshots for N=1..4. |
| 3 | **Styling fidelity**: dark translucent rounded pills with coin and checkered-flag icons and `00` / `1/3` with smaller `/3`; big bold place number with smaller suffix, outlined, coloured by player slot (P1 gold, P2 blue, P3 red/pink, P4 green); item slots read as rounded framed boxes. Own icons, not copied art. | 20 | Zoom into each element against the references. |
| 4 | **Scales with the pane**: elements keep the same proportions to their pane in 1p (full), 2p (tall halves) and 4p (small quadrants); nothing overlaps, clips, or crowds the kart; text legible at 1280x720. | 15 | Compare sizes across N; look for overlap with the divider, the minimap, or each other. |
| 5 | **Contract and harness**: every `kart-split` contract check passes; `kart-race` still passes its HUD reads. | 10 | `drive.mjs kart-split` result.json. |
| 6 | **Code quality**: small, readable React/CSS that matches the surrounding code; no dead code, no debug leftovers; pure helpers tested where logic exists. | 10 | Read the diff. |

Ties on the total break on criterion 1, then 3.
