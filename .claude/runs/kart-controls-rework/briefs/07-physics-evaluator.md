# Brief 07: P2 physics evaluator

You are the evaluator for the kart physics competing run in the kart controls rework. You only judge. You write no feature code and edit no files (you may write throwaway scripts in /private/tmp/claude-501/-Users-jeffersonwu-Desktop-projects-wii-for-phone/c7e7b33f-b1c8-513d-9916-d16509ab550f/scratchpad/ to measure things).

User's goal for this part: Mario Kart-style driving. Gas is always on. Pushing the stick down brakes, then reverses. Holding drift while steering at speed slides the kart; the slide charges a mini-turbo (level 1 at 1 s, 2 at 2 s, 3 at 3 s of sliding); releasing drift fires a boost that grows with the level; pushing the stick down cancels the drift with no boost. No respawns (stuck timer and wrong-way respawn removed), the WRONG WAY flag stays. The contract is in `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/RUN.md` (section "Input and state contract"; physics input also has `throttle`, default 1).

Rubric: section "P2 Physics" of `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/rubric.md`. Score each criterion 0 to 10 for each candidate, multiply by the weight, total (max 1000).

Candidates (each in its own worktree; files under `host/src/games/kart/`: `physics.js`, `race.js`, `autopilot.js`, `physics.test.mjs`, `race.test.mjs`):
- A, grip model: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a4b6afa1c30096f3e`
- B, slip-angle model: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a151921cce8164c0f`

Their authors' reports are appended to `briefs/02-physics-a.md` and `briefs/03-physics-b.md` in the run folder; treat them as claims to check, not facts. Probe outputs from the shared probe, run by the orchestrator, are in `evidence/p2/probe-a.json` and `probe-b.json` in the run folder. The baseline (pre-change) physics is `git show feat/kart-split-screen:host/src/games/kart/physics.js` in the main checkout.

Do:
1. Read both diffs in full against the baseline (`git -C <worktree> diff feat/kart-split-screen -- host/src/games/kart/physics.js host/src/games/kart/race.js host/src/games/kart/autopilot.js` and the tests).
2. Run each candidate's tests from its worktree root: `node --test host/src/games/kart/*.test.mjs`.
3. Read the probe JSON for both.
4. Measure feel on the real track, the same way for both: write one scratch script that imports a candidate's `track.js`, `race.js` and `physics.js` by absolute path, puts a kart at the start of each corner piece of the real track at about 20 m/s, and drives it through with a simple controller that holds drift and steers toward the racing line (for example, autopilot steer, clamped into the drift direction), recording time through the corner, wall hits (speed drops), max slip, charge level reached, and whether the line stays inside the corridor. Also time a full lap with the plain autopilot (no drift) for each. Report the numbers for both side by side. Use them for criteria 4 and to judge how controllable the drift is on the actual track (a drift that cannot be held through the real corners without hitting walls is a problem even if the flat-road probe passes).
5. Check edge cases by reading the code: drift state when a kart finishes, during the countdown, after a wall hit, when `drift` arrives as undefined; whether `boostLevel` and pads interact as the rubric says; any NaN risk; anything left referencing `gas`, `respawn`, `stuck` or `lastCheckpointIndex`.

Report, in this order:
1. Score table: criterion, weight, A score, B score, A weighted, B weighted, one-line reason each, totals.
2. Track measurement table for both.
3. Verdict: which candidate is the base, and why in two or three sentences.
4. Graft plan: specific parts of the other candidate worth bringing into the base (function, constant, test, or rule, with file and line range) and why. Only grafts that would raise a rubric score or the measured feel. "None" if nothing qualifies.
5. Fixes the base needs regardless (anything scored below 7, and any bug found), each concrete.
