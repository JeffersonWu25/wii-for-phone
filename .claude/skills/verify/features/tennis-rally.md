# Rally a tennis point

Two phones join one host and start a one-game singles match. The court splits down the middle into two panes, the camera is pulled back so each pane shows the whole court, a rolled phone sends a backhand grip, and someone runs once the serve is in the air.

## Sub-features

- `split-court`: Ada against Bea shows `.tennis-split`, `.tennis-court` `data-split` `1`, and `data-cam-y` between 7 and 11. The score sits over the join.
- `backhand-grip`: a `deviceorientation` event with `gamma` 80 sends one `grip` of `backhand` from Bea's phone.
- `chase`: after Ada tosses and serves, `window.__tennisView()` shows a flight or a called point, or a player whose `speed` is above 0.5.

## How to get to it (user POV)

- Open the host and join two phones, Ada and Bea.
- Press `Select Game` and choose Tennis.
- Press `One game`, then `Start`.
- Roll Bea's phone so the screen faces away.
- On Ada's phone, flick up to toss, then swing a forehand to serve.
- Watch the court while the returner runs.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The script opens one fresh host at 1280×720 and joins Ada and Bea before selecting Tennis.

Run it:

```bash
node .claude/skills/verify/scripts/drive.mjs tennis-rally
```

Steps the script performs:

- Join Ada and Bea, press `Select Game`, and click the Tennis card.
- Expect `.tennis-format` `1v1`. Click `.tennis-length[data-best-of="1"]`, then `.tennis-start`.
- Expect `.tennis-court canvas` and `.tennis-split`. Expect `data-split` `1`, `data-cam-y` from 7 to 11, and `.tennis-score` centered. Capture `host-split`.
- On Bea's page, dispatch one `deviceorientation` with `beta` 90 and `gamma` 80. Expect one outbound `grip` with `hand` `backhand`.
- On Ada's page, dispatch the same toss flick and forehand swing the tennis-match drive uses.
- Poll `window.__tennisView()` (read only) until `phase` is `flight` or `called`, or a player's `speed` is above 0.5. Capture `host-chase`.

Evidence in `artifacts/tennis-rally/`: `host-split` and `host-chase`, each as `.png` and `.aria.txt`.

## Gotchas

- The flick and the orientation event are synthetic. They go through the phone's own listeners. They are not a proof of how a human swing feels.
- `beta` and `gamma` on `devicemotion` are rotation rates. `beta` and `gamma` on `deviceorientation` are degrees.
- Read `window.__tennisView()`. Do not assign it and do not call rally or scene functions.
- Two players already sit as 1v1. Do not move them between sides.
