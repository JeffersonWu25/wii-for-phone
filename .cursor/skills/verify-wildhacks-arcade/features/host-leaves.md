# Host leaves

Host leaves tells every joined phone that the session is over when the host disconnects, and tells the host when it cannot reach the relay.

## Sub-features

- `host-end` shows `Session Ended` on a joined phone after the host tab closes.
- `host-lost` shows `Lost Connection` on the host when the relay is unreachable, and `Reconnect` starts a new lobby session.

## How to get to it (user POV)

- The host closes the game tab or refreshes away from the session.
- Each phone that had joined shows `Session Ended` and `Host disconnected.`
- If the host cannot open the relay, the host shows `Lost Connection` and a `Reconnect` button.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK` before the host-end path.
- One phone has joined and is on `Waiting for host to select a game...`.
- For `host-lost`, start from a fresh browser tab and do not reuse the healthy host tab.

- **End the session.** Close the host tab with `browser_tabs` `action` `close`. Snapshot the phone tab. The heading is `Session Ended` and the text is `Host disconnected.` The screen id is `#screen-ended`.
- **Confirm the relay.** Copy `[relay] Session ended:` from `run/relay.log` into `artifacts/host-leaves/relay.log.txt`. The id matches the session that was on the lobby.
- **Lost connection.** With the host tab still open, `kill` only the `RELAY_PID` from `run/instance.env`. Leave `HOST_PID` and `PHONE_PID` running. The open host tab switches to `Lost Connection` when its socket closes. Reload `http://127.0.0.1:15173` only if that tab was already closed. The heading is `Lost Connection`, the text is `Could not reach the relay server.`, and the button is `Reconnect`.
- **Reconnect.** From `relay/`, start `PORT=18080 node server.js` again and note the new PID. Click `Reconnect`. The lobby returns with a new `Session: ` id and `Waiting for players...`. The phone that already showed `Session Ended` stays there until it is opened on the new lobby URL. Update `run/instance.env` so `RELAY_PID` is the new process before any later `cleanup.sh`.
- **Proof.** Save `artifacts/host-leaves/session-ended.aria.txt` and `session-ended.png` from the phone. The heading `Session Ended` must be visible. Save `artifacts/host-leaves/lost-connection.aria.txt` and `lost-connection.png` only if the relay was actually stopped and the host rendered `Lost Connection`.

## Gotchas

- `cleanup.sh` kills the relay, the host, and the phone together. After a full cleanup there is no page left to show `Lost Connection`. Stop the relay PID alone for that screen, and run `cleanup.sh` afterward so the leftover host and phone do not keep the ports.
- A phone that never finished `Join Game` may not show `Session Ended`; the relay only notifies players that were in the session. Prove this on a phone that already reached the waiting screen.
- `Reconnect` creates a new session. Player names from the old session are gone. The old phone URL does not join the new session.
- Do not claim `host-lost` from a doctor failure or a console error. The proof is the `Lost Connection` heading on the host.
