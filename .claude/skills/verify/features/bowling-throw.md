# Bowl a throw

With Bowling selected, the host starts the game and the first player's phone gets the bowl screen. The player holds the BOWL button and swings. Releasing sends one throw. The phone shows the throw's speed, angle, and curve, the host runs the physics and records the first roll on the scoreboard, and the phone returns to waiting.

## Sub-features

- `bowl-screen-on-turn`: the first player's phone shows the bowl screen (`#screen-bowl`) with the BOWL button.
- `hold-and-release`: holding BOWL streams `pos` packets, and releasing sends exactly one `throw` event.
- `throw-result-screen`: the phone shows the result with the pin count and the Speed, Angle, and Curve readouts.
- `scoreboard-first-roll`: the host scoreboard records the first roll for that player once the ball settles.
- `return-to-waiting`: tapping the result returns the phone to `Waiting for your next turn...`.

## How to get to it (user POV)

- Join a phone to the lobby, then press `Select Game` and choose the Bowling card.
- The host shows the scoreboard. On the first player's phone, the bowl screen appears.
- Press and hold BOWL, swing the phone, and let go.
- The phone shows the result. Tap it to dismiss. The host scoreboard fills in the roll.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The script joins one phone named `Ada` and selects Bowling, so `Ada` is the first and only player.

Run it:

```bash
node .claude/skills/verify/scripts/drive.mjs bowling-throw
```

Steps the script performs:

- Join `Ada` on a phone, press `Select Game`, click the Bowling card.
- Expect the host `.scoreboard-player` for `Ada`, and the phone `#screen-bowl` with `#btn-bowl` visible.
- Capture the host scoreboard before the throw.
- On the phone, dispatch `touchstart` on `#btn-bowl`. Dispatch 30 `devicemotion` events on `window` at 16 ms intervals, carrying a half-sine peak on the z axis. Dispatch `touchend` on `#btn-bowl`. The phone's own listener buffers the samples and composes the throw.
- Expect `#screen-result` with `Speed`, `Angle`, and `Curve` in its text.
- Wait until the host's first `.scoreboard-player .roll-cell` for `Ada` is non-empty, up to 30 s. Read it.
- Click `#screen-result`. Expect `#waiting-label` to contain `next turn`.
- From `frames.jsonl`: expect one outbound `throw` from the phone, at least 3 outbound `pos` packets, one inbound `throw` at the host, and at least one inbound `throw_result` at the phone.

Evidence in `artifacts/bowling-throw/`: `host-scoreboard-before`, `phone-bowl-screen`, `phone-throw-result`, `host-scoreboard-after`, each as `.png` and `.aria.txt`, plus `frames.jsonl`.

## Gotchas

- The throw's motion is synthetic. Acceleration and rotation values are injected as `devicemotion` events. The phone code that turns them into a throw is the real code. A pin count from this run shows the pipeline works. It does not show how a human swing feels.
- A first roll below 10 pins leaves the frame open. The host scoreboard still shows that roll.
- The phone's result shows `Score: 0` after the first roll. That is correct, because the first frame's running total only appears once the frame is complete.
- Physics settles before the host records the roll. Expect the wait to take a few seconds, and do not read the scoreboard immediately after the throw.
- Only one player is mapped. With two players, the first turn goes to the first joined player, and the next turn is not checked by this feature. See the index.
- A hold shorter than 150 ms is ignored by the phone and shows `Hold longer and swing!`. This feature holds for about 480 ms, so it does not exercise that case.
