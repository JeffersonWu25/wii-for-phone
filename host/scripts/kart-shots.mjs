// Screenshots named kart preview shots.
//   node host/scripts/kart-shots.mjs <baseUrl> <outDir> [shotNames...]
import { chromium } from 'playwright-core';
import fs from 'node:fs';
import path from 'node:path';
import { SHOTS } from '../src/games/kart/shots.js';

const [baseUrl, outDir, ...names] = process.argv.slice(2);
if (!baseUrl || !outDir) {
  console.error('usage: node host/scripts/kart-shots.mjs <baseUrl> <outDir> [shotNames...]');
  process.exit(2);
}
const shots = names.length ? names : Object.keys(SHOTS);
fs.mkdirSync(outDir, { recursive: true });

async function launch() {
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  } catch (err) {
    console.error(`GPU launch failed (${err.message.split('\n')[0]}), retrying with defaults`);
    return chromium.launch({ channel: 'chrome', headless: true });
  }
}

const browser = await launch();
let failed = false;
try {
  for (const name of shots) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, ignoreHTTPSErrors: true }) // the dev server serves HTTPS when certs/ exists;
    page.on('console', (m) => {
      if (m.type() === 'error') console.error(`[${name}] console error: ${m.text()}`);
    });
    page.on('pageerror', (e) => console.error(`[${name}] page error: ${e.message}`));
    await page.goto(`${baseUrl}/kart-preview.html?shot=${encodeURIComponent(name)}`);
    try {
      await page.waitForFunction(() => window.__kartReady === true, null, { timeout: 60000 });
    } catch {
      console.error(`[${name}] never became ready`);
      failed = true;
    }
    await page.waitForTimeout(500);
    const file = path.join(outDir, `${name}.png`);
    await page.screenshot({ path: file });
    console.log(file);
    await page.close();
  }
} finally {
  await browser.close();
}
process.exit(failed ? 1 : 0);
