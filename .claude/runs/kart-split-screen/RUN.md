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
- 17:12 Decision: fixed the host DOM contract up front so the harness (S2) and the HUD runs can be built in parallel against the same selectors.
- 17:12 Decision: S2 adds a `VERIFY_PORT_OFFSET` to the harness. The instance uses fixed ports, so without it the two competing HUD runs could not each run the harness in their own worktree at the same time.
- 17:13 Started S1 (renderer), Sonnet, own worktree. Brief: `briefs/01-renderer.md`.
- 17:13 Started S2 (harness), Sonnet, own worktree, in parallel with S1 (no shared files). Brief: `briefs/02-harness.md`.
- 17:15 Wrote `rubric.md` for the HUD competing run before starting it.
- 17:16 S1 finished (Sonnet, ~2 min). Note: the Agent worktrees were cut from `main`, not from the feature branch, so the subagents could not see `RUN.md` in their checkout; S1 read it from the main checkout. Future briefs paste the spec inline.
- 17:17 Reviewed S1's diff myself: `splitLayout` + tests, per-view cameras with scissored viewports, per-view sun focus and `world.tick`, `MIN_HFOV = 75` widening the vertical FOV for the tall 2p panes, racers capped at 4, timer/standings removed, `?views=N` on the dev preview. Matches the brief. Cherry-picked as 8d0dc23, removed the worktree and branch. Kart unit tests pass.
- 17:22 S2 finished (Sonnet, ~5.5 min). Reviewed the diff myself: offset applied once in `PORTS`, `kart-split` round per N=1..5 with all contract checks, `kart-race` reads moved to the contract, docs updated. Its HUD checks fail as expected (no HUD yet); GAS and kart-advance checks pass, so the harness path is sound.
- 17:23 Cherry-picked S2 as b8f8bba, then d3dabfc removes the pre-HUD `kart-split` sample artifacts (regenerated later) and a stale `kart-race/failure.png` S2 had swept in. Removed its worktree and branch.
- 17:24 Decision: B1 = HTML + CSS container-query units; B2 = SVG-drawn pieces scaled by a per-pane `--u`. Two real alternatives for scaling one HUD across very different pane shapes, which is the hardest part. Each runs its own harness instance (offsets 200 / 300). Briefs tell them to `git merge feat/kart-split-screen` first because Agent worktrees are cut from `main`.
- 17:26 Started B1 (HUD, CSS container queries, offset 200) and B2 (HUD, SVG + per-pane scale, offset 300), Sonnet, own worktrees, in parallel. Briefs: `briefs/03-hud-b1.md`, `briefs/03-hud-b2.md`.
- 17:40 B1 finished (Sonnet). Reports all `kart-split` checks passing. Waiting for B2 before scoring.
- 17:44 B2 finished (Sonnet). Reports all `kart-split` checks passing. Both candidates' screenshots come from the same harness drive (same rounds, same 1280x720 host, same timing), so they are like-for-like evidence.
- 17:47 Looked at both n4-racing shots myself: near-identical placement; B1 has Quit at top-centre on the divider, B2 tucks it into pane 0. Both pass 67/67 checks. Started evaluator E (Sonnet, judge only, no worktree). Brief: `briefs/04-evaluator.md`.
- 17:58 Evaluator finished: B1 87, B2 77, base B1 (full scores in `evaluation.md`). Decisions on the evaluator's common issues: give the 3p map quadrant its own backdrop; keep the countdown clear of the centred map; keep map markers in kart colour while the place number keeps the slot colour from the spec (open look question for the user, logged below). Started grafter G (Sonnet, own worktree, offset 400). Brief: `briefs/05-graft.md`.
- 17:58 Open question for the user (not blocking): P1's place number is gold per the spec but P1's kart and map marker are red (kart palette). Matching them means recolouring karts or numbers.
- 18:00 Started grafter G (offset 400).
- 18:07 G finished (Sonnet, ~6 min): kart-split 68/68, kart-race passed, 43 unit tests pass. Reviewed the host diff myself (Hud.jsx Pane/Minimap, KartApp wiring, rotated `fitMinimap`, projected `startTick`, `ordinal` 11–13 fix): matches the graft plan. Fast-forwarded the feature branch to a40c709, removed the G, B1 and B2 worktrees and the G/B1 branches; kept branch `worktree-agent-a2cf540c8e0e94e60` (losing B2) locally for reference, not pushed.
- 18:09 Looked at n1/n2/n3-racing myself: placement matches the spec in each layout; 3p panel reads as a map panel; the 2p map markers overlap the right pane's kart near the start line (known, by design of a centred map). Starting code review.
