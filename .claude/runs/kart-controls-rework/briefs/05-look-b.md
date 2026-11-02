# Brief 05: P3 renderer look, candidate B (procedural lightning geometry)

You are one of two competing candidates for the drift look. A separate evaluator scores both against `.claude/runs/kart-controls-rework/rubric.md` (section P3) using the same screenshots. Read the rubric first, and look closely at the reference image `.claude/runs/kart-controls-rework/ref-sparks.jpg`: jagged electric arcs and short bright streaks fanning back and outward from the bottom of each rear wheel, white-hot core where they touch the ground, saturated color at the tips, additive glow.

## Shared context (all parts)

User's goal: rework the Kart Racer controls to feel like Mario Kart. The phone loses its GAS button (gas is always on), gets a 2D free stick (X steers, pushing down brakes then reverses), a hold DRIFT button and a USE ITEM placeholder. Holding drift while steering at speed slides the kart and charges a mini-turbo: level 1 after 1.0 s of sliding (blue), level 2 after 2.0 s (orange), level 3 after 3.0 s (purple). Releasing drift fires a boost whose strength and length grow with the level. Pushing the stick down cancels a drift with no boost. While charging, electric sparks flicker under and beside the rear wheels, bigger, more intense and recolored as the level rises, like the reference image `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/ref-sparks.jpg`. Boost flames use the level color. Respawns are removed (stuck timer and wrong-way respawn); the WRONG WAY banner stays.

Fixed contract (other parts are being built in parallel against it, do not change it):
- Phone to host: `{ type: 'drive', steer: -1..1, brake: 0..1, drift: bool }` at 20 Hz, and `{ type: 'use_item' }` on tap. The relay already forwards both.
- Physics input: `{ steer, brake, drift, throttle }`. `throttle` defaults to 1 when missing; 0 means coast (finished karts, disconnected players). `gas` no longer exists.
- Kart state owned by physics: `kart.drift = { sliding: bool, dir: -1|0|1, charge: seconds, level: 0..3 }` (`level` is the current charge level while sliding, 0 when not sliding), `kart.boost` (seconds of boost left, existing), `kart.boostLevel` 0..3 (0 for boost pads or no boost).
- Level colors, used by sparks and boost flames: level 0 faint warm white `#fff4d6`, level 1 blue `#2f8cff`, level 2 orange `#ff8a1f`, level 3 purple `#c040ff`.
- The renderer reads only `kart.drift`, `kart.boost`, `kart.boostLevel`, `kart.steerVis`, `kart.speed`.

Rules:
- You work in your own git worktree on your own branch. Edit only the files you own (listed below). If you believe another file must change, stop and say so in your report instead of editing it.
- Match the surrounding code: comment density, naming, section banners, plain ES modules. No new dependencies.
- Unit tests: `node --test host/src/games/kart/*.test.mjs phone/src/games/kart/*.test.mjs` from the worktree root. Everything must pass.
- Your worktree has no node_modules. Symlink them from the main checkout before running anything that needs them: `for d in host phone relay; do ln -s /Users/jeffersonwu/Desktop/projects/wii-for-phone/$d/node_modules $d/node_modules; done`. Do not commit the symlinks.
- If you need the running app, launch your own verify instance from the worktree root with a port offset (given below): `VERIFY_PORT_OFFSET=<n> node .claude/skills/verify/scripts/instance.mjs launch`, and run `VERIFY_PORT_OFFSET=<n> node .claude/skills/verify/scripts/instance.mjs cleanup` when done. Never touch another instance or kill a process you did not start.
- Commit your work on your branch when done (message ends with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push. Do not merge.
- Final report: the worktree path and branch, the commit sha, every file changed with one line each, every decision you made and why, the evidence (test output, probe or screenshot paths), and anything unfinished or uncertain.

## Your part

Files you own: `host/src/games/kart/scene/kartMesh.js` and a new `host/src/games/kart/scene/driftSparks.js`. Verify port offset: 200. Read `scene/createKartScene.js` (do not edit it): `syncKarts` overwrites the outer group's position and rotation every frame, and `dispose` traverses the scene disposing every geometry and material it finds.

Your approach (B, procedural geometry): no textures for the arcs. Build the electric arcs as jagged polylines in preallocated buffers (for example thin camera-facing ribbon strips or `LineSegments` with additive blending), re-randomizing their vertex positions each frame by midpoint displacement so they crackle. Add a small fixed pool of additive point sprites or tiny quads for the hot sparks and streaks flying back and outward, and one soft glow quad on the ground per wheel for the bloom. Tint per level through material or vertex color with a white core (draw a thinner, brighter white pass inside the colored arcs).

Build:
1. `driftSparks.js`: a small module that builds the spark rig for one kart and updates it from `kart.drift` and `dt`. Anchor the sparks at the ground under and just outside both rear wheels (the kart faces local +x and sits on y = 0; read the tire positions in `kartMesh.js`). Hidden when `kart.drift.sliding` is false.
2. Growth per level: level 0 small and faint (warm white, low opacity, few short sparks); each level clearly bigger and brighter (size, count, streak length, glow) up to level 3. The four levels must be told apart even in greyscale.
3. Colors exactly as the contract. Keep a near-white core at every level.
4. Drift body: restructure `createKartMesh` so the visible kart sits in an inner body group, and ease a small visual yaw into the drift (about 10 to 15 degrees toward `drift.dir`; physics already rotates the heading) plus a lean (roll outward) while sliding, eased in and out, mirrored for `dir = -1`.
5. Boost flames: color by `kart.boostLevel` (level 0 keeps today's orange `0xffa020`), and scale them a little with level.
6. Hygiene: build every geometry, material and texture once (module scope for shared ones). No allocation per frame. Everything hidden when not drifting or boosting.
7. Keep `createKartMesh(color)` and `updateKartMesh(mesh, kart, dt)` signatures; `kart.drift` may be missing on old state, treat it as idle.

Evidence: launch your instance (offset 200) and run, from your worktree root, `node .claude/runs/kart-controls-rework/pose-shots.mjs http://127.0.0.1:15373 .claude/runs/kart-controls-rework/evidence/p3-b`. Look at every screenshot critically next to the reference, iterate until it holds up, then commit the final screenshots with your code. List the screenshot paths in your report.
