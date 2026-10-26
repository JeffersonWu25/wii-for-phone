# Start Mario Kart

Start Mario Kart lets the host leave the lobby grid, open the race on the TV, and put every joined phone on the kart controller with a stick and item button.

## Sub-features

- `kart-open` starts Mario Kart from the game grid after at least one player has joined.
- `kart-host` shows the race HUD on the host with `Back` and `Tuning`.
- `kart-phone` mounts the phone kart screen with `Use item` and the stick pad.

## How to get to it (user POV)

- From the lobby, choose `Select Game` after at least one player has joined.
- On the grid, choose `Mario Kart`.
- On the phone, wait for the race to load, then steer with the stick and tap `Use item` when ready.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- A fresh session: host lists `Verify Player` and the phone is on `Waiting for host to select a game...`.
- Prefer a session that has not already entered bowling, so the phone shell is still waiting for `game_selected`.

- **Open the grid.** Click `Select Game`. The heading is `Choose a Game`. The `Mario Kart` button is enabled and its accessible name does not contain `Coming Soon`.
- **Start kart.** Click the button whose accessible name contains `Mario Kart`. The host leaves the grid. Snapshot until a `Back` button (class `kart-back`) and a `Tuning` button are visible. A countdown digit may appear briefly; the race canvas is present even if pin-like bowling UI is not.
- **Confirm the phone.** Snapshot the phone tab. The kart screen shows `Use item` (id `kart-item`) and the stick pad (id `kart-stick`). Copy such as `Waiting for the start` or a place/lap line may appear under `#kart-sub` / `#kart-place` / `#kart-lap`.
- **Confirm the relay.** The relay does not log `game_selected`. The phone kart controls are the side effect. Keep the host `Back` / `Tuning` snapshot as the other view.
- **Proof.** Save `artifacts/select-kart/host.aria.txt`, `host.png`, `phone.aria.txt`, and `phone.png`. The phone artifacts must show `Use item`. The host artifacts must show `Back` and `Tuning`.

## Gotchas

- Do not confuse this with bowling. Bowling proof is the scoreboard (`/scores/i`) and `BOWL`. Kart proof is `Back` / `Tuning` / `Use item`.
- `Back` returns to the game grid and broadcasts `game_selected` with a null game. Do not press it while capturing proof.
- A phone that was already mounted on bowling will unmount and remount when Mario Kart is selected from a later grid visit; for a clean proof, start kart from the waiting screen.
- Countdown and place text change quickly. The stable controls (`Use item`, stick, host `Back` / `Tuning`) are the pass criteria, not a specific countdown value.
