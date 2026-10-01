# WildHacks Arcade verification map

This directory is the maintained source for verifying the user-facing behavior of WildHacks Arcade (the screens say Wii Playground). Read this index before driving, then use the matching feature file as the recipe.

## Baseline preconditions

- Start the instance with `.cursor/skills/verify-wildhacks-arcade/scripts/launch.sh`.
- Host is `http://127.0.0.1:15173`. Phone is `http://127.0.0.1:15174`. Relay is `http://127.0.0.1:18080`.
- `scripts/doctor.sh` prints `DOCTOR OK` for those URLs and the PIDs in `run/instance.env`.
- Drive only tabs opened against this instance. The relay keeps sessions in memory; a new host load creates a new session.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Start every recipe from a fresh host load unless its preconditions say otherwise.
- Prefer accessible names from `browser_snapshot`. Use the ids in the feature file when the accessible name is only a placeholder or a symbol.
- Pass `viewId` on every browser call so host and phone actions stay on the correct tab.
- Treat button names and input placeholders in the recipes as literal.
- Copy relay log lines into `artifacts/` before cleanup. `scripts/cleanup.sh` deletes `run/`.

## Proof and skip reporting

- Capture the user action and the resulting state, not only the final screen.
- UI proof includes an accessibility snapshot file and a screenshot that shows the screen title.
- Join and disconnect proof includes a relay log line plus the other client's updated screen. Throw proof is the phone result screen plus the host scoreboard. The relay does not log throws.
- Record the feature id and the entry point with every artifact.
- Report an unreachable path with the attempted action and the unmet precondition.
- Do not report a skipped entry point as verified through a different path. The iOS motion-permission screen is a separate entry point from the desktop name screen.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with cursor-ide-browser` starts with `Preconditions:` and uses labeled bullets that pair each user action with an exact tool call and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

## Features

- [Join the lobby](./join-lobby.md) covers the host lobby, phone name entry, the player appearing on the TV, empty names, and duplicate names.
- [Select a game](./select-game.md) covers opening the hub, starting bowling, and opening a coming-soon game.
- [Bowl on your turn](./bowling-turn.md) covers the bowl controls, lane aim, and a short hold.
- [Simulate a bowl](./simulate-bowl.md) covers releasing a real throw from the desktop harness and the score that lands after the ball settles.
- [Play two rounds](./play-two-rounds.md) covers two players each finishing frame 1 and frame 2.
- [Phone disconnect](./phone-disconnect.md) covers a dropped controller during that player's turn, skip, and rejoin.
- [Host leaves](./host-leaves.md) covers the phone session-ended screen and the host lost-connection screen.
