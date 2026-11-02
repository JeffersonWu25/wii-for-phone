# Run log: Kart Racer split screen

Branch: `feat/kart-split-screen` (from `main` at 37293f9). Orchestrator: Opus 5.5. Subagents: Sonnet.

## Spec (agreed with the user)

Reference images (source of truth for the look): `ref-1p.webp`, `ref-2p.webp`, `ref-4p.webp`.

- The first 4 lobby players race. Each gets their own chase camera on their own kart.
- 1 player: full screen. 2 players: left/right halves split down the middle. 3 players: top-left, top-right, bottom-left; the bottom-right quadrant shows a large minimap. 4 players: quadrants.
- Thin dark divider lines between panes.
- Shared minimap: semi-transparent track outline with a marker per racer, no background box. 1p: middle of the right edge. 2p and 4p: centred on the screen centre (on the divider / cross). 3p: large, in the bottom-right quadrant.
- Item slots per pane, top outer corner (left-column panes top-left, right-column panes top-right): a large main slot on the inside and a smaller reserve slot toward the screen edge. Always shown, empty, for now.
- Bottom of each pane: coins pill (coin icon + `00`) and lap pill (flag icon + `2/3`, small `/3`), and the big place number (`6th`, small suffix) coloured by player slot: P1 gold, P2 blue, P3 red/pink, P4 green.
  - 1p and 2p: pills bottom-left, place bottom-right of each pane.
  - 3p and 4p: place stacked above the pills, both aligned to the pane's outer edge.
- Remove the timer and standings list. WRONG WAY shows in the affected pane.
- Our own icons, not Nintendo art.

## Host DOM contract (fixed by the orchestrator so the harness and the HUD agree)

- `.kart-app[data-players="N"]`, N = 1..4 racers.
- One `.kart-pane[data-slot="i"][data-side="left|right"]` per racer, positioned over that racer's viewport.
- In each pane: `.kart-items` with `.kart-item-slot.main` and `.kart-item-slot.reserve`; `.kart-coins` (text contains `00`); `.kart-lapcount` (text contains `<lap>/<laps>`, e.g. `1/3`); `.kart-place` (text like `1st`); `.kart-wrongway` only while wrong way.
- One `.kart-minimap` with one `.kart-map-marker[data-slot="i"]` per racer. In 3p the map sits inside `.kart-map-quadrant`.
- `.kart-countdown` may appear once per pane; the harness reads `.first()`.
- `.kart-timer` and `.kart-standings` are gone. `window.__kartState` / `__kartTrack` are unchanged.

## Plan

| Part | Owner | Mode |
|---|---|---|
| P1 Multi-view renderer: `splitLayout(n)` pure helper + tests, one chase camera per view, viewport/scissor rendering, per-view shadow focus, cap to 4 racers, KartApp wires views | Sonnet subagent S1 (worktree) | single |
| P2 Harness: port offset so instances can run side by side, new `kart-split` drive (1–4 phones, screenshots per layout, contract checks), update `kart-race` for the new HUD contract | Sonnet subagent S2 (worktree) | single, in parallel with S1 |
| P3 Split-screen HUD look: panes, item slots, pills, place number, minimap placement and style, 3p map quadrant, dividers | 2 Sonnet subagents B1 / B2 | **competing run** (core look, hardest to get right) |
| P3 merge | Sonnet evaluator E, then Sonnet grafter G | |
| Review | Sonnet reviewer R | |

Only one part gets a competing run: the HUD look. The renderer is mechanical Three.js viewport work with one obvious approach.

## Timeline

- 2026-11-02 17:09 Branch created, references copied into the run folder, plan written.
