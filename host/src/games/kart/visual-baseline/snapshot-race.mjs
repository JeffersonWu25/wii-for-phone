#!/usr/bin/env node
/**
 * Capture a 2-player race screenshot for visual before/after.
 * Walks lobby → Mario Kart → character pick → track → ready → Start Race.
 *
 * Usage: node snapshot-race.mjs [hostUrl] [outPng]
 * Env: PHONE_URL (default http://127.0.0.1:15174)
 */
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { chromium } from 'playwright-core';

const HOST = process.argv[2] || 'http://127.0.0.1:15173';
const OUT = resolve(
  process.argv[3] ||
    new URL('./current/race-2p-after.png', import.meta.url).pathname,
);
const PHONE = process.env.PHONE_URL || 'http://127.0.0.1:15174';
const WAIT_MS = Number(process.env.SNAPSHOT_WAIT_MS || 2500);

mkdirSync(dirname(OUT), { recursive: true });

async function waitFor(page, fn, { timeoutMs = 20000, label = 'condition' } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (await fn()) return;
    await page.waitForTimeout(150);
  }
  throw new Error(`timeout waiting for ${label}`);
}

async function clickHostText(host, re) {
  await host.evaluate((pattern) => {
    const rx = new RegExp(pattern, 'i');
    const btn = [...document.querySelectorAll('button')].find((b) =>
      rx.test(b.textContent || ''),
    );
    if (!btn) throw new Error(`no button matching /${pattern}/i`);
    btn.click();
  }, re.source || re);
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist', '--enable-webgl', '--no-sandbox'],
});

const host = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await host.goto(HOST, { waitUntil: 'networkidle' });
await waitFor(
  host,
  async () => {
    const text = await host.evaluate(() => document.body.innerText);
    return /Session:\s*\S+/.test(text) && !/Connecting/.test(text);
  },
  { label: 'host session' },
);

const sessionId = (await host.locator('body').innerText()).match(/Session:\s*(\S+)/)[1];

async function join(name) {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.addInitScript(() => {
    try {
      if (typeof DeviceMotionEvent !== 'undefined') {
        Object.defineProperty(DeviceMotionEvent, 'requestPermission', {
          value: undefined,
        });
      }
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${PHONE}/?session=${encodeURIComponent(sessionId)}`, {
    waitUntil: 'networkidle',
  });
  if (await page.locator('#btn-permission').count()) {
    await page.click('#btn-permission').catch(() => {});
  }
  await page.waitForSelector('#input-name', { timeout: 15000 });
  await page.fill('#input-name', name);
  await page.click('#btn-join');
  await waitFor(
    page,
    async () => /Waiting for host/i.test(await page.evaluate(() => document.body.innerText)),
    { label: `${name} waiting` },
  );
  return page;
}

const phone1 = await join('Snap1');
await waitFor(
  host,
  async () => /Snap1/.test(await host.evaluate(() => document.body.innerText)),
  { label: 'host sees Snap1' },
);
const phone2 = await join('Snap2');
await waitFor(
  host,
  async () => /Snap2/.test(await host.evaluate(() => document.body.innerText)),
  { label: 'host sees Snap2' },
);

await clickHostText(host, /Select Game/);
await waitFor(
  host,
  async () => /Choose a Game/i.test(await host.evaluate(() => document.body.innerText)),
  { label: 'game grid' },
);
await host.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(
    (b) => /Mario Kart/i.test(b.textContent || '') && !/Coming Soon/i.test(b.textContent || ''),
  );
  btn?.click();
});
await waitFor(
  host,
  async () => {
    const text = await host.evaluate(() => document.body.innerText);
    return /Mario Kart/i.test(text) && /\bRace\b/.test(text);
  },
  { label: 'kart menu' },
);

await host.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(
    (b) => b.classList.contains('kart-primary') && /Race/i.test(b.textContent || ''),
  );
  btn?.click();
});

await waitFor(phone1, async () => !!(await phone1.$('#kart-character-mario')), {
  label: 'p1 character pick',
});
await waitFor(phone2, async () => !!(await phone2.$('#kart-character-luigi')), {
  label: 'p2 character pick',
});
await phone1.click('#kart-character-mario');
await phone1.click('#kart-confirm');
await phone2.click('#kart-character-luigi');
await phone2.click('#kart-confirm');

await waitFor(
  host,
  async () => {
    const btn = await host.$('button.kart-primary');
    if (!btn) return false;
    const label = await host.evaluate((el) => el.textContent, btn);
    const disabled = await host.evaluate((el) => el.disabled, btn);
    return /Continue/i.test(label) && !disabled;
  },
  { label: 'continue characters' },
);
await host.evaluate(() => {
  const btn = [...document.querySelectorAll('button.kart-primary')].find((b) =>
    /Continue/i.test(b.textContent || ''),
  );
  btn?.click();
});

await waitFor(
  host,
  async () => /Luigi Circuit|Continue/i.test(await host.evaluate(() => document.body.innerText)),
  { label: 'track stage' },
);
await host.evaluate(() => {
  const btn = [...document.querySelectorAll('button.kart-primary')].find((b) =>
    /Continue/i.test(b.textContent || ''),
  );
  btn?.click();
});

await waitFor(phone1, async () => !!(await phone1.$('#kart-ready-toggle')), {
  label: 'p1 ready',
});
await waitFor(phone2, async () => !!(await phone2.$('#kart-ready-toggle')), {
  label: 'p2 ready',
});
await phone1.click('#kart-ready-toggle');
await phone2.click('#kart-ready-toggle');

await waitFor(
  host,
  async () => {
    const btn = await host.$('button.kart-primary');
    if (!btn) return false;
    const label = await host.evaluate((el) => el.textContent, btn);
    const disabled = await host.evaluate((el) => el.disabled, btn);
    return /Start Race/i.test(label) && !disabled;
  },
  { label: 'start race enabled' },
);
await host.evaluate(() => {
  const btn = [...document.querySelectorAll('button.kart-primary')].find((b) =>
    /Start Race/i.test(b.textContent || ''),
  );
  btn?.click();
});

await waitFor(
  host,
  async () => !!(await host.$('.kart-layout, .kart-canvas canvas')),
  { label: 'race layout', timeoutMs: 25000 },
);
await host.waitForTimeout(WAIT_MS);

const err = await host.evaluate(() => window.__kartError || null);
if (err) {
  console.error('kart runtime error:', err);
  await browser.close();
  process.exit(2);
}

await host.screenshot({ path: OUT, type: 'png' });
console.log(`wrote ${OUT}`);
await browser.close();
