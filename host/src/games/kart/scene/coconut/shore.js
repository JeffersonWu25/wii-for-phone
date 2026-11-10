// Sunshine Bend (beach, sea fence, sailboat) and Pelican Pier (plank deck, chunky posts, rope rails, rocky islets).
import * as THREE from 'three';
import { Batch, COL, SEA_LEVEL, mats, place, propGroup, section, xform, rng, lodAt, rowsOf, sweep } from './kit.js';
import { sailboatGeometry, rockGeometry, cyl, box } from './models.js';
import { fence, beach, palmProp, palmGroup, scatter } from './parts.js';

export function buildSunshine(ctx, sec) {
  const { track, isl } = ctx;
  const g = section('sunshine');
  const c = place(track, (sec.s0 + sec.s1) / 2, 30);

  const sand = new Batch();
  sand.add(beach(track, isl, 1, sec.s0 - 6, sec.s1 + 4), null, null);
  sand.add(beach(track, isl, -1, sec.s0 - 6, sec.s1 + 4), null, null);
  g.add(propGroup('sand', [sand.mesh(mats.sand(), { receive: true })]));

  const fB = new Batch();
  fence(track, fB, 1, sec.s0, sec.s1, 'post');
  fence(track, fB, -1, sec.s0, sec.s1, 'post');
  g.add(lodAt(ctx, propGroup('postFence', [fB.mesh(mats.col(), { shadow: true })]), c.x, c.z, 420));

  const bB = new Batch();
  const boats = [[165, 58, 0.9], [196, 95, -0.4], [140, 120, 2.2]];
  boats.forEach(([s, lat, yaw], i) => {
    const p = place(track, s, lat);
    bB.add(sailboatGeometry(), xform(p.x, SEA_LEVEL + 0.5, p.z, yaw, i ? 0.7 : 1), null);
  });
  g.add(propGroup('sailboat', [bB.mesh(mats.col(), { shadow: true })]));

  const spots = [
    ...scatter(track, isl, 1, sec.s0, sec.s1, { n: 16, lats: [3, 11], seed: 12, scale: [0.9, 1.4] }),
    ...scatter(track, isl, -1, sec.s0, sec.s1, { n: 24, lats: [4, 18], seed: 13 }),
  ];
  g.add(palmProp(spots, 90));
  return g;
}

export function buildPier(ctx, sec) {
  const { track, isl } = ctx;
  const g = section('pier');
  const { s0, s1 } = sec;
  const rows = rowsOf(track, s0, s1, 1);
  const mid = place(track, (s0 + s1) / 2, 0);

  // Deck: planks across the road plus a slab under it. One sweep follows every curve and grade.
  const E = 0.5;
  const top = sweep(rows, (row) => {
    const w = row.hw + E;
    const v = row.sw / 4;
    return [[{ lat: -w, dy: 0.05, u: -w / 4 + 1, v, c: 0xffffff }, { lat: w, dy: 0.05, u: w / 4 + 1, v, c: 0xffffff }]];
  });
  const under = sweep(rows, (row) => {
    const w = row.hw + E;
    return [[{ lat: -w, dy: 0.05, c: 0xc89358 }, { lat: -w - 0.1, dy: -0.6, c: COL.woodDark }, { lat: w + 0.1, dy: -0.6, c: COL.woodDark }, { lat: w, dy: 0.05, c: 0xc89358 }]];
  });
  const woodB = new Batch().add(top, null, null);
  const slab = new Batch().add(under, null, null);
  woodB.geos.push(...slab.geos);
  g.add(propGroup('deck', [woodB.mesh(mats.wood(), { receive: true })]));

  // Posts: chunky capped posts with rope rails, piles down to the sea floor and cross beams.
  const posts = new Batch();
  const rope = new Batch();
  for (const side of [-1, 1]) fence(track, rope, side, s0, s1, 'rope', { off: -0.15, posts });
  for (let s = s0 + 2; s < s1; s += 8) {
    const r = rowsOf(track, s, s, 1)[0];
    for (const side of [-1, 1]) {
      const [x, y, z] = r.at(side * (r.hw - 0.2));
      posts.add(cyl(0.34, 0.4, y + 8, 8), xform(x, (y - 8) / 2 + 0.0, z), 0x6f4524);
    }
    const [xa, ya, za] = r.at(0, -0.9);
    posts.add(box(r.hw * 2 + 0.6, 0.35, 0.5), xform(xa, ya, za, -r.h + Math.PI / 2), 0x5f3b1c);
  }
  g.add(lodAt(ctx, propGroup('posts', [posts.mesh(mats.col(), { shadow: true })]), mid.x, mid.z, 400));
  g.add(lodAt(ctx, propGroup('ropeRail', [rope.mesh(mats.col(), { shadow: true })]), mid.x, mid.z, 400));

  // Rocky islets and sea stacks off both sides, some topped with palms.
  const rB = new Batch();
  const r = rng(77);
  const palmSpots = [];
  const spots = [[246, -44, 1.0], [262, 52, 1.5], [282, -74, 1.9], [296, 40, 0.8], [318, -52, 1.2], [330, 86, 2.3], [240, 96, 2.0], [302, -110, 2.6], [270, 130, 2.8], [346, -96, 1.7]];
  spots.forEach(([s, lat, k], i) => {
    const p = place(track, s, lat);
    const geo = rockGeometry(31 + i, { rTop: 2.4 * k, rBot: 4.6 * k, h: 5 + 3.5 * k + r() * 3, seg: 9 });
    rB.add(geo, xform(p.x, SEA_LEVEL - 1.5, p.z, r() * 6.28), null);
    const next = rockGeometry(61 + i, { rTop: 1.2 * k, rBot: 2.4 * k, h: 3 + 2 * k, seg: 7 });
    rB.add(next, xform(p.x + 3.5 * k, SEA_LEVEL - 1.5, p.z + 2 * k, r() * 6.28), null);
    palmSpots.push({ x: p.x, y: SEA_LEVEL - 1.5 + 5 + 3.5 * k, z: p.z, ry: r() * 6, sc: 1.1, tx: 0.05, tz: 0 });
  });
  const isletPalms = palmGroup(palmSpots, 90);
  isletPalms.name = 'prop:palms';
  g.add(propGroup('rocks', [rB.mesh(mats.rock(), { shadow: true }), isletPalms]));
  return g;
}

