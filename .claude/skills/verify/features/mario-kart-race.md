# Race Mario Kart

The host starts a three-lap race around Luigi Circuit. The phone is the kart's steering wheel: the player drags the stick left and right to steer, and the kart drives forward on its own. A lap is eight checkpoint gates passed in order from the start line. The first kart to complete three laps finishes, and the finish table on the TV shows the time.

## How to play it

Rules, from `host/src/games/kart/race.js`:

- Countdown: the TV counts 3, 2, 1, then the race starts. The phone shows `Get ready`, then its subtitle changes to the racer's name.
- The kart always drives forward while racing. There is no gas button. The stick only steers.
- Steering: the stick pushed left steers left, and pushed right steers right. A small dead zone at the centre means no steer. Near the rim of the stick, the controller enters the drift band. The verification never enters it.
- Letting go of the stick: after about 400 ms without a new drive packet, the kart stops steering and drives straight. Holding a steer keeps the kart turning.
- Track: about 420 m per lap, with two right turns, a U-turn, banking, and elevation changes. Walls contain the kart. Hitting one knocks it back onto the road.
- Laps: the kart has eight gates, one at each eighth of the loop, starting from the start line. Passing them in order and crossing the start line again completes a lap. Three laps finishes the race.
- Places: finished karts rank by finish time. Racing karts rank by laps, then gate, then position.
- Items: the phone's `Use item` button sends `use_item`. It records the press and does not affect the race yet in the verification.

What the player sees:

- TV: the road ahead, the kart, a minimap, the lap as `n / 3`, and the place.
- Phone: its place as `P1`, `P2`, and so on in `#kart-place`, its lap in `#kart-lap`, and the stick.
- At the finish: the TV shows a `Finish` table with the kart's name and time. The phone shows `Race over` and a `P<place>` banner.

## Sub-features

- `kart-host-view`: the host shows the race layout with one kart pane per player.
- `countdown-and-go`: the phone receives `race_countdown` three times, then `race_go`.
- `stick-steers-kart`: holding the stick sends `drive` packets at about 20 Hz. The host receives them and steers the kart.
- `lap-counter`: the lap shown by `race_status` goes 1, then 2, then 3 while racing.
- `finish`: the kart finishes after three laps. The host shows the `Finish` table with a timed result, and the phone shows `Race over` with `P1`.

## How to get to it (user POV)

- Join a phone to the lobby, press `Select Game`, and click the Mario Kart card.
- The TV shows the race, and the phone shows the kart screen with the stick.
- Steer the stick to follow the road. Each lap is announced by the lap counter on both screens. After the third lap the TV shows the finish table.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The script joins one phone named `Ada` and selects Mario Kart, so `Ada` is the only racer.

Run it (a full race takes about 50 seconds, so allow up to 5 minutes):

```bash
node .claude/skills/verify/scripts/drive.mjs mario-kart-race
```

The script plays the race with `scripts/kart-pilot.mjs`, a driver policy a human player could follow:

1. Read the road from the same centerline the host uses (`host/src/games/kart/track.js`), not from a list of turns or timings.
2. From the phone's `race_status`, take the kart's position and progress, about four times a second.
3. Estimate the kart's travel direction from the last two positions. Below 2 m/s, keep the stick centred.
4. Aim 14 m ahead along the road. Steer by gain times the heading error between the travel direction and the aim point, clamped to full lock.
5. Turn that steer into a stick offset by inverting the stick's steer curve (`phone/src/games/kart/steer.js`). Keep the knob below the drift band.
6. Move the mouse on `#kart-stick` by that offset, about every 40 ms, until `race_status` reports `finished`. Give up after 180 seconds, or if progress stops for 20 seconds.

Steps the script checks:

- Join `Ada` on a phone, press `Select Game`, click the Mario Kart card.
- Expect the host `.kart-layout` and one `.kart-pane`.
- Wait for a `race_go` frame inbound at the phone.
- Play the race with the pilot. Record each `lap` change from `race_status`.
- Expect the lap counter to go 1, then 2, then 3, and `race_status` to report `finished`.
- Expect a `race_finished` frame at the phone, `#kart-sub` to read `Race over`, and `#kart-banner` to read `P1`.
- Expect the host `.kart-results` table, with a row for `Ada` and a time, not `DNF`.
- Expect more than 100 non-zero `drive` packets, so the stick really steered.

Evidence in `artifacts/mario-kart-race/`: `host-race-start`, `phone-race-start`, `host-race-finish`, `phone-race-finish` (each `.png` and `.aria.txt`), `pilot-track.json` (lap changes with times, and the place, lap, and progress at each `race_status`), and `frames.jsonl`.

The last verified run finished in 43.55 s. Lap 2 started at 13.6 s and lap 3 at 28.4 s.

## Gotchas

- `race_status` arrives about every 250 ms. The pilot extrapolates between updates, so tuning changes can make the kart wander or leave the road. Re-run it after any change to `kart-pilot.mjs` or the kart physics.
- The phone's subtitle shows `Get ready` and `Go` only briefly, then the racer's name replaces it. Do not wait on that text. Wait on the `race_go` frame.
- The race starts on the host when the kart game mounts. A phone that joins after the countdown has begun misses the early countdown frames. This feature joins the phone first.
- Steer sign: stick right is negative steer, the convention in `phone/src/games/kart/steer.js`. A check for a positive value fails for a correct right drag.
- The pilot reads the host's `track.js` directly. If the track changes, the pilot follows the new road without edits, but its gain and lookahead may need retuning.
- Releasing the stick, or letting the phone go quiet for more than 400 ms, makes the kart drive straight. The pilot keeps the stick moving, so this does not happen during a run.
- The race is only "finished" once the third lap completes. The `Finish` table shows the time, but a DNF would appear there instead if the kart never finished.
- The drift band is not driven. Drift and item use are unmapped, as the index says.
