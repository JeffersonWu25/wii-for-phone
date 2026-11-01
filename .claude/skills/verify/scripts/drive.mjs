#!/usr/bin/env node
// Drive one mapped feature against the running verification instance.
//
//   node .claude/skills/verify/scripts/drive.mjs <feature-id>
//   HEADED=1 node .claude/skills/verify/scripts/drive.mjs bowling-throw   # watch it run
//
// Feature ids: join-lobby, select-game, bowling-throw.
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
  const unbuilt = cards.filter((c) => c.label !== 'Bowling');
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

const FEATURES = {
  'join-lobby': joinLobby,
  'select-game': selectGameFeature,
  'bowling-throw': bowlingThrow,
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
