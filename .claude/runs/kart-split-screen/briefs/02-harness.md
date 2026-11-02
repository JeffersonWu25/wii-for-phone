# Brief S2: verify harness for split screen

You are working in the repo `wii-for-phone` (a Wii-style party game: host TV page in `host/`, phone controller in `phone/`, relay in `relay/`). You are in your own git worktree on your own branch, based on `feat/kart-split-screen`. Commit your work on your branch when done (end the commit message with `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>`). Do not push.

## The user's goal

Kart Racer gets local split screen for 1–4 players (one view per player, shared minimap, per-player HUD). Read `.claude/runs/kart-split-screen/RUN.md` first, especially the **Host DOM contract**. Other agents are building the renderer and the HUD at the same time; you build the verification for it against that contract. The contract is fixed: code to it even though the host does not implement it yet.

## Files you own

Only `.claude/skills/verify/**` (scripts, features, SKILL.md, artifacts folders). Read `.claude/skills/verify/SKILL.md`, `features/README.md`, `features/kart-race.md`, `scripts/instance.mjs`, `scripts/drive.mjs` before changing anything.

## What to build

1. **Port offset.** Let `VERIFY_PORT_OFFSET` (integer env var, default 0) shift all three ports (relay, host, phone) in `instance.mjs` and everywhere `drive.mjs` uses them, so two worktrees can each run their own instance at the same time. The `run/` folder is already per checkout. Doctor, launch, cleanup and drive must all respect it. Document it in SKILL.md (Isolation section).
2. **New feature `kart-split`**: one drive entry, one `features/kart-split.md` (follow the feature entry contract in `features/README.md`), one `artifacts/kart-split/` folder. Do not import or depend on another feature's code or artifacts; if you need a helper that `kart-race` also uses (joining phones, the CDP touch steering), only move it into its own shared module if two features truly use it, per the harness rules.
   - For N = 1, 2, 3, 4: fresh host page (1280x720), join N phones (names e.g. Ada, Bo, Cy, Di), Select Game, Kart Racer. Wait for the countdown, then for racing.
   - Hold GAS on every phone through the real touch path (as `kart-race` does) so all karts move; light steering is fine but not required. Let them drive ~4 s.
   - Screenshots per N: `n<N>-countdown.png` (during countdown) and `n<N>-racing.png` (while racing), plus an aria snapshot of the host per N.
   - Checks per N, from the contract: `.kart-app[data-players=N]`; exactly N `.kart-pane`s with slots 0..N-1 and the expected `data-side` (1p left; 2p left,right; 3p left,right,left; 4p left,right,left,right); each pane's bounding box matches the layout (halves/quadrants of the viewport within a few px); each pane has `.kart-item-slot.main` and `.kart-item-slot.reserve`, `.kart-coins` containing `00`, `.kart-lapcount` containing `1/3`, `.kart-place` matching `/^\d+(st|nd|rd|th)$/`; exactly one `.kart-minimap` with N `.kart-map-marker`s; for N=3 the minimap is inside `.kart-map-quadrant`, whose box is the bottom-right quadrant; for N=1 the minimap's centre is in the right 25% of the screen and vertically within the middle third; for N=2 and N=4 the minimap's centre is within 5% of the screen centre; no `.kart-timer` and no `.kart-standings`; every kart's `s` in `window.__kartState` advanced while racing (each view has a moving kart).
   - Also N = 5: join 5 phones, check `data-players=4` and that the 5th player is not in `__kartState.karts`.
   - Write `result.json` and `frames.jsonl` like the other features.
3. **Update `kart-race`** to the new contract: the HUD lap is read from `.kart-pane[data-slot="0"] .kart-lapcount` (expect `1/3`, `2/3`, `3/3` instead of `LAP n/3`), the "host shows the canvas and the HUD" check uses `.kart-pane`, `.kart-lapcount`, `.kart-minimap` instead of `.kart-lap` / `.kart-timer`, and any `.kart-countdown` read uses `.first()`. Keep everything else in that feature unchanged. Update `features/kart-race.md` to match.
4. Update `features/README.md` (features list) and `SKILL.md` (Drive section, feature ids comment in drive.mjs) to list `kart-split`.

## Success criteria

- `node .claude/skills/verify/scripts/instance.mjs launch` / `doctor` / `cleanup` work with and without `VERIFY_PORT_OFFSET=100`.
- `drive.mjs join-lobby` and `drive.mjs select-game` still pass (run them; use `VERIFY_PORT_OFFSET=100` or similar so you don't collide with anything).
- `drive.mjs kart-split` runs end to end: phones join, the race starts, screenshots are written. Its HUD contract checks are expected to FAIL on this branch because the HUD is not built yet; report which checks pass and which fail and confirm each failure is only the missing contract, not a harness bug.
- Do not run the full `kart-race` (2.5 min) more than once; it is also expected to fail on the HUD contract until the HUD lands.
- Install deps with `npm ci` in `host/`, `phone/`, `relay/` if `node_modules` is missing in your worktree.
- Clean up the instance when done. Do not commit `run/`. Commit the `kart-split` artifacts you produced only if they are useful as a sample; they will be regenerated later.

## Rules

- Match the surrounding harness code and doc style. No dead code, no leftover debug output.
- A shared helper goes in its own module only once two features use it; a feature never depends on another feature's code or artifacts.
- Final report: what changed per file, how the port offset works, the check list for kart-split, the run output (pass/fail per check), and anything rough.

---

## Final report (S2, unedited)

Port offset, the `kart-split` feature and the `kart-race` contract update are built and committed on my worktree branch (75b57c6, not pushed). `kart-split` runs end to end. `join-lobby` and `select-game` pass. `kart-race` fails and was not exercised past that, so my edits to it are untested. The instance is cleaned up and `run/` is not committed.

Note: `.claude/runs/kart-split-screen/RUN.md` is not in my worktree. I read it from the main checkout at `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/RUN.md`.

## Changes per file (all under `.claude/skills/verify/`)

- **`scripts/instance.mjs`**
  - `VERIFY_PORT_OFFSET` (integer, default 0) is added to all three ports: 18080, 15173, 15174.
  - A non-integer value exits 2 with a message.
  - The ports and URLs are computed once, so launch, doctor and cleanup follow them. `drive.mjs` already imports `PORTS` and `URLS`, so it follows too (the relay websocket match and the QR URL check).
  - The header comment mentions the offset.
- **`scripts/drive.mjs`**
  - New `kart-split` feature, in the feature map and the feature ids comment.
  - `kart-race`:
    - It waits for `.kart-pane` instead of `.kart-lap`.
    - The "canvas and HUD" check uses `.kart-pane`, `.kart-lapcount` and `.kart-minimap`.
    - The `.kart-countdown` text read uses `.first()`.
    - The HUD lap is read from `.kart-pane[data-slot="0"] .kart-lapcount` with `/(\d)\/(\d)/`, so it expects `1>2>3`.
  - Frame records now carry a `round` field when `run.round` is set. `kart-split` sets it to `n1` to `n5` so frames from different rounds can be told apart.
- **`SKILL.md`**
  - The Isolation section documents the offset: export it for every command, and the ports with offset 100.
  - The Drive section lists `kart-split`.
  - The stable-handles list uses the new host kart selectors.
- **`features/kart-split.md`** is new, following the feature entry contract.
- **`features/README.md`** lists `kart-split`.
- **`features/kart-race.md`** is updated to the new contract (`.kart-lapcount`, `.kart-pane`, `.first()`).
- **`artifacts/kart-split/`**: I committed this run as a sample (screenshots, aria snapshots, `frames.jsonl`, `result.json`). Regenerate it once the HUD lands.

## How the offset works

Every script reads `VERIFY_PORT_OFFSET` when it starts. With `VERIFY_PORT_OFFSET=100`, the relay is 18180, the host 15273 and the phone 15274. `run/` is already per checkout, so two worktrees with different offsets can run instances at the same time.

I ran launch, doctor and cleanup with offset 100 and with no offset. After cleanup, doctor reports `no instance record`.

## `kart-split` checks

The feature runs five rounds, N = 1 to 5. Each round uses a fresh host page at 1280x720. It joins the first N of Ada, Bo, Cy, Di, Eve, then selects Kart Racer. It holds GAS on each racer's phone through CDP touch, which is how `kart-race` does it. It waits for the countdown, screenshots `n<N>-countdown.png`, waits for racing, captures `n<N>-racing` (png plus aria snapshot of the host), and drives about 4 s.

Checks per N (racers = min(N, 4)):
- GAS registers on every racer's phone.
- `.kart-app[data-players]` equals the racer count.
- Exactly that many `.kart-pane`, with slots 0..racers-1.
- Pane sides are `left`, `left,right`, `left,right,left` or `left,right,left,right`.
- Each pane box is within 4 px of the full viewport, halves or quadrants.
- Each pane has one main and one reserve item slot.
- Each pane's `.kart-coins` contains `00`.
- Each pane's `.kart-lapcount` contains `1/3`.
- Each pane's `.kart-place` matches `/^\d+(st|nd|rd|th)$/`.
- One `.kart-minimap` with one marker per racer.
- Minimap placement by N:
  - N=1: centre in the right 25% and the middle third.
  - N=2 and N=4: centre within 5% of the screen centre.
  - N=3: minimap inside `.kart-map-quadrant`, and that box is the bottom-right quadrant.
- No `.kart-timer` and no `.kart-standings`.
- Each kart's `s` advanced (modulo the track length), and the number of karts equals the racer count.
- N=5 only: Eve is not in `__kartState.karts`.

## Run output on this branch (HUD and renderer not built)

Passed:
- The GAS check at every N.
- "Every kart advanced" at N=1 to 4. All karts moved +66 m in the window, so the phone-to-host touch path works.

Failed (the first three are the missing contract, nothing else):
- All `.kart-app`, `.kart-pane` and pane-content checks (data-players, slots, sides, boxes, item slots, coins, lap, place). They fail because the elements do not exist: `data-players null`, `slots` empty.
- Minimap: one `.kart-minimap` exists but has 0 markers (the old minimap). N=3 has no `.kart-map-quadrant` ("missing"). The old minimap centre is at 91%, 84% of the screen, so the placement checks fail.
- "No `.kart-timer` and no `.kart-standings`" fails: the old timer and standings still exist.
- N=5: the host still builds 5 karts, so "5th player not in karts" and "kart count equals 4" fail (the 5th kart's `s` delta is junk because it has no gas). The renderer cap fixes that.

I found no harness bug.

`kart-race` fails at the first wait for `.kart-pane`, which does not exist yet. It never reached the driving loop, so my lap-read edit is syntactically checked only (`node --check`) and not exercised. Run it again once the HUD lands.

## Rough edges

- The lap check assumes no kart crosses the line within 4 s of GO. The place text is only checked for shape.
- Frames from all rounds go into one `frames.jsonl`, separated by the `round` field.
- I did not put the gas-hold or HUD helpers in a shared module, since `kart-race` doesn't use them.
- I reverted the `join-lobby`, `select-game` and `kart-race` artifacts my test runs overwrote, so only `kart-split` artifacts are in the commit.
- Install: `npm ci` was run in `host/`, `phone/` and `relay/` in the worktree. `node_modules` is gitignored.
