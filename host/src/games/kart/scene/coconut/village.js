// Coconut Village: arch over the road, tiki huts and striped stalls on the left, bunting, umbrellas and a wooden fence by the sea.
import * as THREE from 'three';
import { Batch, COL, mats, place, propGroup, section, xform, rng, lodAt, rowsOf } from './kit.js';
import { archGeometry, hutGeometry, stallGeometry, umbrellaGeometry, loungerGeometry } from './models.js';
import { fence, beach, palmProp, palmGroup, scatter, bar, bunting } from './parts.js';

const merge = (a, b) => {
  a.geos.push(...b.geos);
  return a;
};
const LAMP = { off: new THREE.Color(0x3a0d0d), red: new THREE.Color(0xff2a1a), green: new THREE.Color(0x2aff55) };
const FLAGS = [0xe63a2e, 0xffc933, 0x2f9be0, 0x58c24a, 0xff8a1f, 0xfff5e0];

export function buildVillage(ctx) {
  const { track, isl } = ctx;
  const g = section('village');
  const rand = rng(101);
  const onGround = (s, lat) => {
    const p = place(track, s, lat);
    return { ...p, y: isl.heightAt(p.x, p.z) };
  };

  // Arch
  const arch = archGeometry(13.6);
  const a = place(track, 46, 0);
  const am = xform(a.x, a.y, a.z, -a.h);
  const ab = new Batch().add(arch.col, am, null);
  // Countdown lamps: one instanced mesh of five discs on the arch's -x face, colours driven by setStartLights.
  const lamps = new THREE.InstancedMesh(new THREE.CircleGeometry(0.8, 20), new THREE.MeshBasicMaterial(), 5);
  lamps.frustumCulled = false;
  for (let i = 0; i < 5; i++) lamps.setMatrixAt(i, am.clone().multiply(xform(-0.9, 11.6, (i - 2) * 2.2, -Math.PI / 2)));
  ctx.setStartLights = (n) => {
    for (let i = 0; i < 5; i++) {
      const lit = n === 'go' || (typeof n === 'number' && i < n);
      lamps.setColorAt(i, LAMP[lit ? (n === 'go' ? 'green' : 'red') : 'off']);
    }
    lamps.instanceColor.needsUpdate = true;
  };
  ctx.setStartLights(null);
  g.add(propGroup('arch', [ab.add(arch.sign, am, null).mesh(mats.atlas(), { shadow: true }), lamps]));

  // Huts and stalls along the left, fronts toward the road.
  const hutC = new Batch();
  const hutT = new Batch();
  const stC = new Batch();
  const stA = new Batch();
  const row = [
    ['h', 9, 0], ['s', 18.5, 0], ['s', 26.5, 1], ['h', 36, 1], ['s', 61, 2], ['s', 69, 0], ['h', 79, 0], ['s', 88, 3], ['s', 96, 1], ['h', 106, 1],
  ];
  const hutGeo = [hutGeometry(0), hutGeometry(1)];
  const stallGeo = [0, 1, 2, 3].map(stallGeometry);
  for (const [kind, s, v] of row) {
    const p = onGround(s, -29);
    const m = xform(p.x, p.y, p.z, -p.h);
    if (kind === 'h') {
      hutC.add(hutGeo[v % 2].col, m, null);
      hutT.add(hutGeo[v % 2].thatch, m, null);
    } else {
      stC.add(stallGeo[v].col, m, null);
      stA.add(stallGeo[v].awning, m, null);
    }
  }
  const mid = onGround(60, -31);
  g.add(lodAt(ctx, propGroup('hut', [merge(hutC, hutT).mesh(mats.atlas(), { shadow: true })]), mid.x, mid.z, 380));
  g.add(lodAt(ctx, propGroup('stall', [merge(stC, stA).mesh(mats.atlas(), { shadow: true })]), mid.x, mid.z, 380));

  // Bunting: masts both sides, strings along them and across the road.
  const bB = new Batch();
  const masts = [];
  for (let s = 6; s <= 112; s += 15) {
    for (const side of [-1, 1]) {
      const p = onGround(s, side * 25.4);
      masts.push(p);
      bar(bB, [p.x, p.y, p.z], [p.x, p.y + 7.4, p.z], 0.11, COL.woodDark, 6);
      bB.add(new THREE.SphereGeometry(0.2, 6, 5), xform(p.x, p.y + 7.5, p.z), 0xffd23a);
    }
  }
  const top = (p) => [p.x, p.y + 7.2, p.z];
  for (let i = 0; i + 2 < masts.length; i += 2) {
    bunting(bB, top(masts[i]), top(masts[i + 2]), 0.9, FLAGS, 1.0, i + 1);
    bunting(bB, top(masts[i + 1]), top(masts[i + 3] ?? masts[i + 1]), 0.9, FLAGS, 1.0, i + 51);
  }
  for (const k of [2, 6]) bunting(bB, top(masts[k * 2]), top(masts[k * 2 + 1]), 3.4, FLAGS, 1.05, k + 90);
  const pa = a;
  bunting(bB, [pa.x + pa.f.rx * -13.6, pa.y + 11.4, pa.z + pa.f.rz * -13.6], top(masts[6]), 1.4, FLAGS, 1.0, 7);
  bunting(bB, [pa.x + pa.f.rx * 13.6, pa.y + 11.4, pa.z + pa.f.rz * 13.6], top(masts[7]), 1.4, FLAGS, 1.0, 8);
  g.add(lodAt(ctx, propGroup('bunting', [bB.mesh(mats.col())]), mid.x, mid.z, 420));

  // Fence along both limits, start straight and the grid apron behind the line.
  const fB = new Batch();
  for (const side of [-1, 1]) fence(track, fB, side, 0, 120, 'post');
  fence(track, fB, 1, 1062, 1100, 'post');
  g.add(lodAt(ctx, propGroup('fence', [fB.mesh(mats.col(), { shadow: true })]), mid.x, mid.z, 380));

  // Umbrellas, loungers and a few palms on the beach side.
  const uB = new Batch();
  const colors = [[0xe63a2e, 0xfff5e0], [0xffc933, 0xfff5e0], [0x2f9be0, 0xfff5e0], [0xff7a1f, 0xfff5e0]];
  [[14, 33], [22, 38], [30, 31], [66, 34], [74, 39], [84, 32], [94, 37], [104, 33]].forEach(([s, lat], i) => {
    const p = onGround(s, lat);
    const [c1, c2] = colors[i % colors.length];
    uB.add(umbrellaGeometry(c1, c2), xform(p.x, p.y, p.z, rand() * 6), null);
    uB.add(loungerGeometry([0x2f9be0, 0xff8a1f, 0xffd23a][i % 3]), xform(p.x + 1.6, p.y, p.z + 0.6, -p.h + 0.3), null);
  });
  g.add(lodAt(ctx, propGroup('umbrella', [uB.mesh(mats.col(), { shadow: true })]), mid.x, mid.z, 300));

  // Palms: behind the huts, between them and out on the beach.
  const spots = [
    ...scatter(track, isl, -1, 0, 120, { n: 26, lats: [12, 22], seed: 3 }),
    ...scatter(track, isl, 1, 0, 120, { n: 14, lats: [8, 20], seed: 4 }),
    ...scatter(track, isl, -1, 1040, 1100, { n: 5, lats: [12, 20], seed: 5 }),
    ...scatter(track, isl, 1, 1040, 1100, { n: 4, lats: [8, 16], seed: 6 }),
  ];
  g.add(palmProp(spots, 90));

  // Beaches: sandy forecourt behind the huts and the sea-side strip.
  const bC = new Batch();
  bC.add(beach(track, isl, 1, -40, 120), null, null);
  bC.add(beach(track, isl, -1, -40, 120), null, null);
  g.add(propGroup('beach', [bC.mesh(mats.sand(), { receive: true })]));
  return g;
}
