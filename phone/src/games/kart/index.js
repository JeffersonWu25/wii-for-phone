// Kart Racer phone controller: landscape joystick (steer) + GAS button.
// Exported mount(app, sendMsg, myPlayerId) returns { onMessage, onMotion, unmount }.

import { steerFromOffset } from './joystick.js';

const SEND_HZ = 20;
const DEAD_ZONE = 0.12;
const PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

const placeLabel = (n) => PLACES[n - 1] ?? `${n}th`;

export function mount(app, sendMsg, myPlayerId) {
  // ── State ───────────────────────────────────────────────────────────────────
  let steer = 0;
  let gas = false;
  let steerPointer = null;
  let gasPointer = null;
  let sendTimer = null;
  let wakeLock = null;
  let unmounted = false;

  app.innerHTML = `
    <div id="screen-kart">
      <div id="kart-status">Get ready!</div>
      <div class="kart-controls">
        <div class="kart-zone-left" id="kart-zone">
          <div id="kart-joystick"><div id="kart-knob"></div></div>
        </div>
        <button id="btn-gas" type="button">GAS</button>
      </div>
      <div id="kart-finish"></div>
      <div id="kart-rotate"><div class="kart-phone-icon"></div><div>Rotate your phone</div></div>
    </div>
  `;

  const root = document.getElementById('screen-kart');
  const zone = document.getElementById('kart-zone');
  const base = document.getElementById('kart-joystick');
  const knob = document.getElementById('kart-knob');
  const gasBtn = document.getElementById('btn-gas');
  const statusEl = document.getElementById('kart-status');
  const finishEl = document.getElementById('kart-finish');

  // ── Drive output ────────────────────────────────────────────────────────────
  const round2 = (v) => Math.round(v * 100) / 100 || 0;
  function sendDrive() {
    sendMsg({ type: 'drive', steer: round2(steer), gas });
  }

  // ── Joystick ────────────────────────────────────────────────────────────────
  // The base re-centres under the finger so the first touch is always neutral.
  let baseCx = 0;
  let radius = 60; // travel of the knob centre; set from the base on touch
  function moveSteer(clientX, clientY) {
    const dx = Math.max(-radius, Math.min(radius, clientX - baseCx));
    steer = steerFromOffset(dx, radius, DEAD_ZONE);
    knob.style.transform = `translate(${dx}px, 0)`;
  }
  function releaseSteer() {
    steerPointer = null;
    steer = 0;
    knob.style.transition = 'transform 0.12s ease-out';
    knob.style.transform = 'translate(0, 0)';
    base.style.left = '50%';
    base.style.top = '50%';
  }

  zone.addEventListener('pointerdown', (e) => {
    if (steerPointer !== null) return;
    steerPointer = e.pointerId;
    zone.setPointerCapture(e.pointerId);
    const zr = zone.getBoundingClientRect();
    radius = (base.offsetWidth - knob.offsetWidth) / 2;
    const half = base.offsetWidth / 2;
    const cx = Math.max(zr.left + half, Math.min(zr.right - half, e.clientX));
    const cy = Math.max(zr.top + half, Math.min(zr.bottom - half, e.clientY));
    baseCx = cx;
    base.style.left = `${cx - zr.left}px`;
    base.style.top = `${cy - zr.top}px`;
    knob.style.transition = 'none';
    moveSteer(e.clientX, e.clientY);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === steerPointer) moveSteer(e.clientX, e.clientY);
  });
  const endSteer = (e) => { if (e.pointerId === steerPointer) releaseSteer(); };
  zone.addEventListener('pointerup', endSteer);
  zone.addEventListener('pointercancel', endSteer);

  // ── Gas ─────────────────────────────────────────────────────────────────────
  function setGas(on) {
    if (gas === on) return;
    gas = on;
    gasBtn.classList.toggle('pressed', on);
    if (on) { try { navigator.vibrate?.(15); } catch (_) {} }
    sendDrive();
  }
  gasBtn.addEventListener('pointerdown', (e) => {
    if (gasPointer !== null) return;
    gasPointer = e.pointerId;
    gasBtn.setPointerCapture(e.pointerId);
    setGas(true);
    e.preventDefault();
  });
  const endGas = (e) => {
    if (e.pointerId !== gasPointer) return;
    gasPointer = null;
    setGas(false);
  };
  gasBtn.addEventListener('pointerup', endGas);
  gasBtn.addEventListener('pointercancel', endGas);

  const block = (e) => e.preventDefault();
  root.addEventListener('contextmenu', block);
  root.addEventListener('selectstart', block);
  root.addEventListener('touchmove', block, { passive: false });

  // ── Orientation ─────────────────────────────────────────────────────────────
  const portraitMq = window.matchMedia('(orientation: portrait)');
  function syncOrientation() {
    root.classList.toggle('portrait', portraitMq.matches);
    if (portraitMq.matches) {
      // Don't leave a stuck input behind a hidden control.
      if (steerPointer !== null) releaseSteer();
      if (gasPointer !== null) { gasPointer = null; setGas(false); }
    }
  }
  portraitMq.addEventListener('change', syncOrientation);
  syncOrientation();
  try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch (_) {}

  // ── Wake lock ───────────────────────────────────────────────────────────────
  async function acquireWakeLock() {
    try {
      const lock = await navigator.wakeLock.request('screen');
      if (unmounted) lock.release().catch(() => {});
      else wakeLock = lock;
    } catch (_) {}
  }
  function onVisibility() {
    if (document.visibilityState === 'visible' && !wakeLock) acquireWakeLock();
    if (document.visibilityState === 'hidden') wakeLock = null;
  }
  document.addEventListener('visibilitychange', onVisibility);
  acquireWakeLock();

  // ── Host status ─────────────────────────────────────────────────────────────
  function showStatus(me) {
    if (!me) return;
    root.style.setProperty('--kart-color', me.color || '#888');
    const lap = Math.min(me.lap ?? 1, me.laps ?? 3);
    statusEl.innerHTML = `<span class="kart-swatch" style="background:${me.color || '#888'}"></span>` +
      `<span>LAP ${lap}/${me.laps ?? 3}</span><span>${me.place ? placeLabel(me.place) : ''}</span>`;
    if (me.finished) showFinish(me.place);
  }
  function showFinish(place) {
    finishEl.innerHTML = `<span>Finished!</span><b>${place ? placeLabel(place) : ''}</b>`;
    finishEl.classList.add('show');
  }

  function onMessage(msg) {
    switch (msg.type) {
      case 'kart_status': {
        showStatus(msg.players?.[myPlayerId]);
        if (msg.phase === 'lobby' || msg.phase === 'countdown') finishEl.classList.remove('show');
        break;
      }
      case 'kart_results': {
        const mine = msg.players?.[myPlayerId];
        const place = mine?.place
          ?? (Array.isArray(msg.results) ? msg.results.findIndex((r) => (r.playerId ?? r.id) === myPlayerId) + 1 : 0);
        showFinish(place || null);
        break;
      }
      case 'game_started':
        finishEl.classList.remove('show');
        statusEl.textContent = 'Get ready!';
        break;
      default:
        break;
    }
  }

  // ── Stream ──────────────────────────────────────────────────────────────────
  sendTimer = setInterval(sendDrive, 1000 / SEND_HZ);

  return {
    onMessage,
    onMotion() {},
    unmount() {
      unmounted = true;
      clearInterval(sendTimer);
      portraitMq.removeEventListener('change', syncOrientation);
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
      try { screen.orientation?.unlock?.(); } catch (_) {}
      app.innerHTML = '';
    },
  };
}
