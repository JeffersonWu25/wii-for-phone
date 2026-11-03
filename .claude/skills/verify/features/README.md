# Wii Bowling verification map

This directory is the maintained source for verifying the user-facing behavior of the Wii Bowling web app: the host TV screen, the phone controller, and the relay between them. Read the index before driving, then run the matching feature's script. The feature file is the recipe.

## Baseline preconditions

- Start the instance with `node .claude/skills/verify/scripts/instance.mjs launch`.
- Host is `http://127.0.0.1:15173`, phone is `http://127.0.0.1:15174`, relay is `http://127.0.0.1:18080`.
- `node .claude/skills/verify/scripts/instance.mjs doctor` prints `DOCTOR OK`. The drive script refuses to run otherwise.
- Each feature run opens its own host page, so it starts a new relay session. Nothing carries over from a previous run.
- Never drive an instance that was not started by this verification run.

## Driving conventions

- Run a feature with `node .claude/skills/verify/scripts/drive.mjs <feature-id>`. It drives real Chrome for both the host and the phone.
- Prefer the element ids and class names listed in each feature file. They come from the source, not the rendered text.
- Treat every visible string in a feature file as literal, including the wording the checks compare against.
- Read `artifacts/<feature-id>/result.json` for the verdict. The exit code is the same signal.

## Proof and skip reporting

- Capture the action and the resulting state, not only the final screen.
- UI proof includes a screenshot and an accessibility snapshot of each captured state.
- Multiplayer and throw proof includes `frames.jsonl`, which holds every relay frame in both directions.
- Join proof also includes the relay log lines for this run.
- Record the feature id and the entry point in the artifacts. Each result also records the checks it ran.
- Report an unreachable path with the attempted action and the unmet precondition.
- Do not report a skipped entry point as verified through a different path. The iOS motion-permission grant is a separate path from Chrome's, and it is not verified here.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses four H2 sections in this order.

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with Playwright` starts with `Preconditions:` and pairs each user action with the exact driver step and the observable result.
4. `Gotchas` lists traps that can waste or invalidate a run.

## Features

- [Join the lobby](./join-lobby.md) covers the host lobby and QR, the phone's name entry, empty and duplicate names, and players appearing on the host.
- [Select a game](./select-game.md) covers the game hub, with Bowling and Kart Racer enabled and the unbuilt games disabled.
- [Bowl a throw](./bowling-throw.md) covers starting Bowling, the phone's turn screen, a hold-and-release throw, the result, and the host scoreboard.
- [Race Kart Racer](./kart-race.md) covers starting Kart Racer with two phones, the countdown, a full 3-lap drive steering with the real phone joystick (no GAS button, the kart drives itself), boost pads, the corridor wall without respawn, the results card, and returning to the hub.
- [Kart Racer split screen](./kart-split.md) covers one view per racer for 1 to 4 players, the pane layout and per-pane HUD, the shared minimap, the cap at 4 racers, and karts moving from GO with no input.
- [Kart drift](./kart-drift.md) covers the phone's stick, DRIFT and ITEM buttons: gas always on, the slide, charge levels 1 to 3, the boost on release, the brake cancel, reverse, and the ITEM tap that sends `use_item`.

## Not mapped yet

These paths exist in the source and are not verified by any feature above. Add a feature file before claiming them.

- Two or more players in bowling: turn rotation after each throw, and the frame and game-over flow.
- Bowling's 10th frame and scoring rules beyond the first roll.
- Phone disconnect and rejoin during a turn, and skipping a disconnected player.
- Host leaving mid-game (the phone's `Session Ended` screen).
- The iOS motion-permission path (`requestPermission` denied, or granted on Safari).
