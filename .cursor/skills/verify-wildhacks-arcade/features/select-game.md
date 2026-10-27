# Select a game

Select a game lets the host leave the lobby, pick a built game, and have every joined phone switch to that game. Unfinished games stay on the grid as disabled cards marked Coming Soon.

## Sub-features

- `select-open` opens the game grid from the lobby.
- `select-bowling` starts bowling on the host and mounts the bowling controller on the phone.
- `select-kart` starts Mario Kart on the host and mounts the kart controller on the phone (see [Start Mario Kart](./select-kart.md) for the race surface).
- `select-soon` keeps unfinished games disabled on the grid with a `Coming Soon` label; they do not open a separate screen.
- `select-disabled` keeps `Select Game` disabled while the lobby has no players.

## How to get to it (user POV)

- From the lobby, choose `Select Game` after at least one player has joined.
- On the grid, choose `Bowling` or `Mario Kart`.
- Unfinished titles (`Wizard Duel`, `3PT Contest`, `Tennis`, `Golf`, `Piano Master`) show `Coming Soon` and cannot be chosen.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- The join-lobby recipe has been completed for this session. The host lists `Verify Player` and `Select Game` is enabled.
- The phone tab that joined is still open on `Waiting for host to select a game...`.

- **Disabled entry.** On a fresh host load with no players, snapshot the lobby. `Select Game` is disabled. Do not treat a later enabled click as proof of this state.
- **Open the grid.** On the joined host tab, click the button named `Select Game`. The heading is `Choose a Game`. The grid has seven buttons. Their accessible names contain `Bowling`, `Mario Kart`, `Wizard Duel`, `3PT Contest`, `Tennis`, `Golf`, and `Piano Master`. `Bowling` and `Mario Kart` are enabled and do not contain Coming Soon. The other five are disabled and contain Coming Soon (CSS may render the badge as `COMING SOON`).
- **Coming soon (disabled).** Snapshot a disabled card such as `Wizard Duel`. It stays on `Choose a Game`. Do not expect a `Coming Soon` page or a change on the phone — unfinished cards do not send `game_selected`.
- **Start bowling.** Click the button whose accessible name contains `Bowling` and does not contain Coming Soon. The host leaves the grid and shows scoreboard text that matches `/scores/i` (CSS may render `SCORES`) with `Verify Player`, plus a button named `← Games`. The phone leaves the playground waiting screen. It may briefly show heading `Bowling` and `Waiting for your turn...` (or `Game started! Waiting for your turn...`) before `your_turn` lands. Poll until `#btn-bowl` reads `BOWL` with `Hold and swing to bowl!` and tabs `MOVE` / `AIM` (ids `tab-move`, `tab-aim`, `btn-bowl`).
- **Confirm the relay.** The relay does not log `game_selected` and the phone does not print that message. The phone bowling controls are the side effect of the host's selection. Keep the host scoreboard snapshot as the other view.
- **Proof.** Save `artifacts/select-game/grid.aria.txt`, `grid.png`, `bowling-host.aria.txt`, `bowling-host.png`, `bowling-phone.aria.txt`, and `bowling-phone.png`. The phone artifacts must show `BOWL`. The host artifacts must show the scoreboard label and `Verify Player`. The grid count is the seven cards inside `.game-select-grid`. A `Settings` button on the page is outside that count.

## Gotchas

- `Select Game` is disabled at zero players. Snapshot the disabled state before joining if you need `select-disabled`. After a join, the button is enabled and that earlier state is gone.
- Unfinished cards are `disabled={!game.built}`. Automation cannot open a Coming Soon detail screen from the grid. `ComingSoonScreen` in the host app is only a fallback for an unknown screen id, not a grid destination.
- `← Games` on the bowling screen returns to the grid. That control is separate from any coming-soon back button.
- Starting bowling sends `your_turn` to the first player immediately. The phone that joined first should show `BOWL` without an extra host click.
- The lane is a canvas. Prove the host entered bowling with scoreboard text matching `/scores/i` and `← Games`, not with pin pixels.
- Mario Kart is also built. Proving kart start belongs in [Start Mario Kart](./select-kart.md); this file only requires the grid to list it as an enabled card without `Coming Soon`.
