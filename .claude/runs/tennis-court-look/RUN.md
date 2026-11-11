# Tennis court look, swing, and rally

Orchestrator is Grok 4.7. The orchestrate skill asks for Opus 5.5 at medium effort. The user overrode that: Grok extra high for this session, Grok 4.7 high for subagents, and exactly one Claude Sonnet plus one Grok on the competing look builds. This session cannot switch its own effort tier, so the orchestration runs as Grok 4.7. Subagent slugs: `grok-4.7-high` and, for the one competing look build, `claude-sonnet-5-5-high`.

Times below are Europe/Madrid (CET, UTC+1).

## Goal

Make the tennis court play and look like the Wii game in parallel, using the attached reference photo as the source of truth for the picture. Do not copy Nintendo's animation data.

- Low camera, close to the ground, near player and racket large.
- Vertical split when people are on both sides. One pane per side, both showing the same point.
- Bigger racket, elbow, and swings you can read: forehand, backhand, serve, with the string bed meeting the ball.
- Phone hold: screen toward the player is a forehand grip, screen rolled away is a backhand grip.
- Players run to the ball at a capped pace. A well-placed ball is unreturnable. An ordinary serve is returnable, so points become rallies.
- The ball keeps a continuous position and leaves the racket along the string bed.

## Decisions

- Only the hitter plays the full swing. The partner stays in the ready hold. A second full swing would hide who made contact. The user did not pick when asked, and the earlier recommendation stands.
- The competing part is the on-court picture (camera, split, racket, swing and walk cycles, contact). It is the part the reference photo judges, and two approaches will differ. Movement and the phone grip each get one Grok subagent.
- `host/src/games/tennis/rally.probe.mjs` is a frozen contract. It is not edited. Movement has to pass it. That file's canonical fast serve (apex 0.95, timing 0, power 0.7) is struck back at the bounce, so that serve must be reachable. A fast serve aimed wider, but still in, must not be.
- `timing.test.mjs` may gain `step()` calls so the ball arrives before a return swing. The landX numbers, windows, and scoring assertions stay.
- Camera approach split: Grok lags the camera toward the near player's x. Sonnet locks the camera to the baseline center so the player runs inside a still frame. Same height, distance, and field of view band either way.
- Quit moves to the top-right. The score sits top-center, across the split, as in the reference.

## Parts

| Part | Owner | Worktree | Branch | Files |
|---|---|---|---|---|
| 1. Run to the ball and leave the strings | one `grok-4.7-high` | `/tmp/worktrees/tennis-move` | `cursor/tennis-move-d216` | `rally.js`, `rally.graft.test.mjs` (duration assertion only if needed), new `rally.move.test.mjs`, `timing.test.mjs` only to step the ball in |
| 2a. Look, tracked camera | `grok-4.7-high` | `/tmp/worktrees/tennis-look-grok` | `cursor/tennis-look-grok-d216` | `scene.js`, `TennisApp.jsx`, `match.css`, `preview.js` |
| 2b. Look, locked camera | `claude-sonnet-5-5-high` | `/tmp/worktrees/tennis-look-sonnet` | `cursor/tennis-look-sonnet-d216` | same as 2a |
| 3. Phone grip | one `grok-4.7-high` | `/tmp/worktrees/tennis-grip` | `cursor/tennis-grip-d216` | `phone/src/main.js`, `phone/src/games/tennis/index.js`, new `grip.js` and `grip.test.mjs` |
| 4. Evaluate looks | one `grok-4.7-high` who wrote none of the code | none | none | reads only |
| 5. Graft | one `grok-4.7-high` | new worktree after the verdict | `cursor/tennis-look-graft-d216` | the winning look files |
| 6. Review | one `grok-4.7-high` who wrote none of the code | none | none | reads only |
| 7. Harness | one `grok-4.7-high` | after the feature is on this branch | `cursor/tennis-drive-d216` | verify feature files only |

Feature branch for the PR: `cursor/tennis-court-look-d216`.

## Timeline

### 12:53 — Plan

Read `scene.js`, `rally.js`, `flow.js`, `timing.js`, `preview.js`, the phone swing path, `rally.probe.mjs`, `timing.test.mjs`, and the verify skill. Wrote this plan, `rubric.md`, and the briefs. Commit `7e57d31`.

### 12:56 — Subagents started

Four worktrees off `7e57d31`. None of them share files.

- Move: `grok-4.7-high`, `/tmp/worktrees/tennis-move`, `cursor/tennis-move-d216`, brief `briefs/01-move.md`.
- Look, tracked camera: `grok-4.7-high`, `/tmp/worktrees/tennis-look-grok`, `cursor/tennis-look-grok-d216`, brief `briefs/02-look-grok.md`.
- Look, locked camera: `claude-sonnet-5-5-high`, `/tmp/worktrees/tennis-look-sonnet`, `cursor/tennis-look-sonnet-d216`, brief `briefs/03-look-sonnet.md`.
- Grip: `grok-4.7-high`, `/tmp/worktrees/tennis-grip`, `cursor/tennis-grip-d216`, brief `briefs/04-grip.md`.

### 13:55 — First reports, and a pace correction

All four finished. Move is `ffb32e8` (55 tests passed) but the chase uses a 400 m/s² opening sprint, a 0.9 cm planted step, and then 2 m/s for every later ball. That makes the tests pass and makes rallies die. Sent the same agent back: one 11 m/s cap, 45 m/s², no planted step. The fast wide serve stays the ball you cannot reach. A ball down the middle on the next shot has to be reachable at that same 11 m/s.

Look screenshots are in the artifact store. Grok's camera pitches up 5.2°, so the single views are half sky, and the side-B pane has no back wall. Sonnet pitches down 3.5°, builds the missing far end, and the contact sheets show a real forehand, backhand, and serve. Evaluator started on those pictures. Grip is `3af0d59`. The relay allow-list does not yet forward `grip`. That gets wired when the branches fold together.

### 14:01 — Pace correction landed

Move is `2dab5cb`. One cap, 11 m/s, acceleration and braking 45 m/s², walk home at 4 m/s. No planted step and no recovery crawl. The canonical fast serve is in reach (about 1.37 m short of the player at the bounce). A fast serve still in, but wide, gets no closer than about 2.07 m and the server wins the point.

### 14:44 — Look verdict and graft

Evaluator scores: tracked camera (A, `f252f8c`) 81, locked camera (B, `e1ffbb5`) 91. B is the base. The graft from A is the face-on string bed. The graft also pulls contact in front of the chest and tightens the frame. Result `2a56f76`. Camera that shipped: y 1.90 m, 3.20 m behind the baseline, field of view 48, pitch down 6.7°. The camera stays on the baseline center. Side B has its own far wall, trees, and stands.

### 14:45 — Folded onto this branch

Merged move `2dab5cb`, graft `2a56f76`, and grip `3af0d59` into `cursor/tennis-court-look-d216`. Worktrees removed. `45cce56` forwards `grip` on the relay and applies it in the rally before the toss.

### 15:15 — Review

A fresh `grok-4.7-high` that wrote none of the feature stepped the rally in Node. Five bugs, all fixed in `005cbe2` by a separate `grok-4.7-high` on `cursor/tennis-review-fix-d216`, then merged here. The list is `review.md`.

The harness was written in this checkout, not a worktree: one drive entry `tennis-rally`, `features/tennis-rally.md`, and the feature map. Commit `9d6b145`. The scene records `data-split` and `data-cam-y` so that drive can read the framing.

### 15:21 — Drives

`join-lobby`, `select-game`, `bowling-throw`, and `tennis-rally` passed on the first suite. `kart-race` stopped in the countdown. The lights were moving, but each frame only advanced 50 ms of race time, and this machine's software renderer was near 1 fps, so three seconds of countdown never finished inside the 8 second wait.

Chrome's ANGLE GL backend holds the same split kart view near 6 fps (`llvmpipe`, no `/dev/dri`). The drive now launches with that backend, and the race wait is 16 minutes of wall clock so three laps of game time can finish. Lap-time checks are still on game time, 30–80 seconds. Unit tests while that race ran: 281 passed, 0 failed (`node --test` on the tennis, kart, bowling, phone, and relay suites, skipping the three host scripts that import JSX).

### 16:07 — Every drive passed

The drive launcher now asks Chrome for ANGLE's GL backend, which is the faster software path on this machine. Waits that were a few seconds of wall clock now cover the same race time when each step is capped at 50 ms. The assertions themselves are unchanged: lap times stay 30–80 s of race time, the item roulette stays within 3 s of race time, and a drift still has to reach the corner.

| Drive | Result |
|---|---|
| join-lobby | passed |
| select-game | passed |
| bowling-throw | passed |
| kart-race | passed (3 laps, 114.7 s of race time) |
| kart-split | passed |
| kart-drift | passed |
| kart-items | passed |
| tennis-match | passed |
| tennis-rally | passed |

`tennis-rally` reads split `1`, camera height 1.90 m, the score on the join, a backhand grip from a rolled phone, and the returner leaving the baseline (speed 8.2 m/s, z 10.25). The chase shot is `artifacts/tennis-rally/host-chase.png`. The ready pose is `host-split.png`. Graft contact sheets are in `shots/`.

## Rough edges

The near player's shoes stay inside the frame, and a band of sky stays above the trees. The reference crops the feet and fills the top with trees. The locked camera is as tight as the y 1.45–2.05 m band allowed without losing the court. A serve's follow-through is the last fifth of the old swing, about 0.2 s, so a live frame often shows the racket already down. The chase follows the ball, not a predicted landing. There is no CPU opponent, so the split is on for every match. The forehand and backhand grip comes from the phone's tilt, which is a stand-in for "screen toward you" and "screen rolled away".
