You are a subagent building the on-court look for the tennis game. Work only in `/tmp/worktrees/tennis-look-sonnet`. Do not touch `/agent/repos/wii-for-phone`. Do not push and do not open a pull request.

The user's goal: the court should feel like the reference photo. Low camera, close to the ground, a big racket, a split view when both sides have players, and swings, a walk, and a serve whose racket actually meets the ball. The photo is attached. It is the source of truth for the framing. Do not copy Nintendo's models or animation curves. Build original poses with the same beats: ready, backswing, contact in front, follow-through, and an overarm serve.

Read `.claude/runs/tennis-court-look/spec-look.md` and implement it. That file is the success criteria. Also read `host/src/games/tennis/scene.js`, `TennisApp.jsx`, `match.css`, and `preview.js` before editing.

Your camera approach, which the other build does not use: lock each pane's camera to that side's baseline center. Do not follow the player's x. The player runs inside a still frame, the way a Wii court camera stays put. Keep the height, the distance behind the baseline, and the field of view inside the spec's band.

Rules that apply to you:

- You own only the files named in the spec.
- Commit on branch `cursor/tennis-look-sonnet-d216` with a clear message.
- No debug overlays, axes, or console noise.
- The court geometry stays. The world x-mirror stays.

Your final report should name the camera y, the distance behind the baseline, the field of view, the racket scale, and how forehand, backhand, serve, and the walk are posed.
