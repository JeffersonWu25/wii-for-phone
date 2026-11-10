// Shared scenery parts: fences and railings swept along the road limits, the beach strip, rock walls, palm planting.
import * as THREE from 'three';
import { Batch, COL, SEA_LEVEL, rowsOf, sweep, xform, rng, smooth, lerp } from './kit.js';
import { palmGeometry, cyl, box } from './models.js';

export const rect = (lat, dy, w, h, c) => [
  { lat: lat - w, dy: dy - h, c },
  { lat: lat + w, dy: dy - h, c },
  { lat: lat + w, dy: dy + h, c },
  { lat: lat - w, dy: dy + h, c },
  { lat: lat - w, dy: dy - h, c },
];

const limOf = (row, side) => (side > 0 ? row.limR : row.limL);

// Posts every `step` m and horizontal rails/ropes swept between them, standing just outside the road limit.
// kind: 'post' (sea fence), 'timber' (heavy cliff railing), 'rope' (pier), 'guard' (steel guardrail).
export function fence(track, batch, side, s0, s1, kind = 'post', { off = 0.3, step, posts } = {}) {
  const pb = posts ?? batch;
  const spec = {
    post: { h: 1.0, w: 0.15, step: 3, rails: [0.4, 0.85], rw: 0.07, rh: 0.07, pc: COL.wood, rc: COL.woodLight, pw: 0.13 },
    timber: { h: 1.2, w: 0.2, step: 3.5, rails: [0.5, 1.0], rw: 0.1, rh: 0.1, pc: COL.woodDark, rc: COL.wood, pw: 0.17 },
    rope: { h: 1.5, w: 0.3, step: 5, rails: [1.2, 0.7], rw: 0.06, rh: 0.06, pc: 0x8a5a2e, rc: COL.rope, pw: 0.26, sag: 0.45 },
    guard: { h: 0.9, w: 0.3, step: 4, rails: [0.62], rw: 0.05, rh: 0.26, pc: 0x7b7f86, rc: 0xcfd4da, pw: 0.1 },
  }[kind];
  const stp = step ?? spec.step;
  const rows = rowsOf(track, s0, s1, kind === 'rope' ? 0.5 : 1);
  const geo = sweep(rows, (row) => {
    const lat = side * (limOf(row, side) + off);
    const ph = (((row.s - s0) % stp) + stp) % stp;
    const sag = spec.sag ? spec.sag * Math.sin((Math.PI * ph) / stp) : 0;
    return spec.rails.map((dy, k) => rect(lat, dy - (k === 0 && spec.sag ? sag : sag * 0.7), spec.rw, spec.rh, spec.rc));
  });
  batch.add(geo, null, null);
  const n = Math.floor((s1 - s0) / stp);
  const post = box(spec.pw * 2, spec.h, spec.pw * 2);
  const post2 = cyl(spec.pw, spec.pw * 1.15, spec.h, 8);
  const cap = new THREE.SphereGeometry(spec.pw * 1.35, 6, 5);
  for (let i = 0; i <= n; i++) {
    const s = s0 + i * stp;
    const row = rowsOf(track, s, s, 1)[0];
    const lat = side * (limOf(row, side) + off);
    const [x, y, z] = row.at(lat);
    const yaw = -row.h;
    if (kind === 'rope') {
      pb.add(post2, xform(x, y - 0.1 + spec.h / 2, z, yaw, 1, 1, 1), spec.pc);
      pb.add(cap, xform(x, y + spec.h - 0.1, z), 0x4f321a);
      pb.add(cyl(0.07, 0.07, 0.45, 5), xform(x, y + 1.15, z, yaw, 1, 1, 1, 0, Math.PI / 2), 0x4f321a);
    } else if (kind === 'guard') {
      pb.add(post, xform(x, y + spec.h / 2 - 0.05, z, yaw), spec.pc);
    } else {
      pb.add(post, xform(x, y + spec.h / 2, z, yaw), spec.pc);
      pb.add(box(spec.pw * 2.3, 0.08, spec.pw * 2.3), xform(x, y + spec.h + 0.04, z, yaw), spec.rc);
    }
  }
}

// Sand strip from the road limit to the waterline, following the terrain. Absolute points, so it hugs the shore.
export function beach(track, isl, side, s0, s1, { slopeEnd = 3 } = {}) {
  const rows = rowsOf(track, s0, s1, 1.5);
  const K = 12;
  const sand = new THREE.Color(COL.sand);
  const wet = new THREE.Color(COL.sandWet);
  const c = new THREE.Color();
  return sweep(rows, (row) => {
    const f = row.f;
    const lim = limOf(row, side);
    // march outward to the first point under the waterline
    let D = 40;
    for (let d = 1; d < 40; d += 1.5) {
      const lat = side * (lim + d);
      const y = isl.heightAt(f.x + f.rx * lat, f.z + f.rz * lat);
      if (y < SEA_LEVEL + 0.25) {
        D = d + slopeEnd;
        break;
      }
    }
    const pts = [];
    for (let k = 0; k < K; k++) {
      const t = k / (K - 1);
      const lat = side * (lim - 0.4 + (D + 0.4) * t);
      const x = f.x + f.rx * lat;
      const z = f.z + f.rz * lat;
      const y = isl.heightAt(x, z) + 0.07;
      c.copy(sand).lerp(wet, smooth(0.55, 1, t));
      pts.push({ abs: [x, y, z], c: c.getHex() });
    }
    return [pts];
  });
}

// Rock wall on one side of the road: a jagged face rising from the limit to a grassy plateau, then a steep back that
// runs well down so it never floats over the lower terrain. `H(row)` is the height at a row (0 = no wall there).
export function rockWall(track, side, s0, s1, H, { setback = 0, top = 9, step = 1 } = {}) {
  const rows = rowsOf(track, s0, s1, step);
  const r = rng(Math.floor(s0) + 7);
  const jit = new Float32Array(rows.length * 3).map(() => r() - 0.5);
  const warm = new THREE.Color(COL.rockWarm);
  const grey = new THREE.Color(COL.rock);
  const col = new THREE.Color();
  return sweep(rows, (row, i) => {
    const h = H(row);
    if (h < 0.6) return null;
    const lim = limOf(row, side) + setback;
    const j = (k) => jit[i * 3 + k] * 0.9;
    const sg = (o) => side * (lim + o);
    col.copy(grey).lerp(warm, 0.5 + 0.5 * Math.sin(row.s * 0.11));
    const rk = col.getHex();
    const dark = col.clone().multiplyScalar(0.72).getHex();
    const u = row.sw / 7;
    const front = [
      { lat: sg(-0.2), dy: -0.4, u, v: 0, c: dark },
      { lat: sg(0.7 + j(0)), dy: h * 0.32, u, v: 0.3, c: rk },
      { lat: sg(1.5 + j(1)), dy: h * 0.62, u, v: 0.62, c: col.clone().multiplyScalar(1.08).getHex() },
      { lat: sg(2.3 + j(2)), dy: h, u, v: 1, c: rk },
    ];
    const plateau = [
      { lat: sg(2.3 + j(2)), dy: h, u, v: 0, c: 0x58b83c },
      { lat: sg(2.3 + top * 0.5), dy: h + 0.15, u, v: 0, c: 0x4fa83a },
      { lat: sg(2.3 + top), dy: h - 0.2, u, v: 0, c: 0x3f9a34 },
    ];
    const back = [
      { lat: sg(2.3 + top), dy: h - 0.2, u, v: 1, c: rk },
      { lat: sg(4 + top), dy: h * 0.4, u, v: 0.6, c: dark },
      { lat: sg(5 + top), dy: -14, u, v: 0, c: dark },
    ];
    return [front, plateau, back];
  });
}

// Drop-side rock skirt below a railing: a steep rough face from the road edge down.
export function skirt(track, side, s0, s1, wOf = () => 1) {
  const rows = rowsOf(track, s0, s1, 1);
  const grey = new THREE.Color(COL.rock);
  return sweep(rows, (row, i) => {
    const w = wOf(row);
    if (w < 0.1) return null;
    const lim = limOf(row, side);
    const j = Math.sin(row.s * 0.9) * 0.25;
    const u = row.sw / 7;
    const cl = grey.clone().multiplyScalar(0.8).getHex();
    return [[
      { lat: side * (lim + 0.1), dy: -0.2, u, v: 1, c: 0xb0a090 },
      { lat: side * (lim + 0.5 + j), dy: -2.5, u, v: 0.75, c: cl },
      { lat: side * (lim + 1.6 + j), dy: -7, u, v: 0.4, c: cl },
      { lat: side * (lim + 3.2), dy: -16, u, v: 0, c: 0x6c6c74 },
    ]];
  });
}

// ── Palms ───────────────────────────────────────────────────────────────────────────────────────────────────────────
// Spots are bucketed into square cells; each cell is one InstancedMesh, so culling and draw calls stay local.
export function palmGroup(spots, cell = 40, { shadow = true } = {}) {
  const g = new THREE.Group();
  const buckets = new Map();
  for (const sp of spots) {
    const k = `${Math.floor(sp.x / cell)},${Math.floor(sp.z / cell)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k).push(sp);
  }
  const geo = palmGeometry();
  const mat = palmGroup.mat ?? (palmGroup.mat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  for (const list of buckets.values()) {
    const m = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((p, i) => m.setMatrixAt(i, xform(p.x, p.y, p.z, p.ry ?? 0, p.sc, p.sc, p.sc, p.tx ?? 0, p.tz ?? 0)));
    m.instanceMatrix.needsUpdate = true;
    m.computeBoundingSphere();
    m.castShadow = shadow;
    g.add(m);
  }
  return g;
}

export function palmProp(spots, cell = 40, opts) {
  const grp = palmGroup(spots, cell, opts);
  const out = new THREE.Group();
  out.name = 'prop:palms';
  for (const c of [...grp.children]) out.add(c);
  return out;
}

// Random scatter beside the road. `lats` = [min, max] distance beyond the road limit; keeps only dry spots.
export function scatter(track, isl, side, s0, s1, { n, lats = [3, 14], seed = 1, min = 0.0, scale = [0.9, 1.5], skip = () => false }) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = lerp(s0, s1, r());
    const sd = side === 0 ? (r() < 0.5 ? -1 : 1) : side;
    const row = rowsOf(track, s, s, 1)[0];
    const lat = sd * (limOf(row, sd) + lerp(lats[0], lats[1], r()));
    const x = row.f.x + row.f.rx * lat;
    const z = row.f.z + row.f.rz * lat;
    const y = isl.heightAt(x, z);
    if (y < min || skip(row, lat, x, z)) continue;
    out.push({ x, y: y - 0.1, z, ry: r() * 6.28, sc: lerp(scale[0], scale[1], r()), tx: (r() - 0.5) * 0.12, tz: (r() - 0.5) * 0.12 });
  }
  return out;
}

// A straight bar (thin cylinder) from a to b, for strings, struts and ropes.
const UP = new THREE.Vector3(0, 1, 0);
const bq = new THREE.Quaternion();
const bd = new THREE.Vector3();
const bs = new THREE.Vector3();
const bp = new THREE.Vector3();
export function bar(batch, a, b, r, color, seg = 4) {
  bd.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
  const len = bd.length();
  bq.setFromUnitVectors(UP, bd.normalize());
  const m = new THREE.Matrix4().compose(bp.set((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2), bq, bs.set(r, len, r));
  batch.add(bar.geo ?? (bar.geo = new THREE.CylinderGeometry(1, 1, 1, seg)), m, color);
}

// A string of bunting from p0 to p1 sagging `sag` m: rope segments plus a triangle flag every `gap` m.
export function bunting(batch, p0, p1, sag, colors, gap = 1.1, seed = 3) {
  const r = rng(seed);
  const len = Math.hypot(p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]);
  const n = Math.max(2, Math.round(len / gap));
  const pt = (i) => {
    const t = i / n;
    return [lerp(p0[0], p1[0], t), lerp(p0[1], p1[1], t) - sag * 4 * t * (1 - t), lerp(p0[2], p1[2], t)];
  };
  const col = new THREE.Color();
  const pos = [];
  const cols = [];
  for (let i = 0; i < n; i++) {
    const a = pt(i);
    const b = pt(i + 1);
    bar(batch, a, b, 0.03, 0xe8dcc0, 3);
    if (i % 1 === 0) {
      col.set(colors[Math.floor(r() * colors.length)]);
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 0.9, (a[2] + b[2]) / 2];
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2], m[0], m[1], m[2]);
      for (let k = 0; k < 3; k++) cols.push(col.r, col.g, col.b);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
  g.computeVertexNormals();
  batch.add(g, null, null);
}
