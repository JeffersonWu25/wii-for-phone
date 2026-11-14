// Farmhouse Straight (barn with clover emblem, silo, cream farmhouse, rail fences, daisies) and Cow Crossing's pasture fences.
import { Batch, mats, propGroup, section, xform } from '../coconut/kit.js';
import { fence } from '../coconut/parts.js';
import { barn, farmhouse, hayBale, silo } from './buildings.js';
import { flora } from './flora.js';
import { faceSide, ground, limitAt, tree } from './kit.js';

// Stamp a building built in local space (front = +x) beside the road: `lat` is the centre's lateral from the road axis.
function stand(batch, track, fill, s, lat, extraYaw = 0) {
  const p = ground(track, s, lat);
  const tmp = new Batch();
  fill(tmp);
  const m = xform(p.x, p.y - 0.15, p.z, faceSide(p.h, lat < 0 ? 1 : -1) + extraYaw);
  for (const geo of tmp.geos) batch.add(geo, m, null);
  return p;
}

export function buildFarmhouse(ctx, sec) {
  const { track } = ctx;
  const g = section('farmhouse');
  const fb = new Batch();
  for (const side of [-1, 1]) fence(track, fb, side, 2, sec.s1 - 2, 'timber', { off: 0.5 });
  g.add(propGroup('fence', [fb.mesh(mats.col(), { shadow: true })]));

  const bb = new Batch();
  const LAT = limitAt(track, 20, -1);
  stand(bb, track, barn, 20, -(LAT + 13));
  stand(bb, track, silo, 2, -(LAT + 12));
  stand(bb, track, farmhouse, 68, -(LAT + 11));
  for (const [s, l, y] of [[34, -(LAT + 3.6), 0.2], [36.5, -(LAT + 4.4), 0.1], [-4, -(LAT + 4), 0.3]]) {
    const p = ground(track, s, l);
    const tmp = new Batch();
    hayBale(tmp, 0, 0, 0, 0.5);
    for (const geo of tmp.geos) bb.add(geo, xform(p.x, p.y, p.z, y), null);
  }
  // Two big trees framing the house, one on the far side.
  const th = new Batch();
  for (const [s, l, sc] of [[88, -(LAT + 12), 1.9], [48, -(LAT + 6), 1.4], [30, LAT + 16, 1.8]]) {
    const p = ground(track, s, l);
    tree(th, p.x, p.y - 0.2, p.z, sc, s);
  }
  g.add(propGroup('farmhouse', [bb.mesh(mats.col(), { shadow: true })]), propGroup('bigTrees', [th.mesh(mats.col(), { shadow: true })]));

  flora(ctx, g, 4, sec.s1, { trees: 5, bushes: 6, flowers: 30, seed: 1, treeLats: [20, 80], skip: (s, lat) => s < 105 && lat < -limitAt(track, s, -1) - 3 && lat > -limitAt(track, s, -1) - 40 });
  return g;
}

export function buildCows(ctx, sec) {
  const { track } = ctx;
  const g = section('cows');
  const fb = new Batch();
  for (const side of [-1, 1]) fence(track, fb, side, sec.s0 + 4, track.length - 1, 'timber', { off: 0.5 });
  g.add(propGroup('fence', [fb.mesh(mats.col(), { shadow: true })]));
  flora(ctx, g, sec.s0, track.length, { trees: 7, bushes: 5, flowers: 26, rocks: 2, seed: 7, treeLats: [14, 70] });
  return g;
}
