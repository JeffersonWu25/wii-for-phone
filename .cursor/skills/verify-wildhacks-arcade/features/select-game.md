# Select a game

Select a game lets the host leave the lobby, pick bowling, and have every joined phone switch to that game. Picking an unfinished game shows a coming-soon screen on the host.

## Sub-features

- `select-open` opens the game grid from the lobby.
- `select-bowling` starts bowling on the host and mounts the bowling controller on the phone.
- `select-soon` opens the coming-soon screen for a game that is not built, and returns to the grid.
- `select-disabled` keeps `Select Game` disabled while the lobby has no players.

## How to get to it (user POV)

- From the lobby, choose `Select Game` after at least one player has joined.
- On the grid, choose `Bowling`.
- On the grid, choose `Wizard Duel`, `3PT Contest`, `Tennis`, `Golf`, or `Piano Master`.
- On the coming-soon screen, choose `← Back to Games`.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- The join-lobby recipe has been completed for this session. The host lists `Verify Player` and `Select Game` is enabled.
- The phone tab that joined is still open on `Waiting for host to select a game...`.

- **Disabled entry.** On a fresh host load with no players, snapshot the lobby. `Select Game` is disabled. Do not treat a later enabled click as proof of this state.
- **Open the grid.** On the joined host tab, click the button named `Select Game`. The heading is `Choose a Game`. The grid has six buttons. Their accessible names contain `Bowling`, `Wizard Duel`, `3PT Contest`, `Tennis`, `Golf`, and `Piano Master`. Every button except `Bowling` also contains `Coming Soon`.
- **Start bowling.** Click the button whose accessible name contains `Bowling` and does not contain `Coming Soon`. The host leaves the grid and shows the text `Scores` with `Verify Player`, plus a button named `← Games`. The phone leaves the playground waiting screen and shows `Hold and swing to bowl!` with buttons `MOVE`, `AIM`, and `BOWL` (ids `tab-move`, `tab-aim`, `btn-bowl`).
- **Confirm the relay.** The relay does not log `game_selected` and the phone does not print that message. The phone bowling controls are the side effect of the host's selection. Keep the host `Scores` snapshot as the other view.
- **Coming soon.** Load a new session, join one phone, open the grid, and click the button whose accessible name contains `Wizard Duel`. The host heading is `Coming Soon` and the body says `This game is still in development. Check back later!` The button is `← Back to Games`. The phone stays on `Waiting for host to select a game...` because the controller has no wizard-duel screen.
- **Back to the grid.** Click `← Back to Games`. The heading is `Choose a Game` again.
- **Proof.** Save `artifacts/select-game/grid.aria.txt`, `grid.png`, `bowling-host.aria.txt`, `bowling-host.png`, `bowling-phone.aria.txt`, and `bowling-phone.png`. The phone artifacts must show `BOWL`. The host artifacts must show `Scores` and `Verify Player`.

## Gotchas

- `Select Game` is disabled at zero players. Snapshot the disabled state before joining if you need `select-disabled`. After a join, the button is enabled and that earlier state is gone.
- Clicking a coming-soon card still tells phones a game was selected. The phone has no UI for those ids, so it stays on the playground waiting screen. Do not call that waiting screen a successful game start.
- `← Games` on the bowling screen returns to the grid. `← Back to Games` is the coming-soon control. They are different buttons.
- Starting bowling sends `your_turn` to the first player immediately. The phone that joined first should show `BOWL` without an extra host click.
- The lane is a canvas. Prove the host entered bowling with the `Scores` text and `← Games`, not with pin pixels.
