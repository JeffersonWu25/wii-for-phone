#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(__dirname, 'package.json'));
const puppeteer = require('puppeteer-core');

const SKILL = path.resolve(__dirname, '..');
const ART = path.join(SKILL, 'artifacts');
const HOST = process.env.HOST_URL || 'http://127.0.0.1:15173';
const PHONE_ORIGIN = process.env.PHONE_URL || 'http://127.0.0.1:15174';
const CHROME = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';

async function loadExpr(name, replacements = {}) {
  const mod = await import(pathToFileURL(path.join(__dirname, 'cdp', name)).href);
  let expr = mod.expression;
  if (typeof mod.expressionFor === 'function') {
    if (replacements.steer != null) expr = mod.expressionFor(replacements.steer);
    else if (replacements.itemId != null) expr = mod.expressionFor(replacements.itemId);
  } else {
    for (const [key, value] of Object.entries(replacements)) {
      expr = expr.replaceAll(`__${key}__`, value);
    }
  }
  return expr;
}

async function evalJson(page, expression) {
  return page.evaluate((code) => new Function(`return (${code})`)(), expression);
}

async function waitFor(page, fn, { timeoutMs = 30000, label = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function shotText(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const aria = await page.evaluate(() => document.body?.innerText || '');
  fs.writeFileSync(path.join(dir, `${name}.aria.txt`), aria);
}

async function shot(page, dir, name) {
  fs.mkdirSync(dir, { recursive: true });
  const aria = await page.evaluate(() => document.body?.innerText || '');
  fs.writeFileSync(path.join(dir, `${name}.aria.txt`), aria);
  const png = path.join(dir, `${name}.png`);
  try {
    await page.screenshot({ path: png, fullPage: false, captureBeyondViewport: false });
  } catch (err) {
    fs.writeFileSync(path.join(dir, `${name}.screenshot-error.txt`), String(err));
  }
  return png;
}

async function main() {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    protocolTimeout: 120000,
    args: ['--no-sandbox', '--disable-gpu', '--window-size=1280,800'],
  });
  const host = await browser.newPage();
  const phone = await browser.newPage();
  await phone.setViewport({ width: 390, height: 844 });
  await host.setViewport({ width: 1280, height: 800 });

  await host.goto(HOST, { waitUntil: 'networkidle2' });
  await waitFor(host, async () => {
    const text = await host.evaluate(() => document.body.innerText);
    return /Session:\s*[0-9a-f]{6}/i.test(text) && !/Connecting/.test(text);
  }, { label: 'host session id', timeoutMs: 20000 });

  const phoneUrl = await host.evaluate(() => {
    const text = document.body.innerText;
    const match = text.match(/https?:\/\/\S+\?session=[0-9a-f]+/i);
    if (match) return match[0];
    const session = text.match(/Session:\s*([0-9a-f]{6})/i)?.[1];
    return session ? `${location.protocol}//127.0.0.1:15174?session=${session}` : null;
  });
  if (!phoneUrl) throw new Error('no phone url on lobby');

  await phone.evaluateOnNewDocument(() => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined') {
        Object.defineProperty(DeviceMotionEvent, 'requestPermission', { value: undefined });
      }
    } catch {}
  });
  const resolvedPhone = phoneUrl.startsWith('http') ? phoneUrl : `${PHONE_ORIGIN}${phoneUrl}`;
  await phone.goto(resolvedPhone, { waitUntil: 'domcontentloaded' });

  try {
    await waitFor(phone, async () => !!(await phone.$('#input-name')), {
      label: 'phone name screen',
      timeoutMs: 20000,
    });
  } catch (err) {
    const dump = await phone.evaluate(() => document.body?.innerText || '');
    throw new Error(`${err.message}; phone text: ${dump.slice(0, 400)}`);
  }
  await phone.click('#input-name', { clickCount: 3 });
  await phone.type('#input-name', 'Verify Player');
  await phone.click('#btn-join');
  await waitFor(phone, async () => {
    const text = await phone.evaluate(() => document.body.innerText);
    return /Waiting for host to select a game/i.test(text);
  }, { label: 'phone waiting', timeoutMs: 20000 });

  await waitFor(host, async () => {
    const text = await host.evaluate(() => document.body.innerText);
    return /Verify Player/.test(text) && /Players\s*\(\s*1\s*\)/.test(text);
  }, { label: 'host player list' });

  const joinDir = path.join(ART, 'join-lobby-live');
  await shot(host, joinDir, 'host-after-join');
  await shot(phone, joinDir, 'phone-waiting');

  await host.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find((b) => /Select Game/i.test(b.textContent || ''));
    btn?.click();
  });
  await waitFor(host, async () => /Choose a Game/i.test(await host.evaluate(() => document.body.innerText)), {
    label: 'game grid',
  });
  await host.evaluate(() => {
    const buttons = [...document.querySelectorAll('button')];
    const btn = buttons.find((b) => /Mario Kart/i.test(b.textContent || '') && !/Coming Soon/i.test(b.textContent || ''));
    btn?.click();
  });
  await waitFor(host, async () => {
    const text = await host.evaluate(() => document.body.innerText);
    return /Mario Kart/i.test(text) && /\bRace\b/.test(text);
  }, { label: 'kart menu' });
  await waitFor(phone, async () => /Look at the TV/i.test(await phone.evaluate(() => document.body.innerText)), {
    label: 'phone look at tv',
  });

  await host.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find((b) => b.classList.contains('kart-primary') && /Race/i.test(b.textContent || ''));
    btn?.click();
  });
  await waitFor(phone, async () => !!(await phone.$('#kart-character-mario')), {
    label: 'character pick',
    timeoutMs: 15000,
  });
  await phone.click('#kart-character-mario');
  await phone.click('#kart-confirm');

  await waitFor(host, async () => {
    const btn = await host.$('button.kart-primary');
    if (!btn) return false;
    const label = await host.evaluate((el) => el.textContent, btn);
    const disabled = await host.evaluate((el) => el.disabled, btn);
    return /Continue/i.test(label) && !disabled;
  }, { label: 'continue characters', timeoutMs: 20000 });
  await host.evaluate(() => {
    const btn = [...document.querySelectorAll('button.kart-primary')].find((b) => /Continue/i.test(b.textContent || ''));
    btn?.click();
  });

  await waitFor(host, async () => /Luigi Circuit|Continue/i.test(await host.evaluate(() => document.body.innerText)), {
    label: 'track stage',
  });
  await host.evaluate(() => {
    const btn = [...document.querySelectorAll('button.kart-primary')].find((b) => /Continue/i.test(b.textContent || ''));
    btn?.click();
  });

  await waitFor(phone, async () => !!(await phone.$('#kart-ready-toggle')), {
    label: 'ready toggle',
    timeoutMs: 20000,
  });
  await phone.click('#kart-ready-toggle');

  await waitFor(host, async () => {
    const btn = await host.$('button.kart-primary');
    if (!btn) return false;
    const label = await host.evaluate((el) => el.textContent, btn);
    const disabled = await host.evaluate((el) => el.disabled, btn);
    return /Start Race/i.test(label) && !disabled;
  }, { label: 'start race enabled', timeoutMs: 20000 });
  await host.evaluate(() => {
    const btn = [...document.querySelectorAll('button.kart-primary')].find((b) => /Start Race/i.test(b.textContent || ''));
    btn?.click();
  });

  await waitFor(phone, async () => !!(await phone.$('#kart-stick')), {
    label: 'race pad',
    timeoutMs: 20000,
  });

  const findRace = await loadExpr('kart-find-race.js');
  await waitFor(host, async () => {
    const view = await evalJson(host, findRace);
    return view && view.phase === 'racing';
  }, { label: 'racing phase', timeoutMs: 20000 });

  const lapDir = path.join(ART, 'complete-lap');
  fs.mkdirSync(lapDir, { recursive: true });
  const desiredExpr = await loadExpr('kart-desired-steer.js');
  const setStickMod = await import(pathToFileURL(path.join(__dirname, 'cdp', 'kart-set-stick.js')).href);
  const deadline = Date.now() + 120000;
  let last = null;
  while (Date.now() < deadline) {
    last = await evalJson(host, desiredExpr);
    if (last?.error) throw new Error(`steer: ${last.error}`);
    if ((last.completedLaps ?? 0) >= 1) break;
    const stickExpr = setStickMod.expressionFor(last.steer ?? 0);
    const stick = await evalJson(phone, stickExpr);
    if (stick?.error) throw new Error(`stick: ${stick.error}`);
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!last || (last.completedLaps ?? 0) < 1) {
    throw new Error(`lap not completed: ${JSON.stringify(last)}`);
  }
  fs.writeFileSync(path.join(lapDir, 'race.json'), JSON.stringify(last, null, 2));
  await waitFor(phone, async () => {
    const text = await phone.evaluate(() => document.querySelector('#kart-lap')?.textContent || '');
    return /Lap\s*2\s*\/\s*3/.test(text);
  }, { label: 'phone lap 2 label', timeoutMs: 5000 });
  await shot(phone, lapDir, 'phone-lap');
  await shotText(host, lapDir, 'host-lap');
  const hostLap = await host.evaluate(() => document.querySelector('.kart-lap-count')?.textContent || '');
  fs.writeFileSync(path.join(lapDir, 'host-lap-count.txt'), hostLap);
  console.log('complete-lap OK', last, 'hostLap', hostLap);

  const itemsDir = path.join(ART, 'use-kart-items');
  fs.mkdirSync(itemsDir, { recursive: true });
  const grantMod = await import(pathToFileURL(path.join(__dirname, 'cdp', 'kart-grant-item.js')).href);
  const useExpr = await loadExpr('kart-use-item.js');
  const catalog = ['mushroom', 'banana', 'green_shell', 'star'];
  const labels = {
    mushroom: 'Mushroom',
    banana: 'Banana',
    green_shell: 'Green Shell',
    star: 'Star',
  };
  for (const id of catalog) {
    const grant = await evalJson(host, grantMod.expressionFor(id));
    if (!grant?.ok) throw new Error(`grant ${id}: ${JSON.stringify(grant)}`);
    await waitFor(phone, async () => {
      return phone.evaluate((label) => {
        const btn = document.querySelector('#kart-item');
        return !!btn && btn.classList.contains('is-armed') && btn.textContent.includes(label);
      }, labels[id]);
    }, { label: `armed ${id}`, timeoutMs: 5000 });
    await shot(phone, itemsDir, `${id}-armed-phone`);
    await shotText(host, itemsDir, `${id}-armed-host`);
    const beforePresses = (await evalJson(host, findRace)).itemPresses || 0;
    const used = await evalJson(phone, useExpr);
    if (used?.error) throw new Error(`use ${id}: ${JSON.stringify(used)}`);
    let after = null;
    let sawShell = false;
    let sawBanana = false;
    for (let i = 0; i < 40; i++) {
      after = await evalJson(host, findRace);
      if ((after.entities || []).includes('shell')) sawShell = true;
      if ((after.entities || []).includes('banana')) sawBanana = true;
      if (id === 'mushroom' && after.effect === 'boost') break;
      if (id === 'star' && after.effect === 'star') break;
      if (id === 'banana' && sawBanana) break;
      if (id === 'green_shell' && sawShell) break;
      await new Promise((r) => setTimeout(r, 40));
    }
    fs.writeFileSync(
      path.join(itemsDir, `${id}-after.json`),
      JSON.stringify({ used, after, sawShell, sawBanana, beforePresses }, null, 2),
    );
    if (id === 'mushroom' && after.effect !== 'boost') {
      throw new Error(`mushroom failed: ${JSON.stringify(after)}`);
    }
    if (id === 'star' && after.effect !== 'star') {
      throw new Error(`star failed: ${JSON.stringify(after)}`);
    }
    if (id === 'banana' && !sawBanana) {
      throw new Error(`banana missing: ${JSON.stringify(after)}`);
    }
    if (id === 'green_shell' && !sawShell) {
      throw new Error(`shell missing: ${JSON.stringify({ after, used, beforePresses })}`);
    }
    if (!((after.itemPresses || 0) > beforePresses)) {
      throw new Error(`itemPresses did not rise for ${id}: ${beforePresses} -> ${after.itemPresses}`);
    }
    console.log(`item ${id} OK`, after.effect, after.entities, `presses ${beforePresses}->${after.itemPresses}`);
    await new Promise((r) => setTimeout(r, 600));
  }

  console.log('ALL OK');
  await browser.close();
}

main().catch(async (err) => {
  console.error(err);
  process.exitCode = 1;
});
