import { STICK, stickInput } from './steer.js';

const STREAM_HZ = 20;
const CENTER = stickInput(0, 0, 1);

export function mount(app, sendMsg, myPlayerId) {
  let input = CENTER;
  let stickPointer = null;
  let stickRect = null;
  let itemPointer = null;
  let seq = 0;
  let wakeLock = null;

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
      <div class="kart-pad">
        <button type="button" id="kart-item" class="kart-item">Use item</button>
        <div class="kart-stick" id="kart-stick" style="--drift-at:${STICK.driftAt}">
          <div class="kart-stick-knob" id="kart-knob"></div>
        </div>
      </div>
      <div class="kart-banner" id="kart-banner" hidden></div>
    </div>
  `;

  const youEl = document.getElementById('kart-you');
  const subEl = document.getElementById('kart-sub');
  const placeEl = document.getElementById('kart-place');
  const lapEl = document.getElementById('kart-lap');
  const stickEl = document.getElementById('kart-stick');
  const knobEl = document.getElementById('kart-knob');
  const itemEl = document.getElementById('kart-item');
  const banner = document.getElementById('kart-banner');

  bindStick();
  bindItem();

  function bindStick() {
    stickEl.addEventListener('pointerdown', (event) => {
      if (stickPointer !== null) return;
      event.preventDefault();
      stickPointer = event.pointerId;
      stickEl.setPointerCapture(stickPointer);
      stickRect = stickEl.getBoundingClientRect();
      follow(event);
    });
    stickEl.addEventListener('pointermove', (event) => {
      if (event.pointerId === stickPointer) follow(event);
    });
    // lostpointercapture also fires after pointerup. The owner check makes release idempotent.
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      stickEl.addEventListener(type, (event) => {
        if (event.pointerId !== stickPointer) return;
        stickPointer = null;
        show(CENTER, 0);
      });
    }
  }

  function follow(event) {
    const radius = stickRect.width / 2;
    const dx = event.clientX - stickRect.left - radius;
    const dy = event.clientY - stickRect.top - radius;
    show(stickInput(dx, dy, radius), radius);
  }

  function show(next, radius) {
    if (next.drift && !input.drift) buzz(12);
    input = next;
    stickEl.classList.toggle('is-drifting', next.drift);
    knobEl.style.transform = `translate(${next.knobX * radius}px, ${next.knobY * radius}px)`;
  }

  function bindItem() {
    itemEl.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      if (itemPointer !== null) return;
      itemPointer = event.pointerId;
      itemEl.setPointerCapture(itemPointer);
      itemEl.classList.add('is-held');
      sendMsg({ type: 'use_item' });
      buzz(20);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      itemEl.addEventListener(type, (event) => {
        if (event.pointerId !== itemPointer) return;
        itemPointer = null;
        itemEl.classList.remove('is-held');
      });
    }
  }

  function buzz(ms) {
    navigator.vibrate?.(ms);
  }

  const stream = setInterval(() => {
    seq += 1;
    sendMsg({ type: 'drive', steer: input.steer, gas: true, drift: input.drift, seq });
  }, 1000 / STREAM_HZ);

  navigator.wakeLock?.request('screen').then((lock) => { wakeLock = lock; }).catch(() => {});

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
        itemEl.textContent = me.itemLabel || 'Use item';
        itemEl.classList.toggle('is-armed', me.itemPrimary != null);
        itemEl.classList.toggle('is-spinning', me.effect === 'spin');
        itemEl.classList.toggle('is-star', me.effect === 'star');
      } else if (msg.type === 'race_finished') {
        const row = msg.results?.find((player) => player.playerId === myPlayerId);
        showBanner(row ? `P${row.place}` : 'Finish');
        subEl.textContent = 'Race over';
      }
    },
    unmount() {
      clearInterval(stream);
      if (wakeLock) wakeLock.release().catch(() => {});
      wakeLock = null;
    },
  };
}
