# Brief R: code review of the split-screen feature

You review; you do not write feature code. You did not write any of this code.

## The user's goal

Kart Racer (browser kart game in `host/`, phones as controllers in `phone/`, relay in `relay/`) gained local split screen for 1–4 players: one chase camera per racer in its own viewport, a per-pane HUD (item slots, coins and lap pills, place number), a shared translucent minimap, racers capped at the first 4 lobby players, and the timer and standings removed. The verify harness (`.claude/skills/verify`) gained a `VERIFY_PORT_OFFSET` and a `kart-split` feature. Spec: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/RUN.md`.

## Scope

The full diff of branch `feat/kart-split-screen` against `main`, in `/Users/jeffersonwu/Desktop/projects/wii-for-phone` (do not check out anything else, do not edit files there):

```
git -C /Users/jeffersonwu/Desktop/projects/wii-for-phone diff main...feat/kart-split-screen -- host .claude/skills/verify/scripts .claude/skills/verify/SKILL.md .claude/skills/verify/features
```

Skip the binary artifacts and `frames.jsonl`. Read the surrounding code where needed to judge style.

## Look for

- Bugs: wrong viewport math, camera/resize issues, React state or ref misuse (e.g. stale refs, markers not moving, missing keys), effects or listeners not cleaned up, contract mismatches with the harness, edge cases (1 player debug entrant, 5+ players, disconnected racer, results card, wrong way, place 11+).
- Dead code: unused imports, CSS rules no longer referenced (check every Kart Racer class in `host/src/style.css` against the JSX), unused exports.
- Leftover debug hooks or dev-only code that should not ship.
- Missing tests for pure logic.
- Style that does not match the surrounding code (comment density, naming, idiom).
- Harness: the rules are one drive entry, one `features/<id>.md`, one `artifacts/<id>/` per feature; a shared helper only once two features use it; no feature depends on another's code or artifacts.

You may run read-only commands: `cd /Users/jeffersonwu/Desktop/projects/wii-for-phone/host && node --test src/games/kart/*.test.mjs`, `npx vite build --outDir /tmp/kart-review-build` (write the build outside the repo), grep.

## Output

Write `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/review.md`: a numbered list of findings, each with severity (bug / dead code / debug leftover / missing test / style / harness), file:line, what is wrong, and the concrete fix. Leave a "Resolution" line under each finding blank for the orchestrator. Only report what you verified by reading the code; no speculation. Your final message repeats the findings list.

---

## Final report (R, unedited)

Review written to /Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/review.md. 43 unit tests pass and the vite build is clean. I found no real bugs in the viewport/scissor math, the effect cleanup, or the 1-player debug entrant. 5+ players (capped at 4 racers) and place 11+ also look correct. No orphan CSS: `.kart-dot` is still used by the results card.

Findings (each has a blank Resolution line in the file):
1. dead code, hud.js:32 (comment at :21, tests at hud.test.mjs:31-32): `splitLayout().mapRect` is read nowhere except its test. Fix: remove it and the two assertions.
2. dead code, KartApp.jsx:55: `layout.entrants` stores name/css/id/slot but only `.length` is read (:227). Fix: store a count instead.
3. dead code, createKartScene.js:65,175 (fallback at :50): `setFollow` is no longer used outside the scene. Its only caller is the `setKarts` fallback, which `setViews` immediately replaces. Fix: drop it from the API, and the fallback with it.
4. style, KartApp.jsx:47,159: `followId` now only means "the keyboard-driven entrant", which reads like a camera target. Fix: rename to `keyboardId`.
5. missing test, createKartScene.js:60-82,150-157: the per-view aspect, the `MIN_HFOV` fov widening and the rounded pixel rects are untested. Fix: extract `viewFov` and `viewRect` as pure helpers and test them. Tests: 1p 16:9 gives fov 60, 2p gives a wider fov, and the 4p rects tile an odd size such as 1281x721 exactly.
6. bug (minor), Hud.jsx:50: `e.name.charAt(0)` breaks an emoji first character and gives an empty marker for an empty name. Fix: `[...e.name][0]?.toUpperCase() ?? '?'`.
7. bug (minor), Hud.jsx:44-52 / KartApp.jsx:176-180: map markers have no initial `transform`, so they draw at the SVG origin for the first frame. Fix: set an initial transform.
8. style/perf (low), KartApp.jsx:232-234 / Hud.jsx:41: `Minimap` re-renders on every 100 ms HUD tick and its inline ref arrow detaches and reattaches every marker ref each time. Fix: wrap `Minimap` in `React.memo`.
9. harness, drive.mjs:303-304 (used at :637,662,671): `kartSplit` depends on `KART_HOST_VIEWPORT` and `KART_PHONE_VIEWPORT`, which are declared inside the kart-race block. Two features now use them. Fix: move them up to the shared constants area.
10. harness, drive.mjs:93,633: `run.round` is set in `splitRound` and never cleared, so it leaks state on the shared `Run`. Fix: reset it after `kartSplit`.
11. harness, drive.mjs:618-627: `holdGas` duplicates the inline GAS touch in `kartRace` (:363-383). This is allowed today because only one feature uses it. If kart-race is touched again, make it call `holdGas`.
12. debug leftovers: none found. `__kartState`, `__kartTrack` and `__kartInfo` already existed on main and the harness needs them. `?views=N` in preview.js is documented. `entrants[v.slot]` there is safe because `splitLayout` clamps to 4 and there are 4 entrants.
13. style, hud.js:53-77: `fitMinimap` now spreads `Math.min(...pts.map(...))` four times over all samples, which allocates four arrays and would throw a RangeError at roughly 100k+ samples. Fix: use one min/max loop as before.
