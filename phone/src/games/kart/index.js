import { steerFromTilt, stickSteer, tiltAngle } from './steer.js';

const STREAM_HZ = 20;

export function mount(app, sendMsg, myPlayerId) {
  let mode = 'stick';
  let gas = false;
  let drift = false;
  let stick = 0;
  let seq = 0;
  let stream = null;
  let wakeLock = null;
  let gravity = { ax: 0, ay: 0, az: 9.8 };
  let neutral = 0;
  let pointerId = null;

  app.innerHTML = `
    <div class="screen kart-screen">
      <div class="kart-top">
        <div>
          <p class="kart-you" id="kart-you">Racer</p>
          <p class="kart-sub" id="kart-sub">Waiting for the start</p>
        </div>
        <div class="kart-stats">
          <p class="kart-place" id="kart-place">–</p>
          <p class="kart-lap" id="kart-lap">Lap 1</p>
        </div>
      </div>
      <div class="kart-modes">
        <button type="button" id="mode-stick" class="kart-mode is-on">Joystick</button>
        <button type="button" id="mode-tilt" class="kart-mode">Tilt</button>
      </div>
      <div class="kart-stick-wrap" id="stick-wrap">
        <div class="kart-stick-base" id="stick-base">
          <div class="kart-stick-knob" id="stick-knob"></div>
        </div>
      </div>
      <p class="kart-tilt-hint" id="tilt-hint" hidden>Hold the phone like a wheel. The angle you tap is straight ahead.</p>
      <div class="kart-actions">
        <button type="button" id="btn-drift" class="kart-drift">Drift</button>
        <button type="button" id="btn-gas" class="kart-gas">Gas</button>
      </div>
      <div class="kart-banner" id="kart-banner" hidden></div>
    </div>
  `;

  const youEl = document.getElementById('kart-you');
  const subEl = document.getElementById('kart-sub');
  const placeEl = document.getElementById('kart-place');
  const lapEl = document.getElementById('kart-lap');
  const stickWrap = document.getElementById('stick-wrap');
  const stickBase = document.getElementById('stick-base');
  const knob = document.getElementById('stick-knob');
  const tiltHint = document.getElementById('tilt-hint');
  const banner = document.getElementById('kart-banner');
  const stickBtn = document.getElementById('mode-stick');
  const tiltBtn = document.getElementById('mode-tilt');

  function setMode(next) {
    mode = next;
    stickBtn.classList.toggle('is-on', next === 'stick');
    tiltBtn.classList.toggle('is-on', next === 'tilt');
    stickWrap.hidden = next !== 'stick';
    tiltHint.hidden = next !== 'tilt';
    if (next === 'tilt') {
      const angle = screen.orientation?.angle ?? window.orientation ?? 0;
      neutral = tiltAngle(gravity.ax, gravity.ay, gravity.az, angle);
    }
  }

  stickBtn.addEventListener('click', () => setMode('stick'));
  tiltBtn.addEventListener('click', () => setMode('tilt'));

  function currentSteer() {
    if (mode === 'tilt') {
      const angle = screen.orientation?.angle ?? window.orientation ?? 0;
      return steerFromTilt(tiltAngle(gravity.ax, gravity.ay, gravity.az, angle), neutral);
    }
    return stick;
  }

  function holdButton(el, set) {
    function down(event) {
      event.preventDefault();
      el.setPointerCapture(event.pointerId);
      set(true);
      el.classList.add('is-held');
    }
    function up() {
      set(false);
      el.classList.remove('is-held');
    }
    el.addEventListener('pointerdown', down);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  }

  holdButton(document.getElementById('btn-gas'), (v) => { gas = v; });
  holdButton(document.getElementById('btn-drift'), (v) => { drift = v; });

  stickBase.addEventListener('pointerdown', (event) => {
    pointerId = event.pointerId;
    stickBase.setPointerCapture(pointerId);
    moveStick(event);
  });
  stickBase.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    moveStick(event);
  });
  function releaseStick(event) {
    if (event.pointerId !== pointerId) return;
    pointerId = null;
    stick = 0;
    knob.style.transform = 'translate(0px, 0px)';
  }
  stickBase.addEventListener('pointerup', releaseStick);
  stickBase.addEventListener('pointercancel', releaseStick);

  function moveStick(event) {
    const rect = stickBase.getBoundingClientRect();
    const radius = rect.width / 2;
    const dx = event.clientX - (rect.left + radius);
    const dy = event.clientY - (rect.top + radius);
    stick = stickSteer(dx, radius);
    const travel = Math.max(-radius + 18, Math.min(radius - 18, dx));
    const travelY = Math.max(-radius + 18, Math.min(radius - 18, dy));
    knob.style.transform = `translate(${travel}px, ${travelY}px)`;
  }

  function showBanner(text) {
    banner.hidden = false;
    banner.textContent = text;
  }

  function hideBanner() {
    banner.hidden = true;
  }

  function mine(msg) {
    return msg.players?.find((player) => player.playerId === myPlayerId) || null;
  }

  stream = setInterval(() => {
    seq += 1;
    sendMsg({
      type: 'drive',
      steer: currentSteer(),
      gas,
      drift,
      seq,
    });
  }, 1000 / STREAM_HZ);

  try {
    navigator.wakeLock?.request('screen').then((lock) => { wakeLock = lock; }).catch(() => {});
  } catch { /* wake lock is optional */ }

  return {
    onMessage(msg) {
      if (msg.type === 'race_countdown') {
        showBanner(String(msg.seconds));
        subEl.textContent = 'Get ready';
      } else if (msg.type === 'race_go') {
        hideBanner();
        subEl.textContent = 'Go';
      } else if (msg.type === 'race_status') {
        const me = mine(msg);
        if (!me) return;
        youEl.textContent = me.characterName;
        youEl.style.color = me.color;
        placeEl.textContent = `P${me.place}`;
        lapEl.textContent = `Lap ${me.lap} / ${msg.lapsTotal}`;
        if (msg.phase === 'racing') subEl.textContent = me.name;
      } else if (msg.type === 'race_finished') {
        const row = msg.results?.find((player) => player.playerId === myPlayerId);
        showBanner(row ? `P${row.place}` : 'Finish');
        subEl.textContent = 'Race over';
      }
    },
    onMotion({ ax, ay, az }) {
      gravity = { ax, ay, az };
    },
    unmount() {
      clearInterval(stream);
      stream = null;
      gas = false;
      drift = false;
      if (wakeLock) wakeLock.release().catch(() => {});
      wakeLock = null;
    },
  };
}
