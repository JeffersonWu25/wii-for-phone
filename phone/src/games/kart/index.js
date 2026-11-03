// Kart Racer phone controller: landscape free stick (X steers, Y aims thrown items),
// a hold DRIFT button and a USE ITEM button that shows the roulette. The kart accelerates on its own.
// Sends { type:'drive', steer, aimY, drift } at 20 Hz and { type:'use_item' } on tap.
// Exported mount(app, sendMsg, myPlayerId) returns { onMessage, onMotion, unmount }.

import { stickFromOffset, clampToRadius } from './joystick.js';
import { ITEM_ICONS } from './itemIcons.js';
import { buttonView, buzzEvents, landingScale, rouletteFrame, ROLL_TOTAL } from './itemSlot.js';

const SEND_HZ = 20;
const DEAD_ZONE = 0.12;
const PLACES = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];

const placeLabel = (n) => PLACES[n - 1] ?? `${n}th`;

export function mount(app, sendMsg, myPlayerId) {
  // ── State ───────────────────────────────────────────────────────────────────
  let steer = 0;
  let aimY = 0;
  let drift = false;
  let steerPointer = null;
  let driftPointer = null;
  let itemPointer = null;
  let itemTimer = null;
  let sendTimer = null;
  let wakeLock = null;
  let unmounted = false;
  let itemView = buttonView(null);
  let rollStart = null; // performance.now() seconds when the main slot began rolling
  let landedAt = -Infinity;
  let itemRaf = 0;
  let prevStatus = null;

  app.innerHTML = `
    <div id="screen-kart">
      <div id="kart-status">Get ready!</div>
      <div class="kart-controls">
        <div class="kart-zone-left" id="kart-zone">
          <div id="kart-joystick"><div id="kart-knob"></div></div>
        </div>
        <button id="btn-item" type="button" class="empty"><span class="item-icon"></span><span class="item-label">ITEM</span><span class="item-reserve"></span></button>
        <button id="btn-drift" type="button">DRIFT</button>
      </div>
      <div id="kart-finish"></div>
      <div id="kart-rotate"><div class="kart-phone-icon"></div><div>Rotate your phone</div></div>
    </div>
  `;

  const root = document.getElementById('screen-kart');
  const zone = document.getElementById('kart-zone');
  const base = document.getElementById('kart-joystick');
  const knob = document.getElementById('kart-knob');
  const driftBtn = document.getElementById('btn-drift');
  const itemBtn = document.getElementById('btn-item');
  const itemIconEl = itemBtn.querySelector('.item-icon');
  const itemReserveEl = itemBtn.querySelector('.item-reserve');
  const statusEl = document.getElementById('kart-status');
  const finishEl = document.getElementById('kart-finish');

  // ── Drive output ────────────────────────────────────────────────────────────
  const round2 = (v) => Math.round(v * 100) / 100 || 0;
  function sendDrive() {
    sendMsg({ type: 'drive', steer: round2(steer), aimY: round2(aimY), drift });
  }

  // ── Joystick ────────────────────────────────────────────────────────────────
  // The base re-centres under the finger so the first touch is always neutral.
  let baseCx = 0;
  let baseCy = 0;
  let radius = 60; // travel of the knob centre; set from the base on touch
  function moveStick(clientX, clientY) {
    const { x, y } = clampToRadius(clientX - baseCx, clientY - baseCy, radius);
    ({ steer, aimY } = stickFromOffset(x, y, radius, DEAD_ZONE));
    knob.style.transform = `translate(${x}px, ${y}px)`;
  }
  function releaseStick() {
    steerPointer = null;
    steer = 0;
    aimY = 0;
    knob.style.transition = 'transform 0.12s ease-out';
    knob.style.transform = 'translate(0, 0)';
    sendDrive(); // let go of aim and steer now, not on the next tick
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
    baseCy = cy;
    base.style.left = `${cx - zr.left}px`;
    base.style.top = `${cy - zr.top}px`;
    knob.style.transition = 'none';
    moveStick(e.clientX, e.clientY);
    e.preventDefault();
  });
  zone.addEventListener('pointermove', (e) => {
    if (e.pointerId === steerPointer) moveStick(e.clientX, e.clientY);
  });
  const endSteer = (e) => { if (e.pointerId === steerPointer) releaseStick(); };
  zone.addEventListener('pointerup', endSteer);
  zone.addEventListener('pointercancel', endSteer);

  // ── Drift ───────────────────────────────────────────────────────────────────
  function setDrift(on) {
    if (drift === on) return;
    drift = on;
    driftBtn.classList.toggle('pressed', on);
    if (on) { try { navigator.vibrate?.(15); } catch (_) {} }
    sendDrive();
  }
  driftBtn.addEventListener('pointerdown', (e) => {
    if (driftPointer !== null) return;
    driftPointer = e.pointerId;
    driftBtn.setPointerCapture(e.pointerId);
    setDrift(true);
    e.preventDefault();
  });
  const endDrift = (e) => {
    if (e.pointerId !== driftPointer) return;
    driftPointer = null;
    setDrift(false);
  };
  driftBtn.addEventListener('pointerup', endDrift);
  driftBtn.addEventListener('pointercancel', endDrift);

  // ── Use item ────────────────────────────────────────────────────────────────
  // One use_item per press; never touches driving state.
  itemBtn.addEventListener('pointerdown', (e) => {
    if (itemPointer !== null || !itemView.usable) return;
    itemPointer = e.pointerId;
    itemBtn.setPointerCapture(e.pointerId);
    itemBtn.classList.add('pressed');
    clearTimeout(itemTimer);
    itemTimer = setTimeout(() => itemBtn.classList.remove('pressed'), 150);
    sendMsg({ type: 'use_item' });
    e.preventDefault();
  });
  // The roulette and landing bump run on rAF; status only arrives at <= 4 Hz.
  function paintItem() {
    cancelAnimationFrame(itemRaf);
    const now = performance.now() / 1000;
    let icon = itemView.main;
    let scale = 1;
    if (itemView.state === 'rolling') {
      rollStart ??= now;
      icon = rouletteFrame(now - rollStart, ROLL_TOTAL);
    } else {
      scale = icon ? landingScale(now - landedAt) : 1;
    }
    if (itemIconEl.dataset.kind !== (icon ?? '')) {
      itemIconEl.dataset.kind = icon ?? '';
      itemIconEl.innerHTML = icon ? ITEM_ICONS[icon] : '';
    }
    itemIconEl.style.transform = scale === 1 ? '' : `scale(${scale.toFixed(3)})`;
    if (!unmounted && (itemView.state === 'rolling' || scale !== 1)) itemRaf = requestAnimationFrame(paintItem);
  }
  function setItem(item) {
    const next = buttonView(item);
    const now = performance.now() / 1000;
    const wasRolling = itemView.state === 'rolling';
    if (next.state === 'rolling') {
      if (!wasRolling) rollStart = now; // startRoll
    } else if (wasRolling || (next.state === 'ready' && next.main !== itemView.main)) {
      landedAt = now; // landRoll
      rollStart = null;
    }
    itemView = next;
    itemBtn.className = `${next.state}${itemBtn.classList.contains('pressed') ? ' pressed' : ''}`;
    itemBtn.setAttribute('aria-disabled', String(!next.usable));
    itemReserveEl.innerHTML = next.reserve ? ITEM_ICONS[next.reserve] : '';
    itemReserveEl.classList.toggle('on', !!next.reserve || next.reserveRolling);
    itemReserveEl.classList.toggle('rolling', next.reserveRolling);
    paintItem();
  }
  function buzz(me) {
    const ev = buzzEvents(prevStatus, me);
    prevStatus = me;
    if (ev.incoming || ev.hit) { try { navigator.vibrate?.(ev.hit ? [60, 40, 60] : 120); } catch (_) {} }
  }
  const endItem = (e) => { if (e.pointerId === itemPointer) itemPointer = null; };
  itemBtn.addEventListener('pointerup', endItem);
  itemBtn.addEventListener('pointercancel', endItem);

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
      if (steerPointer !== null) releaseStick();
      if (driftPointer !== null) { driftPointer = null; setDrift(false); }
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
    buzz(me);
    setItem(me.item);
    root.classList.toggle('incoming', !!me.incoming);
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
      clearTimeout(itemTimer);
      cancelAnimationFrame(itemRaf);
      portraitMq.removeEventListener('change', syncOrientation);
      document.removeEventListener('visibilitychange', onVisibility);
      if (wakeLock) { wakeLock.release().catch(() => {}); wakeLock = null; }
      try { screen.orientation?.unlock?.(); } catch (_) {}
      app.innerHTML = '';
    },
  };
}
