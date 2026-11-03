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

---

## Final report (unedited)

Candidate B (procedural lightning geometry) is done and committed. Worktree: /Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a5dc0ee0da23fba7b, branch worktree-agent-a5dc0ee0da23fba7b, commit 7533d62. Unit tests: 47 pass, 0 fail. The 14 pose screenshots ran from my offset-200 instance with no page errors, and the instance is cleaned up. The node_modules symlinks are untracked and not committed.

**Worktree setup you should know about**
- The brief says the shared tools are committed in the worktree, but my worktree started at 07f8950 without them or the preview poses. I fast-forwarded the branch to `feat/kart-controls-rework`. That was needed for the `?drift=` / `?boost=` poses and the `driftRear` / `driftQuarter` shots.

**Files changed**
- `host/src/games/kart/scene/driftSparks.js` (new): spark rig for one kart, built by `createDriftSparks()` and driven by `updateDriftSparks(rig, drift, dt)`. It also exports `LEVEL_COLORS`.
- `host/src/games/kart/scene/kartMesh.js`: body moved into an inner group, drift yaw and lean added, flames colored by `boostLevel`, spark rig attached.
- `.claude/runs/kart-controls-rework/evidence/p3-b/*.png`: the 14 pose screenshots, plus `drift3-rear-100ms.png`.

**How it works and why**
- **Arcs:** each arc is a 9-point polyline in a preallocated buffer, re-randomised by 3 midpoint-displacement passes every 35 to 85 ms, so it crackles instead of flickering every frame.
- **Crossed ribbons:** each polyline is drawn as two crossed ribbons, one vertical and one flat. `updateKartMesh` has no camera, so true billboarding wasn't possible, and this stays visible from rear and quarter views.
- **Two passes:** a wide colored pass fades from a hot tint at the root to the level color at the tip. A thin near-white core pass sits inside it at every level.
- **Streaks:** a pool of 20 per wheel is thrown back and outward with gravity and fades out. Each is white at the head and saturated at the tail.
- **One draw call:** arcs, cores and streaks share one additive vertex-colored mesh per kart. A second mesh holds the two ground glow quads, which use one shared radial-gradient canvas texture. Materials, glow texture and index buffer are built once at module scope.
- **Growth per level** (per wheel):

| Level | Arcs | Reach (m) | Streaks/s | Brightness |
|---|---|---|---|---|
| 0 | 1 | 0.5 | 7 | faint |
| 1 | 2 | 1.0 | 20 | brighter |
| 2 | 3 | 1.4 | 42 | brighter |
| 3 | 4 | 1.9 | 75 | brightest |

  Arc width and glow size also grow each level.
- **Colors:** exactly the contract colors.
- **Hidden when idle:** the rig is hidden when `kart.drift` is missing or `sliding` is false.
- **Drift body:** the visible kart sits in an inner group. It eases a yaw of about 12.5 degrees toward `drift.dir` and a lean of about 5 degrees outward, mirrored for `dir = -1`. The ease rate is 9/s.
- **Boost flames:** four shared level materials, with level 0 keeping the orange `0xffa020`. Scale grows about 18% in width and 12% in length per level. The cone geometry is shared at module scope.
- **Hygiene:** no per-frame allocation (I removed a per-frame `corners` array). Disposal works through the existing scene traversal. Shared materials are reused after dispose, the same way `shadowMat` already is.
- **Reading the contract:** the renderer only reads `kart.drift`, `kart.boost`, `kart.boostLevel`, `kart.steerVis` and `kart.speed`.

**Evidence**
- Screenshots are in `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a5dc0ee0da23fba7b/.claude/runs/kart-controls-rework/evidence/p3-b/`:
  - `drift0-rear` through `drift3-rear`, and `drift0-quarter` through `drift3-quarter`
  - `drift3-left-rear`
  - `boost1-rear` through `boost3-rear`
  - `drift3-chase` and `drift3-chase-4up`
  - `drift3-rear-100ms`, a second frame 100 ms after `drift3-rear`, for the motion check
- I iterated twice. The first pass blew out to flat white and fat ribbons, from overlapping additive layers. I cut widths and gains, shortened arc reach, and lowered the displacement amplitude.

**Uncertain or weak**
- The ground glow bloom is barely visible on the dark asphalt, even after raising its gain. The ref's pink bloom is mostly missing, and the arcs and streaks carry the look.
- At level 3 the white core dominates, so the purple reads as pale magenta edges. Level 2 reads as pale orange edges. Color fidelity is moderate, and level 1 (blue) is the most saturated.
- In the 4-up screenshot the level 3 sparks are visible but small.
- I did not check the left (`dir = -1`) yaw and lean sign by eye in detail. It is mirrored by construction.
