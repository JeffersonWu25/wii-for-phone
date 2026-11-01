# Join the lobby

A player opens the host TV page, which shows a QR code and the phone URL with a session id. The player scans it, enters a name on the phone, and sees their name appear in the host's player list. An empty name does not join. A name already used by a connected player is refused, and the player can choose another name.

## Sub-features

- `host-lobby-qr`: the host lobby shows a QR code and the phone URL with this session's id.
- `phone-permission`: on the phone, the motion permission screen comes first and its button grants access.
- `phone-name-entry`: the phone's name screen takes a name and joins on `#btn-join`.
- `empty-name-rejected`: an empty name does not send `join` and the host player count stays put.
- `name-trimmed`: surrounding spaces are removed before the name is sent.
- `duplicate-name-refused`: a name taken by a connected player shows `That name is already taken. Choose another.`
- `second-player-joins`: a different name joins, and the host lists both players.

## How to get to it (user POV)

- Open the host URL on the laptop. The lobby shows the QR code and the URL under `Session:`.
- Scan the QR code with a phone, or type the URL shown under the session id. The phone opens on its motion permission screen, then on the name screen.
- Type a name, then tap `Join Game`.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. No other session is required.

Run it:

```bash
node .claude/skills/verify/scripts/drive.mjs join-lobby
```

Steps the script performs, with what each one proves:

- Open `HOST_URL` in a host context. Read `.session-id strong` for the session id. Expect `.lobby-left` to contain `PHONE_URL?session=<id>`, so the QR points at the local phone port.
- Expect `.player-count` to read `(0)` and no `.player-item`.
- Open `PHONE_URL?session=<id>` in a phone context. Expect `#screen-permission`, click `#btn-permission` (Chrome grants it), then expect `#screen-name`.
- Click `#btn-join` with an empty input. Expect `#screen-name` to remain and the host count to stay `(0)`.
- Fill `#input-name` with `  Ada  ` and click `#btn-join`. Expect `#waiting-label` to read `Waiting for host to select a game...`. Expect the host to show one `.player-item` reading `Ada` and `.player-count` `(1)`.
- Open a second phone context, fill `Ada`, click `#btn-join`. Expect `.input-error` to read `That name is already taken. Choose another.` Expect the host still to show one player.
- In that same second phone, fill `Grace` and click `#btn-join`. Expect `#waiting-label` to show the waiting text and the host to show `Ada` and `Grace`, `(2)`.
- Read `run/relay.log` from this run's start. Expect two `Player joined:` lines, for `Ada` and `Grace`.

Evidence in `artifacts/join-lobby/`: `host-lobby-empty`, `phone-name-entry`, `host-one-player`, `phone-waiting`, `phone-duplicate-name`, `host-two-players` (each `.png` and `.aria.txt`), `relay.log.txt`, and `frames.jsonl` (the `join` frames from each phone and the `player_joined` frames at the host).

## Gotchas

- Chrome desktop shows the motion permission screen too, because it exposes `DeviceMotionEvent.requestPermission`. The driver clicks the real button and Chrome grants it. That does not cover the iOS Safari grant or a denied permission. Those stay unmapped.
- The waiting label first reads `Joining...` until the relay answers `joined`. Wait for the real label, not for `#waiting-label` to exist.
- `run/relay.log` is shared across runs. Read only lines written after this run started, or the join count includes earlier runs.
- The relay logs `Player joined` for each accepted join only. A rejected duplicate writes no log line, so the check counts joins, not attempts.
- The lobby QR and the URL text come from `VITE_PHONE_URL`. A local run must override it, because the repo's `.env` points at the hosted phone.
- After a duplicate-name refusal the phone stays on the name screen with `.input-error` showing. The driver renames that same page to `Grace` rather than opening a third context, so the retry runs on the refused socket's page state.
