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
  let seenRevision = -1;
  let highlightId = null;
  let stream = null;
  let padReady = false;

  let youEl = null;
  let subEl = null;
  let placeEl = null;
  let lapEl = null;
  let stickEl = null;
  let knobEl = null;
  let itemEl = null;
  let banner = null;

  paintSplash();
  navigator.wakeLock?.request('screen').then((lock) => { wakeLock = lock; }).catch(() => {});

  function paintSplash() {
    app.innerHTML = `
      <div class="screen kart-screen kart-splash">
        <h1>Mario Kart</h1>
        <p>Look at the TV</p>
      </div>
    `;
  }

  function paintSurface(surface, msg, me) {
    if (surface === 'pick') paintPick(msg);
    else if (surface === 'holding') paintHolding(msg);
    else if (surface === 'ready') paintReady(msg, me);
    else paintSplash();
  }

  function paintPick(msg) {
    app.innerHTML = `
      <div class="screen kart-screen kart-pick">
        <h1>Choose a racer</h1>
        <div class="kart-characters" id="kart-characters"></div>
        <button type="button" id="kart-confirm">Confirm</button>
      </div>
    `;
    const list = document.getElementById('kart-characters');
    for (const character of msg.catalog || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `kart-character-${character.id}`;
      button.className = character.id === highlightId ? 'kart-character is-picked' : 'kart-character';
      button.style.background = character.css;
      button.textContent = character.name;
      button.addEventListener('click', () => {
        highlightId = character.id;
        paintPick(msg);
      });
      list.appendChild(button);
    }
    const confirm = document.getElementById('kart-confirm');
    confirm.disabled = highlightId == null;
    confirm.addEventListener('click', () => {
      if (highlightId == null) return;
      sendMsg({ type: 'kart_pick', characterId: highlightId });
    });
  }

  function paintHolding(msg) {
    app.innerHTML = `
      <div class="screen kart-screen kart-holding">
        <h1 id="kart-course"></h1>
        <p id="kart-holding"></p>
      </div>
    `;
    const course = msg.trackName || 'the course';
    document.getElementById('kart-course').textContent = course;
    document.getElementById('kart-holding').textContent = msg.phase === 'started'
      ? `${course} is starting. Look at the TV.`
      : `Watch the TV for ${course}.`;
  }

  function paintReady(msg, me) {
    app.innerHTML = `
      <div class="screen kart-screen kart-ready">
        <h1>Ready?</h1>
        <ul id="kart-roster"></ul>
        <div class="kart-characters" id="kart-characters"></div>
        <button type="button" id="kart-ready-toggle"></button>
      </div>
    `;
    const roster = document.getElementById('kart-roster');
    for (const racer of msg.racers || []) {
      const row = document.createElement('li');
      if (!racer.connected) row.className = 'is-disconnected';
      const name = document.createElement('span');
      name.textContent = racer.name;
      const character = document.createElement('span');
      character.textContent = racer.characterName || 'Choosing';
      const flag = document.createElement('span');
      flag.textContent = racer.ready ? 'Ready' : 'Not ready';
      if (racer.ready) flag.className = 'is-ready';
      row.append(name, character, flag);
      roster.appendChild(row);
    }
    const list = document.getElementById('kart-characters');
    for (const character of msg.catalog || []) {
      const button = document.createElement('button');
      button.type = 'button';
      button.id = `kart-character-${character.id}`;
      button.className = character.id === (me && me.characterId) ? 'kart-character is-picked' : 'kart-character';
      button.style.background = character.css;
      button.textContent = character.name;
      button.addEventListener('click', () => {
        highlightId = character.id;
        sendMsg({ type: 'kart_pick', characterId: character.id });
      });
      list.appendChild(button);
    }
    const toggle = document.getElementById('kart-ready-toggle');
    toggle.textContent = me && me.ready ? 'Not ready' : 'Ready';
    toggle.addEventListener('click', () => {
      sendMsg({ type: 'kart_ready', ready: !(me && me.ready) });
    });
  }

  function ensurePad() {
    if (padReady) return;
    padReady = true;
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
    youEl = document.getElementById('kart-you');
    subEl = document.getElementById('kart-sub');
    placeEl = document.getElementById('kart-place');
    lapEl = document.getElementById('kart-lap');
    stickEl = document.getElementById('kart-stick');
    knobEl = document.getElementById('kart-knob');
    itemEl = document.getElementById('kart-item');
    banner = document.getElementById('kart-banner');
    bindStick();
    bindItem();
  }

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

  function paintRace(msg) {
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
  }

  function startStream() {
    if (stream !== null) return;
    stream = setInterval(() => {
      seq += 1;
      sendMsg({ type: 'drive', steer: input.steer, gas: true, drift: input.drift, seq });
    }, 1000 / STREAM_HZ);
  }

  function onMessage(msg) {
    if (msg.type === 'kart_lobby') {
      if (padReady) return;
      if (typeof msg.revision !== 'number' || msg.revision < seenRevision) return;
      seenRevision = msg.revision;
      const me = (msg.racers || []).find((racer) => racer.playerId === myPlayerId);
      const next = me?.surface || 'splash';
      if (next === 'pick' && highlightId == null && me?.characterId) highlightId = me.characterId;
      paintSurface(next, msg, me);
      return;
    }
    if (
      msg.type === 'race_countdown'
      || msg.type === 'race_go'
      || msg.type === 'race_status'
      || msg.type === 'race_finished'
    ) {
      ensurePad();
      paintRace(msg);
      if (msg.type === 'race_go') startStream();
    }
  }

  return {
    onMessage,
    unmount() {
      if (stream !== null) clearInterval(stream);
      stream = null;
      if (wakeLock) wakeLock.release().catch(() => {});
      wakeLock = null;
    },
  };
}
