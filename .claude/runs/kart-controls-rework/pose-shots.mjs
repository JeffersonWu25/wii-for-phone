// Shared screenshot tool for the P3 competing runs. Shoots the preview's fixed drift / boost
// poses from the same camera spots so candidates compare like for like.
//   node .claude/runs/kart-controls-rework/pose-shots.mjs <hostBaseUrl> <outDir>
// Run from a checkout root whose host/node_modules has playwright-core.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const { chromium } = createRequire(path.resolve('host/package.json'))('playwright-core');
const [base, outDir] = process.argv.slice(2);
if (!base || !outDir) {
  console.error('usage: node pose-shots.mjs <hostBaseUrl> <outDir>');
  process.exit(2);
}
const SHOTS = [
  ...[0, 1, 2, 3].map((l) => [`drift${l}-rear`, `drift=${l}&shot=driftRear`]),
  ...[0, 1, 2, 3].map((l) => [`drift${l}-quarter`, `drift=${l}&shot=driftQuarter`]),
  ['drift3-left-rear', 'drift=3&dir=-1&shot=driftRear'],
  ...[1, 2, 3].map((l) => [`boost${l}-rear`, `boost=${l}&shot=driftRear`]),
  ['drift3-chase', 'drift=3'],
  ['drift3-chase-4up', 'drift=3&views=4'],
];
fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
let failed = false;
for (const [name, q] of SHOTS) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => { failed = true; console.error(`[${name}] ${e.message}`); });
  await page.goto(`${base}/kart-preview.html?${q}`);
  await page.waitForFunction(() => window.__kartReady === true, null, { timeout: 60000 });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  if (name === 'drift3-rear') {
    await page.waitForTimeout(100);
    await page.screenshot({ path: path.join(outDir, `${name}-100ms.png`) });
  }
  await page.close();
  console.log(name);
}
await browser.close();
process.exit(failed ? 1 : 0);
