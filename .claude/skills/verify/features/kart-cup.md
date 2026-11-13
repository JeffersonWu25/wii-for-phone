# Kart Racer map select and Coconut Cup

Clicking the Kart Racer card on the hub opens a map select (`.kart-menu`) instead of starting a race. It shows the Coconut Cup (four slots: Coconut Coast, then three locked placeholders) and Sunny Meadow as a standalone track. Arrow keys move the selection, Back returns to the hub, and clicking a card starts the race. The cup plays its unlocked tracks in order, then shows a podium with a button back to the menu. Sunny Meadow plays one race.

## Sub-features

- `menu-cards`: `.kart-cup-card[data-cup="coconut"]` has four `.kart-cup-slot`, slot 1 `data-track="coconut-coast"` and three with `data-locked`. `.kart-track-card[data-track="sunny-meadow"]` is beside it.
- `menu-keys-back`: ArrowRight and ArrowLeft move `data-selected` between the cards. `.kart-menu-back` returns to `.game-select-screen`, and the Kart Racer card opens the menu again.
- `cup-race`: clicking the cup starts `window.__kartTrack.id === 'coconut-coast'` with the countdown, then GO and karts moving with no input but the stick. The phone receives `game_started`.
- `cup-podium`: after the only unlocked cup track, `.kart-results .btn-start` (Continue) opens `.kart-podium` (no `.kart-cup-standings`, which is only between two cup races). `.kart-podium .btn-start` (Back to menu) returns to the map select.
- `single-track`: clicking the Sunny Meadow card starts `sunny-meadow` and sends `game_started` again.

## How to get to it (user POV)

- Join a phone, press `Select Game`, click the Kart Racer card. The map select opens.
- Arrow keys to choose, Enter or a click to race, Back to leave.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. Host viewport 1280x720, one phone `Ada` at 844x390 landscape with `hasTouch` and `isMobile`.

Run it (about 3.5 minutes, because the cup race is three laps of the 1,100 m track):

```bash
node .claude/skills/verify/scripts/drive.mjs kart-cup
```

Steps the script performs:

- Join Ada, `.btn-start`, click the Kart Racer `.game-card`, wait for `.kart-menu`. Check the cup card, its four slots, three `[data-locked]`, slot 1 `coconut-coast`, and the Sunny Meadow card. Capture `01-map-select`.
- Press ArrowRight, expect the Sunny Meadow card to carry `data-selected`. ArrowLeft returns it to the cup. Click `.kart-menu-back`, expect `.game-select-screen`, click the Kart Racer card again, expect `.kart-menu`.
- Click the cup card. Expect `#screen-kart` on the phone, `window.__kartTrack.id === 'coconut-coast'`, `__kartState.phase === 'countdown'` (`02-cup-countdown`), then `racing`, and a `game_started` frame at the phone.
- Hold the phone's joystick with a CDP touch and steer with the same closed-loop controller `kart-race` uses (`computeSteer`, `hostTick`). Check speed over 5 m/s 1.5 s after GO, the finish, and `|lateral|` inside the corridor.
- Wait for `.kart-results` (`03-race-results`), click `.kart-results .btn-start`, expect `.kart-podium` with one step holding Ada and `15 pts` (`04-podium`). Click `.kart-podium .btn-start`, expect the map select.
- Click the Sunny Meadow card. Expect `window.__kartTrack.id === 'sunny-meadow'`, `#screen-kart`, a second `game_started` frame (`05-sunny-meadow-start`).

Evidence in `artifacts/kart-cup/`: the `.png` and `.aria.txt` files above, `frames.jsonl`, `result.json`.

## Gotchas

- The cup race is a real 3-lap race; there is no shortcut to the finish. The steering value comes from a script reading host internals, so this proves the menu flow and the race pipeline, not a human line.
- `s` wraps at the line (the grid sits near the end of the lap), so do not compare `s` across the start to prove movement. The drive reads speed instead.
- `game_started` is sent at the start of every race, so the count after the cup race is not 1. The drive compares against the count before each click.
- Locked slots are plain `div`s with `data-locked`. Clicking one does nothing, and the whole cup card is the click target.
- Keys go to `window`, so press them on the host page with nothing focused in a text field.
- Reaching `.kart-cup-standings` between cup races is not driven: the cup has one unlocked track, so only the podium is reachable until more tracks unlock.
