# Brief B1: split-screen HUD, approach A (HTML + CSS container queries)

Your harness port offset is **200**.

## Your approach

Build the pane HUD as plain HTML elements styled in `style.css`. Make each `.kart-pane` a size container (`container-type: size`) and size everything inside it in container units (`cqmin`, `cqw`, `cqh`) so the proportions hold in every pane shape. Icons (coin, checkered flag) are small inline SVGs. The place number is HTML text with a CSS gradient fill (`background-clip: text`) and an outline built with stacked `filter: drop-shadow(...)` (since `-webkit-text-stroke` does not combine well with gradient-clipped text). The minimap is an SVG.

## Setup (do this first)

You are in your own git worktree on your own branch, cut from `main`. The feature work lives on the local branch `feat/kart-split-screen` (same repository, shared refs). Before anything else run `git merge --no-edit feat/kart-split-screen` in your worktree so you have the multi-view renderer and the harness. Install deps with `npm ci` in `host/`, `phone/` and `relay/` if `node_modules` is missing. Commit your work on your branch when done (end the commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push.

## The user's goal

Kart Racer (host TV page, `host/src/games/kart/`) now renders local split screen for 1–4 players: each racer has their own chase camera in their own viewport (done, see `scene/createKartScene.js` and `splitLayout` in `hud.js`). You build the **HUD look** on top of it so it reads like a modern console kart racer's split screen. Three reference screenshots are the source of truth for placement, proportions and style:

- `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/ref-1p.webp` (1 player)
- `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/ref-2p.webp` (2 players)
- `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/ref-4p.webp` (4 players)

Open them with your Read tool and study them before you write anything. Use our own simple icons and shapes; do not copy character or item art.

## Spec (agreed with the user)

- Layouts (already rendered): 1p full screen; 2p left/right halves; 3p top-left, top-right, bottom-left, and the **bottom-right quadrant shows a large minimap**; 4p quadrants. Draw thin dark divider lines between panes (as in the references).
- **Shared minimap**: a semi-transparent light outline of the track that you can see the 3D scene through, with one marker per racer in that racer's colour (we have no portraits: a coloured disc with a white ring, optionally the player's initial). No opaque box behind it. Placement: 1p in the **middle of the right edge** (see `ref-1p`, where it is tall and narrow); 2p and 4p **centred on the screen centre**, straddling the divider / cross; 3p large inside the bottom-right quadrant. The track's bounding box is wide (about 1.73 : 1, x by z), so consider rotating the map 90° where a tall map fits better (1p side, 2p divider), as the references show tall maps. `fitMinimap(samples, w, h, pad, step)` in `hud.js` already projects the track; extend it rather than duplicating it.
- **Item slots** per pane, top outer corner: left-column panes top-left, right-column panes top-right (in 4p this holds for the bottom row too). A large main slot on the inside and a smaller, darker reserve slot toward the screen edge. Always shown, empty, for now (they will later show items).
- **Bottom of each pane**: a coins pill (coin icon + `00`, always `00` for now: coins do not exist yet) and a lap pill (checkered-flag icon + `2/3` with a smaller `/3`), both dark translucent rounded rectangles with a faint light border; and the big **place number** (`6th`, digits large, suffix smaller), bold italic-ish, outlined, with a light-to-dark vertical gradient, coloured by player slot: P1 gold, P2 blue, P3 red/pink, P4 green (the colour belongs to the slot, not the position: in `ref-2p` the left player is 19th and still gold).
  - 1p and 2p: pills bottom-left, place number bottom-right of each pane.
  - 3p and 4p: the place number stacked directly above the pills, both aligned to the pane's **outer** edge (left column: left; right column: right).
- Elements scale with their pane: the same proportions to the pane in 1p, the tall 2p halves and the small 4p quadrants. Nothing overlaps the divider, the minimap or each other.
- WRONG WAY shows inside the affected pane. The countdown label shows in every pane (or once centred, your call; the harness reads `.first()`).
- The timer and standings list are gone (already removed). Remove the now-unused old HUD CSS (`.kart-panel`, `.kart-lap`, `.kart-timer`, `.kart-standings`, old `.kart-place*`, old minimap box styles) and any markup that the new HUD replaces.
- Keep the Quit button and the results card working; move Quit if it collides with the new HUD.

## Host DOM contract (fixed; the harness checks it)

- `.kart-app[data-players="N"]` (already there).
- One `.kart-pane[data-slot="i"][data-side="left|right"]` per racer, positioned over that racer's viewport (use `layout.views` from `KartApp` state).
- In each pane: `.kart-items` containing `.kart-item-slot.main` and `.kart-item-slot.reserve`; `.kart-coins` (text contains `00`); `.kart-lapcount` (text contains `<lap>/<laps>`, e.g. `1/3`, so keep the digits adjacent in textContent); `.kart-place` (textContent exactly like `1st`); `.kart-wrongway` only while wrong way.
- One `.kart-minimap` with one `.kart-map-marker[data-slot="i"]` per racer. In 3p the map sits inside `.kart-map-quadrant` positioned over the bottom-right quadrant.

`KartApp` already exposes `layout` (`{ views, map, mapRect, entrants: [{ id, name, slot, css }] }`) and `hud` (`{ total, slots: [{ lap, laps, place, wrongWay }] }`). Minimap markers are moved imperatively in the RAF loop (`dotRefs`), keep that pattern (no React re-render per frame).

## Files you own

`host/src/games/kart/KartApp.jsx` (render + minimap wiring), `host/src/style.css` (the Kart Racer section only), `host/src/games/kart/hud.js` and `hud.test.mjs` (pure helpers such as the place/suffix split or a rotated minimap fit, with tests), and new files under `host/src/games/kart/` if you split the HUD into components. Do not touch the scene, physics, phone, relay, or `.claude/skills/verify/`.

## Evidence and checks

- The verify harness drives the real flow. Run your own instance on an offset so you do not collide with the other agent: `VERIFY_PORT_OFFSET=<your offset> node .claude/skills/verify/scripts/instance.mjs launch`, then `VERIFY_PORT_OFFSET=<your offset> node .claude/skills/verify/scripts/drive.mjs kart-split`. It joins 1–5 phones, starts Kart Racer, holds gas, and writes `n1..n4-countdown.png` and `n1..n4-racing.png` to `.claude/skills/verify/artifacts/kart-split/` with contract checks in `result.json`. Read `.claude/skills/verify/features/kart-split.md` first.
- Look at every screenshot next to the matching reference, critically, element by element (position, size relative to the pane, colour, outline, transparency). Fix and re-shoot until it matches. 3p has no reference: apply the 4p rules to its three panes.
- `cd host && node --test src/games/kart/*.test.mjs` and `npx vite build` must pass. All `kart-split` checks must pass.
- Run `instance.mjs cleanup` with your offset when done. Leave the final `kart-split` screenshots in the artifacts folder and commit them (the orchestrator compares them).

## Rules

- Match the surrounding code: comment density, naming, idiom. Small, readable React and CSS. No dead code, no debug leftovers.
- Final report: what you built per file, how you handled scaling and the minimap orientation, the screenshots you produced, the `kart-split` result, and what still looks off compared with the references.
