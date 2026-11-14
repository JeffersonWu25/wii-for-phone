// Scores a candidate: runs mechanics.test.mjs and turns per-test pass/fail into rubric points (100 total, pass bar 85).
// Usage: node src/games/kart/acceptance/score.mjs   (from host/). Each criterion's weight is split equally across its tests.
import { run } from 'node:test';
import { fileURLToPath } from 'node:url';

const WEIGHT = { R1: 15, R2: 15, R3: 15, R4: 15, R5: 15, R6: 20, R7: 5 };
const file = fileURLToPath(new URL('./mechanics.test.mjs', import.meta.url));
const results = new Map();
const stream = run({ files: [file], concurrency: false });
stream.on('test:pass', (d) => results.set(d.name, true));
stream.on('test:fail', (d) => results.set(d.name, false));
stream.on('data', () => {});
stream.on('end', () => {
  let total = 0;
  for (const [r, weight] of Object.entries(WEIGHT)) {
    const tests = [...results].filter(([n]) => n.startsWith(`${r}.`));
    const passed = tests.filter(([, ok]) => ok).length;
    const pts = tests.length ? (weight * passed) / tests.length : 0;
    total += pts;
    console.log(`${r}  ${pts.toFixed(1)} / ${weight}  (${passed}/${tests.length} tests)  ${tests.filter(([, ok]) => !ok).map(([n]) => n.split(' ')[0]).join(' ')}`);
  }
  console.log(`TOTAL ${total.toFixed(1)} / 100  ${total >= 85 ? 'PASS' : 'below the 85 bar'}`);
});
