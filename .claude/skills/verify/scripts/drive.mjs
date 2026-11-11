#!/usr/bin/env node
// Drive one mapped feature against the running verification instance.
//
//   node .claude/skills/verify/scripts/drive.mjs <feature-id>
//   HEADED=1 node .claude/skills/verify/scripts/drive.mjs bowling-throw   # watch it run
//
// Feature ids: join-lobby, select-game, bowling-throw, kart-race, kart-split, kart-drift, kart-items, tennis-match, tennis-rally.
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
  run.check('Tennis card is enabled', byLabel.Tennis?.enabled === true);
  const unbuilt = cards.filter((c) => c.label !== 'Bowling' && c.label !== 'Kart Racer' && c.label !== 'Tennis');
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
  const shaped = drives.length > 0 && drives.every((f) => typeof f.msg.steer === 'number' && typeof f.msg.aimY === 'number' && typeof f.msg.drift === 'boolean' && !('gas' in f.msg) && !('brake' in f.msg));
  run.check('Ada\'s drive frames carry steer, aimY and drift (no gas, no brake) and varied steer', shaped && new Set(drives.map((f) => f.msg.steer)).size > 10, `${drives.length} frames, ${new Set(drives.map((f) => f.msg.steer)).size} distinct steer values, aimY max ${Math.max(...drives.map((f) => f.msg.aimY))}, drift true ${drives.filter((f) => f.msg.drift).length}`);

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

// ── Kart Racer drift and boost ────────────────────────────────

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
  // steer and aimY are the values the phone should send (aimY > 0 is stick down). Inverts stickFromOffset: a radial dead
  // zone, then linear to 1 at the base radius. The phone clamps a combined offset to the circle.
  const stick = async (steer, aimY = 0) => {
    if (!down.has(DRIFT_STICK_ID)) {
      await press(DRIFT_STICK_ID, zoneAt);
      base = await ada.evaluate(() => { const r = document.getElementById('kart-joystick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    }
    const nx = Math.abs(steer) < 0.005 ? 0 : Math.sign(steer) * (JOYSTICK_DEAD_ZONE + Math.min(1, Math.abs(steer)) * (1 - JOYSTICK_DEAD_ZONE));
    const ny = Math.abs(aimY) < 0.005 ? 0 : Math.sign(aimY) * (JOYSTICK_DEAD_ZONE + Math.min(1, Math.abs(aimY)) * (1 - JOYSTICK_DEAD_ZONE));
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
  async function drive(until, { timeout = 30_000, touchOn = true, cmd = (s) => s.steer, aimY = 0, onSample } = {}) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const t0 = Date.now();
      const s = await host.evaluate(driftHostTick, [coreSrc, bands]);
      if (!s) throw new Error('kart debug state is gone');
      last = s;
      trace.push({ stage, t: +s.time.toFixed(3), sm: +s.sm.toFixed(1), ps: +s.ps.toFixed(1), lat: +s.lateral.toFixed(2), v: +s.speed.toFixed(2), boost: +s.boost.toFixed(2), bl: s.boostLevel, sl: s.drift.sliding, dir: s.drift.dir, charge: +s.drift.charge.toFixed(3), lvl: s.drift.level });
      if (touchOn) await stick(cmd(s), aimY);
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
      `${fx(launch.speed, 1)} m/s ${fx(launch.time)} s after GO with no touch; ${neutralFrames.length} Ada drive frames so far, all neutral: ${neutralFrames.every((f) => f.msg.steer === 0 && f.msg.aimY === 0 && f.msg.drift === false)}`,
    );

    // ── 2. Phone shot: stick down-left with DRIFT held (down is aim only now) ──
    stage = 'phone-combo';
    await stick(-0.5, 0.7);
    await press(DRIFT_BUTTON_ID, driftAt);
    await stick(-0.5, 0.7);
    await sleepMs(450);
    await run.capture(ada, 'phone-stick-down-left-drift');
    const combo = adaDrives().slice(-4);
    await liftAll();
    await ticksFor(300, { touchOn: false });
    run.check(
      'phone frames carry steer left, aimY down and drift true while the stick is down-left with DRIFT held',
      combo.length > 0 && combo.every((f) => f.msg.steer < 0 && f.msg.aimY > 0 && f.msg.drift === true),
      combo.map((f) => `${f.msg.steer}/${f.msg.aimY}/${f.msg.drift}`).join(' '),
    );

    // ── 3. Drifts ──
    // Runs one drift on a piece: cruise to the entry, hold DRIFT with an inward stick, then stop
    // on `endWhen` by releasing DRIFT (boost).
    async function runDrift({ label, piece, entryOff, endWhen, shotLevels = [], boostShot = null }) {
      stage = `${label}-approach`;
      const range = R[piece];
      const r = {
        label, piece, levels: [], dir: null, started: false, maxOver: -Infinity, maxAbsLat: 0, slidingSamples: 0, offroadSamples: 0,
        entry: null, end: null, stopReason: null, release: null, postMaxSpeed: 0, postMaxLevel: 0, slideStart: null, wallMs: {},
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
            if (endWhen(s)) r.stopReason = 'release';
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
      } else {
        await lift(DRIFT_BUTTON_ID);
      }
      return r;
    }

    // Drift A: the t1 right-hander, released at level 1.
    const dA = await runDrift({ label: 't1', piece: 't1', entryOff: 3, endWhen: (s) => s.drift.level >= 1 && s.drift.charge >= DRIFT_RELEASE_CHARGE[1], boostShot: 'host-boost-level1' });
    // Drift C: the sweeper, a long right-hander, held to level 3.
    const dC = await runDrift({ label: 'sweeper', piece: 'sweeper', entryOff: 8, endWhen: (s) => s.drift.level >= 3 && s.drift.charge >= DRIFT_RELEASE_CHARGE[3], shotLevels: [0, 1, 2, 3], boostShot: 'host-boost-level3' });

    // ── 4. ITEM tap on a straight at steady speed ──
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
      const heldKind = await host.evaluate(() => window.__kartState.karts[0].item.main);
      const itemFramesBefore = adaDrives().length;
      await press(DRIFT_ITEM_ID, itemAt);
      const itemPressed = await ada.evaluate(() => document.getElementById('btn-item').classList.contains('pressed'));
      const shot = run.capture(ada, 'phone-after-item');
      await sleepMs(60);
      await lift(DRIFT_ITEM_ID);
      await shot;
      await ticksFor(500, { touchOn: false });
      item = { before, after: last, itemFramesBefore, itemPressed, heldKind };
      hostShot('host-after-item');
    }
    await liftAll().catch(() => {});

    // ── Checks ──
    const lvlTxt = (r) => r.levels.map((l) => `L${l.level}@${fx(l.sinceSlide)}s (charge ${fx(l.charge)})`).join(' ');
    const turnRight = () => 1; // both drifted pieces turn right
    for (const r of [dA, dC]) {
      run.check(
        `${r.label}: holding DRIFT while steering into the corner makes drift.sliding true with dir ${turnRight()}`,
        r.started && r.dir === turnRight(),
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
    run.check(
      'ITEM tap: exactly one use_item frame leaves the phone and reaches the host',
      run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'use_item').length === 1
        && run.frames.filter((f) => f.page === 'host' && f.dir === 'in' && f.msg.type === 'use_item').length === 1,
      `phone out ${run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'use_item').length}, host in ${run.frames.filter((f) => f.page === 'host' && f.dir === 'in' && f.msg.type === 'use_item').length}`,
    );
    run.check('ITEM tap lights the button (#btn-item.pressed) right after the touch', item?.itemPressed === true, `pressed ${item?.itemPressed}`);
    run.check(
      'ITEM tap leaves speed, drift and boost alone (a held mushroom boosts instead)',
      item !== null && !item.before.drift.sliding && !item.after.drift.sliding && item.before.boost === 0 && (item.heldKind === 'mushroom'
        ? item.after.boost > 0
        : Math.abs(item.after.speed - item.before.speed) <= 0.3 && item.after.boost === 0 && item.after.boostLevel === 0),
      item ? `held ${item.heldKind}, speed ${fx(item.before.speed)} -> ${fx(item.after.speed)} m/s, sliding ${item.before.drift.sliding} -> ${item.after.drift.sliding}, boost ${fx(item.before.boost)} -> ${fx(item.after.boost)}, boostLevel ${item.after.boostLevel}` : 'never reached a steady straight',
    );
    const drives = adaDrives();
    const shaped = drives.length > 0 && drives.every((f) => typeof f.msg.steer === 'number' && typeof f.msg.aimY === 'number' && typeof f.msg.drift === 'boolean' && !('gas' in f.msg) && !('brake' in f.msg));
    const heldFrames = drives.filter((f) => f.msg.drift === true).length;
    run.check(
      'Ada\'s drive frames carry steer, aimY and drift (no gas, no brake), with drift true while the button is held',
      shaped && heldFrames > 40 && drives.some((f) => f.msg.aimY > 0) && new Set(drives.map((f) => f.msg.steer)).size > 10,
      `${drives.length} frames, drift true ${heldFrames}, aimY > 0 ${drives.filter((f) => f.msg.aimY > 0).length}, ${new Set(drives.map((f) => f.msg.steer)).size} distinct steer values`,
    );
    fs.writeFileSync(path.join(run.dir, 'drift-summary.json'), JSON.stringify({ launch, drifts: { t1: dA, sweeper: dC }, item }, null, 2));
  } finally {
    await liftAll().catch(() => {});
    await Promise.all(shots);
    fs.writeFileSync(path.join(run.dir, 'drift-trace.jsonl'), trace.map((t) => JSON.stringify(t)).join('\n') + '\n');
  }
}

// ── Kart Racer items ──────────────────────────────────────────────────────────

const ITEM_ROW_AIM_M = 1.5; // lateral Ada aims at through the first row (box columns sit at -4.5, -1.5, 1.5, 4.5)
const ITEM_READY_MAX_MS = 3000; // roulette 1.6 s plus status latency; a stacked pickup's reserve lands later but main is first

// Read-only view of Ada's item state and the race objects, shipped into the host page.
function itemsHostSnap() {
  const st = window.__kartState;
  const k = st?.karts[0];
  if (!k) return null;
  return {
    id: k.id, karts: st.karts.map((o) => ({ id: o.id, hit: o.hit, invuln: o.invuln })), item: { ...k.item }, boost: k.boost, mushroom: k.mushroom, hit: k.hit, invuln: k.invuln, speed: k.speed,
    entities: (st.entities ?? []).map((e) => ({ id: e.id, kind: e.kind, owner: e.owner })),
    brokenBoxes: (st.boxes ?? []).filter((b) => !b.ready).length,
    events: (window.__kartRace?.events ?? []).slice(-24).map((e) => ({ seq: e.seq, t: +e.t.toFixed(2), type: e.type, kind: e.kind, kartId: e.kartId, by: e.by, entityId: e.entityId })),
  };
}

async function kartItems(run) {
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

  // Real controls: CDP touches on Ada's stick and ITEM button.
  const rect = (sel) => ada.evaluate((q) => { const r = document.querySelector(q).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel);
  const zoneAt = await rect('#kart-zone');
  const itemAt = await rect('#btn-item');
  const radius = await ada.evaluate(() => (document.getElementById('kart-joystick').offsetWidth - document.getElementById('kart-knob').offsetWidth) / 2);
  const cdp = await ada.context().newCDPSession(ada);
  const down = new Map();
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts });
  let base = null;
  const stick = async (steer) => {
    if (!down.has(DRIFT_STICK_ID)) {
      down.set(DRIFT_STICK_ID, { x: zoneAt.x, y: zoneAt.y, id: DRIFT_STICK_ID });
      await touch('touchStart', [...down.values()]);
      base = await ada.evaluate(() => { const r = document.getElementById('kart-joystick').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
    }
    const nx = Math.abs(steer) < 0.005 ? 0 : Math.sign(steer) * (JOYSTICK_DEAD_ZONE + Math.min(1, Math.abs(steer)) * (1 - JOYSTICK_DEAD_ZONE));
    down.set(DRIFT_STICK_ID, { x: base.x + nx * radius, y: base.y, id: DRIFT_STICK_ID });
    await touch('touchMove', [...down.values()]);
  };

  const rowS = await host.evaluate(() => window.__kartTrack.itemRows[0].s);
  const bands = [{ s0: Math.max(0, rowS - 45), s1: rowS + 20, aim: ITEM_ROW_AIM_M }];
  const coreSrc = driftSteer.toString();
  const shots = [];
  const hostShot = (name) => shots.push(run.capture(host, name).catch(() => {}));
  const phoneShot = (name) => shots.push(run.capture(ada, name).catch(() => {}));
  const fx = (n, d = 2) => Number(n).toFixed(d);
  const phoneBtn = () => ada.evaluate(() => document.getElementById('btn-item').className);
  const tvSlot = () => host.evaluate(() => {
    const el = document.querySelector('.kart-pane[data-slot="0"] .kart-item-slot.main');
    return el ? { kind: el.dataset.kind ?? null, rolling: el.dataset.rolling === '1', icon: !!el.querySelector('.kart-item-icon svg') } : null;
  });

  // One controller loop: steer along the aim line, call onSample, stop when `done` or on timeout (null).
  async function until(done, timeout, onSample) {
    const deadline = Date.now() + timeout;
    for (;;) {
      const t0 = Date.now();
      const s = await host.evaluate(driftHostTick, [coreSrc, bands]);
      if (!s) throw new Error('kart debug state is gone');
      await stick(s.steer);
      const snap = await host.evaluate(itemsHostSnap);
      await onSample?.(s, snap);
      if (done(s, snap)) return { s, snap };
      if (Date.now() > deadline) return null;
      const wait = DRIFT_TICK_MS - (Date.now() - t0);
      if (wait > 0) await sleep(wait);
    }
  }

  try {
    await host.waitForFunction(() => window.__kartState?.phase === 'racing', null, { polling: 30, timeout: 15_000 });

    // ── 1. Drive through the first box row until a pickup lands ──
    const pick = await until((s, snap) => snap.item.main !== null, 40_000);
    run.check(
      'driving through the first box row breaks a box and fills Ada\'s main slot',
      pick !== null && pick.snap.brokenBoxes >= 1,
      pick ? `race time ${fx(pick.s.time)} s at s ${fx(pick.s.sm, 1)} (row at ${fx(rowS, 1)}), ${pick.snap.brokenBoxes} box(es) broken, reserve ${pick.snap.item.reserve ?? 'none'}` : 'no pickup within 40 s',
    );
    if (!pick) throw new Error('no pickup within 40 s');
    const pickedAt = Date.now();
    const kind = pick.snap.item.main;

    // ── 2. Roulette on the phone and the TV, then ready with an icon ──
    const seen = { phoneRolling: false, tvRolling: false, ready: null, tv: null, phoneClass: null };
    const readyRes = await until(
      () => seen.ready !== null,
      ITEM_READY_MAX_MS + 1500,
      async () => {
        const cls = await phoneBtn();
        if (!seen.phoneRolling && cls.includes('rolling')) { seen.phoneRolling = true; phoneShot('phone-item-rolling'); hostShot('host-item-rolling'); }
        if (!seen.tvRolling && (await tvSlot())?.rolling) seen.tvRolling = true;
        if (seen.ready === null && cls.includes('ready')) {
          seen.ready = Date.now() - pickedAt;
          seen.phoneClass = cls;
          // The TV HUD repaints at 10 Hz, so give it a moment to land.
          for (let i = 0; i < 12; i++) { seen.tv = await tvSlot(); if (seen.tv?.kind && !seen.tv.rolling) break; await sleep(80); }
          phoneShot('phone-item-ready');
          hostShot('host-item-ready');
        }
      },
    );
    run.check('phone ITEM button shows its rolling state after the pickup', seen.phoneRolling, seen.phoneRolling ? 'class had "rolling"' : 'never saw "rolling" on #btn-item');
    run.check('TV pane main slot shows the roulette while rolling', seen.tvRolling, seen.tvRolling ? 'data-rolling=1' : 'never saw data-rolling on the main slot');
    run.check(
      `phone ITEM button is ready within ${ITEM_READY_MAX_MS / 1000} s of the pickup`,
      readyRes !== null && seen.ready !== null && seen.ready <= ITEM_READY_MAX_MS,
      seen.ready === null ? 'never ready' : `ready ${seen.ready} ms after the pickup was seen (kind ${kind})`,
    );
    run.check(
      'TV pane main slot shows the landed item icon',
      seen.tv !== null && seen.tv.kind === kind && seen.tv.icon && !seen.tv.rolling,
      JSON.stringify(seen.tv),
    );
    if (seen.ready === null) throw new Error('item never became ready');

    // ── 3. Tap ITEM: the item is used and its effect shows up ──
    const before = (await host.evaluate(itemsHostSnap));
    const entitiesBefore = new Set(before.entities.map((e) => e.id));
    down.set(3, { x: itemAt.x, y: itemAt.y, id: 3 });
    await touch('touchStart', [...down.values()]);
    const pressed = await ada.evaluate(() => document.getElementById('btn-item').classList.contains('pressed'));
    await sleep(60);
    const itemPt = down.get(3);
    down.delete(3);
    await touch('touchEnd', [itemPt]);
    const trail = [];
    const eventsBefore = new Set(before.events.map((e) => e.seq));
    let entitySeen = false;
    const effect = await until(
      (s, snap) => {
        if (kind === 'mushroom') return snap.boost > 0 && snap.mushroom > 0;
        // A banana dropped beside the other kart can be hit within one tick, so a use event plus a hit by that kind counts too.
        const used = snap.events.some((e) => e.type === 'use' && e.kartId === snap.id && e.kind === kind && !eventsBefore.has(e.seq));
        const hitBy = snap.events.some((e) => e.type === 'hit' && e.by === kind && !eventsBefore.has(e.seq));
        return used && (entitySeen || hitBy);
      },
      1500,
      (s, snap) => {
        if (snap.entities.some((e) => !entitiesBefore.has(e.id) && e.owner === snap.id && e.kind === kind)) entitySeen = true;
        trail.push({ t: +s.time.toFixed(2), entities: snap.entities, events: snap.events.slice(-4) });
      },
    );
    const after = effect?.snap ?? (await host.evaluate(itemsHostSnap));
    phoneShot('phone-after-item');
    hostShot('host-after-item');
    run.check('ITEM tap lights the button right after the touch', pressed, `pressed ${pressed}`);
    run.check(
      `ITEM tap used the ${kind}: ${kind === 'mushroom' ? 'boost and mushroom above 0' : `a use event and a ${kind} entity owned by Ada (or a hit by it)`}`,
      effect !== null,
      kind === 'mushroom' ? `boost ${fx(after.boost)}, mushroom ${fx(after.mushroom)}` : `entity seen ${entitySeen}, events ${JSON.stringify(after.events.slice(-3))}`,
    );
    run.check(
      'ITEM tap consumed the main item (main empty, or the reserve moved up)',
      after.item.main === before.item.reserve && (before.item.reserve !== null || after.item.main === null),
      `main ${before.item.main} -> ${after.item.main}, reserve ${before.item.reserve} -> ${after.item.reserve}`,
    );
    const useFrames = (dir, page) => run.frames.filter((f) => f.page === page && f.dir === dir && f.msg.type === 'use_item').length;
    run.check('exactly one use_item frame leaves Ada\'s phone and reaches the host', useFrames('out', 'phone:Ada') === 1 && useFrames('in', 'host') === 1, `phone out ${useFrames('out', 'phone:Ada')}, host in ${useFrames('in', 'host')}`);

    // ── 4. A hit, when Ada's item landed one: the victim shows `hit`, then `invuln` ──
    // Item kinds are random and the rival drives blind, so this is only checked when a hit happened.
    const hitEv = after.events.find((e) => e.type === 'hit' && e.by === kind && !eventsBefore.has(e.seq));
    let hitSeq = null;
    if (hitEv) {
      hitSeq = [];
      await until(() => false, 2800, (s, snap) => {
        const v = snap.karts.find((k) => k.id === hitEv.kartId);
        hitSeq.push({ t: +s.time.toFixed(2), hit: v.hit, invuln: +v.invuln.toFixed(2) });
      });
      const iHit = hitSeq.findIndex((x) => x.hit !== null);
      const iInv = hitSeq.findIndex((x, i) => i >= 0 && x.hit === null && x.invuln > 0 && hitSeq.slice(0, i).some((y) => y.hit !== null));
      run.check(
        `the kart hit by Ada's ${kind} (${hitEv.kartId === after.id ? 'Ada' : 'the rival'}) shows hit, then invuln`,
        iHit >= 0 && iInv > iHit,
        `hit at sample ${iHit} (${hitSeq[iHit]?.hit}), invuln > 0 with no hit at sample ${iInv}; ${hitSeq.length} samples`,
      );
    }

    // ── Drive frames ──
    const drives = run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'drive');
    const shaped = drives.length > 0 && drives.every((f) => typeof f.msg.steer === 'number' && typeof f.msg.aimY === 'number' && typeof f.msg.drift === 'boolean' && !('gas' in f.msg) && !('brake' in f.msg));
    run.check('Ada\'s drive frames carry steer, aimY and drift (no gas, no brake)', shaped, `${drives.length} frames, ${new Set(drives.map((f) => f.msg.steer)).size} distinct steer values`);
    fs.writeFileSync(path.join(run.dir, 'items-summary.json'), JSON.stringify({ rowS, kind, seen, pick: pick.snap, before, after, trail, hitSeq }, null, 2));
  } finally {
    await touch('touchEnd', []).catch(() => {});
    await Promise.all(shots);
  }
}

// ── Tennis ────────────────────────────────────────────────────────────────────

async function tennisMatch(run) {
  // beta and gamma are rotation rates. The phone drops a devicemotion event that
  // lacks accelerationIncludingGravity or rotationRate.
  async function flick(page, samples) {
    await page.evaluate(async (samples) => {
      for (const sample of samples) {
        window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x: 0, y: 0, z: 0 },
          rotationRate: { alpha: 0, beta: sample.beta, gamma: sample.gamma },
        }));
        await new Promise((r) => setTimeout(r, 30));
      }
    }, samples);
  }

  const host = await run.openHost({ viewport: { width: 1280, height: 720 } });
  const names = ['Ada', 'Bea', 'Cal', 'Dee', 'Eve'];
  const phones = {};
  for (const name of names) {
    phones[name] = await run.openPhone(name);
    await waitForWaitingLabel(phones[name]);
    await host.waitForSelector(`.player-item:has-text("${name}")`, { timeout: 10_000 });
  }

  await selectGame(run, 'Tennis');
  await host.waitForSelector('.tennis-teams', { timeout: 15_000 });

  const row = (name) => host.locator('.tennis-player', { has: host.locator('.tennis-name', { hasText: name }) });
  const seatButton = { A: '.tennis-side-a', B: '.tennis-side-b', out: '.tennis-sit' };
  async function seat(name) {
    const item = row(name);
    if (await item.locator(seatButton.A).getAttribute('aria-pressed') === 'true') return 'A';
    if (await item.locator(seatButton.B).getAttribute('aria-pressed') === 'true') return 'B';
    if (await item.locator(seatButton.out).getAttribute('aria-pressed') === 'true') return 'out';
    return '';
  }
  async function assign(name, side) {
    await row(name).locator(seatButton[side]).click();
  }
  async function formatText() {
    return (await host.locator('.tennis-format').innerText()).trim();
  }
  async function startEnabled() {
    return host.locator('.tennis-start').isEnabled();
  }
  async function phoneLabel(page) {
    return (await page.locator('#tennis-label').innerText()).trim();
  }

  const title = (await host.locator('.tennis-title').innerText()).trim();
  const opening = await formatText();
  const seats = {};
  for (const name of names) seats[name] = await seat(name);
  const bestOf3 = await host.locator('.tennis-length[data-best-of="3"]').getAttribute('aria-pressed');
  const openingStart = await startEnabled();
  const seatedFive = seats.Ada === 'A' && seats.Bea === 'A' && seats.Cal === 'B' && seats.Dee === 'B' && seats.Eve === 'out';
  run.check(
    'five phones open on Choose sides as 2v2, Best of 3 pressed, Start enabled',
    title === 'Choose sides' && opening === '2v2' && bestOf3 === 'true' && openingStart && seatedFive,
    `title "${title}", format ${opening}, best of 3 pressed ${bestOf3}, start ${openingStart}, seats ${JSON.stringify(seats)}`,
  );
  await run.capture(host, 'host-teams-five');

  await assign('Eve', 'A');
  await host.waitForFunction(
    () => document.querySelector('.tennis-format')?.textContent.trim() === 'Need 2 to 4 players',
    null,
    { timeout: 5_000 },
  );
  const illegalStart = await startEnabled();
  run.check(
    'Eve on Side A needs 2 to 4 players and disables Start',
    (await formatText()) === 'Need 2 to 4 players' && !illegalStart,
    `format ${await formatText()}, start enabled ${illegalStart}`,
  );
  await run.capture(host, 'host-teams-illegal');
  await assign('Eve', 'out');
  await host.waitForFunction(
    () => document.querySelector('.tennis-format')?.textContent.trim() === '2v2',
    null,
    { timeout: 5_000 },
  );

  await assign('Bea', 'B');
  await assign('Cal', 'out');
  await assign('Dee', 'out');
  await host.waitForFunction(
    () => document.querySelector('.tennis-format')?.textContent.trim() === '1v1',
    null,
    { timeout: 5_000 },
  );
  const singlesFormat = await formatText();
  const singlesStart = await startEnabled();
  const singlesSeats = {};
  for (const name of names) singlesSeats[name] = await seat(name);
  run.check(
    'Bea on Side B with Cal and Dee sitting out is 1v1 and Start is enabled',
    singlesFormat === '1v1' && singlesStart && singlesSeats.Ada === 'A' && singlesSeats.Bea === 'B',
    `format ${singlesFormat}, start enabled ${singlesStart}, seats ${JSON.stringify(singlesSeats)}`,
  );
  await run.capture(host, 'host-teams-singles');

  await assign('Cal', 'B');
  await host.waitForFunction(
    () => document.querySelector('.tennis-format')?.textContent.trim() === '1v2',
    null,
    { timeout: 5_000 },
  );
  run.check('Cal on Side B is 1v2', (await formatText()) === '1v2', await formatText());
  await run.capture(host, 'host-teams-one-two');
  await assign('Cal', 'out');
  await host.waitForFunction(
    () => document.querySelector('.tennis-format')?.textContent.trim() === '1v1',
    null,
    { timeout: 5_000 },
  );

  await host.locator('.tennis-length[data-best-of="1"]').click();
  const oneGame = await host.locator('.tennis-length[data-best-of="1"]').getAttribute('aria-pressed');
  run.check('One game is pressed', oneGame === 'true', `aria-pressed ${oneGame}`);
  await host.locator('.tennis-start').click();

  await host.waitForSelector('.tennis-court canvas', { timeout: 15_000 });
  await phones.Ada.waitForFunction(
    () => document.getElementById('tennis-label')?.textContent.trim() === 'Swing up to toss',
    null,
    { timeout: 15_000 },
  );
  await phones.Eve.waitForFunction(
    () => document.getElementById('tennis-label')?.textContent.trim() === 'Sitting this one out',
    null,
    { timeout: 15_000 },
  );
  const adaLabel = await phoneLabel(phones.Ada);
  const beaLabel = await phoneLabel(phones.Bea);
  const eveLabel = await phoneLabel(phones.Eve);
  run.check(
    'Ada tosses, Bea watches the point, and Eve sits out',
    adaLabel === 'Swing up to toss' && beaLabel === 'Watch the point' && eveLabel === 'Sitting this one out',
    `Ada "${adaLabel}", Bea "${beaLabel}", Eve "${eveLabel}"`,
  );
  await run.capture(host, 'host-court');
  await run.capture(phones.Ada, 'phone-toss');
  await run.capture(phones.Eve, 'phone-sitting');

  await flick(phones.Ada, [
    { beta: 100, gamma: 0 },
    { beta: 200, gamma: 0 },
    { beta: 120, gamma: 0 },
    { beta: 80, gamma: 0 },
  ]);
  await phones.Ada.waitForFunction(
    () => document.getElementById('tennis-label')?.textContent.trim() === 'Swing to serve',
    null,
    { timeout: 15_000 },
  );
  run.check('Ada is told to swing to serve after the toss', (await phoneLabel(phones.Ada)) === 'Swing to serve');

  await flick(phones.Ada, [
    { beta: 0, gamma: 400 },
    { beta: 0, gamma: 500 },
    { beta: 0, gamma: 420 },
    { beta: 0, gamma: 200 },
    { beta: 0, gamma: 0 },
  ]);

  const frameCount = (page, dir, type) => run.frames.filter((f) => f.page === page && f.dir === dir && f.msg?.type === type).length;
  const frameIndex = (page, dir, type) => run.frames.findIndex((f) => f.page === page && f.dir === dir && f.msg?.type === type);
  let counts = {};
  const frameDeadline = Date.now() + 10_000;
  while (Date.now() < frameDeadline) {
    counts = {
      tossOut: frameCount('phone:Ada', 'out', 'toss'),
      swingOut: frameCount('phone:Ada', 'out', 'swing'),
      tossIn: frameCount('host', 'in', 'toss'),
      swingIn: frameCount('host', 'in', 'swing'),
    };
    if (counts.tossOut && counts.swingOut && counts.tossIn && counts.swingIn) break;
    await sleep(50);
  }
  const ordered = frameIndex('phone:Ada', 'out', 'toss') < frameIndex('phone:Ada', 'out', 'swing')
    && frameIndex('host', 'in', 'toss') < frameIndex('host', 'in', 'swing');
  run.check(
    'a toss frame then a swing frame leave Ada and arrive at the host',
    counts.tossOut === 1 && counts.swingOut === 1 && counts.tossIn === 1 && counts.swingIn === 1 && ordered,
    `phone out toss ${counts.tossOut} swing ${counts.swingOut}, host in toss ${counts.tossIn} swing ${counts.swingIn}`,
  );

  await host.waitForFunction(() => {
    const read = window.__tennisView;
    if (typeof read !== 'function') return false;
    const view = read();
    if (!view?.score) return false;
    if (view.phase === 'called') return true;
    const points = `${view.score.pointsA}\u2013${view.score.pointsB}`;
    const games = `${view.score.gamesA}\u2013${view.score.gamesB}`;
    return points !== '0\u20130' || games !== '0\u20130';
  }, null, { timeout: 20_000 });
  const snap = await host.evaluate(() => {
    const view = typeof window.__tennisView === 'function' ? window.__tennisView() : null;
    if (!view) return null;
    return {
      phase: view.phase,
      pointsA: view.score?.pointsA ?? null,
      pointsB: view.score?.pointsB ?? null,
      gamesA: view.score?.gamesA ?? null,
      gamesB: view.score?.gamesB ?? null,
      call: view.call ?? null,
    };
  });
  const points = snap ? `${snap.pointsA}\u2013${snap.pointsB}` : '';
  const games = snap ? `${snap.gamesA}\u2013${snap.gamesB}` : '';
  run.check(
    'the point is called or the score has left 0–0',
    Boolean(snap) && (snap.phase === 'called' || points !== '0\u20130' || games !== '0\u20130'),
    snap ? `phase ${snap.phase}, points ${points}, games ${games}, call ${snap.call}` : 'no view',
  );
  await run.capture(host, 'host-point');
}

async function tennisRally(run) {
  async function flick(page, samples) {
    await page.evaluate(async (samples) => {
      for (const sample of samples) {
        window.dispatchEvent(new DeviceMotionEvent('devicemotion', {
          accelerationIncludingGravity: { x: 0, y: 0, z: 0 },
          rotationRate: { alpha: 0, beta: sample.beta, gamma: sample.gamma },
        }));
        await new Promise((r) => setTimeout(r, 30));
      }
    }, samples);
  }

  const host = await run.openHost({ viewport: { width: 1280, height: 720 } });
  const ada = await run.openPhone('Ada');
  const bea = await run.openPhone('Bea');
  await waitForWaitingLabel(ada);
  await waitForWaitingLabel(bea);
  await host.waitForSelector('.player-item:has-text("Bea")', { timeout: 10_000 });
  await selectGame(run, 'Tennis');
  await host.waitForSelector('.tennis-teams', { timeout: 15_000 });
  const format = (await host.locator('.tennis-format').innerText()).trim();
  run.check('two phones sit down as 1v1', format === '1v1', format);
  await host.locator('.tennis-length[data-best-of="1"]').click();
  await host.locator('.tennis-start').click();
  await host.waitForSelector('.tennis-court canvas', { timeout: 15_000 });
  await host.waitForSelector('.tennis-split', { timeout: 5_000 });

  const framing = await host.evaluate(() => {
    const court = document.querySelector('.tennis-court');
    const split = document.querySelector('.tennis-split');
    const score = document.querySelector('.tennis-score');
    const scoreBox = score ? score.getBoundingClientRect() : null;
    return {
      split: court?.dataset.split ?? '',
      camY: Number(court?.dataset.camY),
      divider: split ? getComputedStyle(split).display : 'missing',
      scoreX: scoreBox ? scoreBox.left + scoreBox.width / 2 : null,
    };
  });
  run.check('the court is split between the two players', framing.split === '1' && framing.divider === 'block', JSON.stringify(framing));
  run.check(
    'the camera sits close to the ground',
    framing.camY >= 1.45 && framing.camY <= 2.05,
    `camY ${framing.camY}`,
  );
  run.check(
    'the score is centered over the join',
    framing.scoreX != null && Math.abs(framing.scoreX - 640) < 80,
    `scoreX ${framing.scoreX}`,
  );
  await run.capture(host, 'host-split');

  await bea.evaluate(() => {
    window.dispatchEvent(new DeviceOrientationEvent('deviceorientation', { beta: 90, gamma: 80 }));
  });
  await bea.waitForTimeout(300);
  const grip = run.frames.find((frame) => frame.page === 'phone:Bea' && frame.dir === 'out' && frame.msg?.type === 'grip');
  run.check('a rolled phone sends a backhand grip', grip?.msg?.hand === 'backhand', grip ? grip.msg.hand : 'no grip frame');

  await ada.waitForFunction(
    () => document.getElementById('tennis-label')?.textContent.trim() === 'Swing up to toss',
    null,
    { timeout: 10_000 },
  );
  await flick(ada, [
    { beta: 100, gamma: 0 },
    { beta: 200, gamma: 0 },
    { beta: 120, gamma: 0 },
    { beta: 80, gamma: 0 },
  ]);
  await ada.waitForFunction(
    () => document.getElementById('tennis-label')?.textContent.trim() === 'Swing to serve',
    null,
    { timeout: 10_000 },
  );
  await flick(ada, [
    { beta: 0, gamma: 400 },
    { beta: 0, gamma: 500 },
    { beta: 0, gamma: 420 },
    { beta: 0, gamma: 200 },
    { beta: 0, gamma: 0 },
  ]);

  await host.waitForFunction(() => {
    const view = window.__tennisView?.();
    if (!view) return false;
    return view.phase === 'flight' || view.phase === 'called' || (view.players || []).some((p) => p.speed > 0.5);
  }, null, { timeout: 10_000 });
  const moving = await host.evaluate(() => {
    const view = window.__tennisView?.();
    const speeds = (view?.players || []).map((p) => ({ id: p.id, speed: p.speed, x: p.x, z: p.z }));
    return { phase: view?.phase ?? null, speeds };
  });
  const ran = (moving.speeds || []).some((p) => p.speed > 0.5);
  run.check('a player runs toward the ball', moving.phase === 'flight' || moving.phase === 'called' || ran, JSON.stringify(moving));
  await run.capture(host, 'host-chase');
}

const FEATURES = {
  'join-lobby': joinLobby,
  'select-game': selectGameFeature,
  'bowling-throw': bowlingThrow,
  'kart-race': kartRace,
  'kart-split': kartSplit,
  'kart-drift': kartDrift,
  'kart-items': kartItems,
  'tennis-match': tennisMatch,
  'tennis-rally': tennisRally,
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
