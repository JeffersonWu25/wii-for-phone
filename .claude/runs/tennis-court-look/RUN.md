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

Read `scene.js`, `rally.js`, `flow.js`, `timing.js`, `preview.js`, the phone swing path, `rally.probe.mjs`, `timing.test.mjs`, and the verify skill. Wrote this plan, `rubric.md`, and the briefs. Competing runs have not started.
