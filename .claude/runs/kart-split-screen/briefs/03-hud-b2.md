# Brief B2: split-screen HUD, approach B (SVG-drawn HUD scaled per pane)

Your harness port offset is **300**.

## Your approach

Draw the HUD pieces as SVG: the item slots, the pills (rounded rects, coin and flag icons, text) and the place number (SVG `<text>` with a `<linearGradient>` fill and a dark `stroke` with `paint-order: stroke`) each live in an SVG with its own `viewBox`, so they scale crisply as a unit. Size each piece from one per-pane scale: measure the pane's pixel size (from the layout fractions and the window size, updated on resize) and set a CSS custom property such as `--u` on the pane that the pieces' width/height use. The minimap is an SVG.

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

---

## Final report (B2, unedited)

B2 (SVG HUD) is built and committed as c02d2af on `worktree-agent-a2cf540c8e0e94e60`, not pushed. `kart-split` passes every check for N=1..5. `node --test src/games/kart/*.test.mjs` passes (45 tests) and `npx vite build` passes. Instance cleaned up (offset 300).

**What changed, per file**
- **`host/src/games/kart/KartHud.jsx` (new):**
  - Holds `KartPane` and `KartMinimap`.
  - The item slots, the coins and lap pills (with coin and checkered-flag icons) and the place number are each their own SVG with a fixed `viewBox`.
  - The place number is an SVG `<text>` with a per-slot `<linearGradient>` fill (P1 gold, P2 blue, P3 red/pink, P4 green), a dark stroke and `paint-order: stroke`. The digits are large and the suffix is a smaller `<tspan>`. The `viewBox` width follows the digit count, and the text is anchored to the pane's outer side.
  - Quit is rendered inside pane 0, right of the item slots, so it doesn't collide with the HUD.
  - WRONG WAY and the countdown label render inside each pane.
  - The minimap is one SVG: a translucent light outline over a faint dark shade stroke, no box, and one `<g class="kart-map-marker" data-slot>` per racer (coloured disc, white ring, initial). In 3p it sits in `.kart-map-quadrant` over the bottom-right quadrant.
- **`host/src/games/kart/hud.js`:**
  - `fitMinimap` takes a new trailing `rotate` argument, a quarter turn clockwise.
  - `startTick` now projects the perpendicular through the same projection, so the start line stays correct on a rotated map.
  - New `placeParts(n)` splits a place into digits and suffix.
  - New `paneUnit(view, w, h)` returns `min(paneH, 0.8 * paneW) / 100` px.
- **`host/src/games/kart/hud.test.mjs`:** new tests for the rotated fit, the rotated start tick, `placeParts` and `paneUnit`.
- **`host/src/games/kart/KartApp.jsx`:**
  - Renders panes, dividers and the minimap.
  - Tracks window size in state (set from the existing resize handler) and passes each pane its unit.
  - Minimap markers now move imperatively through `markerRefs` with a `transform`, still with no per-frame React render.
  - Dropped `hud.total`.
- **`host/src/style.css` (Kart section only):**
  - Removed `.kart-panel`, `.kart-lap`, `.kart-timer`, `.kart-standings`, the old `.kart-place*` and the old minimap box styles.
  - Added the pane, item-slot, pill, place, divider and minimap styles.
  - Kept `.kart-dot`, which the results card still uses.

**Scaling**
- `--u` is set inline on each `.kart-pane` as 1% of the pane height, capped at 0.8 × pane width so tall 2p halves don't overshoot. It is recomputed on window resize.
- Every piece sizes from `calc(var(--u) * k)`, so the HUD keeps the same proportions to its pane in 1p, 2p and 4p. 3p panes use the 4p rules.

**Minimap orientation**
- 1p and 2p rotate the map 90° into a 120×190 tall box. 1p puts it at mid-right (`right: 1.5vw`, `top: 50%`, height 46vh) and 2p centres it on the divider (height 48vh).
- 3p and 4p use the unrotated wide 190×120 box. 4p centres it on the cross (width 24vw), and 3p fills 84% of the bottom-right quadrant.

**Screenshots**
- Committed in `.claude/skills/verify/artifacts/kart-split/`: `n1..n5-countdown.png` and `n1..n5-racing.png`, plus the aria snapshots, `frames.jsonl` and `result.json`.
- Compared against `ref-1p`, `ref-2p` and `ref-4p`. Item slots, pills, place number, dividers and the translucent map match them in position and style. The countdown shows once per pane, and the harness read it fine.

**Still looks off against the references**
- The slots are empty, so they are plain translucent rounded squares with none of the reference item art.
- The pill "/3" suffix is a bit smaller and lighter than in the references.
- In 3p the large map sits on bare scene background, because the empty quadrant has no camera.
- All markers stack at the start line during the countdown, and the 4p centre map overlaps the pane edges by design.
- Rendering is Chrome only.
