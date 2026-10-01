---
name: verify-wildhacks-arcade
description: Drive the WildHacks Arcade host and phone web apps (on-screen title Wii Playground) against a local relay to prove lobby join, game selection, bowling controls, a simulated bowl, two frames with two players, disconnect, and session end. Use when verifying UI behavior, after changes to host, phone, or relay, or when asked to prove a user-facing flow.
---

# Verify WildHacks Arcade

The primary surface is two web apps plus the relay that connects them. The host is the TV screen (`host/`). The phone is the controller (`phone/`). Players join by opening the phone URL shown in the host lobby. A second surface is the relay's HTTP health response (`ok` on its port); that response is only a doctor check, not proof that a player joined.

Drive only the instance these scripts start. The repo root `.env` points `VITE_RELAY_URL` at the hosted relay. `npm run dev` in `host/` and `phone/` also turns on HTTPS when `certs/localhost.pem` exists, and an HTTPS page cannot open this relay's plain `ws://` socket. Do not attach to anything already listening on 5173, 5174, or 8080.

Ports 18080, 15173, and 15174 belong to one verification instance. A second instance cannot share them. If any of those ports is taken, stop. Do not kill the occupant to free the port.

## Launch

From the repo root:

```bash
.cursor/skills/verify-wildhacks-arcade/scripts/launch.sh
```

The script starts each process in its own session so the instance stays up after the launcher exits, and writes their PIDs to `.cursor/skills/verify-wildhacks-arcade/run/instance.env`:

- Relay: `PORT=18080 node server.js` in `relay/`. Ready when `http://127.0.0.1:18080` returns the body `ok` and the log contains `[relay] Listening on port 18080`.
- Host: Vite with `host/vite.verify.config.js` (copied from `scripts/host.vite.config.js` for this run), `VITE_RELAY_URL=ws://127.0.0.1:18080`, and `VITE_PHONE_URL=http://127.0.0.1:15174`. Ready when `http://127.0.0.1:15173` HTML contains `Wii Bowling — Host`.
- Phone: Vite with `phone/vite.verify.config.js` (copied from `scripts/phone.vite.config.js` for this run) and `VITE_RELAY_URL=ws://127.0.0.1:18080`. Ready when `http://127.0.0.1:15174` HTML contains `Wii Bowling — Controller`.

`launch.sh` exits 0 only after all three HTTP checks pass. It prints `HOST_URL`, `PHONE_URL`, and `RELAY_URL`.

Tear down with Cleanup. Logs in `run/` are scratch. Copy any log lines you need into `artifacts/` before cleanup.

## Doctor

Run this before driving, and again whenever a page shows `Lost Connection` or a socket fails:

```bash
.cursor/skills/verify-wildhacks-arcade/scripts/doctor.sh
```

`DOCTOR OK` means all three PIDs from `run/instance.env` are alive, their command lines are `server.js` and the two verification Vite configs, each port is owned by that PID, the relay body is `ok`, and both documents contain the titles above. Anything else is `DOCTOR FAIL`. Do not drive a failed instance. Do not reuse a browser tab that was not opened against this `HOST_URL` and `PHONE_URL`.

## Drive

Harness: the Cursor browser tools `browser_tabs`, `browser_navigate`, `browser_lock`, `browser_snapshot`, `browser_fill`, `browser_click`, and `browser_take_screenshot`.

There is no Playwright suite. Do not prove a flow by sending WebSocket frames yourself. The phone page has to send them.

Tab discipline:

1. `browser_tabs` with `action` `list`.
2. `browser_navigate` with `newTab` true. Omit `position` so the window stays in the background.
3. Record each tab's `viewId`. Pass that `viewId` on every later browser call. The host tab and the phone tab are different.
4. `browser_lock` with `action` `lock` after the first tab exists, before clicks or typing. `browser_lock` with `action` `unlock` only after the run's browser work is finished.

Stable handles are accessible names and the ids in the feature files. Snapshot first, then click or fill the `ref` whose name matches. `browser_snapshot` `selector` can scope to an id such as `#btn-join`.

The desktop browser used here does not implement `DeviceMotionEvent.requestPermission`, so the phone opens on the name screen (`#screen-name`, heading `Wii Playground`, button `Join Game`). If a screen titled with button `Enable Motion Sensors` appears instead, stop and report that entry point unreachable. Do not treat the name screen as proof of the permission screen.

Dev StrictMode opens the host socket twice. The lobby can briefly show `Connecting...` and the relay log can contain an extra `Session ended` line. Read the session id from the lobby text `Session: ` after `Connecting...` is gone. Open the phone on the URL printed under that id. Ignore earlier ids in the log.

Names are trimmed. The input `maxlength` is 16. An empty name does not send `join`. A duplicate name among connected players returns the phone to the name screen with `That name is already taken. Choose another.`

## Evidence

Write proof under `.cursor/skills/verify-wildhacks-arcade/artifacts/<feature-id>/`. Create the directory before taking screenshots.

For each driven feature record the feature id, the entry point, the user action, and the resulting state.

- Accessibility: copy the `browser_snapshot` YAML into `artifacts/<feature-id>/<step>.aria.txt`. The tool does not write this file itself.
- Screenshot: `browser_take_screenshot` with `filename` set to `artifacts/<feature-id>/<step>.png`. The tool does not write that repo path. It returns `Saved to:` under the Cursor temp screenshots directory. Copy that file to `.cursor/skills/verify-wildhacks-arcade/artifacts/<feature-id>/<step>.png` before cleanup.
- Relay side effect: for join and disconnect, copy the matching line from `run/relay.log` into `artifacts/<feature-id>/relay.log.txt` before cleanup. The relay does not log throws. Prove a throw with the phone result screen and the host scoreboard.
- The visible result must be a second user-facing surface (the other client), not a variable you set in the page.

Mocks are not used. The local relay is the real server, bound to these ports so the run does not join the hosted game.

## Cleanup

Close only browser tabs whose URL starts with `http://127.0.0.1:15173` or `http://127.0.0.1:15174`. Then:

```bash
.cursor/skills/verify-wildhacks-arcade/scripts/cleanup.sh
```

That script reads `run/instance.env` and kills those PIDs and their children. It then deletes `run/` and the copied `host/vite.verify.config.js` and `phone/vite.verify.config.js` files. It does not delete `artifacts/`. After cleanup, `doctor.sh` must fail because the instance record is gone, and the artifact files must still be present.

If a launch or drive fails partway, run `cleanup.sh` before retrying so the ports and PIDs are not left behind.

## Helpers

All three scripts are executable and live next to the Vite configs they launch.

| Script | Invocation |
|---|---|
| Start the isolated relay, host, and phone | `.cursor/skills/verify-wildhacks-arcade/scripts/launch.sh` |
| Check PIDs, ports, and document titles | `.cursor/skills/verify-wildhacks-arcade/scripts/doctor.sh` |
| Kill the recorded PIDs and delete `run/` | `.cursor/skills/verify-wildhacks-arcade/scripts/cleanup.sh` |

`scripts/host.vite.config.js` and `scripts/phone.vite.config.js` are verification scaffolding. `launch.sh` copies them to `host/vite.verify.config.js` and `phone/vite.verify.config.js` because Vite resolves packages from the config file's directory. `cleanup.sh` deletes the copies. Do not point `npm run dev` at them, and do not pass the `scripts/` paths to Vite.
