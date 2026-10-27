# Start Mario Kart

Start Mario Kart lets the host leave the game grid and open the Mario Kart main menu. Joined phones leave the waiting screen and show `Look at the TV`. The race HUD and the stick pad come later, after Start Race.

## Sub-features

- `kart-open` starts Mario Kart from the game grid after at least one player has joined.
- `kart-host` shows the main menu with `Race` and `Back to games`.
- `kart-phone` shows `Look at the TV` and does not mount the stick.

## How to get to it (user POV)

- From the lobby, choose `Select Game` after at least one player has joined.
- On the grid, choose `Mario Kart`.
- The TV shows the main menu. The phone says to look at the TV. Nobody is racing yet.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- A fresh session: host lists `Verify Player` and the phone is on `Waiting for host to select a game...`.
- Prefer a session that has not already entered bowling, so the phone shell is still waiting for `game_selected`.

- **Open the grid.** Click `Select Game`. The heading is `Choose a Game`. The `Mario Kart` button is enabled and its accessible name does not contain `Coming Soon`.
- **Open the menu.** Click the button whose accessible name contains `Mario Kart`. The host leaves the grid. Snapshot until the heading `Mario Kart`, a `Race` button (class `kart-primary`), and a `Back to games` button (class `kart-stage-back`) are visible. The menu has no `Settings` control and no race leave button.
- **Confirm the phone.** Snapshot the phone tab. The kart screen shows `Look at the TV`. `Use item` (id `kart-item`) and the stick pad (id `kart-stick`) are absent.
- **Confirm the relay.** The relay does not log `game_selected`. The phone copy is the side effect. Keep the host menu snapshot as the other view.
- **Proof.** Save `artifacts/select-kart/host.aria.txt`, `host.png`, `phone.aria.txt`, and `phone.png`. The phone artifacts must show `Look at the TV` and must not show `Use item`. The host artifacts must show `Race` and `Back to games`.

## After Start Race

`Use item`, `.kart-stick`, host `.btn-abandon` (`← Games`), and `Settings` belong to the race. They appear only after the host has passed Characters, the track, and the race lobby, and every connected phone is ready. Lap and item proof belongs in [Complete one Mario Kart lap](./complete-lap.md) and [Use every Mario Kart item](./use-kart-items.md).

- Host `Race` opens the character mirror. Cells are not buttons.
- The phone shows `Choose a racer`. A character button id is `kart-character-` plus the id (`kart-character-mario`, `kart-character-luigi`, `kart-character-peach`, `kart-character-daisy`). `Confirm` (`#kart-confirm`) sends the pick.
- Host `Continue` opens `Luigi Circuit` (Previous and Next stay disabled with one track), then the race lobby. The phone `Ready` button is `#kart-ready-toggle`.
- Host `Start Race` is enabled only when every connected phone is ready. That click mounts the race. The phone builds the stick on the countdown and starts driving when the race goes.
- Stage `Back` (class `kart-stage-back`, label `Back`) returns one stage and does not clear the game. `Back to games` on the menu, and `← Games` (class `btn-abandon`) during the race, both leave kart.

## Gotchas

- Do not confuse this with bowling. Bowling proof is the scoreboard (`/scores/i`) and `BOWL`. The first kart proof is `Race`, `Back to games`, and `Look at the TV`.
- `Back to games` returns to the game grid and broadcasts `game_selected` with a null game. Do not press it while capturing proof. The stage `Back` button on later kart screens is a different control.
- A phone that was already mounted on bowling will unmount and remount when Mario Kart is selected from a later grid visit. For a clean proof, start kart from the waiting screen.
- The stick and `Use item` missing on the first phone screen is the pass. Do not wait for a countdown on that screen.
