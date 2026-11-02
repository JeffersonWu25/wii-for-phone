# Race Kart Racer split screen

With Kart Racer selected, the first 4 joined players each get their own view of the race: 1 player fills the screen, 2 players split it left and right, 3 and 4 players get quadrants (the empty fourth quadrant of a 3-player race holds a large minimap). Every pane carries its own item slots, coins, lap count and place. One shared minimap shows a marker per racer. The timer and standings list are gone. A 5th player who joined the lobby does not race.

## Sub-features

- `layout`: `.kart-app[data-players]` is the racer count, and `.kart-pane[data-slot][data-side]` boxes fill the viewport as full, halves or quadrants.
- `pane-hud`: each pane has `.kart-item-slot.main` and `.reserve`, `.kart-coins` with `00`, `.kart-lapcount` with `1/3`, and `.kart-place` like `1st`.
- `shared-minimap`: one `.kart-minimap` with a `.kart-map-marker` per racer, placed on the right edge (1p), on the screen centre (2p, 4p), or in `.kart-map-quadrant` at the bottom right (3p).
- `no-legacy-hud`: no `.kart-timer` and no `.kart-standings`.
- `every-view-moves`: with GAS held on every phone, each kart's `s` in `window.__kartState` advances.
- `racer-cap`: with 5 players in the lobby, `data-players` is 4 and the 5th player is not in `__kartState.karts`.

## How to get to it (user POV)

- Join 1 to 5 phones to the lobby, press `Select Game` on the host, choose the Kart Racer card.
- Turn each phone to landscape and hold GAS. Watch the TV split into one view per racer.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The host viewport is 1280x720. Phones are 844x390 landscape with `hasTouch` and `isMobile`. Names are `Ada`, `Bo`, `Cy`, `Di`, `Eve`, in join order, so slot `i` is the `i`th name.

Run it (about 2 minutes):

```bash
node .claude/skills/verify/scripts/drive.mjs kart-split
```

The script runs five rounds, N = 1 to 5. Each round opens a fresh host page, so it is a new session. Steps per round:

- Join the first N names, press `Select Game`, click the Kart Racer card. Expect `#screen-kart` on the first min(N, 4) phones and `.kart-canvas canvas` on the host.
- Open a CDP session on each racer's page and send `Input.dispatchTouchEvent` `touchStart` on `#btn-gas`. Expect `#btn-gas.pressed` on each. No phone steers, so karts drive straight.
- Wait for the countdown, screenshot `n<N>-countdown.png`. Wait for `window.__kartState.phase === 'racing'`, read each kart's `s`, wait 2 s, capture `n<N>-racing` (screenshot and aria snapshot of the host), wait 2 s more, read `s` again and the contract elements.
- Checks, each prefixed `N=<N>:` in `result.json`:
  - `.kart-app[data-players]` is min(N, 4).
  - Exactly that many `.kart-pane`, with slots `0..N-1` and `data-side` `left`; `left,right`; `left,right,left`; `left,right,left,right`.
  - Each pane's bounding box matches the layout within 4 px: the full viewport, halves, or quadrants (slot 0 top-left, 1 top-right, 2 bottom-left, 3 bottom-right).
  - Each pane has one `.kart-item-slot.main` and one `.kart-item-slot.reserve`, `.kart-coins` containing `00`, `.kart-lapcount` containing `1/3`, and `.kart-place` matching `/^\d+(st|nd|rd|th)$/`.
  - Exactly one `.kart-minimap` with one `.kart-map-marker` per racer.
  - N=1: the minimap centre is in the right 25% of the screen and the middle third vertically. N=2 and N=4: the centre is within 5% of the screen centre. N=3: the minimap is inside `.kart-map-quadrant`, and that box is the bottom-right quadrant.
  - No `.kart-timer` and no `.kart-standings`.
  - Every racer's `s` advanced by more than 1 m and less than half the track in the drive window (modulo the track length), and the racer count equals `__kartState.karts.length`.
  - N=5 only: no kart in `__kartState.karts` is named `Eve`.
- Close that round's browser contexts.

Evidence in `artifacts/kart-split/`: `n<N>-countdown.png`, `n<N>-racing.png` and `n<N>-racing.aria.txt` for each N, `frames.jsonl` (every frame carries a `round` field, `n1` to `n5`), `result.json`.

## Gotchas

- The pane-geometry and HUD checks read the DOM contract, not pixels. Whether the views look right (camera behind each kart, dividers, colours by slot) has to be judged from the screenshots.
- GAS is held from the grid, before the countdown, as in `kart-race`. Karts only move once the phase is `racing`, so the drive window starts there.
- The `s` check is modulo the track length, so a kart that crosses the line during the window is still measured correctly. Karts do not steer, so one may hit a wall and slow down, which still advances `s`.
- The 5th phone is never given GAS and never needs `#screen-kart`. Its `s` is not checked.
- The window is 4 s of driving. Place text can change within it, so only its shape is checked.
- The lap count is read at the end of the window, so it assumes no kart crosses the line within 4 s of GO.
- Chrome is the only browser used. Real iOS orientation lock and Pointer Events behavior are not exercised.
