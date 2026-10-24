// Layout check against visual-baseline/SPEC.md.
// Requires playwright-core (e.g. NODE_PATH=/path/to/node_modules).
// Usage: node check-layout.mjs [hostUrl]
// Exit 0 when all contracts pass.

import { createRequire } from 'module';
import { writeFileSync } from 'fs';

const require = createRequire(import.meta.url);
let chromium;
try {
  chromium = require('playwright-core').chromium;
} catch {
  chromium = (await import('playwright-core')).chromium;
}

const HOST = process.argv[2] || 'http://127.0.0.1:15173';
const PHONE = process.env.PHONE_URL || 'http://127.0.0.1:15174';

function pct(part, whole) {
  return (part / Math.max(whole, 1)) * 100;
}

function assert(cond, msg, failures) {
  if (!cond) failures.push(msg);
}

const browser = await chromium.launch({
  executablePath: '/usr/local/bin/google-chrome',
  headless: true,
  args: ['--use-gl=angle', '--ignore-gpu-blocklist'],
});
const host = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await host.goto(HOST, { waitUntil: 'networkidle' });
await host.waitForFunction(() => /Session:\s*\S+/.test(document.body.innerText), { timeout: 20000 });
const sessionId = (await host.locator('body').innerText()).match(/Session:\s*(\S+)/)[1];

async function join(name) {
  const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
  await page.goto(`${PHONE}/?session=${encodeURIComponent(sessionId)}`, { waitUntil: 'networkidle' });
  if (await page.locator('#btn-permission').count()) await page.click('#btn-permission');
  await page.waitForSelector('#input-name', { timeout: 15000 });
  await page.fill('#input-name', name);
  await page.click('#btn-join');
  return page;
}

await join('L1');
await host.waitForFunction(() => document.body.innerText.includes('L1'), { timeout: 15000 });
await join('L2');
await host.waitForFunction(() => document.body.innerText.includes('L2'), { timeout: 15000 });
await host.locator('button').filter({ hasText: /Select Game/i }).first().click();
await host.getByRole('button', { name: /Mario Kart/i }).click();
await host.waitForSelector('.kart-layout', { timeout: 15000 });
await host.waitForTimeout(1200);

const report = await host.evaluate(() => {
  const layout = document.querySelector('.kart-layout').getBoundingClientRect();
  const panes = [...document.querySelectorAll('.kart-pane')].map((el) => el.getBoundingClientRect());
  const items = [...document.querySelectorAll('.kart-items')].map((el) => el.getBoundingClientRect());
  const places = [...document.querySelectorAll('.kart-place')].map((el) => el.getBoundingClientRect());
  const coinlaps = [...document.querySelectorAll('.kart-coinlap')].map((el) => el.getBoundingClientRect());
  const map = document.querySelector('.kart-minimap')?.getBoundingClientRect() || null;
  return { layout, panes, items, places, coinlaps, map };
});

const failures = [];
assert(report.panes.length === 2, `expected 2 panes, got ${report.panes.length}`, failures);
assert(report.items.length === 2, `expected 2 item racks, got ${report.items.length}`, failures);
assert(report.places.length === 2, `expected 2 place badges, got ${report.places.length}`, failures);
assert(report.coinlaps.length === 2, `expected 2 coin/lap rows, got ${report.coinlaps.length}`, failures);
assert(!!report.map, 'missing shared minimap', failures);

if (report.map) {
  const cx = report.map.x + report.map.width / 2;
  const cy = report.map.y + report.map.height / 2;
  const midX = report.layout.x + report.layout.width / 2;
  const midY = report.layout.y + report.layout.height / 2;
  assert(Math.abs(cx - midX) < report.layout.width * 0.04, `minimap not horizontally centered (dx=${(cx - midX).toFixed(1)})`, failures);
  assert(Math.abs(cy - midY) < report.layout.height * 0.06, `minimap not vertically centered (dy=${(cy - midY).toFixed(1)})`, failures);
}

report.panes.forEach((pane, i) => {
  const item = report.items[i];
  const place = report.places[i];
  const coin = report.coinlaps[i];
  assert(pct(item.x - pane.x, pane.width) < 12, `pane ${i} items not top-left (x%=${pct(item.x - pane.x, pane.width).toFixed(1)})`, failures);
  assert(pct(item.y - pane.y, pane.height) < 12, `pane ${i} items not near top (y%=${pct(item.y - pane.y, pane.height).toFixed(1)})`, failures);
  assert(pct(pane.right - place.right, pane.width) < 10, `pane ${i} place not right-aligned`, failures);
  assert(pct(pane.bottom - place.bottom, pane.height) < 12, `pane ${i} place not bottom-aligned`, failures);
  assert(pct(coin.x - pane.x, pane.width) < 12, `pane ${i} coinlap not left`, failures);
  assert(pct(pane.bottom - coin.bottom, pane.height) < 14, `pane ${i} coinlap not bottom`, failures);
});

const out = { ok: failures.length === 0, failures, report };
writeFileSync(new URL('./current/layout-check.json', import.meta.url), JSON.stringify(out, null, 2));
console.log(JSON.stringify(out, null, 2));
await browser.close();
process.exit(failures.length ? 1 : 0);
