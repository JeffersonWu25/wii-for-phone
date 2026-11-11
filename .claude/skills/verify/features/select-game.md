# Select a game

After the lobby has at least one player, the host presses `Select Game` and sees a hub of game cards. Bowling, Kart Racer, and Tennis are built and enabled. The other games are disabled cards marked `Coming Soon`.

## Sub-features

- `hub-opens`: `Select Game` on the lobby opens the `Choose a Game` screen.
- `built-games-enabled`: the Bowling, Kart Racer, and Tennis cards are enabled buttons.
- `unbuilt-games-disabled`: Wizard Duel, 3PT Contest, Golf, and Piano Master are disabled cards with `Coming Soon`.

## How to get to it (user POV)

- On the host TV, join at least one phone to the lobby.
- Press `Select Game` on the lobby (`.btn-start`). It stays disabled until a player has joined.
- Read the game cards on the `Choose a Game` screen.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The script joins one phone named `Ada` first, because `Select Game` is disabled with no players.

Run it:

```bash
node .claude/skills/verify/scripts/drive.mjs select-game
```

Steps the script performs:

- Join `Ada` on a phone (see the join-lobby recipe for the join steps). Expect the host lobby to list `Ada`.
- Click `.btn-start`. Expect `.game-select-screen` and the `Choose a Game` heading.
- Read each `.game-card`. Expect Bowling, Kart Racer, and Tennis enabled, and every other card disabled with `Coming Soon`.

Evidence in `artifacts/select-game/`: `host-game-select.png` and `host-game-select.aria.txt`.

## Gotchas

- The `Select Game` button is disabled until a player joins. Starting this feature on an empty lobby waits and fails, which is correct.
- A disabled card is a `button` with the `disabled` attribute. Clicking it does nothing, so do not treat a click as proof the game started. Start a game through its enabled card, as the bowling feature does.
- Selecting a card sends `game_selected` to the phones before the host switches screens. Phones that already joined load the game, so the select step is also the start of the game features.
