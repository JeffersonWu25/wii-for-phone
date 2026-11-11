# Movement and contact physics

Own `host/src/games/tennis/rally.js`, a new `host/src/games/tennis/rally.move.test.mjs`, and only the swing-duration assertion inside `rally.graft.test.mjs` if the swing window changes. You may insert `step()` loops in `timing.test.mjs` so a return swing happens once the ball has reached the receiver. Do not change that file's expected `landX` values, window kinds, or scoring assertions.

Do not edit `rally.probe.mjs`. All of these must pass from `host/`:

```bash
node --test src/games/tennis/rally.probe.mjs src/games/tennis/rally.graft.test.mjs src/games/tennis/timing.test.mjs src/games/tennis/teamSeat.test.mjs src/games/tennis/rally.move.test.mjs
```

## Behaviour

Players have a home spot, which is the spot `positionFor` already uses. `createMatch` still reports those exact coordinates. The probe checks them.

Nobody moves during `serve` or `toss`. The server stays on the toss. The probe checks the toss stays within 0.45 m of the server.

During `flight`, the current `receiverId` runs toward an intercept. Everyone else walks back toward home if they are away from it. After the point is `called`, everyone walks home. Do not teleport.

Pace:

- Top speed 11 m/s on every chase, including the second and third shots of a point. There is no slower "recovery" pace.
- Acceleration and braking are both 45 m/s². From a standstill, speed at 0.1 s is about 4.5 m/s. There is no extra stride and no 400 m/s² burst.
- Reach is 1.75 m from the player origin to the ball centre, measured in the court plane. Walking back to home, when you are not the receiver, may use 4 m/s.

A swing from the legal hitter connects only when the ball is within reach. A connecting swing changes the ball's velocity and does not move the ball (a correction of 2 cm or less is the most you may apply). A swing from anyone else does nothing, which the probe already requires. A whiff still sets `swinging` on that player and leaves the ball's velocity alone.

The canonical probe serve (`apex` 0.95, `timing` 0, `power` 0.7, fast flight about 0.62 s, landing near x = 2, z = 4.6) is about 6.7 m from the returner at (0, 11.185). At 45 m/s² up to 11 m/s they cover about 5.6 m in 0.63 s, and reach of 1.75 m closes the rest. Confirm with a test that this returner is inside reach at the first bounce, so `rally.probe.mjs` keeps passing. A later shot in the same point uses the same 11 m/s.

These new tests must exist:

- A fast serve that stays in and is wide (`apex` 0.95, `timing` about 0.7, `power` 0.7, landing `|x|` under the singles half-width) never comes within reach of the returner before the second bounce. The server wins the point with no successful return. Stepping and swinging on every frame when the returner is closest still does not connect.
- A slow serve down the deuce pattern (`apex` 0.3, `timing` 0, `power` 0.6) is inside reach before the second bounce, and a swing then connects and the rally continues (`phase` stays `flight`, new shot, receiver flips).
- A flat rally down the middle (`timing` 0, `power` 0.7) from a returner who got to the serve is inside reach for the other player before the second bounce.
- A flat rally down the middle on the shot after the serve is inside reach, and during that chase the runner's speed goes above 8 m/s. That is the same cap as the first sprint.
- While running, reported speed never exceeds 11 m/s. From a standstill, speed after 0.1 s is between 3 and 5 m/s. Position does not jump by more than speed × dt + 1 cm. A planted extra step fails this.
- On a connected hit the ball's position changes by 2 cm or less on that step, and the horizontal exit direction points from the contact point toward `landX, landZ` within 12 degrees. A lob's initial vertical angle is steeper than a flat shot's. A slice's initial vertical angle is shallower than a flat shot's.
- Two substeps at 1/60 produce a ball path with no position gap larger than the speed allows. This is the smoothness check.

Keep `planShot` landing rules. The probe compares them exactly. The exit velocity still arrives at that landing (the existing solver). What changes is that the velocity is applied only at a real contact, while the ball is next to the player, so the direction off the strings is the direction to the landing.

## View fields

Add these without removing the fields the probe and the phone flow already read:

- `homeX`, `homeZ`, `speed`, `travel` (metres walked this point, monotonic while moving), `hand` (`forehand` or `backhand`), `shape` (`flat`, `lob`, `slice`, `serve`, or null), `swingT` (0 at swing start, 1 at end, −1 when idle), `faceYaw` (world yaw of the horizontal exit, radians, or null), `facePitch` (radians above horizontal, or null), `struck` (true for about 0.12 s after a connecting hit).
- Ball objects also include `vx`, `vy`, `vz` when a ball exists.
- `setGrip(match, playerId, hand)` stores the hold. `view` uses the swing's hand while `swingT` is in 0..1, otherwise the stored grip, otherwise `forehand`.

Swing window stays long enough that the existing graft test can be satisfied. Prefer keeping 0.35 s. Contact for the animators is `swingT` crossing 0.42.

`hand` on the swing input is `forehand` or `backhand`. A serve shape on the view is `serve` while that swing came from a toss.
