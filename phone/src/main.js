import './style.css';

const RELAY_URL = import.meta.env.VITE_RELAY_URL;
const SESSION_ID = new URLSearchParams(window.location.search).get('session');

// ── State ─────────────────────────────────────────────────────────────────────
let ws = null;
let myPlayerId = null;
let currentGame = null; // { onMessage, onMotion } returned by game module mount()

const app = document.getElementById('app');

// ── Game loader ───────────────────────────────────────────────────────────────
// Static switch avoids dynamic import string analysis issues with Vite.
async function loadAndMountGame(gameId) {
  let mountFn;
  switch (gameId) {
    case 'bowling': {
      const mod = await import('./games/bowling/index.js');
      mountFn = mod.mount;
      break;
    }
    default:
      console.warn(`[phone] Unknown game: ${gameId}`);
      return;
  }
  // Idempotent: if the same game is already mounted, skip re-mount.
  if (currentGame && currentGame._gameId === gameId) return;
  currentGame = mountFn(app, sendMsg, myPlayerId);
  currentGame._gameId = gameId;
}

// ── Screens ───────────────────────────────────────────────────────────────────

function showPermissionScreen() {
  app.innerHTML = `
    <div class="screen" id="screen-permission">
      <h1>WildHacks Arcade</h1>
      <p>Tap below to enable motion sensors</p>
      <button id="btn-permission">Enable Motion Sensors</button>
    </div>
  `;
  document.getElementById('btn-permission').addEventListener('click', requestPermission);
}

function showNameScreen() {
  app.innerHTML = `
    <div class="screen" id="screen-name">
      <h1>WildHacks Arcade</h1>
      <p>Enter your name to join</p>
      <input id="input-name" type="text" maxlength="16" placeholder="Your name" autocomplete="off" />
      <button id="btn-join">Join Game</button>
    </div>
  `;
  const input = document.getElementById('input-name');
  const btn = document.getElementById('btn-join');
  input.focus();
  btn.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) return;
    connectAndJoin(name);
  });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') btn.click(); });
}

function showWaitingScreen(label = 'Waiting for host to start...') {
  app.innerHTML = `
    <div class="screen" id="screen-waiting">
      <h1>WildHacks Arcade</h1>
      <p id="waiting-label">${label}</p>
    </div>
  `;
}

function showSessionEndedScreen() {
  app.innerHTML = `
    <div class="screen" id="screen-ended">
      <h1>Session Ended</h1>
      <p>Host disconnected.</p>
    </div>
  `;
}

// ── Permission + motion ───────────────────────────────────────────────────────

async function requestPermission() {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    try {
      const result = await DeviceMotionEvent.requestPermission();
      if (result !== 'granted') {
        alert('Motion permission denied. Please allow it in Settings and reload.');
        return;
      }
    } catch (e) {
      alert('Could not request motion permission.');
      return;
    }
  }
  startMotionListener();
  showNameScreen();
}

function startMotionListener() {
  window.addEventListener('devicemotion', (e) => {
    const { accelerationIncludingGravity: acc, rotationRate: rot } = e;
    if (!acc || !rot) return;
    const sample = {
      ax: acc.x ?? 0, ay: acc.y ?? 0, az: acc.z ?? 0,
      alpha: rot.alpha ?? 0, beta: rot.beta ?? 0, gamma: rot.gamma ?? 0,
    };
    // Delegate raw motion data to the active game module.
    currentGame?.onMotion?.(sample);
  });
}

// ── WebSocket ─────────────────────────────────────────────────────────────────

function connectAndJoin(name) {
  if (!SESSION_ID) {
    alert('No session ID in URL. Scan the QR code again.');
    return;
  }
  ws = new WebSocket(`${RELAY_URL}?role=phone&session=${SESSION_ID}`);

  ws.addEventListener('open', () => {
    ws.send(JSON.stringify({ type: 'join', name }));
  });

  ws.addEventListener('message', (e) => {
    handleMessage(JSON.parse(e.data));
  });

  ws.addEventListener('close', showSessionEndedScreen);
  ws.addEventListener('error', () => {
    alert('Could not connect to relay. Make sure you are on the same network.');
  });

  showWaitingScreen('Joining...');
}

function sendMsg(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// ── Message routing ───────────────────────────────────────────────────────────

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myPlayerId = msg.playerId;
      showWaitingScreen('Waiting for host to select a game...');
      break;

    case 'game_selected':
      // Load and mount the game UI. Idempotent if same game is already loaded.
      loadAndMountGame(msg.game);
      break;

    case 'session_ended':
      showSessionEndedScreen();
      break;

    default:
      // Delegate all other messages (your_turn, throw_result, game_started…)
      // to the active game module.
      currentGame?.onMessage?.(msg);
      break;
  }
}

// ── Init ──────────────────────────────────────────────────────────────────────

function init() {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    showPermissionScreen();
  } else {
    startMotionListener();
    showNameScreen();
  }
}

init();
