---
name: verify
description: Drive the Wii Bowling web app (host TV screen in host/, phone controller in phone/, and the relay in relay/) to prove the lobby join, game selection, a bowling throw, and a Mario Kart race, using real Chrome and real WebSocket traffic. Use after changes to host, phone, or relay, or when asked to prove a user-facing flow works.
---

# Verify Wii Bowling

The primary surface is the browser pair. The host (`host/`, Vite + React) is the TV screen. The phone (`phone/`, vanilla JS) is the controller. The relay (`relay/`, Node WebSocket) carries messages between them. Players join by opening the phone URL shown in the host lobby. The relay is in memory, so each host page load is a new session.

Driver: `playwright-core` (already a devDependency in `host/`) launching the installed Google Chrome. Both pages are real. Every relay frame in both directions is recorded.

## Isolation

The instance uses fixed ports and refuses to start if one is taken:

| Part | Port | URL |
|---|---|---|
| relay | 18080 | `http://127.0.0.1:18080` |
| host | 15173 | `http://127.0.0.1:15173` |
| phone | 15174 | `http://127.0.0.1:15174` |

Two instances cannot run side by side. Do not attach to a dev server already on 5173, 5174, or 8080, and do not kill whatever holds a port. Stop and report.

The launcher writes its own Vite configs to `run/` instead of using `host/vite.config.js` and `phone/vite.config.js`. Those add HTTPS whenever `certs/` exists, and this relay URL is `ws://`, so HTTPS would break the instance. The repo's `.env` points at the hosted relay. The launcher overrides `VITE_RELAY_URL` and `VITE_PHONE_URL` in the child environment, which take precedence over `.env`. Doctor confirms the lobby QR URL points at the local phone port.

## Launch

From the repo root:

```bash
node .claude/skills/verify/scripts/instance.mjs launch
```

Ready means all three are serving, not just that the processes started. The relay must return `ok`, the host document must contain `Wii Bowling — Host`, and the phone document must contain `Wii Bowling — Controller`. Launch fails with the tail of the offending log if one process exits early. It gives up after 60s.

No database, migrations, or seed data. A fresh relay has no sessions, so there is nothing to seed. Dependencies come from the lockfile: run `npm ci` in `host/`, `phone/`, and `relay/` if their `node_modules` are missing. `host/` must have `playwright-core` installed, or the driver will not start.

Logs: `run/relay.log`, `run/host.log`, `run/phone.log`. These are scratch and are deleted by cleanup. Copy anything you need into `artifacts/` first.

## Doctor

Run first, and again whenever anything looks off:

```bash
node .claude/skills/verify/scripts/instance.mjs doctor
```

`DOCTOR OK` means: each recorded PID is alive, its command line carries its marker (`server.js`, `host.vite.config.mjs`, `phone.vite.config.mjs`), each port is owned by that PID, and all three documents are served. Otherwise `DOCTOR FAIL: <reason>`. The drive script runs doctor itself and refuses to drive a failed instance.

## Drive

Each feature is one script, run against the live instance:

```bash
node .claude/skills/verify/scripts/drive.mjs join-lobby
node .claude/skills/verify/scripts/drive.mjs select-game
node .claude/skills/verify/scripts/drive.mjs bowling-throw
node .claude/skills/verify/scripts/drive.mjs mario-kart-race
```

Set `HEADED=1` to watch it run. Exit 0 means every check passed. Each check prints `PASS` or `FAIL` with the observed value.

Each run opens a fresh host page, so it starts a new session. Each phone is its own browser context, so its state is separate from the host's. Runs do not depend on each other, but the relay keeps every session until its host page closes.

Stable handles, from the source:

- Host lobby: `.session-id strong` (the session id), `.lobby-left` (the QR and phone URL text), `.player-count`, `.player-item`, `.btn-start` (labelled "Select Game").
- Host game hub: `.game-card` with the game label inside `.game-card-label`. Disabled cards carry `Coming Soon`.
- Phone: `#screen-permission` and `#btn-permission` (motion permission), `#screen-name`, `#input-name`, `#btn-join`, `.input-error`, `#screen-waiting` and `#waiting-label`.
- Phone bowling: `#screen-bowl`, `#btn-bowl` (hold for a throw), `#screen-result`.
- Host bowling scoreboard: `.scoreboard-player`, `.roll-cell`.
- Phone kart: `#kart-stick`, `#kart-place`, `#kart-lap`.
- Host kart: `.kart-layout`, `.kart-pane`, `.kart-countdown`, `.kart-lap-count`.

Motion permission: Chrome on desktop exposes `DeviceMotionEvent.requestPermission`, so the controller opens on the permission screen. The driver clicks the real button, and Chrome grants it. This is not a stub. The iOS Safari grant path is not exercised here.

Bowling motion: the throw is driven by `devicemotion` events dispatched on `window`, with the BOWL button getting real `touchstart` and `touchend` events. The phone's own listener, sample buffer, throw composition, and relay send all run unchanged. The input is synthetic acceleration, not an arm swing, so the throw speed is not a proof of how a human swing feels.

Kart racing: `scripts/kart-pilot.mjs` plays a full three-lap race as a player would. It reads the road from the host's own `track.js` centerline, the kart's position from `race_status`, and steers the stick with real pointer events. Stick-right is negative steer (`steer.js`). The pilot is documented in `features/mario-kart-race.md`, including the rules of the race.

## Evidence

Each run writes to `artifacts/<feature-id>/`:

- `result.json`: `passed`, the list of checks with observed values, `error` if the run threw, and `finishedAt`.
- `frames.jsonl`: every relay frame, in both directions, tagged with the page (`host`, `phone:<name>`). This is the side-effect proof. A throw is proven by the phone's outbound `throw` frame, the host's inbound `throw` frame, and the phone's inbound `throw_result`.
- `<step>.png` and `<step>.aria.txt`: a screenshot and the accessibility snapshot of each captured state. The screenshot shows the screen title.
- `relay.log.txt` (join-lobby only): the relay log lines for this run's joins.
- `failure.png`: the host screen at the moment a feature threw.

Proof standards:

- Exercise the real user path: type into `#input-name`, click `#btn-join`, click the game card, press the BOWL button. Do not set `window` state or call internal functions.
- Capture the action and the resulting state. The screenshot and the frame log together show both.
- Verify side effects as well as what is visible. Frames are the side effects. The relay log is the server-side join record.
- The only injected inputs are the `devicemotion` events and the browser's own motion permission click, which goes through the real API.

## Cleanup

```bash
node .claude/skills/verify/scripts/instance.mjs cleanup
```

Cleanup signals each recorded PID's process group, but only after its command line still matches its marker, so a recycled PID is left alone. It deletes `run/`. It does not touch `artifacts/`. After cleanup, `doctor` must report `DOCTOR FAIL: no instance record`, and the artifacts must still be present.

If a launch or drive fails partway, run cleanup before retrying so the ports are free.

## Helpers

| Script | Invocation |
|---|---|
| Start the relay, host, and phone on their ports | `node .claude/skills/verify/scripts/instance.mjs launch` |
| Check PIDs, ports, commands, and documents | `node .claude/skills/verify/scripts/instance.mjs doctor` |
| Stop the recorded processes and delete `run/` | `node .claude/skills/verify/scripts/instance.mjs cleanup` |
| Run one mapped feature with proof | `node .claude/skills/verify/scripts/drive.mjs <feature-id>` |
| Driver policy for racing a kart (imported by `drive.mjs`, not run directly) | `scripts/kart-pilot.mjs` |

The feature map is in `features/README.md`. It lists what is covered and what is not.
