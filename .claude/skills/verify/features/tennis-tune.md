# Tune a tennis match

Two phones start a one-game singles match. The court has four bodies, two of them partners controlled by the humans. The Tune panel starts closed. Opening it and moving the forgiveness slider leaves direction sensitivity alone, and Reset puts forgiveness back.

## Sub-features

- `four-bodies`: `window.__tennisView().players` has length 4. Each `~partner` is `role` `net` and `controlledBy` the human in its id.
- `tune-panel`: `.tennis-tune-panel` is hidden until `.tennis-tune` is pressed. Swing timing forgiveness moves from `180` to `240`. Shot direction sensitivity stays `1.00`. `.tennis-tune-reset` restores `180`.

## How to get to it (user POV)

- Open the host and join two phones, Ada and Bea.
- Press `Select Game` and choose Tennis.
- Press `One game`, then `Start`.
- Press `Tune`.
- Drag Swing timing forgiveness.
- Press `Reset`.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The script opens one fresh host at 1280×720 and joins Ada and Bea before selecting Tennis.

Run it:

```bash
node .claude/skills/verify/scripts/drive.mjs tennis-tune
```

Steps the script performs:

- Join Ada and Bea, press `Select Game`, and click the Tennis card.
- Expect `.tennis-format` `1v1`. Click `.tennis-length[data-best-of="1"]`, then `.tennis-start`.
- Expect `.tennis-court canvas`. Read `window.__tennisView().players` (read only). Expect four bodies and two net partners. Capture `host-court`.
- Expect `.tennis-tune-panel` to carry `hidden`. Click `.tennis-tune`.
- Set the Swing timing forgiveness range to 240. Expect its `.tennis-tune-value` to read `240` and Shot direction sensitivity to stay `1.00`. Capture `host-tune`.
- Click `.tennis-tune-reset`. Expect forgiveness to read `180`.

Evidence in `artifacts/tennis-tune/`: `host-court` and `host-tune`, each as `.png` and `.aria.txt`.

## Gotchas

- Read `window.__tennisView()`. Do not assign it and do not call rally or scene functions.
- The panel uses the `hidden` attribute. A closed panel is not a missing panel.
