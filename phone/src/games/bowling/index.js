// Bowling phone UI module.
// Exported mount(app, sendMsg, myPlayerId) bootstraps the bowling controller
// and returns an onMessage(msg) handler for the thin main.js to call.

import { composeThrow, twistFromLeans } from './throw.js';
import { createTiltSensor } from './tilt.js';
import { FEEL_CONTROLS, clampTuning, loadTuning, saveTuning } from './tuning.js';

const STREAM_HZ = 20;
const MIN_HOLD_MS = 150;
const D_STEP = 0.2;    // each D-pad tap moves aim or position by this much

export function mount(app, sendMsg, myPlayerId) {
  // ── Module-level state ──────────────────────────────────────────────────────
  let motionBuffer = [];
  let streamInterval = null;
  let holdStart = null;
  let wakeLock = null;
  let lastRotation = { alpha: 0, beta: 0, gamma: 0 };
  let aimOffset = 0;
  let aimAngle = 0;
  let aimMode = 'move';
  let tuning = loadTuning();
  let startTilt = null;
  const tilt = createTiltSensor();

  // ── Screens ─────────────────────────────────────────────────────────────────

  function showWaitingScreen(label = 'Waiting for your turn...') {
    app.innerHTML = `
      <div class="screen" id="screen-waiting">
        <h1>Bowling</h1>
        <p id="waiting-label">${label}</p>
        ${tuningMarkup()}
      </div>
    `;
    bindTuning();
  }

  function updateWaitingLabel(label) {
    const el = document.getElementById('waiting-label');
    if (el) el.textContent = label;
  }

  function showBowlScreen() {
    aimOffset = 0;
    aimAngle = 0;
    aimMode = 'move';

    app.innerHTML = `
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

        <div class="tilt-gauge">
          <div class="dpad-track">
            <div class="dpad-dot" id="dot-tilt"></div>
          </div>
          <span id="tilt-label">LEVEL</span>
        </div>

        ${tuningMarkup()}

        <p id="bowl-prompt">Hold and swing to bowl!</p>
        <button id="btn-bowl">BOWL</button>
        <p id="bowl-hint"></p>
      </div>
    `;

    refreshDots();
    refreshTiltGauge();
    bindTuning();

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
    app.innerHTML = `
      <div class="screen" id="screen-result">
        <h1>${label}</h1>
        <p>Score: ${totalScore}</p>
        <p id="result-sub">Waiting for your next turn...</p>
      </div>
    `;
  }

  // ── D-pad ───────────────────────────────────────────────────────────────────

  function setMode(mode) {
    aimMode = mode;
    const tabMove  = document.getElementById('tab-move');
    const tabAim   = document.getElementById('tab-aim');
    const wrapMove = document.getElementById('track-move-wrap');
    const wrapAim  = document.getElementById('track-aim-wrap');
    if (!tabMove) return;

    if (mode === 'move') {
      tabMove.classList.add('active');    tabAim.classList.remove('active');
      wrapMove.classList.remove('inactive'); wrapAim.classList.add('inactive');
    } else {
      tabAim.classList.add('active');     tabMove.classList.remove('active');
      wrapAim.classList.remove('inactive'); wrapMove.classList.add('inactive');
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

  function refreshDots() {
    setDot('dot-move', aimOffset);
    setDot('dot-aim',  aimAngle);
  }

  function setDot(id, value) {
    const dot = document.getElementById(id);
    if (!dot) return;
    dot.style.left = `${((value + 1) / 2) * 90 + 5}%`;
  }

  // ── Tilt gauge ──────────────────────────────────────────────────────────────

  function refreshTiltGauge() {
    const label = document.getElementById('tilt-label');
    if (!label) return;
    const { lean } = tilt.read(tuning.tilt);
    setDot('dot-tilt', lean);
    label.textContent = lean === 0
      ? 'LEVEL'
      : `${lean > 0 ? 'RIGHT' : 'LEFT'} ${Math.round(Math.abs(lean) * 100)}%`;
  }

  // ── Tuning sliders ──────────────────────────────────────────────────────────

  function tuningMarkup() {
    const rows = FEEL_CONTROLS.map(({ key, label, min, max, step, format }) => `
      <label class="tuning-row">
        <span class="tuning-label">${label}</span>
        <input type="range" class="tuning-input" data-key="${key}"
          min="${min}" max="${max}" step="${step}" value="${tuning[key]}">
        <span class="tuning-value" id="tuning-value-${key}">${format(tuning[key])}</span>
      </label>
    `).join('');
    return `<div class="tuning">${rows}</div>`;
  }

  function bindTuning() {
    app.querySelectorAll('.tuning-input').forEach((input) => {
      input.addEventListener('input', () => {
        const { key } = input.dataset;
        tuning = clampTuning({ ...tuning, [key]: Number(input.value) });
        saveTuning(tuning);
        const control = FEEL_CONTROLS.find((c) => c.key === key);
        document.getElementById(`tuning-value-${key}`).textContent = control.format(tuning[key]);
        refreshTiltGauge();
      });
    });
  }

  // ── Bowl button ─────────────────────────────────────────────────────────────

  function onHoldStart() {
    if (streamInterval) clearInterval(streamInterval);
    holdStart = Date.now();
    startTilt = tilt.read(tuning.tilt);
    const leanAtPress = startTilt.lean;
    motionBuffer = [];
    setDpadEnabled(false);
    acquireWakeLock();

    streamInterval = setInterval(() => {
      const angle = Math.max(-1, Math.min(1, aimAngle + leanAtPress));
      sendMsg({ type: 'pos', yaw: lastRotation.alpha, aimOffset, aimAngle: angle });
    }, 1000 / STREAM_HZ);
  }

  function onHoldEnd() {
    if (holdStart === null) return;
    const holdDuration = Date.now() - holdStart;

    clearInterval(streamInterval);
    streamInterval = null;
    releaseWakeLock();
    setDpadEnabled(true);

    const releasedTilt = tilt.read(tuning.tilt);
    const pressedTilt = startTilt;
    startTilt = null;

    if (holdDuration < MIN_HOLD_MS) {
      const hint = document.getElementById('bowl-hint');
      if (hint) hint.textContent = 'Hold longer and swing!';
      motionBuffer = [];
      holdStart = null;
      return;
    }

    const throwMsg = composeThrow({
      samples: motionBuffer,
      aim: { offset: aimOffset, angle: aimAngle },
      tilt: { angle: pressedTilt.lean, spin: twistFromLeans(pressedTilt.lean, releasedTilt.lean) },
      tuning,
    });
    motionBuffer = [];
    holdStart = null;

    sendMsg(throwMsg);
    if (navigator.vibrate) navigator.vibrate(100);
  }

  function setDpadEnabled(enabled) {
    ['btn-left', 'btn-right', 'tab-move', 'tab-aim'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.disabled = !enabled;
    });
    app.querySelectorAll('.tuning-input').forEach((el) => { el.disabled = !enabled; });
  }

  // ── Wake lock ───────────────────────────────────────────────────────────────

  async function acquireWakeLock() {
    try { wakeLock = await navigator.wakeLock.request('screen'); } catch (_) {}
  }

  function releaseWakeLock() {
    if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
  }

  // ── Motion listener (shared with main.js, registered once globally) ─────────
  // main.js calls startMotionListener() before mounting any game module,
  // so lastRotation and motionBuffer are updated via the window event.
  // We expose a setLastRotation hook so main.js can feed us the data.

  // ── Init ────────────────────────────────────────────────────────────────────

  showWaitingScreen('Waiting for your turn...');

  // ── Public message handler ──────────────────────────────────────────────────

  return {
    onMessage(msg) {
      switch (msg.type) {
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
        case 'game_started':
          updateWaitingLabel('Game started! Waiting for your turn...');
          break;
      }
    },
    // Called by main.js's devicemotion listener to keep lastRotation current
    // and to push samples into motionBuffer while a swing is in progress.
    onMotion({ ax, ay, az, alpha, beta, gamma }) {
      lastRotation = { alpha, beta, gamma };
      tilt.update({ ax, ay, az });
      refreshTiltGauge();
      if (motionBuffer !== null && holdStart !== null) {
        motionBuffer.push({ ax, ay, az, alpha, beta, gamma, t: Date.now() });
      }
    },
    unmount() {
      if (streamInterval) clearInterval(streamInterval);
      streamInterval = null;
      holdStart = null;
      startTilt = null;
      releaseWakeLock();
    },
  };
}
