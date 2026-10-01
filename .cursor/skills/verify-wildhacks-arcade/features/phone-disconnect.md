# Phone disconnect

Phone disconnect lets the host pause the current bowler's turn when that phone drops, skip the rest of their frame, or continue when the same name rejoins.

## Sub-features

- `disconnect-pause` pauses the host on the current bowler when their phone closes before they throw.
- `disconnect-skip` records the rest of that frame as zero and moves on when the host chooses `Skip Turn`.
- `disconnect-rejoin` restores the turn when a phone joins again with the same name.

## How to get to it (user POV)

- During bowling, the current player closes the controller or loses the network.
- The host sees a reconnect message and chooses `Skip Turn`, or the player opens the phone URL again and enters the same name.
- A player who has not finished joining has no name, so closing that tab does not pause the host.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- Two phones have joined this session, in order: `Verify Player`, then `Second Player`.
- The host has chosen `Bowling`. `Verify Player`'s phone shows `BOWL`. `Second Player`'s phone shows `Waiting for your turn...`.
- The host is not already showing `Game Over`.

- **Drop the current phone.** Close the `Verify Player` tab with `browser_tabs` `action` `close` for that tab's index. Leave the host tab and the second phone tab open.
- **Pause.** Snapshot the host. A reconnect overlay reads `Waiting for Verify Player to reconnect…` and offers `Skip Turn`. The second phone still shows `Waiting for your turn...`.
- **Confirm the relay.** Copy the line `[relay] Phone disconnected: Verify Player (<playerId>)` from `run/relay.log` into `artifacts/phone-disconnect/relay.log.txt`. The id in parentheses is required; a line without it is a different event.
- **Rejoin.** Open the lobby's phone URL in a new tab, fill `Verify Player`, and click `Join Game`. The phone reaches the bowl controls again (`BOWL` is visible). The host overlay closes. The relay log contains `Player reconnected: Verify Player (<playerId>)`.
- **Skip.** Drop `Verify Player` again so the overlay returns. Click `Skip Turn`. The overlay closes and the turn moves to `Second Player`: that phone shows `BOWL`, and `Verify Player`'s frame on the host scoreboard shows zeros. The relay log does not need a new join line for the skip itself.
- **Proof.** Save `artifacts/phone-disconnect/paused.aria.txt` and `paused.png` while the overlay names `Verify Player`. Save `artifacts/phone-disconnect/rejoined-phone.aria.txt` and `rejoined-phone.png` when `BOWL` is back. Save `artifacts/phone-disconnect/after-skip.aria.txt` and `after-skip.png` from the host scoreboard and `second-bowling.aria.txt` from the second phone.

## Gotchas

- With only one player, `Skip Turn` still lands on that same disconnected player, so the overlay comes back immediately. Use two players when proving that skip clears the overlay.
- The lobby player list keeps a name after the phone disconnects. Prove the pause on the bowling overlay, not by watching the lobby.
- Rejoin matches the name of a disconnected player. A different name creates a new player and does not close the overlay.
- Close the controller tab only after `BOWL` is showing. Closing during the name screen does not emit `Phone disconnected` for a named player.
- `Skip Turn` records pin count `0` for each remaining roll in the frame. That is a zero on the scoreboard, not the angle-based gutter rule. It does not remove the player from the game.
