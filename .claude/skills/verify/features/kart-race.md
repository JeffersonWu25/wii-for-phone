# Race Kart Racer

With Kart Racer selected, every joined player gets a kart on the start grid. After a 3-2-1 countdown and GO, players steer with a joystick and hold GAS on a landscape phone. The host TV splits into one view per player, each following that player's kart around a 3-lap circuit with a hill, banked sweeper, boost pads and walls at the track edge. When the first kart finishes, the race ends after a 30 s grace (or when all finish), a results card lists the standings, and the host returns to the game hub.

## Sub-features

- `kart-screens`: both phones show `#screen-kart`; the host shows the canvas, the pane with its lap count and place, and the minimap.
- `countdown-go`: the countdown counts down on the host, then `GO!` shows and the race phase starts.
- `three-laps`: driving the whole circuit with the phone's controls advances the HUD lap in `.kart-pane[data-slot="0"] .kart-lapcount` through `1/3`, `2/3`, `3/3` and finishes.
- `boost-pads`: driving over a pad lifts speed above the 22 m/s top speed.
- `walls`: steering into the corridor edge clamps the kart at the limit and costs speed.
- `ground-follow`: the kart's y matches the track height under it, on the hill and the bank.
- `results-card`: `.kart-results` lists both players, first place with a time, plus a Back to games button.
- `phone-feedback`: phones receive `kart_status` and `kart_results`; the finisher's phone shows `Finished!` and the place.
- `rotate-prompt`: a phone held in portrait shows `Rotate your phone`.
- `return-to-hub`: Back to games returns the host to game select and the phones to the waiting screen.

## How to get to it (user POV)

- Join two phones to the lobby, press `Select Game` on the host, choose the Kart Racer card.
- Turn each phone to landscape. Hold GAS with one thumb, drag the joystick on the left with the other.
- Finish 3 laps. After the results card, press `Back to games` (or wait 10 s for it to exit by itself).

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The host viewport is 1280x720. Phones are 844x390 landscape with `hasTouch` and `isMobile`. `Ada` joins first, so she gets the left pane (slot 0), whose `.kart-lapcount` the checks read. `Bo` joins second and never touches a control, so his kart stays on the grid and the race ends 30 s after Ada finishes.

Run it (about 2.5 minutes):

```bash
node .claude/skills/verify/scripts/drive.mjs kart-race
```

Steps the script performs:

- Join Ada and Bo, press `Select Game`, click the Kart Racer card. Expect `#screen-kart` on both phones and `.kart-canvas canvas` plus `.kart-pane`, `.kart-lapcount`, `.kart-minimap` on the host.
- Open a CDP session on Ada's page. `Input.dispatchTouchEvent` `touchStart` on `#btn-gas` (id 1), then a second `touchStart` at the center of `#kart-zone` (id 2). Chrome synthesizes the pointer events the phone listens to. Expect `#btn-gas.pressed`.
- Capture `01-grid`, `02-countdown-lights`, `03-go` (the `.kart-countdown.go` label, read from `.kart-countdown` `.first()`).
- Drive at about 18 Hz: read the host's `window.__kartState` (read-only) and `window.__kartTrack`, compute a steer in -1..1 with a closed-loop controller (aim at `frameAt(s + 5 + 0.4 * speed)`, offset to the pad's lateral while a boost pad is ahead, steer = 2.2 * heading error), invert the joystick dead zone (0.12) and radius into an x offset, and send `touchMove` with both touch points. At the end `touchEnd` releases both.
- Screenshots as Ada's kart reaches each section: `04-t1`, `05-short`, `06-sLeft-pond`, `07-sRight`, `08-hill-mid`, `09-back-crest`, `10-pad1-boost`, `10-pad2-boost`, `12-sweeper-mid`, `13-approach-finish` (lap 3), `14-line-lap2`. Also `15-phone-landscape-steering` (Ada's phone while steering with gas held), `16-phone-portrait-rotate` (Bo's page resized to 390x844 for a moment, then restored).
- Wall test on lap 1, back straight, after pad 1: force full left steer through the same joystick touch until the lateral clamps at the left limit and 1 s has passed (`11-wall-test`), then the controller takes over and recovers.
- Checks, with observed values in `result.json`: HUD lap sequence `1>2>3`, completed-lap counter `0>1>2>3`, three lap times of 30-80 s from line crossings, no respawn jumps, no WRONG WAY outside the wall test, `|lateral|` never over the corridor limit, y within 5 cm of `heightAt(s, lateral)`, both pads give speed above 22 m/s, wall clamp and speed drop, rotate prompt visible, results card with Ada 1st and a time, Ada's phone `Finished!` `1st`, `kart_status` and `kart_results` frames at both phones, Ada's `drive` frames carry gas and varied steer.
- Wait for `.kart-results`, capture `results`, click `.kart-results .btn-start` (Back to games). Expect `.game-select-screen` on the host and `#screen-waiting` on both phones; capture `host-back-to-games`.

Evidence in `artifacts/kart-race/`: the `.png` files above, `phone-ada-finished.png` and `.aria.txt`, `frames.jsonl`, `result.json`.

## Gotchas

- The input path is real (touch, pointer events, relay `drive` frames at the phone's 20 Hz), but the steering value comes from a script reading host internals. It proves the race pipeline, not how a human finds the racing line.
- The kart y check uses the host's own `kart.y`, which the physics sets from `heightAt`. It guards the data. Floating or clipping in the render has to be judged from the screenshots.
- Start lights hang on the gantry above the line. The pulled-back grid camera shows them in each pane, and `02-countdown-lights` shows them with the per-pane countdown digit. `13-approach-finish` shows the gantry with the lights out.
- Screenshots are fired without awaiting so the steering loop keeps running, so each one lands a few frames after the section was entered.
- The first lap counts from the first line crossing after the grid start. The completed-lap counter is 0 until then, and Ada's `.kart-lapcount` shows `1/3` from the grid.
- The wall test flips the kart around, so WRONG WAY may flash after it. That is excluded from the check by design.
- Bo's kart sits on the grid the whole race. The race ends 30 s after Ada finishes, so the results card is up to 30 s late.
- Chrome is the only browser used. Real iOS orientation lock and Pointer Events behavior are not exercised.
