# Wii Sports Resort Bowling — Web App

## Project Overview

A web-based multiplayer bowling game replicating Wii Sports Resort bowling. Players use their smartphones as motion controllers instead of Wii Remotes. The host game runs in a browser on a laptop connected to a TV via HDMI. Players join by scanning a QR code — no app install required.

The Wii original translated physical arm swing into game input: swing speed = power, arm angle at release = direction, wrist twist = spin. We replicate this exactly using the phone's accelerometer and gyroscope via the browser DeviceMotion API.

### The Button Mechanic

Mirrors Wii's B-button exactly:
- Player **holds** a large on-screen button → phone starts recording motion data
- Player **releases** the button → phone snapshots the buffer, extracts power/angle/spin, fires one WebSocket event to the host
- While held, phone also **streams** lightweight orientation packets at 20hz so the TV shows the ball moving in real time during the approach
- On release, the stream stops and the physics engine takes over

### Player Experience Flow

1. Host opens game URL on laptop → lobby + QR code appears on TV
2. Players scan QR → phone controller loads instantly in browser
3. iOS users tap "Enable motion sensors" (required by Safari)
4. Players enter name → appear in lobby list on TV
5. Host starts game → turns rotate through all players
6. On your turn: hold button, swing arm, release → ball launches on TV
7. Everyone watches pins scatter, scores update
8. 10 frames per player, standard bowling scoring, final scoreboard at end

---

## System Architecture

Three components: **host client**, **phone client**, **relay server**.

```
Phone (mobile browser)
  └── WebSocket ──► Relay Server (Node.js) ──► Host (browser on laptop → TV)
```

### Relay Server
- Lightweight Node.js WebSocket server
- Manages sessions (rooms) keyed by a short random session ID
- Stores everything in memory — no database needed, sessions are ephemeral
- Two responsibilities: forward phone messages to the host, forward host messages to all phones in the session
- Session structure: `{ hostWs, players: [{ id, ws, name, scores }], gameState, currentPlayerId }`

### Host Client
- React app managing game state (turns, frames, scores, player list)
- Three.js for 3D rendering: lane, ball, 10 pins
- Rapier (WASM) for physics: ball rolling, pin collisions, scatter
- Generates QR code from session URL on lobby screen
- Two ball modes: **preview mode** (follows phone orientation stream) and **physics mode** (after throw event, Rapier takes over)

### Phone Client
- Vanilla JS single-screen app
- Four screens: permission → name entry → waiting → bowl button
- DeviceMotion listener runs continuously once permitted
- On touchstart: begin buffering motion samples, start 20hz stream to host
- On touchend: extract values from buffer, fire single throw event, clear buffer
- Uses Wake Lock API to prevent screen sleep during play

---

## Data Flow

### Session Setup
```
Host connects to relay → relay creates session → host gets sessionId
Host generates QR encoding: https://<ip>/phone?session=<sessionId>
Player scans QR → phone loads with sessionId in URL param
Phone connects to relay → sends join message → relay notifies host
Host lobby updates with player name
```

### Throw Sequence
```
touchstart
  → start motion buffer
  → start 20hz pos stream: { type:"pos", yaw, pitch, roll }
  → relay forwards pos to host
  → host animates ball preview on TV

touchend
  → stop stream
  → extract from buffer:
      power = peak acceleration magnitude (normalized 0–1)
      angle = gyro yaw at moment of peak acceleration (normalized -1 to 1)
      spin  = gyro roll delta start-to-end (normalized -1 to 1)
  → send: { type:"throw", power, angle, spin }
  → relay forwards to host
  → host stops preview, passes values to physics engine
  → ball rolls, pins scatter
  → on settle: count standing pins, record score
  → host sends result to relay → relay broadcasts to all phones
  → host advances turn, sends your_turn to next player
```

### Motion-to-Physics Mapping
- `power` (0–1) → ball speed 3–12 m/s
- `angle` (-1 to 1) → launch angle ±15 degrees from center
- `spin` (-1 to 1) → angular spin ±10 rad/s (positive = clockwise curve)

### Message Types
Phone → Relay → Host: `join`, `pos`, `throw`
Host → Relay → Phones: `session_created`, `player_joined`, `game_started`, `your_turn`, `throw_result`, `game_over`

---

## Tech Stack

### Host (`/host`) — Vite + React
| Package | Purpose |
|---|---|
| `react` + `react-dom` | UI state — turns, scores, lobby |
| `three` | WebGL rendering — lane, ball, pins |
| `@dimforge/rapier3d-compat` | WASM physics — ball roll, pin collision |
| `qrcode` | QR code generation for lobby screen |
| `vite` | Dev server + build |

### Phone (`/phone`) — Vite + Vanilla JS
No framework needed. Browser APIs only: `DeviceMotionEvent`, `DeviceMotionEvent.requestPermission()` (iOS), `navigator.wakeLock`, `WebSocket`, `navigator.vibrate` (Android haptics).

### Relay (`/relay`) — Node.js
| Package | Purpose |
|---|---|
| `ws` | WebSocket server |
| `https` (built-in) | HTTPS wrapper (required for iOS sensors) |
| `crypto` (built-in) | Session ID generation |

### System Tools (install once)
- **Node.js** LTS
- **mkcert** (`brew install mkcert`) — local HTTPS certs required for iOS DeviceMotion

---

## Local Dev Setup

Phone and laptop must be on the same WiFi. Phone accesses the laptop by its local IP (e.g. `192.168.1.42`).

HTTPS is mandatory — iOS will not grant motion sensor permission over HTTP.

Setup steps:
1. `mkcert -install` then `mkcert 192.168.1.42` → generates cert + key files
2. Both Vite configs: set `host: '0.0.0.0'` and point `https` to the cert files
3. Relay server: create an `https` server with the cert files, wrap `ws` around it
4. Store local IP in `.env` as `VITE_LOCAL_IP` — reference everywhere via env var
5. Run three terminals: relay server, host dev server, phone dev server

Rapier WASM requires these response headers: `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp`. Add to Vite config.

---

## Bowling Rules

- 10 frames per player
- Each frame: up to 2 rolls (except 10th)
- **Spare** (all 10 on 2 rolls): score = 10 + next 1 roll bonus
- **Strike** (all 10 on first roll): score = 10 + next 2 rolls bonus
- **10th frame**: earn bonus attempts on strike or spare — up to 3 rolls
- Max score: 300 (12 consecutive strikes)
- Score display: standard card format with `X` for strike, `/` for spare

---

## Build Order — 8 Parts

Build and verify each part before starting the next. Each part is independently testable.

### Part 1: Relay Server
Build the WebSocket relay with session creation, player join, and message forwarding.
**Test:** Use two browser console tabs to simulate host + phone. Verify messages route correctly between them.

### Part 2: Phone Motion Capture
Build the phone app with DeviceMotion capture, hold-button mechanic, stream + throw events, WebSocket client.
**Test:** Physically swing phone, verify `pos` packets stream while held and a single `throw` event fires on release with sensible power/angle/spin values.

### Part 3: Host Lobby
Build the React host app lobby: creates session, shows QR code, live player list, start button.
**Test:** Scan QR with phone, verify player name appears on host in real time.

### Part 4: 3D Scene
Build Three.js scene: lane geometry, 10 pins in regulation triangle formation, ball at start position, camera behind ball looking down lane.
**Test:** Visual — lane, pins, and ball render correctly. No interaction needed.

### Part 5: Physics
Integrate Rapier: ball rigid body with initial velocity from throw values, pin rigid bodies, floor collider. Sync Rapier body positions to Three.js meshes each frame. Detect settle and count standing pins.
**Test:** Hardcode a test throw. Verify ball rolls, pins scatter realistically, correct pin count is logged after settle.

### Part 6: Game Logic
Build `BowlingGame` class: frame tracking, strike/spare detection, bonus roll calculation, turn rotation, 10th frame rules, score totalling. No UI dependencies.
**Test:** Unit test known games — perfect game = 300, all spares = 150, gutter game = 0. Verify two-player turn rotation.

### Part 7: Production Hosting
Refactor env vars and deploy all three components so real phones can join without local network or cert setup.

**Env var refactor:**
- Replace `VITE_LOCAL_IP` with `VITE_RELAY_URL` (e.g. `wss://relay.yourdomain.com`) and `VITE_PHONE_URL` (e.g. `https://yourdomain.com/phone`) in both Vite apps
- Relay reads port from `process.env.PORT` with fallback to 8080
- Relay runs as plain WS (no cert files in code) — TLS handled by reverse proxy

**Hosting targets:**
- **Relay** — any Node.js host (Railway, Render, Fly.io). Add a `start` script, ensure WebSocket connections are supported
- **Host client** — static site host (Vercel, Netlify, GitHub Pages). Run `vite build` in `/host`, deploy `/host/dist`
- **Phone client** — same static host as above, or subdirectory. Run `vite build` in `/phone`, deploy `/phone/dist`

**Test:** Deploy all three. On a phone with no special cert setup and on a different network, scan the QR code and join the lobby successfully.

### Part 8: Full Integration
Wire all parts together: throw events from real phones → physics → scoring → turn advancement → score broadcast → phone feedback. Connect pos stream to ball preview. Add scoreboard overlay.
**Test:** Full end-to-end with real phones on the production deployment. Play 3+ complete frames, verify scores, verify turn rotation, verify game over screen.

### Part 9: Polish and Edge Cases
- Host: camera pan during roll, strike/spare overlay animations, pin reset animation between frames
- Phone: live power meter while holding, result feedback text, haptics (Android)
- Edge cases: player disconnects mid-game (skip turn, allow rejoin), throw too short < 150ms (ignore + prompt), no motion permission (persistent explanation screen), host refresh (broadcast session ended to all phones)
- **Test:** Full 4-player game, disconnect test, iOS + Android cross-browser test

---

## Key Implementation Notes

- **iOS motion permission** must be triggered inside a user gesture (tap handler). Cannot request on page load. A full-screen tap prompt as the first screen is required.
- **Wake Lock** can fail silently — always wrap in try/catch. Game works without it.
- **Pin reset** between frames: destroy Rapier bodies and recreate at origin positions. Do not reposition existing bodies.
- **Throw validation**: ignore throws where button was held less than 150ms — too short to be intentional.
- **Gutter detection**: if `angle` normalized value exceeds ±0.95, treat as gutter ball regardless of physics.
- **Session cleanup**: delete session from memory when host WebSocket closes.
- **20hz stream rate** is intentional — do not stream raw DeviceMotion at 60hz. Throttle on the phone with `setInterval`.
- **Android** gets haptic feedback via `navigator.vibrate` on release. iOS does not support this API — fail silently.