# Bowl on your turn

Bowl on your turn gives the current player MOVE and AIM controls and a hold-to-bowl button. Releasing a very short hold stays on that screen and asks the player to hold longer.

## Sub-features

- `bowl-show` shows the bowl controls only on the phone whose turn it is.
- `bowl-move` nudges the lane position from the MOVE pad.
- `bowl-aim` nudges the launch angle from the AIM pad.
- `bowl-short-hold` ignores a hold shorter than 150ms and shows `Hold longer and swing!`.

## How to get to it (user POV)

- Host chooses `Bowling` from the game grid after players have joined.
- The first player's phone switches from the waiting screen to the bowl controls.
- Choose `MOVE` or `AIM`, then `◀` or `▶`.
- Hold `BOWL` and release it to throw. A flick that is too short stays on the bowl screen.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- The select-game bowling path has just run. The phone tab shows `Hold and swing to bowl!` and the host shows `Scores` with `Verify Player`.
- This phone is the player who received the turn. A second phone, if joined, still shows a waiting line and does not show `BOWL`.

- **Show controls.** Snapshot the phone tab. Buttons are `MOVE` (id `tab-move`, pressed state is the `active` class), `AIM` (id `tab-aim`), `◀` (id `btn-left`), `▶` (id `btn-right`), and `BOWL` (id `btn-bowl`). The prompt is `Hold and swing to bowl!`.
- **Move.** Click `▶`. Read `#dot-move` in the phone page. Its `style.left` changes from the centered value. The host has no text for this nudge. The side effect is the next relay message of type `aim` from this phone; the host canvas previews the ball only while the lane is running.
- **Aim.** Click `AIM`, then click `◀`. `#tab-aim` has the `active` class and `#tab-move` does not. `#dot-aim` `style.left` changes. `#dot-move` stays where the MOVE nudge left it.
- **Short hold.** A click on `BOWL` does not throw. `browser_click` `holdDurationMs` is a mouse hold and does not count. Call `browser_cdp` method `Runtime.evaluate` with `awaitPromise` true and `returnByValue` true, and this expression: `new Promise((resolve) => { const el = document.querySelector('#btn-bowl'); el.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true })); setTimeout(() => { el.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true })); resolve(document.querySelector('#bowl-hint').textContent); }, 40); })`. The returned text is `Hold longer and swing!`. `BOWL` stays on screen. The host scoreboard does not gain a roll.
- **Proof.** Save `artifacts/bowling-turn/controls.aria.txt` and `controls.png` while the prompt and `BOWL` are visible, then `artifacts/bowling-turn/short-hold.aria.txt` and `short-hold.png` after the hint appears. Record `#dot-move` and `#dot-aim` `style.left` in `artifacts/bowling-turn/dots.txt` before and after the nudges.

## Gotchas

- `BOWL` ignores mouse clicks. A screenshot of the button after a click is not a throw and is not a short-hold.
- A hold of 150ms or longer sends `throw` and the host physics takes the turn. Do not use a long hold while proving the short-hold hint.
- Desktop browsers in this harness do not emit a real swing. A completed throw from this browser sends a default power when the motion buffer is empty. Do not treat that throw as proof of motion capture.
- The second player's phone shows `Waiting for your turn...` (heading `Bowling`) until the host advances the turn. Do not look for `BOWL` on that phone during player one's turn.
- D-pad buttons disable while a hold is in progress. If they stay disabled, the matching `touchend` never fired.
