# Brief 09: P2 physics, build the base with fixes

User's goal: Mario Kart-style driving. Gas is always on. Pushing the stick down brakes, then reverses. Holding drift while steering at speed slides the kart and charges a mini-turbo (level 1 at 1 s, 2 at 2 s, 3 at 3 s of sliding). Releasing drift fires a boost that grows with the level. Pushing the stick down cancels the drift with no boost. No respawns. The contract is in `.claude/runs/kart-controls-rework/RUN.md` (section "Input and state contract"; physics input also has `throttle`, default 1).

Where you work: the git worktree `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/physics-build`, branch `build/physics`. Do every edit and commit there. Its HEAD already holds the winning candidate B (slip-angle model) on top of the run branch.

Files you own: `host/src/games/kart/physics.js`, `race.js`, `autopilot.js`, `physics.test.mjs`, `race.test.mjs` (all under `host/src/games/kart/`). Edit nothing else.

Read first: the P2 section of `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/evaluation.md` in full (scores, track measurements, fixes), and the P2 section of `rubric.md`.

The two acceptance tools, run from your worktree root:
- Flat-road probe: `node .claude/runs/kart-controls-rework/probe-physics.mjs host/src/games/kart/physics.js`
- Real-track drift script: `node .claude/runs/kart-controls-rework/tools/track-drift.mjs "$PWD"`. It drives each corner piece at 20 m/s in `plain`, `drift` (drift held the whole corner, steered by autopilot) and `tap` modes, then laps the track.

Must do:
1. **Make a held drift followable on every real corner.** Today the slide's minimum turn rate is about 0.66 rad/s, so a held drift cannot widen enough: t1 reaches maxLatFrac 1.72, the S-bends 1.38, and the R85 sweeper runs into the wall (97% off-road, 23 hits). Widen the steer modulation inside a drift so steering fully out gives a gentle arc (it must be able to follow R85 at 20 m/s, which needs about 0.24 rad/s, so the floor must sit at or below about 0.2 rad/s) and steering fully in gives a tight one. Keep it so the drift never reverses direction. Tune `DRIFT_TURN`, `DRIFT_STEER_MOD`, the floor and, only if needed, `DRIFT_SLIP` (22 to 30 degrees).
   - Pass bar on `track-drift.mjs` in `drift` mode, every piece: maxLatFrac at most 1.0, 0 hits, offroadPct 0.
   - Pass bar in `tap` mode: maxLatFrac at most 1.0.
   - Pass bar on the probe, still: maxSlipDeg over 15, drift pathRadius at most 1.3x the plain radius, speedRatio at least 0.8.
   - If the autopilot's steer inside the script's drift mode can't do it because the bot is crude, say so with numbers rather than bending the physics to the bot, and still make the sweeper followable.
2. **Keep `kart.slip` private to physics.** Leave it on the kart if you need the state, but the renderer must not read it. Mention in a one-line comment that it is physics-internal.
3. **Reduce the duplication** the evaluator flagged in `stepKart` (the second integration branch for the slide) where you can do it without changing behavior. Keep physics pure.
4. Add or update tests for the widened steer range: steering out inside a drift turns less than neutral, which turns less than steering in, and none of them reverse. Also add a test that a drift can follow a gentle R85 arc on a flat stub without the turn rate exceeding what the arc needs.

Rules: match the surrounding code style and comment density; tunables stay in the Tunables block. Unit tests must pass: `node --test host/src/games/kart/*.test.mjs phone/src/games/kart/*.test.mjs`. Symlink node_modules from the main checkout only if needed and never commit them. Commit when done (message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push or merge.

Final report: commit sha; files changed with one line each; the final tunables and why; the full `track-drift.mjs` output table and lap lines; the full probe JSON; the test summary; and anything still weak.
