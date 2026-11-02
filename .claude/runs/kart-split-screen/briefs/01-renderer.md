# Brief S1: multi-view renderer

You are working in the repo `wii-for-phone` (a Wii-style party game: host TV page in `host/`, phone controller in `phone/`, relay in `relay/`). You are in your own git worktree on your own branch, based on `feat/kart-split-screen`. Commit your work on your branch when done (end the commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push.

## The user's goal

Kart Racer gets local split screen for 1–4 players, like a console kart game: each player has their own view that follows their own kart. Read `.claude/runs/kart-split-screen/RUN.md` (Spec and Host DOM contract) first. You build the rendering half only. A separate run builds the HUD look afterwards, so keep the HUD as-is except where stated below.

## Files you own

- `host/src/games/kart/scene/createKartScene.js`
- `host/src/games/kart/hud.js` and `host/src/games/kart/hud.test.mjs` (add the layout helper + tests)
- `host/src/games/kart/KartApp.jsx` (wiring only, see below)
- `host/src/games/kart/preview.js` (keep it working with the new scene API)

Do not touch anything else (in particular not `host/src/style.css` and not `.claude/skills/verify/`).

## What to build

1. **`splitLayout(n)`** in `hud.js`, pure, n clamped to 1..4. Returns `{ views, map }`:
   - `views`: `[{ slot, x, y, w, h, side }]` in screen fractions with `y` measured from the top. 1: full screen. 2: left half, right half. 3: top-left, top-right, bottom-left. 4: quadrants in reading order. `side` is `'left'` for the left column and `'right'` for the right column (1p is `'left'`).
   - `map`: `'side'` for 1p, `'center'` for 2p and 4p, `'quadrant'` for 3p, plus `mapRect` (fractions) for the 3p bottom-right quadrant (null otherwise).
   - Unit tests in `hud.test.mjs` (`node --test`), in the style of the existing tests.
2. **Scene views.** Replace the single chase camera with one per view: `scene.setViews([{ id, x, y, w, h }])` (fractions, y from top). Each view owns its `PerspectiveCamera` (aspect = its pixel aspect), its own smoothed `camPos`/`camLook`/`camReady`. Keep `setFollow(id)` as shorthand for one full-screen view so `preview.js` keeps working. Debug shots (`setShot`) apply to a single view as today.
   - Render each view with `renderer.setViewport` + `setScissor` + `setScissorTest(true)`; three.js's viewport y is from the bottom, so convert. Clear once per frame, not per view, unless you find a reason.
   - Move the sun / shadow-camera focus to the view's kart before each view's render (the shadow map re-renders per render call). Call `world.tick(time, camera)` per view with that view's camera (read `scene/world.js` to see what tick needs).
   - `resize()` updates every camera's aspect.
   - For pane aspect ratios far from 16:9 (the 2p halves are tall), make sure the chase view still frames the kart well: consider widening the FOV horizontally rather than letting a narrow pane crop the sides. Decide and explain in your report.
   - Keep performance sane at 4 views: report draw calls / frame time if you can measure them (`window.__kartInfo` is the renderer info).
3. **KartApp wiring.**
   - Racers = the first 4 lobby players (`players.slice(0, 4)`), still falling back to the one debug entrant with no players. Players beyond 4 do not race (their phones keep their current behaviour; note it in your report).
   - Compute `splitLayout(entrants.length)` and call `scene.setViews` with each racer in slot order.
   - Keyboard input still drives slot 0.
   - Put `data-players={N}` on `.kart-app`. Leave the existing HUD markup and the minimap as they are; the HUD run replaces them. Do expose the layout to the render (e.g. state holding `{ views, map, entrants with slot/css }`) and per-slot HUD data from `publish()` (lap, laps, place, wrongWay for every racer, keyed by slot) so the HUD run can consume it. Remove the timer and standings from the HUD state and markup (user decision); keep `.kart-lap` and `.kart-place` rendering for slot 0 for now.

## Success criteria

- `cd host && node --test src/games/kart/*.test.mjs` passes, including new `splitLayout` tests.
- `cd host && npx vite build` succeeds.
- With 1 racer the picture is the same as before (same camera rig, full screen).
- With N racers there are N viewports in the right places, each camera following its own kart.
- You checked it visually: run `npx vite --port 15990 --strictPort` in `host/` (install deps with `npm ci` first if `node_modules` is missing) and open `http://127.0.0.1:15990/kart-preview.html` in headless Chrome via `playwright-core` (already a host devDependency; `chromium.launch({ channel: 'chrome' })`). Add a temporary `?views=N` query to preview.js only if you need it to see N views, and remove it before committing unless it is a clean, documented dev option. Save screenshots to your worktree's `/tmp`-free scratch folder under `host/` and delete them before committing. Do not launch the verify instance (`.claude/skills/verify`); another agent is working on it.

## Rules

- Match the surrounding code: its comment density, naming and idiom. No leftover debug hooks or dead code.
- Small, focused commits on your branch.
- Final report: what changed per file, the decisions you made (FOV, clear strategy, shadows), test/build output, what you looked at visually, and anything you left rough.

---

## Final report (S1, unedited)

S1 is done and committed as 97c6cc3 on my branch. Not pushed. The tests and the build pass, and I checked 1p, 2p and 4p visually. I did not screenshot 3p (it uses the same code path as 2p and 4p), and I did not measure frame time.

**Spec file:** `.claude/runs/kart-split-screen/RUN.md` doesn't exist in the worktree. I read it from the main checkout and worked from the Spec and DOM contract there.

## Changes per file
- **`hud.js`**: added `splitLayout(n)`, pure, with n clamped to 1..4. It returns `{ views: [{slot,x,y,w,h,side}], map: 'side'|'center'|'quadrant', mapRect }`. `mapRect` is `{x:.5,y:.5,w:.5,h:.5}` for 3p and null otherwise.
- **`hud.test.mjs`**: two new tests covering the rects for 1 to 4 players, slots, sides, `map` / `mapRect` and clamping.
- **`scene/createKartScene.js`**:
  - **New view API:** `setViews([{id,x,y,w,h}])` gives each view its own `PerspectiveCamera`, `camPos`, `camLook` and `ready` flag.
  - **Unchanged API:** `setFollow(id)` is now shorthand for one full-screen view. `setKarts` defaults to a single view on the first kart when no views are set yet.
  - **Rendering:** each view renders with `setViewport` and `setScissor`, with y converted to from-the-bottom, and the sun's shadow focus moves to that view's kart (or shot camera) before each render. `world.tick(time, view.camera)` runs per view, which the sky dome needs because it follows the camera. The ground and decor ticks just repeat for the same `t`.
  - **Resize and shots:** `resize()` refits every camera. `setShot` applies to view 0 only; other views keep following their karts.
- **`KartApp.jsx`**:
  - **Racers and views:** racers are `players.slice(0, 4)`, with the debug entrant when there are no players. It calls `splitLayout` and `scene.setViews`. Keyboard still drives slot 0.
  - **`data-players` and state:** `data-players` is on `.kart-app`. State `layout` holds `{views, map, mapRect, entrants:[{id,name,slot,css}]}`.
  - **HUD data:** `hud` is now `{ total, slots: [{lap, laps, place, wrongWay}] }`, indexed by slot.
  - **Removed and kept:** timer and standings are gone from state and markup. `.kart-lap`, `.kart-place` and WRONG WAY render slot 0 only. The minimap is untouched.
- **`preview.js`**: added a documented `?views=N` option (1..4) that calls `splitLayout` and `setViews`. I kept it because it is a clean dev option.

## Decisions
- **FOV:**
  - **Rule:** the vertical FOV stays 60 unless the pane is narrower than a 75° horizontal FOV allows. In that case the vertical FOV widens so the horizontal view never drops below 75° (`MIN_HFOV`).
  - **Effect on each layout:** 1p and 4p (16:9 panes) keep the old 60 vertical FOV, so 1p is identical to before. 2p halves (aspect about 0.89) go to about 82° vertical.
  - **Why:** the sides of the road stay visible instead of being cropped. It looked fine in the 2p screenshot, but 75 is a guess and is easy to tune.
- **Clear:** I left `autoClear` on, so each scissored render clears its own pane. This is equivalent to one clear per frame because the scene's colour background force-clears per render anyway. It avoids depending on that three.js detail.
- **Shadows:** the single sun and 2048 shadow map are reused. The shadow pass runs once per view with the sun re-aimed each time, so there is no extra memory.

## Performance
- **Draw calls:** `renderer.info` resets on each render call, so `__kartInfo` only reports the last view (about 109 calls and 340k triangles per view). I did not sum them across views.
- **Frame time:** headless Chrome ran about 16.5 ms per frame (vsync-capped) at 1280x720 with 1, 2, 3 and 4 views. That is software or headless GL, so treat it as a smoke test. A 4p frame costs roughly 4 times the draw work.

## Visual check
- 2p: two halves, each following its own kart, with the whole gantry and road in frame and no side cropping.
- 4p: four correctly placed quadrants, each with its own camera and shadows. Neighbouring grid karts overlapping the edge of a pane is just the grid, not a bug.

## Rough edges
- **Players beyond 4:** they get no kart. Their phones keep their current behaviour, and `drive` messages from them are ignored because `cssById` has no entry.
- **`layout` state:** nothing consumes it yet apart from `data-players`, so the HUD run has to pick it up. The old `.kart-lap` and `.kart-place` CSS still positions slot 0.
- **Unused import:** `formatTime` in `KartApp.jsx` is still used by the results card.
- **Cleanup:** I removed my scratch screenshots and stopped the vite server. I did not touch `style.css` or the verify skill.
