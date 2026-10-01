# Join the lobby

Join the lobby lets a player open the phone URL from the host, enter a name, and show up in the host player list so the host can select a game.

## Sub-features

- `lobby-open` shows a session id, the phone URL, an empty player list, and a disabled `Select Game` button.
- `join-name` submits a trimmed name from the phone and lands on the waiting screen.
- `join-appears` adds that name to the host list and enables `Select Game`.
- `join-empty` keeps a blank name on the phone and leaves the host list empty.
- `join-duplicate` rejects a second connected player who uses the same name.
- `join-permission` asks for motion sensors before the name screen on browsers that gate DeviceMotion behind a gesture.

## How to get to it (user POV)

- Open the host URL. The lobby is the first screen after the relay connects.
- On the phone, open the URL printed on the lobby (`?session=` plus the session id).
- On a browser that requires a motion gesture, tap `Enable Motion Sensors`, then enter a name.
- On a browser that does not require that gesture, the name screen is the first phone screen.
- Type a name and choose `Join Game`, or press Enter in the name field.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- Host tab is a fresh load of `http://127.0.0.1:15173`. No phone has joined this session yet.
- The phone tab has not been opened yet.

- **Open lobby.** Navigate the host tab with `browser_navigate` `url` `http://127.0.0.1:15173` `newTab` true. Lock, then `browser_snapshot`. The first paint is often `Lost Connection` while the socket is still opening. Snapshot again until the heading is `Wii Playground`. If `Lost Connection` is still there after the socket has had time to open, run `scripts/doctor.sh` and stop. When the lobby is up, `Connecting...` is gone, a line reads `Session: ` plus a 6-character hex id, the player list says `Waiting for players...`, and the heading's accessible name is `Players ( 0 )`. The `Select Game` button is disabled. Record the full phone URL shown under the session id. The visible count reads `Players (0)`.
- **Empty name.** Open that phone URL in a new tab with `browser_navigate` `newTab` true. Snapshot `#screen-name`. The heading is `Wii Playground`, the textbox placeholder is `Your name` (id `input-name`), and the button is `Join Game` (id `btn-join`). Click `Join Game` with the textbox empty. The name screen stays. The host list still says `Waiting for players...`. `run/relay.log` has no `Player joined` line for this attempt.
- **Enter name.** Fill the name textbox with `Verify Player` using `browser_fill`. Snapshot the phone tab and confirm the textbox value is `Verify Player`.
- **Join.** Click `Join Game`. The phone first shows `Joining...`. Snapshot again until `#screen-waiting` shows `Waiting for host to select a game...`.
- **Confirm on the host.** Snapshot the host tab. The list item is `Verify Player`. The heading's accessible name is `Players ( 1 )` (the visible label is `Players (1)`). `Select Game` is enabled (it has no disabled state).
- **Confirm the relay.** Copy the `Player joined: Verify Player` line from `run/relay.log` into `artifacts/join-lobby/relay.log.txt`. The session id in nearby `Session created` lines must be the id still shown on the host.
- **Duplicate name.** Open the same phone URL in a third tab, fill `Verify Player`, and click `Join Game`. The phone returns to `#screen-name` with `That name is already taken. Choose another.` The host count stays `Players (1)`.
- **Proof.** Save `artifacts/join-lobby/phone-name.aria.txt` and `phone-name.png` from the filled name screen before the successful join click. Save `artifacts/join-lobby/host-after-join.aria.txt` and `host-after-join.png` from the host after the name appears. Save `artifacts/join-lobby/phone-waiting.aria.txt` and `phone-waiting.png` from the waiting screen. The host artifacts must show `Wii Playground`, `Verify Player`, and the session id.

## Gotchas

- The host's first paint is `Lost Connection` until the WebSocket opens. Wait for `Wii Playground` before treating the relay as down.
- After `Join Game`, the label `Joining...` and the later label `Waiting for host to select a game...` are both `#screen-waiting`. The joined state is the second label.
- The snapshot heading is `Players ( 0 )` or `Players ( 1 )`, with spaces around the count. The pixels read `Players (0)` and `Players (1)`.
- `join-permission` is not this path. If the phone shows `Enable Motion Sensors` (id `btn-permission`), report `join-permission` unreachable on this browser and do not claim the name screen covers it.
- Use the phone URL currently printed in the lobby. A session id from an earlier `Session created` log line belongs to the socket StrictMode already closed.
- `Select Game` stays disabled until at least one named player is listed. A phone that connected but has not completed `Join Game` is not a player.
- Closing the phone tab after a successful join does not remove the name from the lobby list. Disconnect is visible on the bowling screen, not here.
- The root `.env` phone URL is a LAN address. The verification host must show `http://127.0.0.1:15174?session=`. If it shows another host, the Vite process was not started by `launch.sh`.
