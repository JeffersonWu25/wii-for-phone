#!/usr/bin/env node
// Drive one mapped feature against the running verification instance.
//
//   node .claude/skills/verify/scripts/drive.mjs <feature-id>
//   HEADED=1 node .claude/skills/verify/scripts/drive.mjs bowling-throw   # watch it run
//
// Feature ids: join-lobby, select-game, bowling-throw, kart-race, kart-split, kart-drift.
// Each run opens a fresh host page, so each run is a new session on the relay.
// Proof lands in .claude/skills/verify/artifacts/<feature-id>/.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { PORTS, REPO, RUN_DIR, SKILL_DIR, URLS, doctor } from './instance.mjs';

const require = createRequire(path.join(REPO, 'host/package.json'));
const { chromium } = require('playwright-core');

const HOST_VIEWPORT = { width: 1280, height: 800 };
const PHONE_VIEWPORT = { width: 390, height: 844 };
const KART_PHONE_VIEWPORT = { width: 844, height: 390 };
const KART_HOST_VIEWPORT = { width: 1280, height: 720 };
const RELAY_WS_MARK = `127.0.0.1:${PORTS.relay}`;
const RELAY_LOG = path.join(RUN_DIR, 'relay.log');

// ── Harness helpers ───────────────────────────────────────────────────────────

class Run {
  constructor(featureId, browser) {
    this.featureId = featureId;
    this.browser = browser;
    this.dir = path.join(SKILL_DIR, 'artifacts', featureId);
    this.checks = [];
    this.frames = [];
    this.contexts = [];
    // The relay log outlives each run, so relay checks read only what this run appended.
    this.relayStart = fs.existsSync(RELAY_LOG) ? fs.statSync(RELAY_LOG).size : 0;
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
  }

  relayLines(pattern) {
    const log = fs.readFileSync(RELAY_LOG, 'utf8').slice(this.relayStart);
    return log.split('\n').filter((line) => line.includes(pattern));
  }

  check(name, ok, detail = '') {
    this.checks.push({ name, ok: Boolean(ok), detail: String(detail) });
    console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}`);
  }

  async openHost({ viewport = HOST_VIEWPORT } = {}) {
    const ctx = await this.browser.newContext({ viewport });
    this.contexts.push(ctx);
    const page = await ctx.newPage();
    this.tapFrames(page, 'host');
    await page.goto(URLS.host);
    await page.waitForSelector('.session-id strong', { timeout: 15_000 });
    const sessionId = (await page.locator('.session-id strong').textContent()).trim();
    this.host = page;
    this.sessionId = sessionId;
    return page;
  }

  async openPhone(name, { join = true, viewport = PHONE_VIEWPORT, isMobile = false } = {}) {
    const ctx = await this.browser.newContext({ viewport, hasTouch: true, isMobile });
    this.contexts.push(ctx);
    const page = await ctx.newPage();
    this.tapFrames(page, `phone:${name}`);
    await page.goto(`${URLS.phone}?session=${this.sessionId}`);
    // Chrome exposes DeviceMotionEvent.requestPermission, so the controller always
    // opens on the permission screen. The button calls the real API; Chrome grants it.
    await page.waitForSelector('#screen-permission, #screen-name', { timeout: 15_000 });
    if (await page.isVisible('#btn-permission')) {
      await page.click('#btn-permission');
    }
    await page.waitForSelector('#screen-name', { timeout: 10_000 });
    if (join) await this.submitName(page, name);
    return page;
  }

  async submitName(page, name) {
    await page.fill('#input-name', name);
    await page.click('#btn-join');
  }

  // Records every WebSocket frame on the relay socket, both directions.
  tapFrames(page, label) {
    page.on('websocket', (ws) => {
      if (!ws.url().includes(RELAY_WS_MARK)) return;
      const record = (dir) => (event) => {
        let msg;
        try { msg = JSON.parse(event.payload); } catch { msg = { raw: String(event.payload).slice(0, 120) }; }
        this.frames.push({ at: new Date().toISOString(), page: label, ...(this.round && { round: this.round }), dir, msg });
      };
      ws.on('framesent', record('out'));
      ws.on('framereceived', record('in'));
    });
  }

  // Polls the frame log, for events the page only shows briefly.
  async waitForFrame(page, type, timeoutMs = 15_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (this.frames.some((f) => f.page === page && f.dir === 'in' && f.msg.type === type)) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    return false;
  }

  async capture(page, step) {
    await page.screenshot({ path: path.join(this.dir, `${step}.png`) });
    fs.writeFileSync(path.join(this.dir, `${step}.aria.txt`), await page.locator('body').ariaSnapshot());
  }

  // Reads the lobby count and names so checks compare the host's own state, not a variable.
  async hostPlayers() {
    const count = (await this.host.locator('.player-count').textContent()).trim();
    const names = await this.host.locator('.player-item').allTextContents();
    return { count, names: names.map((n) => n.trim()) };
  }

  writeArtifacts(error) {
    fs.writeFileSync(path.join(this.dir, 'frames.jsonl'), this.frames.map((f) => JSON.stringify(f)).join('\n') + '\n');
    const passed = !error && this.checks.length > 0 && this.checks.every((c) => c.ok);
    fs.writeFileSync(
      path.join(this.dir, 'result.json'),
      JSON.stringify({
        feature: this.featureId,
        passed,
        finishedAt: new Date().toISOString(),
        error: error ? error.message.split('\n')[0] : null,
        checks: this.checks,
      }, null, 2),
    );
    return passed;
  }

  async close() {
    for (const ctx of this.contexts) await ctx.close().catch(() => {});
  }
}

// The waiting label reads "Joining..." until the relay answers `joined`. Wait for the real state.
async function waitForWaitingLabel(page) {
  await page.waitForFunction(
    () => document.getElementById('waiting-label')?.textContent.includes('Waiting for host to select a game'),
    null,
    { timeout: 10_000 },
  );
}

// Joins one phone to the lobby and waits for the controller's waiting screen.
async function lobbyWithPlayer(run, name) {
  await run.openHost();
  const phone = await run.openPhone(name);
  await waitForWaitingLabel(phone);
  await run.host.waitForSelector(`.player-item:has-text("${name}")`, { timeout: 10_000 });
  return phone;
}

async function selectGame(run, title) {
  await run.host.click('.btn-start');
  await run.host.waitForSelector('.game-select-screen');
  await run.host.locator('.game-card', { hasText: title }).click();
}

// ── Features ──────────────────────────────────────────────────────────────────

async function joinLobby(run) {
  const host = await run.openHost();
  const lobbyText = await host.locator('.lobby-left').innerText();
  run.check(
    'host lobby QR points at the local phone URL with this session',
    lobbyText.includes(`${URLS.phone}?session=${run.sessionId}`),
    `session ${run.sessionId}`,
  );
  const before = await run.hostPlayers();
  run.check('host lobby starts with no players', before.count === '(0)' && before.names.length === 0, before.count);
  await run.capture(host, 'host-lobby-empty');

  const first = await run.openPhone('', { join: false });
  await run.capture(first, 'phone-name-entry');
  run.check('phone opens on the name screen', await first.isVisible('#screen-name'));

  await first.click('#btn-join');
  await first.waitForTimeout(400);
  run.check(
    'empty name does not join',
    (await first.isVisible('#screen-name')) && (await run.hostPlayers()).count === '(0)',
  );

  await run.submitName(first, '  Ada  ');
  await waitForWaitingLabel(first);
  const label = await first.textContent('#waiting-label');
  run.check('phone shows the waiting screen after joining', label.includes('Waiting for host to select a game'), label);
  await host.waitForSelector('.player-item:has-text("Ada")', { timeout: 10_000 });
  const oneUp = await run.hostPlayers();
  run.check('host lists Ada, trimmed, and counts one player', oneUp.count === '(1)' && oneUp.names.join() === 'Ada', oneUp.names.join());
  await run.capture(host, 'host-one-player');
  await run.capture(first, 'phone-waiting');

  const dupe = await run.openPhone('Ada', { join: false });
  await run.submitName(dupe, 'Ada');
  await dupe.waitForSelector('.input-error', { timeout: 10_000 });
  const err = await dupe.textContent('.input-error');
  run.check('duplicate name is refused with the message', err.includes('already taken'), err);
  run.check('duplicate name is not added to the host', (await run.hostPlayers()).count === '(1)');
  await run.capture(dupe, 'phone-duplicate-name');

  await dupe.fill('#input-name', 'Grace');
  await dupe.click('#btn-join');
  await waitForWaitingLabel(dupe);
  await host.waitForSelector('.player-item:has-text("Grace")', { timeout: 10_000 });
  const twoUp = await run.hostPlayers();
  run.check('second player joins after a rename', twoUp.count === '(2)' && twoUp.names.join() === 'Ada,Grace', twoUp.names.join());
  await run.capture(host, 'host-two-players');

  const joins = run.relayLines('Player joined:');
  run.check('relay logged two joins', joins.length === 2, joins.join(' | '));
  fs.writeFileSync(path.join(run.dir, 'relay.log.txt'), joins.join('\n') + '\n');
}

async function selectGameFeature(run) {
  await lobbyWithPlayer(run, 'Ada');
  await run.host.click('.btn-start');
  await run.host.waitForSelector('.game-select-screen');
  const cards = await run.host.locator('.game-card').evaluateAll((els) =>
    els.map((el) => ({
      label: el.querySelector('.game-card-label')?.textContent.trim(),
      enabled: !el.disabled,
      soon: el.textContent.includes('Coming Soon'),
    })),
  );
  const byLabel = Object.fromEntries(cards.map((c) => [c.label, c]));
  run.check('Bowling card is enabled', byLabel.Bowling?.enabled === true);
  run.check('Kart Racer card is enabled', byLabel['Kart Racer']?.enabled === true);
  const unbuilt = cards.filter((c) => c.label !== 'Bowling' && c.label !== 'Kart Racer');
  run.check(
    'unbuilt games are disabled Coming Soon cards',
    unbuilt.length > 0 && unbuilt.every((c) => !c.enabled && c.soon),
    unbuilt.map((c) => c.label).join(', '),
  );
  await run.capture(run.host, 'host-game-select');
}

async function bowlingThrow(run) {
  const phone = await lobbyWithPlayer(run, 'Ada');
  await selectGame(run, 'Bowling');
  await run.host.waitForSelector('.scoreboard-player:has-text("Ada")', { timeout: 15_000 });
  await phone.waitForSelector('#screen-bowl', { timeout: 15_000 });
  run.check('phone gets the bowl screen on its turn', await phone.isVisible('#btn-bowl'));
  await run.capture(run.host, 'host-scoreboard-before');
  await run.capture(phone, 'phone-bowl-screen');

  // Real touch events on the BOWL button. Motion is injected as real devicemotion
  // events, which the phone's own listener turns into the throw sample buffer.
  await phone.evaluate(async () => {
    const btn = document.getElementById('btn-bowl');
    btn.dispatchEvent(new Event('touchstart'));
    const steps = 30;
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1);
      window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
        accelerationIncludingGravity: { x: 0, y: -9.81, z: 25 * Math.sin(t * Math.PI) },
        rotationRate: { alpha: 0, beta: 0, gamma: 0 },
      }));
      await new Promise((r) => setTimeout(r, 16));
    }
    btn.dispatchEvent(new Event('touchend'));
  });

  await phone.waitForSelector('#screen-result', { timeout: 10_000 });
  const resultText = await phone.textContent('#screen-result');
  run.check('phone shows the throw result with speed, angle, and curve', resultText.includes('Speed') && resultText.includes('Curve'), resultText.replace(/\s+/g, ' ').trim());
  await run.capture(phone, 'phone-throw-result');

  // The host scoreboard updates only after the physics settles and reports back.
  await run.host.waitForFunction(() => {
    const cell = document.querySelector('.scoreboard-player .scoreboard-frame .roll-cell');
    return cell && cell.textContent.trim() !== '';
  }, null, { timeout: 30_000 });
  const firstRoll = (await run.host.locator('.scoreboard-player:has-text("Ada") .roll-cell').first().textContent()).trim();
  run.check('host scoreboard shows the first roll for Ada', firstRoll !== '', `roll cell "${firstRoll}"`);
  await run.capture(run.host, 'host-scoreboard-after');

  const sent = run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out');
  const throws = sent.filter((f) => f.msg.type === 'throw');
  const pos = sent.filter((f) => f.msg.type === 'pos');
  run.check('phone sent exactly one throw event', throws.length === 1, `throw frames ${throws.length}`);
  run.check('phone streamed pos packets while held', pos.length >= 3, `pos frames ${pos.length}`);
  const hostIn = run.frames.filter((f) => f.page === 'host' && f.dir === 'in' && f.msg.type === 'throw');
  run.check('host received the throw through the relay', hostIn.length === 1, `host throw frames ${hostIn.length}`);
  const results = run.frames.filter((f) => f.page.startsWith('phone') && f.dir === 'in' && f.msg.type === 'throw_result');
  run.check('phone received a throw_result', results.length >= 1, `throw_result frames ${results.length}`);

  await phone.click('#screen-result');
  await phone.waitForSelector('#waiting-label', { timeout: 5_000 });
  run.check('dismissing the result returns the phone to waiting', (await phone.textContent('#waiting-label')).includes('next turn'));
}

// ── Kart Racer ────────────────────────────────────────────────────────────────

const JOYSTICK_DEAD_ZONE = 0.12; // phone/src/games/kart/index.js DEAD_ZONE
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Closed-loop steering, self-contained so it can be shipped into the host page.
// Reads the kart and the track geometry only. Aims at frameAt(s + lookahead), offset to the
// boost pad's lateral while one is ahead. Returns steer -1..1 (+1 = right).
function computeSteer(track, kart, force) {
  const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
  const L = track.length;
  let aim = 0;
  for (const pad of track.boostPads) {
    let d = pad.s - kart.s;
    d -= L * Math.round(d / L);
    if (d > -pad.length / 2 - 1 && d < 38) aim = pad.lateral;
  }
  const fr = track.frameAt(kart.s + 5 + kart.speed * 0.4);
  const diff = wrap(Math.atan2(fr.z + fr.rz * aim - kart.z, fr.x + fr.rx * aim - kart.x) - kart.h);
  const steer = force == null ? Math.max(-1, Math.min(1, diff * 2.2)) : force;
  return { steer, aim };
}

// Reads the host's debug snapshot (read-only) and returns the controller output plus
// what the checks need: state, corridor limits, and the road height under the kart.
function hostTick([coreSrc, force]) {
  const st = window.__kartState;
  const track = window.__kartTrack;
  if (!st || !track) return null;
  const k = st.karts[0];
  const core = new Function(`return ${coreSrc}`)();
  const { steer } = core(track, k, force);
  const surf = track.surfaceAt(k.s, k.lateral);
  return {
    steer,
    phase: st.phase, time: st.time, countdown: st.countdown,
    s: k.s, lateral: k.lateral, y: k.y, speed: k.speed, lap: k.lap, finished: k.finished,
    surface: k.surface, wrongWay: k.wrongWay,
    limitL: surf.limitL, limitR: surf.limitR, hy: track.heightAt(k.s, k.lateral),
  };
}

async function kartRace(run) {
  const host = await run.openHost({ viewport: KART_HOST_VIEWPORT });
  const phoneOpts = { viewport: KART_PHONE_VIEWPORT, isMobile: true };
  const ada = await run.openPhone('Ada', phoneOpts);
  await waitForWaitingLabel(ada);
  await host.waitForSelector('.player-item:has-text("Ada")', { timeout: 10_000 });
  const bo = await run.openPhone('Bo', phoneOpts);
  await waitForWaitingLabel(bo);
  await host.waitForSelector('.player-item:has-text("Bo")', { timeout: 10_000 });

  await selectGame(run, 'Kart Racer');
  await ada.waitForSelector('#screen-kart', { timeout: 15_000 });
  await bo.waitForSelector('#screen-kart', { timeout: 15_000 });
  await host.waitForSelector('.kart-canvas canvas', { timeout: 15_000 });
  await host.waitForSelector('.kart-pane', { timeout: 15_000 });
  run.check('both phones show #screen-kart', (await ada.isVisible('#screen-kart')) && (await bo.isVisible('#screen-kart')));
  run.check('host shows the canvas and the HUD', (await host.isVisible('.kart-canvas canvas')) && (await host.isVisible('.kart-pane')) && (await host.isVisible('.kart-lapcount')) && (await host.isVisible('.kart-minimap')));

  // Real control: a CDP touch on the joystick zone. Chrome turns it into the pointer events the
  // phone listens for. The kart has no GAS button and drives on its own from GO.
  const rect = (sel) => ada.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const zoneAt = await rect('#kart-zone');
  const radius = await ada.evaluate(() => (document.getElementById('kart-joystick').offsetWidth - document.getElementById('kart-knob').offsetWidth) / 2);
  const cdp = await ada.context().newCDPSession(ada);
  const STEER_ID = 1;
  let steerX = zoneAt.x;
  const points = () => [{ x: steerX, y: zoneAt.y, id: STEER_ID }];
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  await touch('touchStart', points());
  const setSteer = (steer) => {
    // Invert steerFromOffset: output 0 inside the dead zone, then linear to +/-1 at the radius.
    const n = steer === 0 ? 0 : JOYSTICK_DEAD_ZONE + Math.abs(steer) * (1 - JOYSTICK_DEAD_ZONE);
    steerX = zoneAt.x + Math.sign(steer) * n * radius;
    return touch('touchMove', points());
  };
  run.check('phone has no GAS button', (await ada.locator('#btn-gas').count()) === 0);

  // Countdown and GO.
  const shots = [];
  const shoot = (name) => shots.push(host.screenshot({ path: path.join(run.dir, `${name}.png`) }).catch(() => {}));
  const coreSrc = computeSteer.toString();
  const tick = (force) => host.evaluate(hostTick, [coreSrc, force]);
  let t0 = await tick(null);
  run.check('race starts in the countdown with the kart on the grid', t0?.phase === 'countdown' && t0.s > 0, `phase ${t0?.phase}, s ${t0?.s?.toFixed(1)}`);
  await host.screenshot({ path: path.join(run.dir, '01-grid.png') });
  await host.waitForFunction(() => window.__kartState.phase === 'countdown' && window.__kartState.countdown < 1.2, null, { polling: 30, timeout: 8000 }).catch(() => {});
  await host.screenshot({ path: path.join(run.dir, '02-countdown-lights.png') });
  await host.waitForFunction(() => window.__kartState.phase === 'racing', null, { polling: 30, timeout: 8000 });
  await host.waitForSelector('.kart-countdown.go', { timeout: 3000 }).catch(() => {});
  await host.screenshot({ path: path.join(run.dir, '03-go.png') });
  run.check('GO! label shows right after the lights', (await host.locator('.kart-countdown').first().textContent().catch(() => '')).includes('GO'));

  // ── Drive 3 laps ──
  const track = await host.evaluate(() => {
    const t = window.__kartTrack;
    const r = (tag) => t.pieceRange(tag);
    return {
      length: t.length,
      ranges: Object.fromEntries(['start', 't1', 'short', 'sLeft', 'sRight', 'hill', 'back', 'sweeper', 'grid'].map((g) => [g, r(g)])),
      pads: t.boostPads.map((p) => ({ s: p.s, lateral: p.lateral, length: p.length, width: p.width })),
    };
  });
  const mid = (tag) => (track.ranges[tag].s0 + track.ranges[tag].s1) / 2;
  const L = track.length;
  // Lap-0 shots fire when the kart reaches `s` (within a 10 m window) on `lap` completed laps.
  const sectionShots = [
    { name: '04-t1', lap: 0, s: mid('t1') },
    { name: '05-short', lap: 0, s: mid('short') },
    { name: '06-sLeft-pond', lap: 0, s: mid('sLeft') },
    { name: '07-sRight', lap: 0, s: mid('sRight') },
    { name: '08-hill-mid', lap: 0, s: mid('hill') },
    { name: '09-back-crest', lap: 0, s: track.ranges.back.s0 + 70, phone: true },
    { name: '12-sweeper-mid', lap: 0, s: mid('sweeper') },
    { name: '13-approach-finish', lap: 2, s: L - 14 },
    { name: '14-line-lap2', lap: 1, s: 3 },
  ].map((x) => ({ ...x, done: false }));
  const padState = track.pads.map((p, i) => ({ i, ...p, hit: false, passed: false, maxAfter: 0, shot: false, entered: false, speedBefore: 0 }));
  const sinceStart = Date.now();

  const sec = {
    laps: [], hudLaps: [], wrapTimes: [], maxAbsOverLimit: -Infinity, maxYErr: 0, samples: 0, badPlaces: 0,
    wrongWay: 0, wrongWayAfterWall: 0, maxLateralMargin: Infinity,
  };
  const wall = { state: 'idle', from: 0, maxLat: 0, limit: 0, speedStart: 0, minSpeed: Infinity, clampSeen: 0, note: '' };
  let prev = null;
  let last = null;
  let portraitDone = false;
  let phoneShot = false;
  let tickNo = 0;
  let knobMoved = null;
  const raceDeadline = Date.now() + 6 * 60_000;

  while (Date.now() < raceDeadline) {
    const loopStart = Date.now();
    // Wall test: lap 1, back straight, after pad 1. Steer hard left until the clamp is seen.
    let force = null;
    if (wall.state === 'active') force = -1;
    last = await tick(force);
    if (!last) break;
    if (last.phase === 'finished' || last.finished) break;

    if (wall.state === 'idle' && last.lap === 0 && last.s > track.ranges.back.s0 + 46 && last.s < track.ranges.back.s0 + 60 && padState[0].passed) {
      wall.state = 'active'; wall.from = Date.now(); wall.speedStart = last.speed;
    }
    if (wall.state === 'active') {
      const margin = last.limitL - Math.abs(last.lateral);
      wall.minSpeed = Math.min(wall.minSpeed, last.speed);
      if (last.lateral < 0 && Math.abs(last.lateral) > wall.maxLat) { wall.maxLat = Math.abs(last.lateral); wall.limit = last.limitL; }
      if (margin < 1.1) wall.clampSeen += 1;
      if (wall.clampSeen === 1) wall.hitAt = Date.now();
      if (wall.clampSeen > 0 && Date.now() - wall.hitAt > 1000) { wall.state = 'done'; wall.speedAfter = last.speed; wall.note = 'ok'; }
      else if (Date.now() - wall.from > 9000) { wall.state = 'done'; wall.note = 'timeout'; }
      if (wall.state === 'done') shoot('11-wall-test');
    }
    await setSteer(wall.state === 'active' ? -1 : last.steer);
    if (knobMoved === null && Math.abs(last.steer) > 0.3) {
      knobMoved = await ada.evaluate(() => document.getElementById('kart-knob').style.transform);
    }

    // Corridor + ground checks on every sample.
    sec.samples++;
    sec.maxAbsOverLimit = Math.max(sec.maxAbsOverLimit, last.lateral < 0 ? -last.lateral - last.limitL : last.lateral - last.limitR);
    sec.maxYErr = Math.max(sec.maxYErr, Math.abs(last.y - last.hy));
    if (last.wrongWay) { if (wall.state === 'active' || wall.state === 'done') sec.wrongWayAfterWall++; else sec.wrongWay++; }
    if (prev && prev.s > L - 60 && last.s < 60) sec.wrapTimes.push(last.time);
    if (!sec.laps.length || sec.laps[sec.laps.length - 1] !== last.lap) sec.laps.push(last.lap);
    if (prev && Math.abs(last.s - prev.s) > 30 && Math.abs(last.s - prev.s) < L - 60) sec.respawnJump = (sec.respawnJump || 0) + 1;

    // Boost pads: record whether the kart drove over each and its speed after.
    for (const p of padState) {
      let d = last.s - p.s; d -= L * Math.round(d / L);
      const onPad = Math.abs(d) <= p.length / 2 && Math.abs(last.lateral - p.lateral) <= p.width / 2 + 0.5;
      if (onPad && !p.entered) { p.entered = true; p.hit = true; p.speedBefore = last.speed; p.passed = true; p.maxAfter = 0; }
      if (p.entered && d > 0) p.maxAfter = Math.max(p.maxAfter, last.speed);
      if (p.entered && d > p.length / 2 + 1 && !p.shot && wall.state !== 'active') { p.shot = true; shoot(`10-pad${p.i + 1}-boost`); }
      if (p.entered && d > 30) { p.entered = false; p.final = p.maxAfter; p.finals = (p.finals || []).concat(p.maxAfter); }
      if (!p.entered && d < -p.length) p.passed = p.passed;
    }
    // Section screenshots, once each.
    for (const sh of sectionShots) {
      if (!sh.done && last.lap === sh.lap && last.s >= sh.s && last.s < sh.s + 10 && last.phase === 'racing') {
        sh.done = true;
        shoot(sh.name);
        if (sh.phone && !phoneShot) { phoneShot = true; shots.push(ada.screenshot({ path: path.join(run.dir, '15-phone-landscape-steering.png') }).catch(() => {})); }
      }
    }
    if (!portraitDone && last.lap === 0 && last.s >= mid('short') && last.s < mid('short') + 10) {
      portraitDone = true;
      // Bo is idle, so rotating it only shows the rotate prompt.
      await bo.setViewportSize({ width: 390, height: 844 });
      await sleep(250);
      await bo.screenshot({ path: path.join(run.dir, '16-phone-portrait-rotate.png') });
      sec.rotateVisible = await bo.evaluate(() => { const el = document.getElementById('kart-rotate'); return !!el && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0; });
      await bo.setViewportSize(KART_PHONE_VIEWPORT);
    }
    if (tickNo++ % 10 === 0) {
      const hud = await host.locator('.kart-pane[data-slot="0"] .kart-lapcount').textContent().catch(() => '');
      const m = hud.match(/(\d)\/(\d)/);
      if (m && sec.hudLaps[sec.hudLaps.length - 1] !== m[1]) sec.hudLaps.push(m[1]);
    }
    prev = last;
    const wait = 55 - (Date.now() - loopStart);
    if (wait > 0) await sleep(wait);
  }
  await touch('touchEnd', []);
  // The loop stops on the finishing sample, which is also the 3rd line crossing.
  if (last?.finished) {
    if (sec.laps[sec.laps.length - 1] !== last.lap) sec.laps.push(last.lap);
    sec.wrapTimes.push(last.time);
  }
  const raceElapsed = (Date.now() - sinceStart) / 1000;
  await Promise.all(shots);
  console.log(`drive loop ended: phase ${last?.phase} finished ${last?.finished} race time ${last?.time?.toFixed(1)}s wall ${raceElapsed.toFixed(0)}s`);

  // ── Checks ──
  run.check('Ada finished all 3 laps', last?.finished === true, `lap ${last?.lap}, race time ${last?.time?.toFixed(2)}s`);
  run.check('HUD lap counter showed 1, 2, 3 in order', sec.hudLaps.join('>') === '1>2>3', sec.hudLaps.join('>'));
  run.check('completed-lap counter went 0>1>2>3 in order', sec.laps.join('>') === '0>1>2>3', sec.laps.join('>'));
  const lapTimes = sec.wrapTimes.slice(1).map((t, i) => t - sec.wrapTimes[i]);
  run.check('three crossings after the grid start gave 3 plausible lap times (30-80 s)', lapTimes.length === 3 && lapTimes.every((t) => t >= 30 && t <= 80), `wraps at ${sec.wrapTimes.map((t) => t.toFixed(1)).join(', ')}; laps ${lapTimes.map((t) => t.toFixed(1)).join(', ')} s`);
  run.check('no respawn jumps (clean run)', !sec.respawnJump, `jumps ${sec.respawnJump || 0}`);
  run.check('no WRONG WAY state outside the wall test', sec.wrongWay === 0, `${sec.wrongWay} samples (${sec.wrongWayAfterWall} during/after the wall test)`);
  run.check('kart stays inside the corridor (|lateral| <= limit)', sec.maxAbsOverLimit <= 0, `max overshoot ${sec.maxAbsOverLimit.toFixed(3)} m over ${sec.samples} samples`);
  run.check('kart y within 5 cm of heightAt(s, lateral)', sec.maxYErr <= 0.05, `max error ${(sec.maxYErr * 100).toFixed(2)} cm`);
  for (const p of padState) {
    const best = Math.max(...(p.finals || [0]), p.maxAfter);
    run.check(`boost pad ${p.i + 1} hit, speed after > 22 m/s`, (p.finals || []).length > 0 && best > 22.2, `passes ${(p.finals || []).length}, max speed after ${best.toFixed(1)} m/s`);
  }
  run.check('wall test: lateral clamps at the corridor limit', wall.state === 'done' && wall.note === 'ok' && wall.maxLat <= wall.limit + 0.001 && wall.maxLat >= wall.limit - 1.2, `${wall.note}; max |lateral| ${wall.maxLat.toFixed(2)} vs limit ${wall.limit.toFixed(2)}`);
  run.check('wall test: speed drops on contact', wall.minSpeed < wall.speedStart * 0.8, `speed ${wall.speedStart.toFixed(1)} -> min ${wall.minSpeed.toFixed(1)} m/s`);
  run.check('wall test: kart recovered to finish the race', last?.finished === true);
  run.check('joystick touch moves the knob', knobMoved !== null && knobMoved !== 'translate(0px, 0px)', `knob ${knobMoved}`);
  run.check('portrait phone shows the rotate prompt', sec.rotateVisible === true);

  // Wait for the race to end (Ada finished; Bo never moves, so the grace timer ends it).
  await host.waitForSelector('.kart-results', { timeout: 60_000 });
  await sleep(500);
  await host.screenshot({ path: path.join(run.dir, 'results.png') });
  const rows = await host.locator('.kart-results li').allTextContents();
  const txt = rows.map((r) => r.replace(/\s+/g, ' ').trim());
  run.check('results card lists both players with Ada 1st and a time', txt.length === 2 && /1st.*Ada.*\d:\d\d\.\d\d/.test(txt[0]) && txt[1].includes('Bo'), txt.join(' | '));
  const adaFinish = await ada.textContent('#kart-finish');
  run.check('Ada\'s phone shows Finished! 1st', adaFinish.includes('Finished') && adaFinish.includes('1st'), adaFinish.replace(/\s+/g, ' ').trim());
  await run.capture(ada, 'phone-ada-finished');
  const inFrames = (page, type) => run.frames.filter((f) => f.page === page && f.dir === 'in' && f.msg.type === type).length;
  run.check('phones received kart_status frames', inFrames('phone:Ada', 'kart_status') > 5 && inFrames('phone:Bo', 'kart_status') > 5, `Ada ${inFrames('phone:Ada', 'kart_status')}, Bo ${inFrames('phone:Bo', 'kart_status')}`);
  run.check('phones received kart_results frames', inFrames('phone:Ada', 'kart_results') >= 1 && inFrames('phone:Bo', 'kart_results') >= 1, `Ada ${inFrames('phone:Ada', 'kart_results')}, Bo ${inFrames('phone:Bo', 'kart_results')}`);
  const drives = run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'drive');
  const shaped = drives.length > 0 && drives.every((f) => typeof f.msg.steer === 'number' && typeof f.msg.brake === 'number' && typeof f.msg.drift === 'boolean' && !('gas' in f.msg));
  run.check('Ada\'s drive frames carry steer, brake and drift (no gas) and varied steer', shaped && new Set(drives.map((f) => f.msg.steer)).size > 10, `${drives.length} frames, ${new Set(drives.map((f) => f.msg.steer)).size} distinct steer values, brake max ${Math.max(...drives.map((f) => f.msg.brake))}, drift true ${drives.filter((f) => f.msg.drift).length}`);

  await host.click('.kart-results .btn-start');
  await host.waitForSelector('.game-select-screen', { timeout: 10_000 });
  run.check('Back to games returns the host to game select', await host.isVisible('.game-select-screen'));
  await ada.waitForSelector('#screen-waiting', { state: 'visible', timeout: 10_000 }).catch(() => {});
  await bo.waitForSelector('#screen-waiting', { state: 'visible', timeout: 10_000 }).catch(() => {});
  run.check('both phones return to the waiting screen', (await ada.isVisible('#screen-waiting')) && (await bo.isVisible('#screen-waiting')));
  await run.capture(host, 'host-back-to-games');
}

// ── Kart Racer split screen ───────────────────────────────────────────────────

const SPLIT_GEOMETRY_TOLERANCE_PX = 4;
const SPLIT_DRIVE_MS = 4000;
const SPLIT_PLAYERS = ['Ada', 'Bo', 'Cy', 'Di', 'Eve'];
const SPLIT_SIDES = { 1: ['left'], 2: ['left', 'right'], 3: ['left', 'right', 'left'], 4: ['left', 'right', 'left', 'right'] };

// Pane i of an n-racer layout on a viewport: 1p full, 2p halves, 3p and 4p quadrants.
function expectedPane(n, i, vp) {
  const cols = n === 1 ? 1 : 2;
  const rows = n <= 2 ? 1 : 2;
  const w = vp.width / cols;
  const h = vp.height / rows;
  return { x: (i % 2) * w * (cols - 1), y: Math.floor(i / 2) * h * (rows - 1), w, h };
}

const boxMatches = (box, want) =>
  box && ['x', 'y', 'w', 'h'].every((key) => Math.abs(box[key] - want[key]) <= SPLIT_GEOMETRY_TOLERANCE_PX);
const fmtBox = (b) => (b ? `${b.x.toFixed(0)},${b.y.toFixed(0)} ${b.w.toFixed(0)}x${b.h.toFixed(0)}` : 'missing');

// Reads every contract element in one pass so the checks compare a single frame.
function readSplitHud() {
  const box = (el) => {
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  };
  const text = (el, sel) => el.querySelector(sel)?.textContent.trim() ?? null;
  const minimap = document.querySelector('.kart-minimap');
  const quadrant = document.querySelector('.kart-map-quadrant');
  const st = window.__kartState;
  return {
    players: document.querySelector('.kart-app')?.dataset.players ?? null,
    panes: [...document.querySelectorAll('.kart-pane')].map((el) => ({
      slot: el.dataset.slot,
      side: el.dataset.side,
      box: box(el),
      main: el.querySelectorAll('.kart-item-slot.main').length,
      reserve: el.querySelectorAll('.kart-item-slot.reserve').length,
      coins: text(el, '.kart-coins'),
      lap: text(el, '.kart-lapcount'),
      place: text(el, '.kart-place'),
    })),
    minimaps: document.querySelectorAll('.kart-minimap').length,
    minimapBox: box(minimap),
    markers: minimap ? minimap.querySelectorAll('.kart-map-marker').length : 0,
    quadrantBox: box(quadrant),
    minimapInQuadrant: Boolean(quadrant && minimap && quadrant.contains(minimap)),
    timers: document.querySelectorAll('.kart-timer').length,
    standings: document.querySelectorAll('.kart-standings').length,
    karts: st ? st.karts.map((k) => ({ name: k.name, s: k.s })) : null,
    trackLength: st?.trackLength ?? null,
  };
}

async function splitRound(run, n) {
  const tag = `N=${n}`;
  const racers = Math.min(n, 4);
  const contextsBefore = run.contexts.length;
  run.round = `n${n}`;
  const host = await run.openHost({ viewport: KART_HOST_VIEWPORT });
  const phones = [];
  for (const name of SPLIT_PLAYERS.slice(0, n)) {
    const phone = await run.openPhone(name, { viewport: KART_PHONE_VIEWPORT, isMobile: true });
    await waitForWaitingLabel(phone);
    await host.waitForSelector(`.player-item:has-text("${name}")`, { timeout: 10_000 });
    phones.push(phone);
  }

  await selectGame(run, 'Kart Racer');
  for (const phone of phones.slice(0, racers)) await phone.waitForSelector('#screen-kart', { timeout: 15_000 });
  await host.waitForSelector('.kart-canvas canvas', { timeout: 15_000 });

  await host.waitForFunction(() => window.__kartState?.phase === 'countdown' && window.__kartState.countdown < 2.5, null, { polling: 30, timeout: 10_000 });
  await host.screenshot({ path: path.join(run.dir, `n${n}-countdown.png`) });
  await host.waitForFunction(() => window.__kartState.phase === 'racing', null, { polling: 30, timeout: 10_000 });
  const before = await host.evaluate(readSplitHud);
  await sleep(SPLIT_DRIVE_MS / 2);
  await run.capture(host, `n${n}-racing`);
  await sleep(SPLIT_DRIVE_MS / 2);
  const hud = await host.evaluate(readSplitHud);

  run.check(`${tag}: .kart-app[data-players] is ${racers}`, hud.players === String(racers), `data-players ${hud.players}`);
  const panes = [...hud.panes].sort((a, b) => Number(a.slot) - Number(b.slot));
  run.check(`${tag}: exactly ${racers} .kart-pane with slots 0..${racers - 1}`, panes.map((p) => p.slot).join() === [...Array(racers).keys()].join(), `slots ${panes.map((p) => p.slot).join()}`);
  run.check(`${tag}: pane sides are ${SPLIT_SIDES[racers].join(',')}`, panes.map((p) => p.side).join() === SPLIT_SIDES[racers].join(), `sides ${panes.map((p) => p.side).join()}`);
  const boxes = panes.map((p, i) => ({ got: p.box, want: expectedPane(racers, i, KART_HOST_VIEWPORT) }));
  run.check(`${tag}: pane boxes match the layout within ${SPLIT_GEOMETRY_TOLERANCE_PX}px`, boxes.length === racers && boxes.every((b) => boxMatches(b.got, b.want)), boxes.map((b) => fmtBox(b.got)).join(' | '));
  run.check(`${tag}: every pane has a main and a reserve item slot`, panes.length === racers && panes.every((p) => p.main === 1 && p.reserve === 1), panes.map((p) => `${p.main}/${p.reserve}`).join(' '));
  run.check(`${tag}: every pane shows coins 00`, panes.length === racers && panes.every((p) => p.coins?.includes('00')), panes.map((p) => p.coins).join(' | '));
  run.check(`${tag}: every pane shows lap 1/3`, panes.length === racers && panes.every((p) => p.lap?.includes('1/3')), panes.map((p) => p.lap).join(' | '));
  run.check(`${tag}: every pane shows a place like 1st`, panes.length === racers && panes.every((p) => /^\d+(st|nd|rd|th)$/.test(p.place ?? '')), panes.map((p) => p.place).join(' | '));

  run.check(`${tag}: one .kart-minimap with ${racers} markers`, hud.minimaps === 1 && hud.markers === racers, `minimaps ${hud.minimaps}, markers ${hud.markers}`);
  const m = hud.minimapBox;
  const centre = m && { x: (m.x + m.w / 2) / KART_HOST_VIEWPORT.width, y: (m.y + m.h / 2) / KART_HOST_VIEWPORT.height };
  const centreText = centre ? `centre ${(centre.x * 100).toFixed(0)}%, ${(centre.y * 100).toFixed(0)}% of the screen` : 'no minimap';
  if (racers === 1) {
    run.check(`${tag}: minimap centre is in the right 25% and the middle third`, centre && centre.x > 0.75 && centre.y >= 1 / 3 && centre.y <= 2 / 3, centreText);
  } else if (racers === 3) {
    const quadrant = { x: KART_HOST_VIEWPORT.width / 2, y: KART_HOST_VIEWPORT.height / 2, w: KART_HOST_VIEWPORT.width / 2, h: KART_HOST_VIEWPORT.height / 2 };
    run.check(`${tag}: minimap sits inside .kart-map-quadrant`, hud.minimapInQuadrant);
    run.check(`${tag}: .kart-map-quadrant is the bottom-right quadrant`, boxMatches(hud.quadrantBox, quadrant), fmtBox(hud.quadrantBox));
  } else {
    run.check(`${tag}: minimap centre is within 5% of the screen centre`, centre && Math.abs(centre.x - 0.5) <= 0.05 && Math.abs(centre.y - 0.5) <= 0.05, centreText);
  }
  run.check(`${tag}: no .kart-timer and no .kart-standings`, hud.timers === 0 && hud.standings === 0, `timers ${hud.timers}, standings ${hud.standings}`);

  const L = hud.trackLength;
  const advanced = hud.karts.map((k, i) => {
    const delta = (((k.s - before.karts[i].s) % L) + L) % L;
    return { name: k.name, delta };
  });
  run.check(`${tag}: ${racers} karts, each advanced along the track while racing`, advanced.length === racers && advanced.every((a) => a.delta > 1 && a.delta < L / 2), advanced.map((a) => `${a.name} +${a.delta.toFixed(1)} m`).join(', '));
  if (n > 4) run.check(`${tag}: the 5th player is not in __kartState.karts`, !hud.karts.some((k) => k.name === SPLIT_PLAYERS[4]), hud.karts.map((k) => k.name).join(','));

  await Promise.all(run.contexts.splice(contextsBefore).map((ctx) => ctx.close().catch(() => {})));
}

async function kartSplit(run) {
  for (const n of [1, 2, 3, 4, 5]) await splitRound(run, n);
  run.round = undefined;
}

// ── Kart Racer drift, boost, brake and reverse ────────────────────────────────

const DRIFT_STICK_ID = 1;
const DRIFT_BUTTON_ID = 2;
const DRIFT_ITEM_ID = 3;
const DRIFT_TICK_MS = 55;
const DRIFT_RELEASE_CHARGE = { 1: 1.2, 3: 3.5 }; // s of sliding to hold before releasing for a boost of that level
const CORRIDOR_SLACK_M = 0; // |lateral| may not pass the corridor limit during a drift

// Closed-loop steering, self-contained so it can be shipped into the host page. Aims at
// frameAt(s + 5 + 0.4 * speed), offset to `aim` metres of lateral. Returns steer -1..1 (+1 = right).
function driftSteer(track, kart, aim) {
  const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
  const fr = track.frameAt(kart.s + 5 + kart.speed * 0.4);
  const diff = wrap(Math.atan2(fr.z + fr.rz * aim - kart.z, fr.x + fr.rx * aim - kart.x) - kart.h);
  return Math.max(-1, Math.min(1, diff * 2.2));
}

// Reads Ada's kart (read-only) and returns the controller output plus what the checks need.
// `bands` are track stretches (s modulo the lap) with a lateral to aim at, used to stay off the boost pads.
function driftHostTick([coreSrc, bands]) {
  const st = window.__kartState;
  const track = window.__kartTrack;
  if (!st || !track) return null;
  const k = st.karts[0];
  const L = track.length;
  const sm = ((k.s % L) + L) % L;
  // Distance driven along the track: the grid sits just behind the line, so it counts as negative until the first crossing.
  const ps = k.lap * L + (k.lap === 0 && st.time < 8 && sm > L - 60 ? sm - L : sm);
  const band = bands.find((b) => sm >= b.s0 && sm < b.s1);
  const steer = new Function(`return ${coreSrc}`)()(track, k, band ? band.aim : 0);
  const surf = track.surfaceAt(k.s, k.lateral);
  return {
    steer, phase: st.phase, time: st.time, sm, ps, lap: k.lap, lateral: k.lateral, speed: k.speed,
    boost: k.boost, boostLevel: k.boostLevel, drift: { ...k.drift },
    surface: k.surface, wrongWay: k.wrongWay, limitL: surf.limitL, limitR: surf.limitR,
  };
}

async function kartDrift(run) {
  const host = await run.openHost({ viewport: KART_HOST_VIEWPORT });
  const phoneOpts = { viewport: KART_PHONE_VIEWPORT, isMobile: true };
  const ada = await run.openPhone('Ada', phoneOpts);
  await waitForWaitingLabel(ada);
  await host.waitForSelector('.player-item:has-text("Ada")', { timeout: 10_000 });
  const bo = await run.openPhone('Bo', phoneOpts);
  await waitForWaitingLabel(bo);
  await host.waitForSelector('.player-item:has-text("Bo")', { timeout: 10_000 });
  await selectGame(run, 'Kart Racer');
  await ada.waitForSelector('#screen-kart', { timeout: 15_000 });
  await bo.waitForSelector('#screen-kart', { timeout: 15_000 });
  await host.waitForSelector('.kart-canvas canvas', { timeout: 15_000 });
  await host.waitForSelector('.kart-pane', { timeout: 15_000 });

  // The controls on the phone, before anything touches them.
  const ui = await ada.evaluate(() => ({
    drift: document.getElementById('btn-drift')?.textContent.trim() ?? null,
    item: document.getElementById('btn-item')?.textContent.trim() ?? null,
    gas: document.querySelectorAll('#btn-gas').length,
    driftShown: !!document.getElementById('btn-drift') && document.getElementById('btn-drift').getBoundingClientRect().width > 0,
    itemShown: !!document.getElementById('btn-item') && document.getElementById('btn-item').getBoundingClientRect().width > 0,
  }));
  run.check('phone shows #btn-drift and #btn-item and no #btn-gas', ui.driftShown && ui.itemShown && ui.gas === 0, `#btn-drift "${ui.drift}", #btn-item "${ui.item}", #btn-gas elements ${ui.gas}`);
  await run.capture(ada, 'phone-idle');

  // Real controls: CDP touches. Chrome turns them into the pointer events the phone listens for.
  const rect = (sel) => ada.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const zoneAt = await rect('#kart-zone');
  const driftAt = await rect('#btn-drift');
  const itemAt = await rect('#btn-item');
  const radius = await ada.evaluate(() => (document.getElementById('kart-joystick').offsetWidth - document.getElementById('kart-knob').offsetWidth) / 2);
  const cdp = await ada.context().newCDPSession(ada);
  const down = new Map();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  const press = (id, at) => { down.set(id, { x: at.x, y: at.y, id }); return touch('touchStart', [...down.values()]); };
  // touchEnd lists only the point that lifts; the others stay down.
  const lift = async (id) => { const p = down.get(id); down.delete(id); await touch('touchEnd', [p]); };
  const liftAll = async () => { down.clear(); await touch('touchEnd', []); };
  let base = null;
  // steer and brake are the values the phone should send. Inverts stickFromOffset: a radial dead
  // zone, then linear to 1 at the base radius. The phone clamps a combined offset to the circle.
  const stick = async (steer, brake = 0) => {
    if (!down.has(DRIFT_STICK_ID)) {
      await press(DRIFT_STICK_ID, zoneAt);
      base = await ada.evaluate(() => { const r = document.getElementById('kart-joystick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    }
    const nx = Math.abs(steer) < 0.005 ? 0 : Math.sign(steer) * (JOYSTICK_DEAD_ZONE + Math.min(1, Math.abs(steer)) * (1 - JOYSTICK_DEAD_ZONE));
    const ny = brake < 0.005 ? 0 : JOYSTICK_DEAD_ZONE + Math.min(1, brake) * (1 - JOYSTICK_DEAD_ZONE);
    down.set(DRIFT_STICK_ID, { x: base.x + nx * radius, y: base.y + ny * radius, id: DRIFT_STICK_ID });
    await touch('touchMove', [...down.values()]);
  };

  // ── Track, controller and loop helpers ──
  const track = await host.evaluate(() => {
    const t = window.__kartTrack;
    return { length: t.length, ranges: Object.fromEntries(['t1', 'sRight', 'back', 'sweeper', 'grid'].map((g) => [g, t.pieceRange(g)])) };
  });
  const R = track.ranges;
  // Aim at lateral 6 on the back straight so the kart passes the boost pads (lateral -3 and 3, 4 m wide) without touching them.
  const bands = [{ s0: R.back.s0 - 25, s1: R.back.s1 - 15, aim: 6 }];
  const coreSrc = driftSteer.toString();
  const shots = [];
  const hostShot = (name) => shots.push(run.capture(host, name).catch(() => {}));
  const trace = [];
  let stage = 'launch';
  let last = null;
  const sleepMs = sleep;
  const fx = (n, d = 2) => Number(n).toFixed(d);

  // One controller step per loop: read the host, send the stick, call onSample, test `until`.
  // touch:false leaves the screen alone. Returns the sample that satisfied `until`, or null on timeout.
  async function drive(until, { timeout = 30_000, touchOn = true, cmd = (s) => s.steer, brake = 0, onSample } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const t0 = Date.now();
      const s = await host.evaluate(driftHostTick, [coreSrc, bands]);
      if (!s) throw new Error('kart debug state is gone');
      last = s;
      trace.push({ stage, t: +s.time.toFixed(3), sm: +s.sm.toFixed(1), ps: +s.ps.toFixed(1), lat: +s.lateral.toFixed(2), v: +s.speed.toFixed(2), boost: +s.boost.toFixed(2), bl: s.boostLevel, sl: s.drift.sliding, dir: s.drift.dir, charge: +s.drift.charge.toFixed(3), lvl: s.drift.level });
      if (touchOn) await stick(cmd(s), brake);
      onSample?.(s);
      if (until(s)) return s;
      if (Date.now() > deadline) return null;
      const wait = DRIFT_TICK_MS - (Date.now() - t0);
      if (wait > 0) await sleepMs(wait);
    }
  }
  const ticksFor = (ms, opts = {}) => { const end = Date.now() + ms; return drive(() => Date.now() >= end, opts); };
  const adaDrives = () => run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'drive');

  try {
    // ── 1. No touch after GO: gas is always on ──
    await host.waitForFunction(() => window.__kartState?.phase === 'racing', null, { polling: 30, timeout: 15_000 });
    stage = 'launch';
    const launch = await drive((s) => s.speed > 10 || s.time > 3.2, { timeout: 8000, touchOn: false });
    const neutralFrames = adaDrives();
    hostShot('host-no-touch');
    run.check(
      'no touch after GO: the kart reaches over 10 m/s within 3 s',
      launch.speed > 10 && launch.time <= 3 && down.size === 0,
      `${fx(launch.speed, 1)} m/s ${fx(launch.time)} s after GO with no touch; ${neutralFrames.length} Ada drive frames so far, all neutral: ${neutralFrames.every((f) => f.msg.steer === 0 && f.msg.brake === 0 && f.msg.drift === false)}`,
    );

    // ── 2. Reverse: hold the stick down from a slow speed ──
    stage = 'reverse';
    const rev = { min: Infinity, shot: false, speedAtPress: launch.speed };
    const revDone = await drive((s) => s.speed <= -5.5, {
      timeout: 4000, cmd: () => 0, brake: 1,
      onSample: (s) => {
        rev.min = Math.min(rev.min, s.speed);
        if (s.speed <= -3 && !rev.shot) { rev.shot = true; hostShot('host-reversing'); }
      },
    });
    await lift(DRIFT_STICK_ID);
    stage = 'reverse-recover';
    const recovered = await drive((s) => s.speed > 0.5, { timeout: 3000, touchOn: false, onSample: (s) => { rev.min = Math.min(rev.min, s.speed); } });
    run.check(
      'holding the stick down takes the speed below 0 and no lower than -6',
      rev.min < 0 && rev.min >= -6.05 && revDone !== null,
      `from ${fx(rev.speedAtPress, 1)} m/s, minimum ${fx(rev.min)} m/s`,
    );
    run.check('releasing the stick brings the speed back above 0', recovered !== null && recovered.speed > 0, `${fx(recovered?.speed ?? NaN)} m/s after release`);

    // ── 3. Phone shot: stick down-left with DRIFT held (no slide: braking blocks it) ──
    stage = 'phone-combo';
    await stick(-0.5, 0.7);
    await press(DRIFT_BUTTON_ID, driftAt);
    await stick(-0.5, 0.7);
    await sleepMs(450);
    await run.capture(ada, 'phone-stick-down-left-drift');
    const combo = adaDrives().slice(-4);
    const comboState = await host.evaluate(driftHostTick, [coreSrc, bands]);
    await liftAll();
    await ticksFor(300, { touchOn: false });
    run.check(
      'phone frames carry steer left, brake and drift true while the stick is down-left with DRIFT held',
      combo.length > 0 && combo.every((f) => f.msg.steer < 0 && f.msg.brake > 0 && f.msg.drift === true),
      combo.map((f) => `${f.msg.steer}/${f.msg.brake}/${f.msg.drift}`).join(' '),
    );
    run.check('braking blocks the slide while DRIFT is held', comboState.drift.sliding === false, `sliding ${comboState.drift.sliding}`);

    // ── 4. Drifts ──
    // Runs one drift on a piece: cruise to the entry, hold DRIFT with an inward stick, then stop
    // on `endWhen` by releasing DRIFT (boost) or pushing the stick down (cancel).
    async function runDrift({ label, piece, entryOff, endWhen, cancel = false, shotLevels = [], boostShot = null }) {
      stage = `${label}-approach`;
      const range = R[piece];
      const r = {
        label, piece, levels: [], dir: null, started: false, maxOver: -Infinity, maxAbsLat: 0, slidingSamples: 0, offroadSamples: 0,
        entry: null, end: null, stopReason: null, cancelPost: [], release: null, postMaxSpeed: 0, postMaxLevel: 0, slideStart: null, wallMs: {},
      };
      const entry = await drive((s) => s.ps >= range.s0 + entryOff, { timeout: 70_000 });
      if (!entry) { r.stopReason = 'never reached the entry'; return r; }
      r.entry = { ps: entry.ps, speed: entry.speed, boost: entry.boost, lateral: entry.lateral };
      stage = `${label}-drift`;
      await press(DRIFT_BUTTON_ID, driftAt);
      const pressedAt = Date.now();
      let lastLevel = -1;
      const taken = new Set();
      const endSample = await drive(() => r.stopReason !== null, {
        timeout: 14_000,
        cmd: (s) => (s.drift.sliding ? s.steer : Math.max(0.45, s.steer)),
        onSample: (s) => {
          if (r.stopReason !== null) return;
          if (s.drift.sliding) {
            if (r.slideStart === null) { r.slideStart = s.time - s.drift.charge; r.dir = s.drift.dir; r.started = true; r.wallMs.slideStart = Date.now() - pressedAt; }
            if (s.drift.level !== lastLevel) {
              lastLevel = s.drift.level;
              r.levels.push({ level: s.drift.level, charge: +s.drift.charge.toFixed(3), sinceSlide: +(s.time - r.slideStart).toFixed(3), wallMs: Date.now() - pressedAt });
            }
            r.slidingSamples++;
            const over = (s.lateral < 0 ? -s.lateral - s.limitL : s.lateral - s.limitR);
            r.maxOver = Math.max(r.maxOver, over);
            r.maxAbsLat = Math.max(r.maxAbsLat, Math.abs(s.lateral));
            if (s.surface !== 'road') r.offroadSamples++;
            for (const lvl of shotLevels) {
              if (!taken.has(lvl) && s.drift.level === lvl && s.drift.charge >= (lvl === 0 ? 0.5 : lvl + 0.2)) { taken.add(lvl); hostShot(`host-drift-level${lvl}`); }
            }
            if (endWhen(s)) r.stopReason = cancel ? 'cancel' : 'release';
          } else if (r.started) {
            r.stopReason = 'slide dropped by itself';
          } else if (s.time - entry.time > 2.5) {
            r.stopReason = 'slide never started';
          }
          if (r.stopReason === null && s.ps > range.s1 - 3) r.stopReason = 'ran out of corner';
        },
      });
      r.end = endSample ? { ps: endSample.ps, speed: endSample.speed, level: endSample.drift.level, charge: endSample.drift.charge, boost: endSample.boost } : null;
      if (r.stopReason === null) r.stopReason = 'timeout';

      if (r.stopReason === 'release') {
        stage = `${label}-release`;
        await lift(DRIFT_BUTTON_ID);
        const relAt = Date.now();
        let shot = false;
        await drive(() => Date.now() - relAt > 2500, {
          onSample: (s) => {
            if (r.release === null && !s.drift.sliding) r.release = { boost: s.boost, boostLevel: s.boostLevel, speed: s.speed, afterMs: Date.now() - relAt };
            r.postMaxSpeed = Math.max(r.postMaxSpeed, s.speed);
            r.postMaxLevel = Math.max(r.postMaxLevel, s.boostLevel);
            if (boostShot && !shot && r.release && Date.now() - relAt > 400) { shot = true; hostShot(boostShot); }
          },
        });
      } else if (r.stopReason === 'cancel') {
        stage = `${label}-cancel`;
        const inward = (s) => Math.max(-0.5, Math.min(0.5, s.steer));
        const pre = last;
        let n = 0;
        r.cancelPre = { level: pre.drift.level, charge: pre.drift.charge, boost: pre.boost, boostLevel: pre.boostLevel, speed: pre.speed };
        await stick(inward(pre), 1);
        await drive(() => n >= 5, {
          cmd: inward, brake: 1,
          onSample: (s) => {
            n++;
            r.cancelPost.push({ sliding: s.drift.sliding, level: s.drift.level, charge: s.drift.charge, boost: s.boost, boostLevel: s.boostLevel, speed: s.speed });
            if (n === 2) hostShot('host-brake-cancel');
          },
        });
        // DRIFT is still held here; letting it go after the cancel must not grant a boost either.
        await lift(DRIFT_BUTTON_ID);
        await ticksFor(400, { cmd: inward, brake: 1, onSample: (s) => r.cancelPost.push({ sliding: s.drift.sliding, level: s.drift.level, charge: s.drift.charge, boost: s.boost, boostLevel: s.boostLevel, speed: s.speed }) });
        await lift(DRIFT_STICK_ID);
      } else {
        await lift(DRIFT_BUTTON_ID);
      }
      return r;
    }

    // Drift A: the t1 right-hander, released at level 1.
    const dA = await runDrift({ label: 't1', piece: 't1', entryOff: 3, endWhen: (s) => s.drift.level >= 1 && s.drift.charge >= DRIFT_RELEASE_CHARGE[1], boostShot: 'host-boost-level1' });
    // Drift B: sRight, charged to level 1, then the stick goes down.
    const dB = await runDrift({ label: 'sRight', piece: 'sRight', entryOff: 0, endWhen: (s) => s.drift.level >= 1 && s.drift.charge >= DRIFT_RELEASE_CHARGE[1], cancel: true });
    // Drift C: the sweeper, a long right-hander, held to level 3.
    const dC = await runDrift({ label: 'sweeper', piece: 'sweeper', entryOff: 8, endWhen: (s) => s.drift.level >= 3 && s.drift.charge >= DRIFT_RELEASE_CHARGE[3], shotLevels: [0, 1, 2, 3], boostShot: 'host-boost-level3' });

    // ── 5. ITEM tap on a straight at steady speed ──
    stage = 'item-approach';
    const steady = await drive(
      (s) => s.ps >= R.sweeper.s0 + 120 && ((s.sm >= R.grid.s0 + 2 && s.sm <= R.grid.s1 - 24) || (s.sm >= 2 && s.sm <= 60))
        && s.boost === 0 && s.speed >= 21.9 && !s.drift.sliding && Math.abs(s.lateral) < 3 && Math.abs(s.steer) < 0.12,
      { timeout: 60_000 },
    );
    let item = null;
    if (steady) {
      stage = 'item';
      await lift(DRIFT_STICK_ID);
      await ticksFor(350, { touchOn: false });
      const before = last;
      const itemFramesBefore = adaDrives().length;
      await press(DRIFT_ITEM_ID, itemAt);
      const itemPressed = await ada.evaluate(() => document.getElementById('btn-item').classList.contains('pressed'));
      const shot = run.capture(ada, 'phone-after-item');
      await sleepMs(60);
      await lift(DRIFT_ITEM_ID);
      await shot;
      await ticksFor(500, { touchOn: false });
      item = { before, after: last, itemFramesBefore, itemPressed };
      hostShot('host-after-item');
    }
    await liftAll().catch(() => {});

    // ── Checks ──
    const lvlTxt = (r) => r.levels.map((l) => `L${l.level}@${fx(l.sinceSlide)}s (charge ${fx(l.charge)})`).join(' ');
    const turnRight = (p) => (p === 't1' || p === 'sRight' || p === 'sweeper' ? 1 : -1); // all three drifted pieces turn right
    for (const r of [dA, dB, dC]) {
      run.check(
        `${r.label}: holding DRIFT while steering into the corner makes drift.sliding true with dir ${turnRight(r.piece)}`,
        r.started && r.dir === turnRight(r.piece),
        `started ${r.started}, dir ${r.dir}, entered at ${r.entry ? fx(r.entry.speed, 1) : '?'} m/s, ${r.stopReason}`,
      );
    }
    const order = dC.levels.map((l) => l.level).join('>');
    const times = [1, 2, 3].map((n) => dC.levels.find((l) => l.level === n)?.sinceSlide ?? NaN);
    run.check('sweeper: levels 1, 2, 3 reached in order, each at about 1, 2, 3 s of sliding', order === '0>1>2>3' && times.every((t, i) => t >= i + 1 - 0.05 && t <= i + 1 + 0.3), `order ${order}; ${lvlTxt(dC)}`);
    run.check(
      'sweeper: |lateral| stays inside the corridor limit for the whole drift',
      dC.slidingSamples > 20 && dC.maxOver <= CORRIDOR_SLACK_M,
      `${dC.slidingSamples} sliding samples, max |lateral| ${fx(dC.maxAbsLat)} m, overshoot ${fx(dC.maxOver)} m (negative is inside), non-road samples ${dC.offroadSamples}`,
    );
    run.check(
      'sweeper: releasing DRIFT at level 3 sets boostLevel 3 and boost above 0',
      dC.release?.boostLevel === 3 && dC.release.boost > 0,
      dC.release ? `boostLevel ${dC.release.boostLevel}, boost ${fx(dC.release.boost)} s, ${fx(dC.release.afterMs, 0)} ms after the release` : `no release (${dC.stopReason})`,
    );
    run.check('sweeper: speed rises above 22 m/s after the level 3 release', dC.postMaxSpeed > 22, `${dC.end ? fx(dC.end.speed, 1) : '?'} m/s at release, max ${fx(dC.postMaxSpeed, 1)} m/s within 2.5 s`);
    run.check(
      't1: a second drift released at level 1 sets boostLevel 1',
      dA.release?.boostLevel === 1 && dA.release.boost > 0,
      dA.release ? `boostLevel ${dA.release.boostLevel}, boost ${fx(dA.release.boost)} s; levels ${lvlTxt(dA)}` : `no release (${dA.stopReason})`,
    );
    const cp = dB.cancelPost;
    const firstOff = cp.findIndex((p) => !p.sliding);
    run.check(
      'brake cancel: pushing the stick down during a charged drift ends the slide with boost 0 and boostLevel 0',
      dB.stopReason === 'cancel' && (dB.cancelPre?.level ?? 0) >= 1 && firstOff >= 0 && firstOff <= 3 && cp.slice(firstOff).every((p) => !p.sliding) && cp.every((p) => p.boost === 0 && p.boostLevel === 0),
      dB.cancelPre
        ? `before: level ${dB.cancelPre.level}, charge ${fx(dB.cancelPre.charge)} s, boost ${fx(dB.cancelPre.boost)}; slide ended at sample ${firstOff + 1}; ${cp.length} samples after, max boost ${fx(Math.max(...cp.map((p) => p.boost)))}, max boostLevel ${Math.max(...cp.map((p) => p.boostLevel))}, speed ${fx(dB.cancelPre.speed, 1)} -> ${fx(cp[cp.length - 1].speed, 1)} m/s`
        : dB.stopReason,
    );
    run.check(
      'ITEM tap: exactly one use_item frame leaves the phone and reaches the host',
      run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'use_item').length === 1
        && run.frames.filter((f) => f.page === 'host' && f.dir === 'in' && f.msg.type === 'use_item').length === 1,
      `phone out ${run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'use_item').length}, host in ${run.frames.filter((f) => f.page === 'host' && f.dir === 'in' && f.msg.type === 'use_item').length}`,
    );
    run.check('ITEM tap lights the button (#btn-item.pressed) right after the touch', item?.itemPressed === true, `pressed ${item?.itemPressed}`);
    run.check(
      'ITEM tap does not change the kart\'s speed, drift or boost',
      item !== null && Math.abs(item.after.speed - item.before.speed) <= 0.3 && !item.before.drift.sliding && !item.after.drift.sliding && item.before.boost === 0 && item.after.boost === 0 && item.after.boostLevel === 0,
      item ? `speed ${fx(item.before.speed)} -> ${fx(item.after.speed)} m/s, sliding ${item.before.drift.sliding} -> ${item.after.drift.sliding}, boost ${fx(item.before.boost)} -> ${fx(item.after.boost)}, boostLevel ${item.after.boostLevel}` : 'never reached a steady straight',
    );
    const drives = adaDrives();
    const shaped = drives.length > 0 && drives.every((f) => typeof f.msg.steer === 'number' && typeof f.msg.brake === 'number' && typeof f.msg.drift === 'boolean' && !('gas' in f.msg));
    const heldFrames = drives.filter((f) => f.msg.drift === true).length;
    run.check(
      'Ada\'s drive frames carry steer, brake and drift (no gas), with drift true while the button is held',
      shaped && heldFrames > 40 && drives.some((f) => f.msg.brake > 0) && new Set(drives.map((f) => f.msg.steer)).size > 10,
      `${drives.length} frames, drift true ${heldFrames}, brake > 0 ${drives.filter((f) => f.msg.brake > 0).length}, ${new Set(drives.map((f) => f.msg.steer)).size} distinct steer values`,
    );
    fs.writeFileSync(path.join(run.dir, 'drift-summary.json'), JSON.stringify({ launch, rev, drifts: { t1: dA, sRight: dB, sweeper: dC }, item }, null, 2));
  } finally {
    await liftAll().catch(() => {});
    await Promise.all(shots);
    fs.writeFileSync(path.join(run.dir, 'drift-trace.jsonl'), trace.map((t) => JSON.stringify(t)).join('\n') + '\n');
  }
}

const FEATURES = {
  'join-lobby': joinLobby,
  'select-game': selectGameFeature,
  'bowling-throw': bowlingThrow,
  'kart-race': kartRace,
  'kart-split': kartSplit,
  'kart-drift': kartDrift,
};

async function main() {
  const featureId = process.argv[2];
  if (!FEATURES[featureId]) {
    console.error(`usage: drive.mjs <${Object.keys(FEATURES).join('|')}>`);
    process.exit(2);
  }
  if (!(await doctor())) {
    console.error('Refusing to drive a failed instance. Run instance.mjs doctor, then launch or cleanup.');
    process.exit(1);
  }

  const browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
  const run = new Run(featureId, browser);
  let error = null;
  try {
    await FEATURES[featureId](run);
  } catch (err) {
    error = err;
    const shot = path.join(run.dir, 'failure.png');
    if (run.host) await run.host.screenshot({ path: shot }).catch(() => {});
    console.log(`ERROR ${err.message.split('\n')[0]}`);
  } finally {
    await run.close();
    await browser.close();
  }
  const passed = run.writeArtifacts(error);
  console.log(`${passed ? 'FEATURE PASSED' : 'FEATURE FAILED'} ${featureId} → ${run.dir}`);
  process.exit(passed ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) await main();
