# Review: kart split screen (feat/kart-split-screen vs main)

Checked: full diff of host, verify scripts, SKILL.md and features; `node --test src/games/kart/*.test.mjs` (43 pass); `npx vite build` (builds clean, only the existing chunk-size warning). Every Kart Racer class in `host/src/style.css` was matched against the JSX: no orphan rules (`.kart-dot` is still used by the results card at KartApp.jsx:244). No bugs found in viewport/scissor math (CSS-pixel rects with `height - py - ph` are correct because three multiplies by pixel ratio), effect cleanup, or the 1-player debug entrant, 5+ players, and place 11+ paths.

1. **dead code** - `host/src/games/kart/hud.js:32` (and comment at hud.js:21, tests at hud.test.mjs:31-32). `splitLayout().mapRect` is never read by any code, only asserted in a test. The 3p quadrant is positioned by CSS (`.kart-map-quadrant`). Fix: drop `mapRect` from the return value, the comment mention, and the two test assertions.
   Resolution: Fixed (F, 50cbb08): `mapRect` and its assertions removed.

2. **dead code** - `host/src/games/kart/KartApp.jsx:55`. `setLayout` stores `entrants: [{ id, name, slot, css }]`, but the only read is `layout?.entrants.length` (KartApp.jsx:227). `name`, `css`, `id`, `slot` are unused (the minimap gets its own copy in `map.entrants`). Fix: store `count: entrants.length` (or reuse `layout.views.length`) and use it for `data-players`.
   Resolution: Fixed (F, 50cbb08): `setLayout(split)`; `data-players` reads `layout.views.length`.

3. **dead code** - `host/src/games/kart/scene/createKartScene.js:65,175`. `setFollow` is no longer called from outside the scene (KartApp and preview.js both use `setViews`); its only caller is the fallback in `setKarts` (line 50). That fallback builds a full-screen view that `setViews` immediately replaces in both entry points. Fix: remove `setFollow` from the returned API; either delete the fallback in `setKarts` or keep it as an internal one-liner. Also `const setFollow` is declared after `setKarts` uses it (works only because it is called later).
   Resolution: Fixed (F, 50cbb08): `setFollow` and the `setKarts` fallback removed; both callers use `setViews`.

4. **style** - `host/src/games/kart/KartApp.jsx:47,159`. `followId` now only means "the entrant the keyboard drives". With split screen it reads like the camera target. Fix: rename to `keyboardId` (or add a one-line comment).
   Resolution: Fixed (F, 50cbb08): renamed to `keyboardId`.

5. **missing test** - `host/src/games/kart/scene/createKartScene.js:60-82,150-157`. Pure math is buried in the scene closure and untested: per-view aspect, the `MIN_HFOV` widening (`fov = max(FOV, 2*atan(tan(hfov/2)/aspect))`), and the rounded pixel rect (`px/py/pw/ph`, which must tile the canvas with no seam or gap for odd sizes). Fix: extract `viewFov(aspect)` and `viewRect(view, width, height)` into `hud.js` (or a `scene/views.js`) and add tests: 2p on 1280x720 gives fov > 60, 1p on 16:9 gives exactly 60, and the four 4p rects at an odd size such as 1281x721 cover the canvas exactly.
   Resolution: Fixed (F, 50cbb08): new `scene/views.js` with `viewFov` / `viewRect` and `views.test.mjs` (16:9 → 60, 2p wider, 1281x721 tiles exactly). Leftover: the camera constructor still passes a literal 60 that `fitCamera` overrides at once; left as is.

6. **bug (minor)** - `host/src/games/kart/Hud.jsx:50`. `e.name.charAt(0)` splits an emoji/surrogate-pair first character into a broken glyph, and gives an empty marker for an empty name. Fix: `[...e.name][0]?.toUpperCase() ?? '?'`.
   Resolution: Fixed (F, 50cbb08).

7. **bug (minor)** - `host/src/games/kart/Hud.jsx:44-52` / `KartApp.jsx:176-180`. Marker `<g>` elements have no `transform` until the first RAF tick, so on mount all markers draw at the SVG origin (top-left of the map) for one frame. Fix: give each `<g>` an initial `transform` in the JSX (for example the start position from `map`) or set it right after `setMap` in the effect.
   Resolution: Fixed (F, 50cbb08): markers start at the projected start sample (`map.start`).

8. **style / perf (low)** - `host/src/games/kart/KartApp.jsx:232-234`, `Hud.jsx:41`. `Minimap` re-renders on every 100 ms HUD tick and its inline `ref` arrow is a new function each render, so React detaches and reattaches every marker ref (`null` then element) 10x a second. Harmless today (the RAF loop re-sets transforms) but wasteful. Fix: wrap `Minimap` in `React.memo` (its `map` and `dotRefs` props are stable) .
   Resolution: Fixed (F, 50cbb08): `Minimap` wrapped in `memo`; its props are stable, so HUD ticks no longer re-render it.

9. **harness** - `.claude/skills/verify/scripts/drive.mjs:303-304,637,662,671`. `kartSplit` uses `KART_HOST_VIEWPORT` and `KART_PHONE_VIEWPORT`, which are declared in the kart-race block. Not a code or artifact dependency, but kart-split is not self-contained: moving or renaming them in the kart-race section breaks it. Both constants are now used by two features, so the rule (shared once two features use it) is met; fix: move them above the kart-race section into the shared constants area next to the other shared helpers (`selectGame`, `waitForWaitingLabel`).
   Resolution: Fixed (F, 50cbb08): both constants moved next to the shared viewports.

10. **harness** - `.claude/skills/verify/scripts/drive.mjs:93,633`. `run.round` is set in `splitRound` and never cleared, so any later code on the same `Run` would tag frames with `n5`. Only `kart-split` uses it today, so there is no effect, but the field is a generic `Run` property that leaks state. Fix: reset `run.round = undefined` at the end of `kartSplit`, or note in the comment that it is split-only.
   Resolution: Fixed (F, 50cbb08): `run.round` cleared after `kartSplit`.

11. **harness** - `.claude/skills/verify/scripts/drive.mjs:618-627`. `holdGas` duplicates the GAS-touch block that `kartRace` does inline (drive.mjs:363-383). Allowed by the rule (one feature, one helper), but if kart-race is touched again, make it call `holdGas`, since two features would then share it. No change needed now.
   Resolution: Not done, by decision: allowed by the harness rule (a shared helper only once two features use it). Noted for the next change to `kart-race`.

12. **debug leftover** - none found. `window.__kartState`, `__kartTrack` and `__kartInfo` already existed on main and are required by the harness; `?views=N` in `preview.js` is the dev preview and is documented in its header comment. Note: `preview.js:26` `entrants[v.slot]` is safe only because `entrants` has 4 items and `splitLayout` clamps to 4; no fix needed.
    Resolution: No action needed.

13. **style** - `host/src/games/kart/hud.js:53-77`. `fitMinimap` now spreads `Math.min(...pts.map(...))` over all samples (4 times). Fine for the current track length, but it throws a RangeError for roughly 100k+ samples and allocates four arrays. Fix: one loop for min/max as the old code did, keeping the `turn` helper.
    Resolution: Fixed (F, 50cbb08): one min/max loop.
