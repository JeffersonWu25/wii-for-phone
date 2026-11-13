// Tennis phone: a score, the action for this window, and a hand toggle.
// mount(app, sendMsg, myPlayerId) returns { onMessage, onMotion, unmount }.

import { BUFFER_MS, finishedGesture, samplesSince } from './gesture.js';
import './tennis.css';

const SERVE_APEX_AT_MS = 450;
const APEX_FALL_MS = 900;

export function mount(app, sendMsg, myPlayerId) {
  let alive = true;
  let handed = 'right';
  let state = null;
  let samples = [];
  let armedId = null;
  let ackedId = null;
  let sentTossId = null;
  let sentSwingId = null;
  let windowRecvAt = 0;
  let tossSentAt = null;

  app.innerHTML = `
    <div id="screen-tennis">
      <p id="tennis-score"></p>
      <p id="tennis-label">Watch the point</p>
      <button id="tennis-hand" type="button">Right hand</button>
    </div>
  `;

  const scoreEl = document.getElementById('tennis-score');
  const labelEl = document.getElementById('tennis-label');
  const handBtn = document.getElementById('tennis-hand');

  handBtn.addEventListener('click', () => {
    handed = handed === 'right' ? 'left' : 'right';
    handBtn.textContent = handed === 'right' ? 'Right hand' : 'Left hand';
  });

  function myWindow() {
    const hit = state?.window;
    if (!hit || hit.playerId !== myPlayerId) return null;
    return hit;
  }

  function paint() {
    const playing = Array.isArray(state?.playing) && state.playing.includes(myPlayerId);
    const hit = myWindow();
    let label = 'Watch the point';
    if (state && Array.isArray(state.playing) && !playing) label = 'Sitting this one out';
    else if (state?.phase === 'match') label = 'Game over';
    else if (hit?.kind === 'toss') label = 'Swing up to toss';
    else if (hit?.kind === 'serve') label = 'Swing to serve';
    else if (hit?.kind === 'rally') label = 'Swing';
    labelEl.textContent = label;
    scoreEl.textContent = state ? `${state.scoreText}\n${state.gamesText}` : '';
    handBtn.hidden = Boolean(state) && !playing;
  }

  function onMessage(msg) {
    if (!alive || msg?.type !== 'tennis') return;
    state = msg;
    const hit = myWindow();
    if (hit && hit.windowId !== armedId) {
      armedId = hit.windowId;
      windowRecvAt = performance.now();
    }
    if (hit && hit.windowId !== ackedId) {
      ackedId = hit.windowId;
      sendMsg({ type: 'window_ack', windowId: hit.windowId });
    }
    paint();
  }

  function onMotion(sample) {
    if (!alive || !sample) return;
    const t = performance.now();
    samples.push({
      t,
      ax: sample.ax ?? 0,
      ay: sample.ay ?? 0,
      az: sample.az ?? 0,
      alpha: sample.alpha ?? 0,
      beta: sample.beta ?? 0,
      gamma: sample.gamma ?? 0,
    });
    const keepFrom = Math.max(t - BUFFER_MS, windowRecvAt);
    samples = samplesSince(samples, keepFrom);

    const hit = myWindow();
    if (!hit || state?.phase === 'match') return;

    if (hit.kind === 'toss') {
      if (sentTossId === hit.windowId) return;
      const done = finishedGesture(samples, 'toss');
      if (!done) return;
      sentTossId = hit.windowId;
      tossSentAt = performance.now();
      sendMsg({ type: 'toss' });
      return;
    }

    if (hit.kind !== 'serve' && hit.kind !== 'rally') return;
    if (sentSwingId === hit.windowId) return;
    const done = finishedGesture(samples, 'swing');
    if (!done) return;
    sentSwingId = hit.windowId;
    const swingAfterRecvMs = done.at - windowRecvAt;
    let apex = 0;
    if (hit.kind === 'serve' && tossSentAt != null) {
      const away = Math.abs(done.at - tossSentAt - SERVE_APEX_AT_MS);
      apex = Math.max(0, 1 - away / APEX_FALL_MS);
    }
    sendMsg({
      type: 'swing',
      windowId: hit.windowId,
      swingAfterRecvMs,
      hand: done.gesture.hand,
      shape: done.gesture.shape,
      power: done.gesture.power,
      handed,
      apex,
    });
  }

  paint();

  return {
    onMessage,
    onMotion,
    unmount() {
      alive = false;
      app.innerHTML = '';
    },
  };
}
