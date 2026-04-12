import './style.css';

const RELAY_URL = import.meta.env.VITE_RELAY_URL;
const SESSION_ID = new URLSearchParams(window.location.search).get('session');
const STREAM_HZ = 20;
const MIN_HOLD_MS = 150;
const MAX_ROLL = 360;  // deg/s — clamp for spin normalization
const MAX_ACCEL = 30;  // m/s² — clamp for power normalization
const D_STEP = 0.2;    // each D-pad tap moves aim or position by this much

// --- State ---
let ws = null;
let myPlayerId = null;
let motionBuffer = [];
let streamInterval = null;
let holdStart = null;
let wakeLock = null;
let lastRotation = { alpha: 0, beta: 0, gamma: 0 };
let aimOffset = 0;  // -1 (far left) to 1 (far right) — ball lane position
let aimAngle = 0;   // -1 (max left) to 1 (max right) — trajectory direction
let aimMode = 'move'; // 'move' | 'aim'

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
  aimAngle = 0;
  aimMode = 'move';

  render(`
    <div class="screen" id="screen-bowl">
      <div class="mode-tabs">
        <button id="tab-move" class="mode-tab active">MOVE</button>
        <button id="tab-aim"  class="mode-tab">AIM</button>
      </div>

      <div class="dpad-section">
        <div class="dpad-row">
          <button id="btn-left"  class="btn-dpad">◀</button>
          <div class="dpad-tracks">
            <div class="dpad-track-wrap" id="track-move-wrap">
              <div class="dpad-track">
                <div class="dpad-dot" id="dot-move"></div>
              </div>
            </div>
            <div class="dpad-track-wrap inactive" id="track-aim-wrap">
              <div class="dpad-track">
                <div class="dpad-dot" id="dot-aim"></div>
              </div>
            </div>
          </div>
          <button id="btn-right" class="btn-dpad">▶</button>
        </div>
      </div>

      <p id="bowl-prompt">Hold and swing to bowl!</p>
      <button id="btn-bowl">BOWL</button>
      <p id="bowl-hint"></p>
    </div>
  `);

  refreshDots();

  document.getElementById('tab-move').addEventListener('click', () => setMode('move'));
  document.getElementById('tab-aim').addEventListener('click',  () => setMode('aim'));
  document.getElementById('btn-left').addEventListener('click',  () => nudge(-D_STEP));
  document.getElementById('btn-right').addEventListener('click', () => nudge(+D_STEP));

  const bowl = document.getElementById('btn-bowl');
  bowl.addEventListener('touchstart', onHoldStart, { passive: true });
  bowl.addEventListener('touchend',   onHoldEnd,   { passive: true });
}

function showResultScreen(result) {
  const { pinsKnocked, totalScore, frameScore } = result;
  let label = `${pinsKnocked} pin${pinsKnocked !== 1 ? 's' : ''} knocked down`;
  if (frameScore === 'strike') label = 'STRIKE!';
  if (frameScore === 'spare')  label = 'SPARE!';
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

// --- D-pad logic ---

function setMode(mode) {
  aimMode = mode;

  const tabMove = document.getElementById('tab-move');
  const tabAim  = document.getElementById('tab-aim');
  const wrapMove = document.getElementById('track-move-wrap');
  const wrapAim  = document.getElementById('track-aim-wrap');
  if (!tabMove) return;

  if (mode === 'move') {
    tabMove.classList.add('active');
    tabAim.classList.remove('active');
    wrapMove.classList.remove('inactive');
    wrapAim.classList.add('inactive');
  } else {
    tabAim.classList.add('active');
    tabMove.classList.remove('active');
    wrapAim.classList.remove('inactive');
    wrapMove.classList.add('inactive');
  }
}

function nudge(delta) {
  if (aimMode === 'move') {
    aimOffset = Math.max(-1, Math.min(1, aimOffset + delta));
  } else {
    aimAngle = Math.max(-1, Math.min(1, aimAngle + delta));
  }
  refreshDots();
  sendMsg({ type: 'aim', aimOffset, aimAngle });
}

// Update both dot indicators to reflect current values
function refreshDots() {
  setDot('dot-move', aimOffset);
  setDot('dot-aim',  aimAngle);
}

function setDot(id, value) {
  const dot = document.getElementById(id);
  if (!dot) return;
  // value -1→1 maps to left 5%→95% within the track
  dot.style.left = `${((value + 1) / 2) * 90 + 5}%`;
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
      alpha: rotationRate.alpha ?? 0,
      beta:  rotationRate.beta  ?? 0,
      gamma: rotationRate.gamma ?? 0,
    };

    if (motionBuffer !== null && holdStart !== null) {
      motionBuffer.push({
        ax: accelerationIncludingGravity.x ?? 0,
        ay: accelerationIncludingGravity.y ?? 0,
        az: accelerationIncludingGravity.z ?? 0,
        alpha: lastRotation.alpha,
        beta:  lastRotation.beta,
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

  ws.addEventListener('close', () => showSessionEndedScreen());
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
      if (msg.playerId === myPlayerId) showResultScreen(msg);
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

  // Disable D-pad and mode tabs while swinging
  setDpadEnabled(false);
  acquireWakeLock();

  // 20hz stream — carries current aimOffset + aimAngle so the TV tracks them
  streamInterval = setInterval(() => {
    sendMsg({
      type: 'pos',
      yaw: lastRotation.alpha,
      aimOffset,
      aimAngle,
    });
  }, 1000 / STREAM_HZ);
}

function onHoldEnd() {
  const holdDuration = Date.now() - holdStart;

  clearInterval(streamInterval);
  streamInterval = null;
  releaseWakeLock();
  setDpadEnabled(true);

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

  sendMsg({ type: 'throw', ...throwData, aimOffset, aimAngle });

  if (navigator.vibrate) navigator.vibrate(100);
}

function setDpadEnabled(enabled) {
  ['btn-left', 'btn-right', 'tab-move', 'tab-aim'].forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.disabled = !enabled;
  });
}

// --- Motion extraction ---

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function extractThrow(buffer) {
  if (buffer.length === 0) return { power: 0.5, spin: 0 };

  let peakMag = 0;
  for (let i = 0; i < buffer.length; i++) {
    const { ax, ay, az } = buffer[i];
    const mag = Math.sqrt(ax * ax + ay * ay + az * az);
    if (mag > peakMag) peakMag = mag;
  }

  const power = clamp(peakMag / MAX_ACCEL, 0, 1);

  const rollStart = buffer[0].gamma;
  const rollEnd   = buffer[buffer.length - 1].gamma;
  const spin = clamp((rollEnd - rollStart) / MAX_ROLL, -1, 1);

  return { power, spin };
}

// --- Wake Lock ---

async function acquireWakeLock() {
  try {
    wakeLock = await navigator.wakeLock.request('screen');
  } catch (_) {}
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().catch(() => {});
    wakeLock = null;
  }
}

// --- Init ---

function init() {
  if (typeof DeviceMotionEvent.requestPermission === 'function') {
    showPermissionScreen();
  } else {
    startMotionListener();
    showNameScreen();
  }
}

init();
