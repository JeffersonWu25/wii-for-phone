# Simulate a bowl

Simulate a bowl lets the desktop harness release the bowl button the way a held touch would, then shows the pin result on that phone and the roll on the host scoreboard after the ball settles.

## Sub-features

- `bowl-release` sends one throw when the bowl button is held at least 150ms.
- `bowl-result` replaces the bowl screen with the pin result for that player.
- `bowl-score` writes that roll into the player's current frame on the host scoreboard.
- `bowl-next` gives the same player another roll, or gives the next player the turn, 1500ms after the ball settles.

## How to get to it (user POV)

- Host chooses `Bowling` after at least one player has joined.
- The player whose turn it is sees `Hold and swing to bowl!` and holds `BOWL`, then lets go.
- Everyone watches the ball on the host. The phone then shows how many pins fell, or `STRIKE!` or `SPARE!`.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- Bowling has started. The phone whose turn it is shows `Hold and swing to bowl!` and `#btn-bowl`. The host shows `Scores` and that player's name.
- Do this on the first roll of a frame so the scoreboard cell for that roll starts empty.

- **Release a throw.** On the phone tab that shows `BOWL`, call `browser_cdp` method `Runtime.evaluate` with `viewId` set to that tab. Params include `awaitPromise` true and `returnByValue` true. Expression below. It holds `BOWL` and, while the hold is open, dispatches `DeviceMotionEvent`s. Each event carries `accelerationIncludingGravity` in m/s² and `rotationRate` in deg/s, the same fields the phone listener reads. The swing is a firm straight shot: gravity on Y, a forward pulse on Z, wrist roll rate staying at 0. `motion` in the result is the accel and gyro from the first event. `motion: null` means the browser dropped the sensor payload and the throw used an empty buffer.

```javascript
new Promise((resolve) => {
  const el = document.querySelector('#btn-bowl');
  if (!el) { resolve({ error: 'no-bowl' }); return; }
  const frames = 24;
  const samples = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    samples.push({
      ax: 0,
      ay: -9.81,
      az: 25 * Math.sin(t * Math.PI),
      gamma: 0,
    });
  }
  const motion = { peakAz: 0, peakGamma: 0 };
  const mark = (e) => {
    const acc = e.accelerationIncludingGravity;
    const rot = e.rotationRate;
    if (!acc || !rot) return;
    motion.peakAz = Math.max(motion.peakAz, Math.abs(acc.z || 0));
    motion.peakGamma = Math.max(motion.peakGamma, Math.abs(rot.gamma || 0));
  };
  window.addEventListener('devicemotion', mark);
  el.dispatchEvent(new Event('touchstart', { bubbles: true, cancelable: true }));
  samples.forEach((sample, i) => {
    setTimeout(() => {
      const event = new DeviceMotionEvent('devicemotion', {
        accelerationIncludingGravity: { x: sample.ax, y: sample.ay, z: sample.az },
        rotationRate: { alpha: 0, beta: 0, gamma: sample.gamma },
        interval: 16,
      });
      window.dispatchEvent(event);
    }, 12 * i);
  });
  setTimeout(() => {
    window.removeEventListener('devicemotion', mark);
    el.dispatchEvent(new Event('touchend', { bubbles: true, cancelable: true }));
    const start = Date.now();
    const timer = setInterval(() => {
      const heading = document.querySelector('h1')?.textContent ?? '';
      if (/knocked down|STRIKE!|SPARE!/.test(heading) || Date.now() - start > 12000) {
        clearInterval(timer);
        resolve({ heading, ms: Date.now() - start, motion });
      }
    }, 250);
  }, 12 * frames + 40);
})
```

`heading` is `STRIKE!`, `SPARE!`, or a line ending in `knocked down`. In this harness that arrived about 5 seconds after release. `error: no-bowl` means this phone was not the one bowling.
- **Read the scoreboard.** On the host tab, call `browser_cdp` method `Runtime.evaluate` with `returnByValue` true and this expression:

```javascript
[...document.querySelectorAll('.scoreboard-player')].map((player) => ({
  name: player.querySelector('.scoreboard-name').textContent,
  frames: [...player.querySelectorAll('.scoreboard-frame')].slice(0, 2).map((frame) =>
    [...frame.querySelectorAll('.roll-cell')].map((cell) => cell.textContent.trim())
  ),
}))
```

The player who threw has a new mark in the current frame: a digit, `X`, or `/`. Save that JSON as `artifacts/simulate-bowl/scoreboard.json`.
- **Next turn.** Snapshot again at least 1500ms after the result heading appeared. A strike hands `BOWL` to the other joined phone. Any other first roll returns `BOWL` to the same phone. The result screen stays up on a phone that is waiting for its next turn.
- **Proof.** Save `artifacts/simulate-bowl/result.aria.txt` and `result.png` from the phone result screen, and `artifacts/simulate-bowl/scoreboard.png` from the host. The phone artifact shows the result heading. The host artifact shows `Scores` and the same player name. There is no relay log line for a throw.

## Gotchas

- A mouse click on `BOWL`, including `browser_click` with `holdDurationMs`, does not send a throw. The button only listens for `touchstart` and `touchend`.
- A gap under 150ms sets `#bowl-hint` to `Hold longer and swing!` and leaves the scoreboard unchanged. That is the short-hold path, not this one. The hint text stays on the bowl screen until a result replaces it, so a later real throw can still show that old hint.
- The release expression above is the swing. It must report `motion.peakAz` near 25 and `motion.peakGamma` of 0. The first sample of that swing has `az` 0, so a reading of the first event is not the pulse. A hold with no events still sends power `0.5` and spin `0`. Do not use that hold as proof of a bowl. Do not require a specific pin count beyond a result heading.
- The bowl screen has no heading. A still-visible `BOWL` button during the first few seconds means the ball has not settled yet. The result heading is the signal.
- After the result, the same player gets `BOWL` again about 1500ms later when the frame needs another roll. Capture the result heading from the evaluate return as soon as it appears. A later snapshot can show `BOWL` again and the result heading will be gone.
- A frame-ending roll leaves the result screen up. The other phone gets `BOWL` about 1500ms later.
- `STRIKE!` on the phone finishes that frame in one roll. `SPARE!` appears on the second roll of a frame. A second roll that leaves pins standing uses the `knocked down` heading, not `SPARE!`.
