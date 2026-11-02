# Brief 08: P3 look, build the base with grafts

User's goal: while a kart drifts, electric sparks flicker under and beside the rear wheels like the reference image (`.claude/runs/kart-controls-rework/ref-sparks.jpg`, view it), small and faint at charge level 0, then bigger, more intense and recolored per level (1 blue `#2f8cff`, 2 orange `#ff8a1f`, 3 purple `#c040ff`, 0 faint warm white `#fff4d6`). The kart yaws and leans into the drift. Boost flames take the level color.

Where you work: the git worktree `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/look-build`, branch `build/look`. Do every edit and commit there. Its HEAD already holds the winning candidate A (textured sprites) on top of the run branch.

Files you own: `host/src/games/kart/scene/driftSparks.js` and `host/src/games/kart/scene/kartMesh.js`. Edit nothing else except new evidence screenshots. Read-only context: `scene/createKartScene.js` (outer group transform is overwritten every frame; scene dispose traverses and disposes all geometry and materials), the contract in `.claude/runs/kart-controls-rework/RUN.md`, the rubric section P3 in `rubric.md`, and the evaluation in `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/evaluation.md` (read the P3 section in full; it cites line numbers in A's and B's files).

The losing candidate B's code, for the grafts: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a5dc0ee0da23fba7b/host/src/games/kart/scene/driftSparks.js` and `kartMesh.js` beside it.

Do:
1. Graft B's gravity streaks into A's sprite pool: per-streak position and velocity, launched back and outward from the wheel, falling under gravity with a small ground bounce, fading with life, all on `dt` (B's `launchStreak` and streak loop). Keep A's sprite art for streaks; do not port B's ribbon geometry.
2. Graft B's `rotation.order = 'YXZ'` (or equivalent) on the drift body group so yaw and lean compose cleanly.
3. Fix the sprite and material count: aim for about 20 sprites per kart or fewer with no visible loss (for example, one bolt sprite per arc whose texture already has the white core, with the color tint only reaching the halo, or by sharing materials across sprites of the same role and level where tint does not differ per sprite). No geometry, material or texture created per frame.
4. Fix the hard horizontal clip where bolt halos and glow meet the road (raise the sprites, or disable depth test on the halos, or use a polygon offset), so no bolt or glow is sliced flat in any pose.
5. Fix the level-3 glow washing the tire and body purple (lower its opacity and size, or restore depth test with a lifted edge).
6. Make the glow flicker time-driven (accumulated time or held on a dt timer), not per-frame `Math.random`.
7. Keep everything A does well: the saturated level colors, the white-hot core, the clear growth per level, visibility from the chase camera and in the 4-up split.

Rules: match the surrounding code (comment density, naming, section banners). No new dependencies. Unit tests must pass: `node --test host/src/games/kart/*.test.mjs phone/src/games/kart/*.test.mjs`. Symlink node_modules from the main checkout before anything that needs them (`for d in host phone relay; do ln -s /Users/jeffersonwu/Desktop/projects/wii-for-phone/$d/node_modules $d/node_modules; done`) and never commit the symlinks.

Evidence: launch your own verify instance from the worktree root with `VERIFY_PORT_OFFSET=100 node .claude/skills/verify/scripts/instance.mjs launch`, then run `node .claude/runs/kart-controls-rework/pose-shots.mjs http://127.0.0.1:15273 .claude/runs/kart-controls-rework/evidence/p3-final`. View every screenshot next to the reference and the earlier `evidence/p3-a/` shots, and iterate until each fix is visible and nothing regressed. Clean up with `VERIFY_PORT_OFFSET=100 node .claude/skills/verify/scripts/instance.mjs cleanup`. Commit code and screenshots (message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push or merge.

Final report: commit sha, files changed with one line each, how each of the 7 items above was done, the sprite and material count per kart before and after, screenshot paths, and anything still weak.
