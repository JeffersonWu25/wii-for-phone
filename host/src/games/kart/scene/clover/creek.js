// Creek Crossing: a creek cut into the terrain (the ground builder sees a track proxy with the channel carved out), flowing water,
// a plank bridge with railings and piles over it, rocks and willows on the banks.
import * as THREE from 'three';
import { Batch, mats, propGroup, rowsOf, section, sweep, xform } from '../coconut/kit.js';
import { box, cyl, rockGeometry } from '../coconut/models.js';
import { fence, rect } from '../coconut/parts.js';
import { canvasTex } from '../textures.js';
import { flora } from './flora.js';
import { CL, cells, ground, tree } from './kit.js';

const HALF = 6.5; // water half-width
const BANK = 7; // extra metres of sloping bank
const DEPTH = 3.2;
const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));

// Creek centreline in world space: crosses the road at the bridge's mid point along the road's right axis, with a gentle meander.
export function creekPath(track) {
  const { s0, s1 } = track.pieceRange('bridge');
  const f = track.frameAt((s0 + s1) / 2);
  const along = (u) => ({ x: f.x + f.rx * u + f.fx * Math.sin(u * 0.045) * 7, z: f.z + f.rz * u + f.fz * Math.sin(u * 0.045) * 7, u });
  return { f, at: along, from: -105, to: 62 };
}

// Terrain with the creek carved in. Returns a track proxy for buildGround plus the sampler.
export function carveCreek(track) {
  const path = creekPath(track);
  const pts = Array.from({ length: 90 }, (_, i) => path.at(path.from + ((path.to - path.from) * i) / 89));
  const dist = (x, z) => {
    let best = Infinity;
    let u = 0;
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz)));
      const d = Math.hypot(x - a.x - dx * t, z - a.z - dz * t);
      if (d < best) {
        best = d;
        u = a.u + (b.u - a.u) * t;
      }
    }
    return { d: best, u };
  };
  const orig = track.terrainHeight;
  const depthAt = (x, z) => {
    const { d, u } = dist(x, z);
    if (d > HALF + BANK) return 0;
    const ends = smooth((u - path.from) / 25) * smooth((path.to - u) / 25);
    return DEPTH * ends * (1 - smooth((d - HALF * 0.55) / (HALF * 0.45 + BANK)));
  };
  const proxy = Object.create(track);
  proxy.terrainHeight = (x, z) => orig(x, z) - depthAt(x, z);
  return { proxy, pts, orig, depthAt };
}

const waterTex = () =>
  canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = '#3fa9e0';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    for (let i = 0; i < 22; i++) {
      const x = ((i * 53) % w) | 0;
      const y = ((i * 97) % h) | 0;
      ctx.beginPath();
      ctx.ellipse(x, y, 4 + (i % 4) * 3, 1.6, 0, 0, 6.28);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(x, y - h, 4 + (i % 4) * 3, 1.6, 0, 0, 6.28);
      ctx.fill();
    }
    ctx.fillStyle = 'rgba(20,90,170,0.22)';
    for (let i = 0; i < 8; i++) ctx.fillRect(((i * 37) % w) | 0, 0, 3, h);
  }, { repeat: true });

export function buildCreek(ctx, sec) {
  const { track } = ctx;
  const g = section('creek');
  const { pts, orig } = ctx.creek;
  const bridge = track.pieceRange('bridge');
  const roadY = track.heightAt((bridge.s0 + bridge.s1) / 2, 0);

  // Water ribbon: v along the flow; surface follows the original ground minus 1.7 m, but never above the bridge's underside.
  const pos = [];
  const uv = [];
  const idx = [];
  pts.forEach((p, i) => {
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const tx = next.x - prev.x;
    const tz = next.z - prev.z;
    const l = Math.hypot(tx, tz);
    const rx = -tz / l;
    const rz = tx / l;
    const y = Math.min(orig(p.x, p.z) - 1.7, roadY - 1.7);
    for (const sgn of [-1, 1]) {
      pos.push(p.x + rx * sgn * (HALF + 1.5), y, p.z + rz * sgn * (HALF + 1.5));
      uv.push(sgn < 0 ? 0 : 1, i * 0.7);
    }
    if (i) idx.push((i - 1) * 2, i * 2, (i - 1) * 2 + 1, (i - 1) * 2 + 1, i * 2, i * 2 + 1);
  });
  const wg = new THREE.BufferGeometry();
  wg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  wg.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  wg.setIndex(idx);
  wg.computeVertexNormals();
  const tex = waterTex();
  const wm = new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, transparent: true, opacity: 0.93, emissive: 0x1a6fa8, emissiveIntensity: 0.35 });
  g.add(propGroup('water', [new THREE.Mesh(wg, wm)]));
  ctx.anim.push((t) => { tex.offset.y = -t * 0.35; });

  // Bridge: plank deck laid over the road, thick side beams, railings, piles into the water.
  const rows = rowsOf(track, bridge.s0, bridge.s1, 1);
  const deck = sweep(rows, (row) => [[{ lat: -row.hw, dy: 0.05, u: -row.hw / 4, v: row.sw / 4 }, { lat: row.hw, dy: 0.05, u: row.hw / 4, v: row.sw / 4 }]]);
  const beams = sweep(rows, (row) => [-1, 1].map((sd) => rect(sd * (row.hw - 0.1), -0.55, 0.28, 0.55, CL.woodDark)));
  const wood = new THREE.Mesh(deck, mats.wood());
  wood.receiveShadow = true;
  const bb = new Batch().add(beams, null, null);
  fence(track, bb, -1, bridge.s0, bridge.s1, 'timber', { off: 0.1 });
  fence(track, bb, 1, bridge.s0, bridge.s1, 'timber', { off: 0.1 });
  const mid = (bridge.s0 + bridge.s1) / 2;
  for (const s of [mid - 9, mid - 3, mid + 3, mid + 9]) {
    for (const sd of [-1, 1]) {
      const p = ground(track, s, sd * (rows[0].hw - 0.6));
      bb.add(cyl(0.3, 0.34, 6, 6), xform(p.x, p.y - 3, p.z), CL.woodDark);
    }
  }
  // stone abutment heads at each end so the deck sits on something
  for (const s of [bridge.s0 + 0.5, bridge.s1 - 0.5]) {
    const p = ground(track, s, 0);
    bb.add(box(rows[0].hw * 2 + 1.2, 1.6, 1.4), xform(p.x, p.y - 0.9, p.z, -p.h), CL.stone);
  }
  g.add(propGroup('bridge', [wood, bb.mesh(mats.col(), { shadow: true })]));

  // Bank rocks and willows along the water.
  const rc = cells(80);
  const tc = cells(80);
  pts.forEach((p, i) => {
    if (i % 3) return;
    const prev = pts[Math.max(0, i - 1)];
    const next = pts[Math.min(pts.length - 1, i + 1)];
    const l = Math.hypot(next.x - prev.x, next.z - prev.z);
    const rx = -(next.z - prev.z) / l;
    const rz = (next.x - prev.x) / l;
    const side = i % 2 ? 1 : -1;
    const x = p.x + rx * side * (HALF + 2.5 + (i % 5));
    const z = p.z + rz * side * (HALF + 2.5 + (i % 5));
    const tt = track.project(x, z);
    if (Math.abs(tt.lateral) < 28 && Math.abs(tt.s - (bridge.s0 + bridge.s1) / 2) < 40) return;
    const y = ctx.creek.proxy.terrainHeight(x, z);
    if (i % 6 === 0) tree(tc.batchAt(x, z), x, y - 0.2, z, 1.3, i);
    else rc.batchAt(x, z).add(rockGeometry(i, { rTop: 0.6, rBot: 1.3, h: 1.1, seg: 7, rows: 2, cap: false, tone: 0xb3ab9d }), xform(x, y - 0.3, z, i), null);
  });
  g.add(...rc.groups('rocks', mats.col()), ...tc.groups('trees', mats.col()));
  flora(ctx, g, sec.s0, sec.s1, { trees: 8, bushes: 5, flowers: 26, rocks: 2, seed: 6, treeLats: [14, 70], skip: (s, lat, p) => ctx.creek.depthAt(p.x, p.z) > 0.01 });
  return g;
}
