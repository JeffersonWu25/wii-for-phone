You are a subagent building one part of the tennis game. Work only in `/tmp/worktrees/tennis-move`. Do not touch `/agent/repos/wii-for-phone`. Do not push and do not open a pull request.

The user's goal: players run to the ball at a capped pace so a well-placed ball is unreturnable and an ordinary serve is returnable, and a connected hit leaves the racket along the strings without teleporting the ball. Points should become rallies rather than a string of aces.

Read `.claude/runs/tennis-court-look/spec-move.md` and implement it. That file is the success criteria. Also read `host/src/games/tennis/rally.js`, `rally.probe.mjs`, `rally.graft.test.mjs`, and `timing.test.mjs` before editing.

Rules that apply to you:

- You own only the files named in the spec.
- `rally.probe.mjs` is frozen. Do not edit it. Your code must pass it.
- Commit on branch `cursor/tennis-move-d216` with a clear message when the tests pass.
- Do not copy Nintendo code or assets.
- Decide technical details yourself and list them at the end of your report.

Run, from `host/`:

```bash
node --test src/games/tennis/rally.probe.mjs src/games/tennis/rally.graft.test.mjs src/games/tennis/timing.test.mjs src/games/tennis/teamSeat.test.mjs src/games/tennis/rally.move.test.mjs
```

Your final report should include the test command and its result, the speed and reach constants you settled on, how a whiff differs from a connect, and any test assertion you had to update.
