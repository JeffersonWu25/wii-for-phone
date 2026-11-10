// One-off landmark models and repeated props for Coconut Coast, each built once in local space as merged,
// vertex-coloured geometry. Callers stamp them into a Batch with a world matrix.
import * as THREE from 'three';
import { Batch, COL, xform, rng, uvRegion, ATLAS } from './kit.js';

const cyl = (rt, rb, h, seg = 8, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);

// Per-triangle colour by centroid (geometry must be non-indexed).
function colorTris(geo, fn) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const p = g.attributes.position;
  const col = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i += 3) {
    const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
    const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
    const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
    c.set(fn(cx, cy, cz));
    for (let k = 0; k < 3; k++) col.set([c.r, c.g, c.b], (i + k) * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ── Palm tree ────────────────────────────────────────────────────────────────────────────────────────────────────────
// Leaning ringed trunk, a drooping crown of 9 fronds and a coconut cluster. About 300 triangles, 7 m tall at scale 1.
let palmGeo;
export function palmGeometry() {
  if (palmGeo) return palmGeo;
  const b = new Batch();
  const H = 7;
  const lean = 1.1;
  const top = (t) => new THREE.Vector3(lean * t * t, H * t, 0);
  const trunk = [];
  const SEG = 6;
  const SIDES = 6;
  const pos = [];
  const col = [];
  const tc = new THREE.Color();
  for (let i = 0; i <= SEG; i++) {
    const t = i / SEG;
    const c = top(t);
    const r = 0.36 - 0.17 * t;
    tc.set(i % 2 ? 0x95623a : 0x7b4d2a);
    for (let k = 0; k < SIDES; k++) {
      const a = (k / SIDES) * Math.PI * 2;
      pos.push(c.x + Math.cos(a) * r, c.y, c.z + Math.sin(a) * r);
      col.push(tc.r, tc.g, tc.b);
    }
  }
  const idx = [];
  for (let i = 0; i < SEG; i++) {
    for (let k = 0; k < SIDES; k++) {
      const a = i * SIDES + k;
      const n = i * SIDES + ((k + 1) % SIDES);
      idx.push(a, a + SIDES, n, n, a + SIDES, n + SIDES);
    }
  }
  const tg = new THREE.BufferGeometry();
  tg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  tg.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  tg.setIndex(idx);
  tg.computeVertexNormals();
  trunk.push(tg);
  trunk.forEach((g) => b.add(g, null, null));

  const crown = top(1);
  const cp = new THREE.Vector3(crown.x, crown.y, crown.z);
  const FR = 9;
  for (let f = 0; f < FR; f++) {
    const a = (f / FR) * Math.PI * 2 + (f % 2) * 0.2;
    const dx = Math.cos(a);
    const dz = Math.sin(a);
    const len = f % 2 ? 3.4 : 3.0;
    const up = f % 2 ? 1.5 : 2.2;
    const P = [];
    const C = [];
    const S = 6;
    const base = new THREE.Color(f % 2 ? 0x2c8f35 : 0x2f9e3a);
    const tip = new THREE.Color(f % 2 ? 0x5cc44a : 0x7ad24f);
    for (let i = 0; i <= S; i++) {
      const u = i / S;
      const out = len * u;
      const y = up * Math.sin(u * 2.1) - 2.4 * u * u;
      const w = 0.7 * Math.pow(Math.sin(Math.PI * Math.min(1, 0.12 + u * 0.88)), 0.7);
      const cx = cp.x + dx * out;
      const cy = cp.y + 0.2 + y;
      const cz = cp.z + dz * out;
      const sx = -dz * w;
      const sz = dx * w;
      const col2 = base.clone().lerp(tip, u);
      P.push(cx + sx, cy - 0.12 * w, cz + sz, cx, cy + 0.08, cz, cx - sx, cy - 0.12 * w, cz - sz);
      for (let k = 0; k < 3; k++) C.push(col2.r, col2.g, col2.b);
    }
    const id = [];
    for (let i = 0; i < S; i++) {
      for (let k = 0; k < 2; k++) {
        const a0 = i * 3 + k;
        id.push(a0, a0 + 3, a0 + 1, a0 + 1, a0 + 3, a0 + 4);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
    g.setIndex(id);
    g.computeVertexNormals();
    b.add(g, null, null);
  }
  for (let i = 0; i < 3; i++) {
    const a = i * 2.1;
    b.add(new THREE.IcosahedronGeometry(0.24, 0), xform(cp.x + Math.cos(a) * 0.3, cp.y - 0.15, cp.z + Math.sin(a) * 0.3), 0x5a3a1a);
  }
  palmGeo = b.geometry();
  return palmGeo;
}

// ── Rock chunk: jittered tapered cylinder, green cap optional. For sea stacks, islets, cliff blocks. ─────────────────
export function rockGeometry(seed, { rTop = 3, rBot = 5, h = 6, seg = 9, rows = 4, cap = true, tone = 0xa09a92 } = {}) {
  const r = rng(seed);
  const g = new THREE.CylinderGeometry(rTop, rBot, h, seg, rows, false);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    const edge = Math.abs(y) < h / 2 - 1e-4;
    const j = (edge ? 0.22 : 0.08) * (rTop + rBot) * 0.5;
    p.setXYZ(i, p.getX(i) + (r() - 0.5) * j, y + (edge ? (r() - 0.5) * 0.25 * h / rows : 0), p.getZ(i) + (r() - 0.5) * j);
  }
  g.translate(0, h / 2, 0);
  const shade = new THREE.Color(tone);
  return colorTris(g, (x, y, z) => {
    const ny = y / h;
    if (cap && ny > 0.97) return COL.grass;
    if (cap && ny > 0.9) return 0x3f9a34;
    const k = 0.78 + 0.3 * ((Math.sin(x * 3.1 + z * 2.3) + 1) * 0.5) + ny * 0.1;
    return shade.clone().multiplyScalar(k);
  });
}

// ── Tiki hut: thatched cone roof on four posts over a counter. Returns { col, thatch } geometries. ──────────────────
export function hutGeometry(variant = 0) {
  const c = new Batch();
  const t = new Batch();
  const W = 5;
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(cyl(0.16, 0.2, 3.4, 6), xform(sx * W / 2, 1.7, sz * W / 2), COL.woodDark);
  c.add(box(W, 0.25, W), xform(0, 0.12, 0), COL.woodLight);
  c.add(box(W - 0.2, 1.0, 0.25), xform(0, 1.0, W / 2 - 0.2), COL.wood); // counter front
  c.add(box(0.25, 1.0, W - 0.2), xform(-W / 2 + 0.2, 1.0, 0), COL.wood);
  c.add(box(W - 0.2, 2.2, 0.2), xform(0, 1.3, -W / 2 + 0.15), COL.woodLight); // back wall
  c.add(box(W - 0.2, 0.25, 0.5), xform(0, 1.55, W / 2 - 0.1), 0xe8b85a); // counter top
  for (let i = 0; i < 4; i++) c.add(box(0.5, 0.45, 0.5), xform(-1.6 + i * 0.9, 1.9, W / 2 - 0.1 + (i % 2) * 0.1), [0xe63a2e, 0xffc933, 0x58c24a, 0xff8a1f][i]);
  // tiki mask on the front post
  c.add(box(0.6, 1.0, 0.25), xform(variant ? -W / 2 : W / 2, 3.0, W / 2 + 0.2), 0x6a3b1c);
  c.add(box(0.4, 0.14, 0.1), xform(variant ? -W / 2 : W / 2, 3.2, W / 2 + 0.34), 0xffd84a);
  c.add(box(0.3, 0.2, 0.1), xform(variant ? -W / 2 : W / 2, 2.85, W / 2 + 0.34), 0xe63a2e);
  // lanterns
  for (const sx of [-1, 1]) c.add(new THREE.SphereGeometry(0.22, 6, 5), xform(sx * 1.8, 2.7, W / 2 - 0.1), 0xffb030);
  // thatched roof: two stacked cones with a rim of hanging straw
  t.add(uvRegion(cyl(0.25, W * 0.86, 2.4, 10), ATLAS.thatch), xform(0, 4.6, 0, 0.3), 0xffffff, true);
  t.add(uvRegion(cyl(W * 0.86, W * 0.88, 0.5, 10, true), ATLAS.thatch), xform(0, 3.35, 0, 0.3), 0xe9c868, true);
  c.add(cyl(0.12, 0.12, 0.9, 5), xform(0, 6.0, 0), COL.woodDark);
  return { col: c.geometry(), thatch: t.geometry() };
}

// ── Market stall: striped awning over a counter. Returns { col, awning }. ────────────────────────────────────────────
export function awningGeometry(w, d, row, tilt = 0.28) {
  const g = new THREE.PlaneGeometry(w, d, 1, 1);
  g.rotateX(-Math.PI / 2 + tilt);
  return uvRegion(g, ATLAS.awning(row));
}

export function stallGeometry(row = 0) {
  const c = new Batch();
  const a = new Batch();
  const W = 4.2;
  const D = 2.6;
  for (const sx of [-1, 1]) {
    c.add(cyl(0.1, 0.12, 3.1, 6), xform(sx * (W / 2 - 0.1), 1.55, D / 2 - 0.2), COL.woodDark);
    c.add(cyl(0.1, 0.12, 2.5, 6), xform(sx * (W / 2 - 0.1), 1.25, -D / 2 + 0.2), COL.woodDark);
  }
  c.add(box(W, 1.0, 1.0), xform(0, 0.5, D / 2 - 0.6), COL.wood);
  c.add(box(W + 0.2, 0.15, 1.25), xform(0, 1.05, D / 2 - 0.55), COL.woodLight);
  c.add(box(W, 2.2, 0.15), xform(0, 1.1, -D / 2 + 0.2), COL.woodDark);
  for (let i = 0; i < 3; i++) c.add(new THREE.SphereGeometry(0.22, 6, 5), xform(-1.2 + i * 1.2, 1.35, D / 2 - 0.5), [0xffd23a, 0xe63a2e, 0x58c24a][i]);
  c.add(box(0.8, 0.8, 0.8), xform(W / 2 + 0.7, 0.4, D / 2 - 0.2), 0xa5703a); // crates
  c.add(box(0.7, 0.7, 0.7), xform(W / 2 + 0.7, 1.15, D / 2 - 0.2, 0.4), 0xc4894a);
  a.add(awningGeometry(W + 0.5, D + 0.7, row), xform(0, 2.75, 0.05), 0xffffff, true);
  a.add(box(W + 0.5, 0.12, 0.1), xform(0, 2.55, D / 2 + 0.3), 0xfff5e0);
  return { col: c.geometry(), awning: a.geometry() };
}

// ── Beach umbrella ───────────────────────────────────────────────────────────────────────────────────────────────────
export function umbrellaGeometry(a = 0xe63a2e, b = 0xfff5e0) {
  const c = new Batch();
  c.add(cyl(0.05, 0.05, 2.9, 5), xform(0, 1.45, 0, 0, 1, 1, 1, 0, 0.08), 0xe8e0d0);
  const cone = new THREE.ConeGeometry(1.9, 0.75, 8, 1, true);
  const painted = colorTris(cone, (x, y, z) => (Math.floor(((Math.atan2(z, x) + Math.PI) / (Math.PI * 2)) * 8) % 2 ? b : a));
  c.add(painted, xform(0.12, 3.1, 0, 0, 1, 1, 1, 0, 0.08), null);
  c.add(new THREE.SphereGeometry(0.1, 5, 4), xform(0.15, 3.5, 0), 0xffd23a);
  return c.geometry();
}

// Lounger next to an umbrella.
export function loungerGeometry(col = 0x2f9be0) {
  const c = new Batch();
  c.add(box(0.7, 0.1, 1.6), xform(0, 0.35, 0), col);
  c.add(box(0.7, 0.1, 0.7), xform(0, 0.62, -0.75, 0, 1, 1, 1, 0.9), col);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) c.add(box(0.06, 0.3, 0.06), xform(sx * 0.3, 0.15, sz * 0.7), 0xf0e8d8);
  return c.geometry();
}

// ── Lighthouse: banded red/white tower on a rock, glass lantern, red cap. ~24 m. ─────────────────────────────────────
export function lighthouseGeometry() {
  const c = new Batch();
  const glow = new Batch();
  const H = 20;
  const bands = 6;
  for (let i = 0; i < bands; i++) {
    const y0 = (i / bands) * H;
    const h = H / bands;
    const r0 = 3.2 - 1.3 * (i / bands);
    const r1 = 3.2 - 1.3 * ((i + 1) / bands);
    c.add(cyl(r1, r0, h, 12), xform(0, y0 + h / 2, 0), i % 2 ? COL.white : 0xe0302a);
  }
  c.add(cyl(3.5, 3.5, 0.5, 12), xform(0, H + 0.25, 0), 0x4a4a52);
  c.add(cyl(2.4, 2.4, 0.18, 12), xform(0, H + 1.5, 0), 0x4a4a52);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2;
    c.add(cyl(0.08, 0.08, 1.2, 4), xform(Math.cos(a) * 3.3, H + 1.1, Math.sin(a) * 3.3), 0x55555c);
  }
  c.add(cyl(1.6, 1.6, 2.2, 10), xform(0, H + 1.6, 0), 0x9fe4ff);
  glow.add(new THREE.SphereGeometry(0.9, 8, 6), xform(0, H + 1.6, 0), 0xfff2a0);
  c.add(new THREE.ConeGeometry(2.1, 1.9, 10), xform(0, H + 3.7, 0), 0xe0302a);
  c.add(new THREE.SphereGeometry(0.3, 6, 5), xform(0, H + 4.8, 0), 0xffd23a);
  c.add(box(1.1, 2, 0.2), xform(0, 1.0, 3.15), 0x5a3a1e);
  for (const y of [7, 12, 16]) c.add(box(0.7, 1.0, 0.3), xform(0, y, 2.7 - y * 0.065), 0x2a3a5a);
  return { col: c.geometry(), glow: glow.geometry() };
}

// ── Sailboat: striped hull, mast, two sails. ~9 m long. ──────────────────────────────────────────────────────────────
export function sailboatGeometry() {
  const c = new Batch();
  const hull = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  c.add(colorTris(hull, (x, y) => (y > -0.12 ? 0xe0302a : 0xf7f3ea)), xform(0, 0.25, 0, 0, 4.4, 1.0, 1.5), null);
  c.add(box(6.6, 0.12, 2.2), xform(0, 0.28, 0), 0xc98a4a);
  c.add(cyl(0.09, 0.12, 9, 5), xform(0.2, 4.6, 0), 0xe8e0d0);
  const sail = (pts, col) => {
    const sh = new THREE.Shape();
    sh.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) sh.lineTo(pts[i][0], pts[i][1]);
    return [new THREE.ShapeGeometry(sh), col];
  };
  const [s1, c1] = sail([[0, 1.0], [0, 9], [-3.4, 1.3]], 0xffffff);
  const [s2, c2] = sail([[0.5, 1.2], [0.5, 8], [3.2, 1.2]], 0xfff0d0);
  c.add(s1, xform(0.2, 0, 0.05), c1);
  c.add(s2, xform(0.2, 0, -0.05), c2);
  c.add(box(0.1, 0.8, 0.6), xform(0.2, 9.2, 0), 0xe0302a);
  return c.geometry();
}

// ── Chevron sign on a post. Two parts: plain (post) and textured (board, uv covers the whole texture). ─────────────
export function chevronBoard() {
  const g = new THREE.PlaneGeometry(2.6, 1.9);
  return g;
}

// ── Torch / lantern post (tunnel entrance, arch) ─────────────────────────────────────────────────────────────────────
export function lanternGeometry() {
  const c = new Batch();
  c.add(cyl(0.08, 0.1, 1.4, 5), xform(0, 0.7, 0), COL.woodDark);
  c.add(new THREE.SphereGeometry(0.26, 6, 5), xform(0, 1.5, 0), 0xffa830);
  return c.geometry();
}

// ── Wooden arch: two tall carved posts, curved beam, sign boards both sides, coconut emblem with leaves. ────────────
// Local space: road runs along +x, posts at z = +-halfSpan, the arch spans z. Sign faces +x and -x.
export function archGeometry(halfSpan = 14) {
  const c = new Batch();
  const s = new Batch();
  const PH = 9.5;
  for (const sz of [-1, 1]) {
    const z = sz * halfSpan;
    c.add(box(2.4, 1.2, 2.4), xform(0, 0.6, z), 0xa49a8c); // stone footing
    c.add(box(1.7, PH, 1.7), xform(0, 1.2 + PH / 2, z), COL.wood);
    for (const y of [3, 6, 9]) c.add(box(2.0, 0.35, 2.0), xform(0, y, z), COL.woodDark);
    c.add(box(2.1, 0.5, 2.1), xform(0, PH + 1.3, z), COL.woodLight);
    // cross-brace stubs
    c.add(box(0.5, 2.2, 0.5), xform(0, 4.2, z - sz * 1.4, 0, 1, 1, 1, 0, sz * 0.6), COL.woodDark);
    c.add(new THREE.SphereGeometry(0.45, 6, 5), xform(0, PH + 1.9, z), 0xffc933);
  }
  const bot = PH + 1.0;
  const N = 14;
  for (let i = 0; i < N; i++) {
    const t0 = i / N;
    const t1 = (i + 1) / N;
    const zc = (-halfSpan + (t0 + t1) * halfSpan);
    const arch = (t) => bot + 2.3 * (1 - Math.pow(2 * t - 1, 2));
    const y0 = arch(t0);
    const y1 = arch(t1);
    const len = Math.hypot(2 * halfSpan / N, y1 - y0);
    const ang = Math.atan2(y1 - y0, 2 * halfSpan / N);
    c.add(box(1.5, 1.2, len + 0.05), xform(0, (y0 + y1) / 2 + 0.6, zc, 0, 1, 1, 1, -ang), COL.wood);
  }
  // sign board rides the beam: slightly bowed, text on both faces
  const sign = new THREE.PlaneGeometry(2 * halfSpan * 0.62, 3.6);
  const apex = bot + 2.3;
  s.add(uvRegion(sign.clone(), ATLAS.sign), xform(0.95, apex + 0.55, 0, Math.PI / 2), 0xffffff, true);
  s.add(uvRegion(sign.clone(), ATLAS.sign), xform(-0.95, apex + 0.55, 0, -Math.PI / 2), 0xffffff, true);
  c.add(box(1.0, 3.8, 2 * halfSpan * 0.64), xform(0, apex + 0.55, 0), COL.woodDark);
  // lamp housing under the beam, front (-x) face, for the countdown lights
  c.add(box(0.6, 2.4, 11.6), xform(-0.55, 11.6, 0), COL.woodDark);
  // coconut emblem
  const ez = 0;
  const ey = apex + 3.9;
  c.add(new THREE.SphereGeometry(1.5, 10, 8), xform(0, ey, ez), 0x6b3f1c);
  c.add(new THREE.SphereGeometry(0.2, 5, 4), xform(1.35, ey + 0.35, ez - 0.5), 0x2a1608);
  c.add(new THREE.SphereGeometry(0.2, 5, 4), xform(1.35, ey + 0.35, ez + 0.5), 0x2a1608);
  c.add(new THREE.SphereGeometry(0.2, 5, 4), xform(-1.35, ey + 0.35, ez - 0.5), 0x2a1608);
  c.add(new THREE.SphereGeometry(0.2, 5, 4), xform(-1.35, ey + 0.35, ez + 0.5), 0x2a1608);
  c.add(new THREE.SphereGeometry(0.2, 5, 4), xform(1.42, ey - 0.2, ez), 0x2a1608);
  c.add(new THREE.SphereGeometry(0.2, 5, 4), xform(-1.42, ey - 0.2, ez), 0x2a1608);
  const leaf = new THREE.ConeGeometry(0.5, 3.4, 4);
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2;
    c.add(leaf, xform(Math.cos(a) * 1.3, ey + 1.2, Math.sin(a) * 1.3, 0, 1, 1, 0.4, Math.sin(a) * 0.9, -Math.cos(a) * 0.9), i % 2 ? COL.leaf : COL.leafLight);
  }
  return { col: c.geometry(), sign: s.geometry() };
}

export { cyl, box, colorTris };
