# Play two rounds

Play two rounds lets two players each finish frame 1 and frame 2. A round is one bowling frame: every joined player bowls until that frame is over, then the next frame starts with the first player.

## Sub-features

- `rounds-roster` starts bowling with two named players in join order.
- `rounds-frame` ends a player's frame on a strike, or after their second roll.
- `rounds-order` gives the turn to one phone at a time, in join order, and returns to the first player for the next frame.
- `rounds-two` leaves both players with two completed frames on the host scoreboard.

## How to get to it (user POV)

- Two players join from the lobby, then the host chooses `Bowling`.
- The first player's phone shows `BOWL`. They bowl until the frame ends.
- The second player's phone then shows `BOWL`, and they finish the same frame.
- Both players do that again for the next frame. The host scoreboard shows both names and the marks for those two frames.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- Two phones have joined this session, in order: `Verify Player`, then `Second Player`.
- The host has chosen `Bowling`. `Verify Player` shows `Hold and swing to bowl!`. `Second Player` shows `Waiting for your turn...` under the heading `Bowling`.
- The host scoreboard lists both names and the first two frames of each are empty.

- **Throw the current roll.** Find the phone tab whose snapshot contains the button `BOWL`. Run the polling `Runtime.evaluate` release from [Simulate a bowl](./simulate-bowl.md) on that tab only. Wait for its returned `heading`. Do not start the next throw until that heading has arrived.
- **Record the result.** Snapshot that phone until the heading is `STRIKE!`, `SPARE!`, or ends with `knocked down`. Then read the host scoreboard with the expression in [Simulate a bowl](./simulate-bowl.md). A frame is complete when its roll cells include `X`, or when two cells are non-empty (digits and/or `/`).
- **Follow the turn.** After the result, wait until a phone shows `BOWL` again. A strike or a second roll moves `BOWL` to the other phone. A first roll that is not a strike returns `BOWL` to the same phone after about 1500ms. Repeat the throw on whichever phone shows `BOWL`.
- **Stop at two rounds.** Stop when both `Verify Player` and `Second Player` have two complete frames. That is at most 8 throws. Do not start frame 3's proof; if `BOWL` appears for frame 3 after the second frames are already complete, leave it and capture the scoreboard as it is.
- **Proof.** Save `artifacts/play-two-rounds/scoreboard.json` from the host expression after the last completing throw. Save `artifacts/play-two-rounds/scoreboard.aria.txt`, `scoreboard.png`, and one phone result snapshot pair (`result.aria.txt`, `result.png`) from the throw that completed the second frame for the second player. Both names appear on the host. Each player's first two frames are complete. The relay has no throw lines; the scoreboard is the side effect.

## Gotchas

- One player cannot complete two rounds of a two-player game. Join `Second Player` before the host chooses `Bowling`. A player who joins after the game starts is not in the scoreboard.
- Do not assert an exact score. Power is `0.5` with no swing, so pin counts vary. Assert that each of the four frames is complete.
- Each roll in this harness took about 5 seconds to settle. The next `BOWL` appears about 1500ms after the result heading. Throwing again before the heading arrives stacks a throw the host ignores.
- Throw only on the phone that currently shows `BOWL`. A throw from the waiting phone is ignored by the host.
- The waiting phone's heading is `Bowling` with `Waiting for your turn...`. After that player bowls, their screen stays on the result until their next turn. Do not look for `BOWL` on a phone that is showing a result.
- Stop at 8 throws even if a frame looks incomplete, and report the scoreboard JSON. More than 8 throws means a roll was not recorded.
- `← Games` abandons the scoreboard. Do not press it during this recipe.
