import './style.css';

const RELAY_URL = import.meta.env.VITE_RELAY_URL;
const SESSION_ID = new URLSearchParams(window.location.search).get('session');
const STREAM_HZ = 20;
const MIN_HOLD_MS = 150;
const MAX_ROLL = 360;  // deg/s — clamp for spin normalization
const MAX_ACCEL = 30;  // m/s² — clamp for power normalization
const AIM_STEP = 0.25; // each arrow tap moves aim by this much (-1 to 1 range)

// --- State ---
let ws = null;
let myPlayerId = null;
let motionBuffer = [];
let streamInterval = null;
let holdStart = null;
let wakeLock = null;
let lastRotation = { alpha: 0, beta: 0, gamma: 0 };
let aimOffset = 0; // -1 (far left) to 1 (far right), set by aim arrows before throw

// --- App container ---
const app = document.getElementById('app');

function render(html) {
  app.innerHTML = html;
}

// --- Screens ---

function showPermissionScreen() {
  render(`
    <div class="screen" id="screen-permission">
      <h1>Wii Bowling</h1>
      <p>Tap below to enable motion sensors</p>
      <button id="btn-permission">Enable Motion Sensors</button>
    </div>
  `);
  document.getElementById('btn-permission').addEventListener('click', requestPermission);
}

function showNameScreen() {
  render(`
    <div class="screen" id="screen-name">
      <h1>Wii Bowling</h1>
      <p>Enter your name to join</p>
      <input id="input-name" type="text" maxlength="16" placeholder="Your name" autocomplete="off" />
      <button id="btn-join">Join Game</button>
    </div>
  `);
  const input = document.getElementById('input-name');
  const btn = document.getElementById('btn-join');
  input.focus();
  btn.addEventListener('click', () => {
    const name = input.value.trim();
    if (!name) return;
    connectAndJoin(name);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') btn.click();
  });
}

function showWaitingScreen(label = 'Waiting for host to start...') {
  render(`
    <div class="screen" id="screen-waiting">
      <h1>Wii Bowling</h1>
      <p id="waiting-label">${label}</p>
    </div>
  `);
}

function updateWaitingLabel(label) {
  const el = document.getElementById('waiting-label');
  if (el) el.textContent = label;
}

function showBowlScreen() {
  // Reset aim to center each new turn
  aimOffset = 0;

  render(`
    <div class="screen" id="screen-bowl">
      <div class="aim-controls">
        <button id="btn-aim-left" class="btn-aim">◀</button>
        <div class="aim-track">
          <div class="aim-dot" id="aim-dot"></div>
        </div>
        <button id="btn-aim-right" class="btn-aim">▶</button>
      </div>
      <p id="bowl-prompt">Aim, then hold and swing!</p>
      <button id="btn-bowl">BOWL</button>
      <p id="bowl-hint"></p>
    </div>
  `);

  updateAimDot();

  document.getElementById('btn-aim-left').addEventListener('click', () => adjustAim(-AIM_STEP));
  document.getElementById('btn-aim-right').addEventListener('click', () => adjustAim(AIM_STEP));

  const btn = document.getElementById('btn-bowl');
  btn.addEventListener('touchstart', onHoldStart, { passive: true });
  btn.addEventListener('touchend', onHoldEnd, { passive: true });
}

function showResultScreen(result) {
  const { pinsKnocked, totalScore, frameScore } = result;
  let label = `${pinsKnocked} pin${pinsKnocked !== 1 ? 's' : ''} knocked down`;
  if (frameScore === 'strike') label = 'STRIKE!';
  if (frameScore === 'spare') label = 'SPARE!';
  render(`
    <div class="screen" id="screen-result">
      <h1>${label}</h1>
      <p>Score: ${totalScore}</p>
      <p id="result-sub">Waiting for your next turn...</p>
    </div>
  `);
}

function showSessionEndedScreen() {
  render(`
    <div class="screen" id="screen-ended">
      <h1>Game Over</h1>
      <p>Host disconnected.</p>
    </div>
  `);
}

// --- Aim controls ---

function adjustAim(delta) {
  aimOffset = Math.max(-1, Math.min(1, aimOffset + delta));
  updateAimDot();
  sendMsg({ type: 'aim', aimOffset });
}

function updateAimDot() {
  const dot = document.getElementById('aim-dot');
  if (!dot) return;
  // Map aimOffset (-1 to 1) → left position (5% to 95% within track)
  dot.style.left = `${((aimOffset + 1) / 2) * 90 + 5}%`;
}

// --- Permission ---

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

// --- Motion listener ---

function startMotionListener() {
  window.addEventListener('devicemotion', (e) => {
    const { accelerationIncludingGravity, rotationRate } = e;
    if (!accelerationIncludingGravity || !rotationRate) return;

    lastRotation = {
      alpha: rotationRate.alpha ?? 0, // yaw (deg/s)
      beta: rotationRate.beta ?? 0,   // pitch (deg/s)
      gamma: rotationRate.gamma ?? 0, // roll (deg/s)
    };

    if (motionBuffer !== null && holdStart !== null) {
      motionBuffer.push({
        ax: accelerationIncludingGravity.x ?? 0,
        ay: accelerationIncludingGravity.y ?? 0,
        az: accelerationIncludingGravity.z ?? 0,
        alpha: lastRotation.alpha,
        beta: lastRotation.beta,
        gamma: lastRotation.gamma,
        t: Date.now(),
      });
    }
  });
}

// --- WebSocket ---

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
    const msg = JSON.parse(e.data);
    handleMessage(msg);
  });

  ws.addEventListener('close', () => {
    showSessionEndedScreen();
  });

  ws.addEventListener('error', () => {
    alert('Could not connect to relay. Make sure you are on the same network.');
  });

  showWaitingScreen('Joining...');
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'joined':
      myPlayerId = msg.playerId;
      showWaitingScreen('Waiting for host to start...');
      break;
    case 'game_started':
      // Cosmetic update only — your_turn will trigger the bowl screen
      updateWaitingLabel('Game started! Waiting for your turn...');
      break;
    case 'your_turn':
      if (msg.playerId === myPlayerId) {
        showBowlScreen();
      } else {
        updateWaitingLabel('Waiting for your turn...');
      }
      break;
    case 'throw_result':
      if (msg.playerId === myPlayerId) {
        showResultScreen(msg);
      }
      break;
    case 'session_ended':
      showSessionEndedScreen();
      break;
  }
}

function sendMsg(obj) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(obj));
  }
}

// --- Bowl button ---

function onHoldStart() {
  holdStart = Date.now();
  motionBuffer = [];

  // Disable aim arrows while swinging
  const btnLeft = document.getElementById('btn-aim-left');
  const btnRight = document.getElementById('btn-aim-right');
  if (btnLeft) btnLeft.disabled = true;
  if (btnRight) btnRight.disabled = true;

  acquireWakeLock();

  // 20hz position stream — includes current aimOffset so TV preview tracks it
  streamInterval = setInterval(() => {
    sendMsg({
      type: 'pos',
      yaw: lastRotation.alpha,
      pitch: lastRotation.beta,
      roll: lastRotation.gamma,
      aimOffset,
    });
  }, 1000 / STREAM_HZ);
}

function onHoldEnd() {
  const holdDuration = Date.now() - holdStart;

  clearInterval(streamInterval);
  streamInterval = null;
  releaseWakeLock();

  // Re-enable aim arrows
  const btnLeft = document.getElementById('btn-aim-left');
  const btnRight = document.getElementById('btn-aim-right');
  if (btnLeft) btnLeft.disabled = false;
  if (btnRight) btnRight.disabled = false;

  if (holdDuration < MIN_HOLD_MS) {
    const hint = document.getElementById('bowl-hint');
    if (hint) hint.textContent = 'Hold longer and swing!';
    motionBuffer = [];
    holdStart = null;
    return;
  }

  const throwData = extractThrow(motionBuffer);
  motionBuffer = [];
  holdStart = null;

  sendMsg({ type: 'throw', ...throwData, aimOffset });

  // Haptics on Android (fails silently on iOS)
  if (navigator.vibrate) navigator.vibrate(100);
}

// --- Motion extraction ---

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function normalize(val, absMax) {
  return clamp(val / absMax, -1, 1);
}

function extractThrow(buffer) {
  if (buffer.length === 0) {
    return { power: 0.5, angle: 0, spin: 0 };
  }

  // Find peak acceleration magnitude
  let peakMag = 0;
  for (let i = 0; i < buffer.length; i++) {
    const { ax, ay, az } = buffer[i];
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    if (mag > peakMag) peakMag = mag;
  }

  const power = clamp(peakMag / MAX_ACCEL, 0, 1);

  // Direction is controlled entirely by aimOffset (the aim arrows).
  // Throw motion only contributes power and spin — not angle.
  const angle = 0;

  // Spin = roll rate delta from start to end of swing
  const rollStart = buffer[0].gamma;
  const rollEnd = buffer[buffer.length - 1].gamma;
  const spin = normalize(rollEnd - rollStart, MAX_ROLL);

  return { power, angle, spin };
}

// --- Wake Lock ---

async function acquireWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {
    // Wake lock not supported or denied — game works without it
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// --- Init ---

function init() {
  // Android / desktop: DeviceMotionEvent.requestPermission doesn't exist
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    showPermissionScreen();
  } else {
    startMotionListener();
    showNameScreen();
  }
}

init();
