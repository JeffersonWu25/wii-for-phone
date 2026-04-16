import './style.css';

const RELAY_URL = import.meta.env.VITE_RELAY_URL;
const SESSION_ID = new URLSearchParams(window.location.search).get('session');

// ── State ─────────────────────────────────────────────────────────────────────
let ws = null;
let myPlayerId = null;
let myName = null;
let currentGame = null; // { onMessage, onMotion } returned by game module mount()
let gameLoading = false; // true while the dynamic import is in flight
let pendingMessages = []; // messages received while gameLoading — replayed on mount
let sessionEnded = false; // set true when host sends session_ended — stop retrying
let reconnectAttempt = 0;
let reconnectTimer = null;

const app = document.getElementById('app');

// ── Game loader ───────────────────────────────────────────────────────────────
// Static switch avoids dynamic import string analysis issues with Vite.
async function loadAndMountGame(gameId) {
  // Idempotent: if the same game is already mounted, skip re-mount.
  if (currentGame && currentGame._gameId === gameId) return;

  gameLoading = true;
  let mountFn;
  switch (gameId) {
    case 'bowling': {
      const mod = await import('./games/bowling/index.js');
      mountFn = mod.mount;
      break;
    }
    default:
      console.warn(`[phone] Unknown game: ${gameId}`);
      gameLoading = false;
      return;
  }

  // Re-check after await in case game_selected fired twice during loading.
  if (currentGame && currentGame._gameId === gameId) {
    gameLoading = false;
    return;
  }

  currentGame = mountFn(app, sendMsg, myPlayerId);
  currentGame._gameId = gameId;
  gameLoading = false;

  // Replay any messages that arrived while the module was loading.
  const queued = pendingMessages.splice(0);
  for (const msg of queued) {
    currentGame.onMessage?.(msg);
  }
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

function showNameScreen(error = null) {
  app.innerHTML = `
    <div class="screen" id="screen-name">
      <h1>WildHacks Arcade</h1>
      <p>Enter your name to join</p>
      <input id="input-name" type="text" maxlength="16" placeholder="Your name" autocomplete="off" />
      ${error ? `<p class="input-error">${error}</p>` : ''}
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

function showReconnectingScreen(attempt) {
  app.innerHTML = `
    <div class="screen" id="screen-reconnecting">
      <h1>WildHacks Arcade</h1>
      <p>Connection lost. Reconnecting${attempt > 1 ? ` (attempt ${attempt})` : ''}...</p>
    </div>
  `;
}

function showReconnectFailedScreen() {
  app.innerHTML = `
    <div class="screen" id="screen-reconnect-failed">
      <h1>WildHacks Arcade</h1>
      <p>Couldn't reconnect to the session.</p>
      <button id="btn-retry">Try Again</button>
    </div>
  `;
  document.getElementById('btn-retry').addEventListener('click', () => {
    reconnectAttempt = 0;
    sessionEnded = false;
    openWebSocket();
    showReconnectingScreen(1);
  });
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
  myName = name;
  sessionEnded = false;
  reconnectAttempt = 0;
  openWebSocket();
  showWaitingScreen('Joining...');
}

function openWebSocket() {
  ws = new WebSocket(`${RELAY_URL}?role=phone&session=${SESSION_ID}`);

  ws.addEventListener('open', () => {
    reconnectAttempt = 0;
    ws.send(JSON.stringify({ type: 'join', name: myName }));
  });

  ws.addEventListener('message', (e) => {
    handleMessage(JSON.parse(e.data));
  });

  ws.addEventListener('close', () => {
    if (sessionEnded) return;
    scheduleReconnect();
  });

  ws.addEventListener('error', () => {
    // error always fires before close — let the close handler drive reconnect
  });
}

const MAX_RECONNECT_ATTEMPTS = 5;

function scheduleReconnect() {
  reconnectAttempt++;
  if (reconnectAttempt > MAX_RECONNECT_ATTEMPTS) {
    showReconnectFailedScreen();
    return;
  }
  // Cap backoff at 16s: 1s, 2s, 4s, 8s, 16s
  const delay = Math.min(1000 * Math.pow(2, reconnectAttempt - 1), 16000);
  showReconnectingScreen(reconnectAttempt);
  reconnectTimer = setTimeout(() => {
    if (!sessionEnded) openWebSocket();
  }, delay);
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

    case 'rejoined':
      myPlayerId = msg.playerId;
      showWaitingScreen('Reconnecting...');
      break;

    case 'name_taken':
      sessionEnded = true; // prevent close event from triggering reconnect
      ws.close();
      ws = null;
      // sessionEnded stays true until connectAndJoin resets it on next submit
      showNameScreen('That name is already taken. Choose another.');
      break;

    case 'game_selected':
      // Load and mount the game UI. Idempotent if same game is already loaded.
      loadAndMountGame(msg.game);
      break;

    case 'session_ended':
      sessionEnded = true;
      clearTimeout(reconnectTimer);
      showSessionEndedScreen();
      break;

    default:
      // Delegate all other messages (your_turn, throw_result, game_started…)
      // to the active game module. Queue if the module is still loading.
      if (gameLoading) {
        pendingMessages.push(msg);
      } else {
        currentGame?.onMessage?.(msg);
      }
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
