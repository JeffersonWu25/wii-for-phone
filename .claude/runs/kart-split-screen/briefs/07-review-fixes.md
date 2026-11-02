# Brief F: apply the code review fixes

## Setup (do this first)

You are in your own git worktree on your own branch, cut from `main`. Run `git merge --no-edit feat/kart-split-screen` first (the feature lives there). Install deps with `npm ci` in `host/`, `phone/`, `relay/` if `node_modules` is missing. Commit on your branch when done (end the message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push.

## The user's goal

Kart Racer (`host/src/games/kart/`) has local split screen for 1–4 players (one camera per racer, per-pane HUD, shared minimap). A reviewer audited the branch; its findings are in `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/review.md`. Read it. Apply these findings exactly, and nothing else (no behaviour or look changes):

1. Remove `splitLayout().mapRect` (hud.js) and its test assertions.
2. `layout.entrants` is only read for its length: drop it from the `layout` state and use `layout.views.length` for `data-players`.
3. Drop `setFollow` from `createKartScene`'s API and the `setKarts` fallback that calls it (both callers now use `setViews`; check `preview.js` still works).
4. Rename `followId` in `KartApp.jsx` to `keyboardId`.
5. Extract the per-view FOV (the `MIN_HFOV` widening) and the rounded pixel rect math in `createKartScene.js` into small pure exported helpers (e.g. `viewFov(aspect)` and `viewRect(view, width, height)`; put them where pure scene helpers fit, e.g. the top of `createKartScene.js` or a tiny module beside it, so tests can import them without three.js's WebGL), and test them: 16:9 gives 60, a 2p half (~0.89) gives a wider fov, and four quadrant rects tile an odd size like 1281x721 exactly with no gaps or overlaps.
6. Marker initial: `[...e.name][0]?.toUpperCase() ?? '?'` in `Hud.jsx`.
7. Give minimap markers an initial transform at the start position so they do not flash at the SVG origin.
8. Wrap `Minimap` in `React.memo` and make the ref callback stable so markers are not detached every HUD tick (check the RAF loop still moves the markers).
9. In `.claude/skills/verify/scripts/drive.mjs`, move `KART_HOST_VIEWPORT` and `KART_PHONE_VIEWPORT` up to the shared constants area (two features use them now).
10. Clear `run.round` after `kartSplit` finishes.
13. `fitMinimap`: replace the four `Math.min(...spread)` / `Math.max(...spread)` passes with one min/max loop.

Skip finding 11 (allowed by the harness rules today) and 12 (no action).

## Files you own

`host/src/games/kart/hud.js`, `hud.test.mjs`, `KartApp.jsx`, `Hud.jsx`, `scene/createKartScene.js`, `preview.js`, a new small helper module + test under `host/src/games/kart/scene/` if you choose that, and `.claude/skills/verify/scripts/drive.mjs`.

## Checks

- `cd host && node --test src/games/kart/*.test.mjs src/games/kart/scene/*.test.mjs` (whatever test files exist) pass; `npx vite build` passes.
- `VERIFY_PORT_OFFSET=500 node .claude/skills/verify/scripts/instance.mjs launch`, then `VERIFY_PORT_OFFSET=500 node .claude/skills/verify/scripts/drive.mjs kart-split`: all checks pass. Look at `n2-racing.png` and `n4-racing.png` to confirm markers sit on the track. Cleanup with the same offset. Do not commit the regenerated artifacts (the orchestrator regenerates them at the end): `git checkout -- .claude/skills/verify/artifacts` before committing.

## Rules

- Match the surrounding code: comment density, naming, idiom. No dead code, no debug leftovers.
- Final report: what you did per finding, test/build/drive results.
