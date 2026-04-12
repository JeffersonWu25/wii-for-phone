# Wii Sports Resort Bowling — Web App

A browser-based multiplayer bowling game. The host runs on a laptop (connected to a TV), and players join as controllers by scanning a QR code on their phones — no app install required.

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
5. Host clicks **Start** → game begins.

---

## Project Structure

```
wii-for-phone/
├── certs/          # mkcert-generated TLS certs (git-ignored)
├── host/           # Vite + React app — game screen (Three.js + Rapier physics)
├── phone/          # Vite + Vanilla JS app — mobile controller
├── relay/          # Node.js WebSocket relay server
├── .env            # Environment variables (see above)
└── CLAUDE.md       # Architecture and implementation notes
```

---

## How it Works

The relay server is a lightweight Node.js WebSocket broker. The host connects as `role=host` and gets a session ID. The QR code encodes `https://<ip>/phone?session=<id>`. Phones connect as `role=phone` with that session ID.

- While the player holds the bowl button, the phone streams orientation at 20 Hz (`pos` events) so the TV shows the ball moving in real time.
- On release, the phone fires a single `throw` event with `power`, `angle`, and `spin` derived from the motion buffer. The physics engine takes over from there.

See [CLAUDE.md](CLAUDE.md) for the full architecture, data flow, and build order.
