# Complete one Mario Kart lap

Complete one lap advances the racer from lap 1 to lap 2 on both the phone controller and the host HUD after the race is running. The phone stick sends the drive stream. The host only advises a steer value.

## Sub-features

- `kart-race-start` walks menu → characters → track → lobby → Start Race until the race HUD is up.
- `kart-lap-drive` holds the phone stick under closed-loop steer until one lap completes.
- `kart-lap-hud` shows `Lap 2 / 3` on the phone (`#kart-lap`) and `2 / 3` on the host (`.kart-lap-count`).

## How to get to it (user POV)

- From the lobby, choose `Select Game`, then `Mario Kart`.
- On the TV choose `Race`. On the phone pick a racer and `Confirm`.
- On the TV choose `Continue` through the track, wait until the phone is `Ready`, then `Start Race`.
- When the countdown ends, steer with the stick and drive a full circuit past the start/finish line once.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- A fresh session with one joined player named `Verify Player` on the waiting screen.
- Prefer a session that has not entered bowling.

- **Reach the race.** Click `Select Game`, then the enabled `Mario Kart` button. Click host `Race`. On the phone click `kart-character-mario`, then `Confirm`. On the host click `Continue` (characters), then `Continue` (track). On the phone click `Ready`. On the host click `Start Race`. Snapshot until the phone shows `#kart-stick` and `#kart-lap` text `Lap 1 / 3`, and the host shows `.kart-layout` with `.kart-lap-count` text `1 / 3`.
- **Wait for go.** Poll host `Runtime.evaluate` with the expression in `scripts/cdp/kart-find-race.js` until `phase` is `racing`. The phone stream starts on `race_go` and keeps `gas` true.
- **Drive one lap.** Repeat until the host expression reports `completedLaps >= 1` or the phone `#kart-lap` reads `Lap 2 / 3` (cap the loop around 120 seconds):
  1. Host tab: `browser_cdp` `Runtime.evaluate` the expression in `scripts/cdp/kart-desired-steer.js` (`returnByValue` true). Read `steer`.
  2. Phone tab: `browser_cdp` `Runtime.evaluate` the expression in `scripts/cdp/kart-set-stick.js` after replacing `__STEER__` with that number. Confirm `ok: true`.
  3. Sleep about 50ms. Do not send WebSocket frames yourself. The phone page must keep emitting `drive`.
- **Proof.** Save `artifacts/complete-lap/phone-lap.aria.txt` and `phone-lap.png` while `#kart-lap` shows `Lap 2 / 3`. Save `artifacts/complete-lap/host-lap.aria.txt` and `host-lap.png` while `.kart-lap-count` shows `2 / 3`. Save the final host find-race JSON as `artifacts/complete-lap/race.json` with `completedLaps` at least `1`.

## Gotchas

- `select-kart` only proves the main menu and `Look at the TV`. This feature starts after that menu and must pass character pick, track, ready, and Start Race.
- A mouse click on the stick does not hold capture the way these pointer events do. Use the CDP expression, not `browser_click`, for steer.
- Host fiber reads are advisory. Mutating `kart.steer` on the host is not proof. The phone stick path is.
- Luigi Circuit is roughly 245–305 m. At race speed one lap is often under a minute when the steer loop stays on asphalt. If `completedLaps` stays 0 past two minutes, doctor the instance and check that `phase` is `racing` and the stick expression returns `ok`.
- Crossing the line updates `completedLaps` only after every checkpoint gate in order. Spawning past the line or teleporting progress is not this feature.
