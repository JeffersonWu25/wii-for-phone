# WildHacks Arcade — Web Multiplayer Hub

A browser-based multiplayer game hub. The host runs on a laptop (connected to a TV), and players join as controllers by scanning a QR code on their phones — no app install required.

Currently shipped: **Bowling**. Coming soon: Wizard Duel, 3PT Contest, Tennis, Golf, Piano Master.


---

## Local Dev Setup

### Prerequisites

- **Node.js** LTS
- **mkcert** — generates trusted local HTTPS certs (required for iOS motion sensors)

```bash
brew install mkcert
```

### 1. Generate local HTTPS certs

HTTPS is mandatory — iOS will not grant DeviceMotion permission over plain HTTP.

```bash
mkcert -install                    # one-time: installs the local CA
cd /path/to/wii-for-phone
mkdir -p certs
cd certs
mkcert localhost                   # generates localhost.pem + localhost-key.pem
```

The Vite configs for both `host` and `phone` automatically detect and use `certs/localhost.pem` and `certs/localhost-key.pem` at startup.

### 2. Install dependencies

Run in three separate directories:

```bash
cd relay && npm install
cd ../host && npm install
cd ../phone && npm install
```

### 3. Configure environment variables

Create a `.env` file in the project root (next to `host/`, `phone/`, `relay/`):

```env
VITE_RELAY_URL=ws://localhost:8080
VITE_PHONE_URL=https://<your-local-ip>:5174
```

- Replace `<your-local-ip>` with your machine's local network IP (e.g. `192.168.1.42`). Find it with `ipconfig getifaddr en0` on macOS.
- `VITE_PHONE_URL` is used by the host to generate the QR code that phones scan. It must be your LAN IP — `localhost` won't work from a phone.
- Both Vite apps read `.env` from the project root (configured via `envDir: '../'` in each `vite.config.js`).

### 4. Start the servers

Open **three terminals**, one per component:

```bash
# Terminal 1 — relay server
cd relay
npm start
# Listening on port 8080

# Terminal 2 — host (laptop / TV screen)
cd host
npm run dev
# https://localhost:5173

# Terminal 3 — phone controller
cd phone
npm run dev
# https://<your-local-ip>:5174
```

### 5. Play

1. Open `https://localhost:5173` in a browser on the laptop.
2. The lobby screen shows a QR code — scan it with a phone on the same WiFi network.
3. On iOS: tap **Enable motion sensors** when prompted (required by Safari).
4. Enter a name → you appear in the lobby on the TV.
5. Host clicks **Select Game** → choose a game from the hub → game begins.

---

## Project Structure

```
wii-for-phone/
├── certs/                  # mkcert-generated TLS certs (git-ignored)
├── relay/                  # Node.js WebSocket relay server
├── host/                   # Vite + React — TV/laptop game screen
│   └── src/
│       ├── App.jsx         # Thin router: lobby → game-select → game
│       ├── shared/
│       │   ├── useRelay.js           # WebSocket hook (stable send)
│       │   ├── LobbyScreen.jsx       # QR code + player list
│       │   └── GameSelectScreen.jsx  # Game hub grid
│       └── games/
│           ├── bowling/
│           │   ├── BowlingApp.jsx    # Bowling game logic + scoring
│           │   ├── Scene.jsx         # Three.js lane, pins, ball
│           │   ├── physics.js        # Rapier physics world
│           │   └── BowlingGame.js    # Frame/score tracking
│           ├── wizard-duel/          # (coming soon)
│           ├── 3pt-contest/          # (coming soon)
│           ├── tennis/               # (coming soon)
│           ├── golf/                 # (coming soon)
│           └── piano-master/         # (coming soon)
├── phone/                  # Vite + Vanilla JS — mobile controller
│   └── src/
│       ├── main.js         # Thin bootstrap: connect, route game_selected
│       └── games/
│           ├── bowling/    # Bowl button, D-pad, motion capture
│           └── ...         # (future game UIs)
├── .env                    # Environment variables (see above)
└── CLAUDE.md               # Architecture and implementation notes
```

---

## How it Works

### Hub flow

```
Host opens lobby → players scan QR → host clicks "Select Game"
→ game-select screen → host picks a game
→ relay broadcasts game_selected to all phones
→ phones load the matching game UI
→ game starts
```

### Relay

The relay server is a lightweight Node.js WebSocket broker. The host connects as `role=host` and receives a session ID. The QR code encodes `https://<ip>/phone?session=<id>`. Phones connect as `role=phone` with that session ID.

The relay stores the currently selected game in session state. If a phone joins or reconnects after game selection, the relay immediately sends `game_selected` so the phone loads the correct UI without waiting for another broadcast.

### Bowling (motion controls)

- While the player holds the bowl button, the phone streams orientation at 20 Hz (`pos` events) so the TV shows the ball moving in real time.
- On release, the phone fires a single `throw` event with `power`, `angle`, and `spin` derived from the motion buffer. The Rapier physics engine takes over from there.
- D-pad controls ball lane position (MOVE mode) and throw angle (AIM mode).

### Adding a new game

1. Create `host/src/games/<id>/` with a default export component receiving `{ wsRef, send, players, onGameOver, onAbandon }`.
2. Create `phone/src/games/<id>/index.js` exporting `mount(app, sendMsg, myPlayerId)` → `{ onMessage, onMotion }`.
3. Add the game to the `GAMES` array in `GameSelectScreen.jsx` with `built: true`.
4. Add a `case '<id>':` to the switch in `phone/src/main.js` and to `App.jsx`'s render block.

See [CLAUDE.md](CLAUDE.md) for the full architecture, data flow, and message protocol.
