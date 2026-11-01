#!/usr/bin/env node
// Drive one mapped feature against the running verification instance.
//
//   node .claude/skills/verify/scripts/drive.mjs <feature-id>
//   HEADED=1 node .claude/skills/verify/scripts/drive.mjs bowling-throw   # watch it run
//
// Feature ids: join-lobby, select-game, bowling-throw, mario-kart-race.
// Each run opens a fresh host page, so each run is a new session on the relay.
// Proof lands in .claude/skills/verify/artifacts/<feature-id>/.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { PORTS, REPO, RUN_DIR, SKILL_DIR, URLS, doctor } from './instance.mjs';
import { steerCommand, stickOffsetFor } from './kart-pilot.mjs';

const require = createRequire(path.join(REPO, 'host/package.json'));
const { chromium } = require('playwright-core');

const HOST_VIEWPORT = { width: 1280, height: 800 };
const PHONE_VIEWPORT = { width: 390, height: 844 };
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

  async openHost() {
    const ctx = await this.browser.newContext({ viewport: HOST_VIEWPORT });
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

  async openPhone(name, { join = true } = {}) {
    const ctx = await this.browser.newContext({ viewport: PHONE_VIEWPORT, hasTouch: true });
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
        this.frames.push({ at: new Date().toISOString(), page: label, dir, msg });
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
  run.check('Mario Kart card is enabled', byLabel['Mario Kart']?.enabled === true);
  const unbuilt = cards.filter((c) => c.label !== 'Bowling' && c.label !== 'Mario Kart');
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

async function marioKartRace(run) {
  const phone = await lobbyWithPlayer(run, 'Ada');
  await selectGame(run, 'Mario Kart');
  await run.host.waitForSelector('.kart-layout', { timeout: 15_000 });
  await run.host.waitForSelector('.kart-pane', { timeout: 15_000 });
  run.check('host shows one kart pane for one player', (await run.host.locator('.kart-pane').count()) === 1);

  await phone.waitForSelector('#kart-stick', { timeout: 15_000 });
  const gotGo = await run.waitForFrame('phone:Ada', 'race_go');
  run.check('phone received the countdown and the go signal from the host',
    gotGo && run.frames.filter((f) => f.page === 'phone:Ada' && f.msg.type === 'race_countdown').length === 3,
    `race_go ${gotGo ? 'seen' : 'missing'}`);
  await run.capture(run.host, 'host-race-start');
  await run.capture(phone, 'phone-race-start');

  // Play the whole race: steer the stick to follow the road until the kart finishes.
  const myId = run.frames.find((f) => f.page === 'phone:Ada' && f.dir === 'in' && f.msg.type === 'joined').msg.playerId;
  const box = await phone.locator('#kart-stick').boundingBox();
  const cx = box.x + box.width / 2;
  const cy = box.y + box.height / 2;
  const radius = box.width / 2;

  const laps = [];
  const track = [];
  let seen = 0;
  let prev = null;
  let cur = null;
  let lastLap = null;
  let stuckSince = Date.now();
  let lastProgress = -1;
  const raceStart = Date.now();
  const RACE_LIMIT_MS = 180_000;

  await phone.mouse.move(cx, cy);
  await phone.mouse.down();
  try {
    while (Date.now() - raceStart < RACE_LIMIT_MS) {
      for (; seen < run.frames.length; seen++) {
        const f = run.frames[seen];
        if (f.page !== 'phone:Ada' || f.dir !== 'in' || f.msg.type !== 'race_status') continue;
        const me = f.msg.players.find((p) => p.playerId === myId);
        if (!me) continue;
        prev = cur;
        cur = { t: Date.parse(f.at), x: me.x, z: me.z, progress: me.progress, lap: me.lap, finished: me.finished };
        track.push({ t: Date.now() - raceStart, place: me.place, lap: me.lap, progress: +me.progress.toFixed(3) });
        if (me.lap !== lastLap) {
          laps.push({ lap: me.lap, atMs: Date.now() - raceStart });
          lastLap = me.lap;
        }
        if (me.progress !== lastProgress) {
          lastProgress = me.progress;
          stuckSince = Date.now();
        }
      }
      if (cur?.finished) break;
      if (Date.now() - stuckSince > 20_000) throw new Error('kart made no progress for 20s; the pilot is stuck');

      const wheel = steerCommand(prev, cur, Date.now());
      await phone.mouse.move(cx + stickOffsetFor(wheel, radius), cy);
      await phone.waitForTimeout(40);
    }
  } finally {
    await phone.mouse.up();
  }

  // The lap counter starts at 1 and steps up each time the kart completes a lap.
  run.check('lap counter went 1 → 2 → 3 while racing', laps.map((l) => l.lap).join() === '1,2,3',
    laps.map((l) => `${l.lap}@${(l.atMs / 1000).toFixed(1)}s`).join(' '));
  run.check('race_status reports the kart finished', cur?.finished === true);
  fs.writeFileSync(path.join(run.dir, 'pilot-track.json'), JSON.stringify({ laps, samples: track }, null, 2));

  const finishFrame = run.frames.find((f) => f.page === 'phone:Ada' && f.dir === 'in' && f.msg.type === 'race_finished');
  run.check('phone received race_finished', Boolean(finishFrame));
  await phone.waitForFunction(() => document.getElementById('kart-sub')?.textContent === 'Race over', null, { timeout: 10_000 });
  run.check('phone banner shows P1 for the solo finish',
    (await phone.textContent('#kart-banner')).trim() === 'P1', await phone.textContent('#kart-banner'));

  await run.host.waitForSelector('.kart-results', { timeout: 20_000 });
  const row = (await run.host.locator('.kart-results li').first().textContent()).replace(/\s+/g, ' ').trim();
  run.check('host shows the finish table with Ada timed, not DNF', row.includes('Ada') && /\d+\.\d\ds/.test(row) && !row.includes('DNF'), row);
  await run.capture(run.host, 'host-race-finish');
  await run.capture(phone, 'phone-race-finish');

  const drives = run.frames.filter((f) => f.page === 'phone:Ada' && f.dir === 'out' && f.msg.type === 'drive');
  const steered = drives.filter((f) => f.msg.steer !== 0).length;
  run.check('the stick was used during the race', steered > 100, `non-zero drive packets ${steered} of ${drives.length}`);
}

const FEATURES = {
  'join-lobby': joinLobby,
  'select-game': selectGameFeature,
  'bowling-throw': bowlingThrow,
  'mario-kart-race': marioKartRace,
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
