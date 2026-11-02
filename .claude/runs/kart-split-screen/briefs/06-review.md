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
