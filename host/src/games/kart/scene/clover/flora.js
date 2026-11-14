// Planting along a stretch of road: trees, bushes and flower clumps scattered clear of every road, culled by cell.
import { mats, xform } from '../coconut/kit.js';
import { CL, bush, cells, clump, scatter, tree } from './kit.js';
import { rockGeometry } from '../coconut/models.js';

const WILD = [[CL.white, CL.yellow], [CL.white, CL.yellow], [CL.white, CL.yellow], [0xf06fa0, CL.yellow], [CL.yellow, 0xc97a1a], [0xa58bf0, CL.yellow]];

// opts: trees/bushes/flowers/rocks counts per side, treeLats/flowerLats = metres beyond the road limit (negative = on the verge),
// skip(s, lat) filters spots. Everything is deterministic from `seed`.
export function flora(ctx, g, s0, s1, { trees = 0, bushes = 0, flowers = 0, rocks = 0, seed = 1, treeLats = [8, 60], flowerLats = [-9, 12], skip, sides = [-1, 1], daisyOnly = false } = {}) {
  const { track } = ctx;
  const tc = cells(90);
  const bc = cells(70);
  const fc = cells(50);
  const rc = cells(90);
  sides.forEach((side, k) => {
    const sd = seed * 10 + k;
    for (const p of scatter(track, side, s0, s1, { n: trees, lats: treeLats, seed: sd + 1, margin: 6, skip })) tree(tc.batchAt(p.x, p.z), p.x, p.y - 0.2, p.z, 0.9 + p.r * 0.8, Math.floor(p.r2 * 99));
    for (const p of scatter(track, side, s0, s1, { n: bushes, lats: [3, 30], seed: sd + 2, margin: 3, skip })) bush(bc.batchAt(p.x, p.z), p.x, p.y - 0.1, p.z, 0.8 + p.r * 0.7, Math.floor(p.r2 * 99));
    for (const p of scatter(track, side, s0, s1, { n: flowers, lats: flowerLats, seed: sd + 3, margin: -14, skip })) {
      const [petal, centre] = daisyOnly ? WILD[0] : WILD[Math.floor(p.r2 * WILD.length)];
      clump(fc.batchAt(p.x, p.z), p.x, p.y, p.z, p.r, petal, centre, 3 + Math.floor(p.r * 3), 1.4 + p.r);
    }
    for (const p of scatter(track, side, s0, s1, { n: rocks, lats: [3, 26], seed: sd + 4, margin: 3, skip })) {
      rc.batchAt(p.x, p.z).add(rockGeometry(Math.floor(p.r2 * 90), { rTop: 0.8 + p.r, rBot: 1.5 + p.r * 1.3, h: 1 + p.r * 1.4, seg: 7, rows: 2, cap: false, tone: 0xb3ab9d }), xform(p.x, p.y - 0.3, p.z, p.r * 6), null);
    }
  });
  const col = mats.col();
  g.add(...tc.groups('trees', col), ...bc.groups('bushes', col), ...fc.groups('flowers', col), ...rc.groups('rocks', col));
}
