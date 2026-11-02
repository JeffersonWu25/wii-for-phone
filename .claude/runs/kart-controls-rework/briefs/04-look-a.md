# Brief 04: P3 renderer look, candidate A (textured sprite sparks)

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

Files you own: `host/src/games/kart/scene/kartMesh.js` and a new `host/src/games/kart/scene/driftSparks.js`. Verify port offset: 100. Read `scene/createKartScene.js` (do not edit it): `syncKarts` overwrites the outer group's position and rotation every frame, and `dispose` traverses the scene disposing every geometry and material it finds.

Your approach (A, textured sprites): draw a few spark textures once at module load on a canvas (a soft radial glow, and two or three jagged lightning-arc shapes with a white core and colored edge), then render the sparks as additive-blended sprites or camera-facing quads from a fixed pool per kart. Tint per level through material color over the white core. Each frame re-pick arc textures, rotations, offsets and scales at random from the pool, and move a handful of short streak particles back and outward with a short life.

Build:
1. `driftSparks.js`: a small module that builds the spark rig for one kart and updates it from `kart.drift` and `dt`. Anchor the sparks at the ground under and just outside both rear wheels (the kart faces local +x and sits on y = 0; read the tire positions in `kartMesh.js`). Hidden when `kart.drift.sliding` is false.
2. Growth per level: level 0 small and faint (warm white, low opacity, few short sparks); each level clearly bigger and brighter (size, count, streak length, glow) up to level 3. The four levels must be told apart even in greyscale.
3. Colors exactly as the contract. Keep a near-white core at every level.
4. Drift body: restructure `createKartMesh` so the visible kart sits in an inner body group, and ease a small visual yaw into the drift (about 10 to 15 degrees toward `drift.dir`; physics already rotates the heading) plus a lean (roll outward) while sliding, eased in and out, mirrored for `dir = -1`.
5. Boost flames: color by `kart.boostLevel` (level 0 keeps today's orange `0xffa020`), and scale them a little with level.
6. Hygiene: build every geometry, material and texture once (module scope for shared ones). No allocation per frame. Everything hidden when not drifting or boosting.
7. Keep `createKartMesh(color)` and `updateKartMesh(mesh, kart, dt)` signatures; `kart.drift` may be missing on old state, treat it as idle.

Evidence: launch your instance (offset 100) and run, from your worktree root, `node .claude/runs/kart-controls-rework/pose-shots.mjs http://127.0.0.1:15273 .claude/runs/kart-controls-rework/evidence/p3-a`. Look at every screenshot critically next to the reference, iterate until it holds up, then commit the final screenshots with your code. List the screenshot paths in your report.

---

## Final report (unedited)

Candidate A (textured sprite sparks) is built and committed. Tests pass (47 pass, 0 fail) and I checked the screenshots against the reference.

Worktree: /Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a8a8f93332db70de8
Branch: worktree-agent-a8a8f93332db70de8
Commit: 5dbb40b

**Setup undone as you asked.** I reverted the files I had wrongly copied in and removed the copied `.claude/runs`. I then merged `feat/kart-controls-rework`, which brought in the preview poses, shots and split-screen code. The commit contains only my two owned files plus the evidence screenshots. The node_modules symlinks are untracked and not committed.

**Files changed**
- `host/src/games/kart/scene/driftSparks.js` (new): the spark rig. It exports `LEVEL_COLORS`, `createDriftSparks()` and `updateDriftSparks(rig, drift, dt)`.
- `host/src/games/kart/scene/kartMesh.js`: the kart body now sits in an inner group that yaws and leans into a drift, and it calls the spark rig. Boost flames take the level color and scale with level.

**How it works**
- **Textures:** All spark textures are drawn once on a canvas: a soft radial glow, three jagged bolt shapes (each with a wide soft halo and a thin white core), and a streak. The shapes come from a seeded random generator, so they are the same on every load.
- **Pool per rear wheel:**
  - Sparks sit on the ground just outside each rear tire.
  - A glow and a hot flash.
  - Up to 4 bolts, each a halo sprite plus a near-white core sprite.
  - Up to 7 short streaks that fly back and outward.
- **Colors:** The halo and the streaks use exactly `#fff4d6`, `#2f8cff`, `#ff8a1f` and `#c040ff`. The core is the same color mixed 75% toward white, so there is a near-white core at every level.
- **Growth:** Per level, the number of bolts and streaks, bolt length, streak length, streak speed, and glow size and opacity all rise. The four levels are told apart by size and count, not just color.
- **Motion:** Bolts re-roll their shape, direction, length and root offset every 40 to 100 ms. Glow and flash flicker every frame, and streaks age and respawn on `dt`.
- **Drift body:** The body eases toward `drift.dir` with a yaw of 0.22 rad (about 12.6 degrees) and a roll of 0.1 rad away from the turn, at a rate of 9 per second. It is mirrored for `dir = -1`. A missing `kart.drift` is treated as idle.
- **Boost flames:** Level 0 keeps `0xffa020`. Levels 1 to 3 use the level color, scaled 1.1, 1.25 and 1.45. They show only while `kart.boost > 0`.
- **Hygiene:**
  - No geometry, material or texture is created per frame.
  - The flame geometry is shared at module scope.
  - Spark materials are per sprite, so the scene's dispose pass frees them. Textures and the shared sprite quad live at module scope.
  - All sparks are hidden unless `drift.sliding`.

**Decisions**
- **Camera-facing rotation:** Sprites can only rotate in screen space. Each directional sprite sets its own rotation in `onBeforeRender`, so every split-screen camera sees the bolts and streaks pointing back and outward. This also keeps `updateKartMesh(mesh, kart, dt)` and `createKartScene.js` untouched.
- **Ground glow without depth test:** The ground glow has `depthTest` off. With it on, the camera-facing quad cut a hard line where it crossed the road. The kart body can therefore be lightly washed by the glow, which looks close to the reference. Bolts and streaks keep the depth test.
- **Sparks inside the body group:** They follow the yawed wheels.
- **Tuning from screenshots:** After the first look the bolts were too large and too regular. I made them finer and shorter at level 3 (1.55 m long), widened and softened the glow, and cut the halo alpha so the colors stay saturated.

**Evidence** (all under `.claude/runs/kart-controls-rework/evidence/p3-a/`, committed). `drift3-rear.png` and `drift3-rear-100ms.png` are the pair for checking that frames differ. I viewed these screenshots myself:
- `drift0-rear.png` to `drift3-rear.png`
- `drift0-quarter.png` to `drift3-quarter.png`
- `drift3-left-rear.png`
- `boost1-rear.png` to `boost3-rear.png`
- `drift3-chase.png`
- `drift3-chase-4up.png`
- `drift3-rear-100ms.png`

**Uncertain**
- In the 4-way split screen the level-3 sparks are visible but small, as the karts are small there.
- The level-3 purple reads a little pink-white at the core because of additive blending, which is similar to the reference.
- Pixel cost with 4 karts is unmeasured. I expect up to about 30 additive sprites per kart.
