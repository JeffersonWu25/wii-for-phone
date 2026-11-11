You are a subagent building the phone grip for the tennis game. Work only in `/tmp/worktrees/tennis-grip`. Do not touch `/agent/repos/wii-for-phone`. Do not push and do not open a pull request.

The user's goal: how the player holds the phone shows up as the character's grip. The screen facing the player is a forehand. The screen rolled away is a backhand. The existing swing and toss classifier must keep working. The verify harness sends synthetic `devicemotion` events and usually no `deviceorientation`, so a missing orientation stays on the previous grip and defaults to forehand.

Own only:

- `phone/src/main.js`
- `phone/src/games/tennis/index.js`
- a new `phone/src/games/tennis/grip.js`
- a new `phone/src/games/tennis/grip.test.mjs`

Do not edit the host.

Implement `gripFromOrientation({ beta, gamma })` in degrees from `DeviceOrientationEvent`:

- If `beta` or `gamma` is not finite, return null.
- If `abs(beta) < 20` or `abs(beta) > 160`, the phone is flat. Return null so the previous grip is kept.
- If `abs(gamma) <= 55`, return `'forehand'` (screen toward the holder).
- Otherwise return `'backhand'` (screen rolled away).

In `main.js`, request `DeviceOrientationEvent.requestPermission` in the same user gesture as motion permission when that function exists. Listen for `deviceorientation` and call `currentGame?.onOrientation?.({ beta, gamma })` with the event's degrees. Do not drop the existing `devicemotion` path.

In the tennis phone, `onOrientation` updates the hold. Send `{ type: 'grip', hand }` only when the hand changes, and at most once every 200 ms. Swings still send their own `hand` from the gamma-rate classifier. Do not change toss or swing detection.

Tests in `grip.test.mjs` cover forehand, backhand, flat (null), and non-finite (null). Run:

```bash
node --test src/games/tennis/grip.test.mjs
```

from `phone/`.

Commit on branch `cursor/tennis-grip-d216`.

Your final report should quote the rule, the test result, and the message shape you send.
