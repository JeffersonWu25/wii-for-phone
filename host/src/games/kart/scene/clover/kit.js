// Clover Meadows shared helpers: palette, ground-aware placement, scatter that keeps clear of every road, shared meshes.
import * as THREE from 'three';
import { Batch, rng, xform, propGroup, rowsOf, sweep } from '../coconut/kit.js';
import { cyl, box } from '../coconut/models.js';
import { rect } from '../coconut/parts.js';
import { canvasTex } from '../textures.js';

export const CL = {
  dirt: 0xc98a4b,
  dirtLight: 0xdba062,
  grass: 0x5cbf3a,
  grassDark: 0x3f9a2e,
  mud: 0x6b4a2b,
  red: 0xd8402f,
  redDark: 0xa82f22,
  roof: 0xb5382c,
  wood: 0xb9783d,
  woodDark: 0x7a4a24,
  cream: 0xf2e3c4,
  creek: 0x3fa9e0,
  white: 0xf7f3ea,
  yellow: 0xffc933,
  stone: 0xb9b3a6,
  stoneDark: 0x8d877c,
  trunk: 0x8a5a2e,
  slate: 0x59606e,
};

// Ground point at lateral `lat` (m, + = right) of the road at s: world x/y/z plus the road heading, using the real terrain
// past the road edge.
export function ground(track, s, lat) {
  const f = track.frameAt(s);
  const x = f.x + f.rx * lat;
  const z = f.z + f.rz * lat;
  const sp = track.samples[Math.round(f.s / track.sampleStep) % (track.samples.length - 1)];
  const lim = f.halfWidth + (lat > 0 ? sp.curbR + sp.runR : sp.curbL + sp.runL);
  const y = Math.abs(lat) <= lim ? track.heightAt(f.s, lat) : track.terrainHeight(x, z);
  return { x, y, z, h: f.h, f };
}

// Metres from the road centre to where the road's own surface (curb + runoff) ends.
export function limitAt(track, s, side) {
  const f = track.frameAt(s);
  const sp = track.samples[Math.round(f.s / track.sampleStep) % (track.samples.length - 1)];
  return f.halfWidth + (side > 0 ? sp.curbR + sp.runR : sp.curbL + sp.runL);
}

// Yaw that turns a model whose front is local +x to face `dir` (+1 toward the road's right, -1 toward its left).
export const faceSide = (h, dir) => -h - dir * (Math.PI / 2);

// True when (x, z) is clear of every road piece (the loop passes near itself in places), measured past the road limit.
export function clearOfRoad(track, x, z, margin) {
  const p = track.project(x, z);
  return Math.abs(p.lateral) > limitAt(track, p.s, p.lateral >= 0 ? 1 : -1) + margin;
}

// n deterministic spots on `side` between s0 and s1, `lats` metres beyond the road limit (min, max), clear of all roads.
export function scatter(track, side, s0, s1, { n, lats = [6, 40], seed = 1, margin = 4, skip } = {}) {
  const r = rng(seed);
  const out = [];
  for (let i = 0; i < n * 3 && out.length < n; i++) {
    const s = s0 + r() * (s1 - s0);
    const lat = side * (limitAt(track, s, side) + lats[0] + r() * (lats[1] - lats[0]));
    const p = ground(track, s, lat);
    if (!clearOfRoad(track, p.x, p.z, margin) || skip?.(s, lat, p)) continue;
    out.push({ ...p, s, lat, r: r(), r2: r() });
  }
  return out;
}

export const cutRange = (s0, s1, a, b) => !(s1 <= a || s0 >= b);

// Distance culling for a group of small props.
export function lodGroup(ctx, g, x, z, dist) {
  ctx.lod.push({ obj: g, x, z, d2: dist * dist });
  return g;
}

export const mesh = (batch, mat, opts) => batch.mesh(mat, opts);

// Daisy-like flower head: ring of petals around a centre, lying slightly tilted. Unit size ~0.5 m.
const flowerCache = new Map();
export function flowerGeo(petal = CL.white, centre = CL.yellow) {
  const key = `${petal}:${centre}`;
  if (flowerCache.has(key)) return flowerCache.get(key);
  const b = new Batch();
  const pg = new THREE.SphereGeometry(0.11, 5, 4);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add(pg, xform(Math.cos(a) * 0.17, 0.2, Math.sin(a) * 0.17, -a, 1.5, 0.45, 0.8), petal);
  }
  b.add(new THREE.SphereGeometry(0.1, 6, 4), xform(0, 0.22, 0), centre);
  b.add(cyl(0.018, 0.018, 0.22, 4), xform(0, 0.11, 0), 0x3f9a2e);
  const g = b.geometry();
  flowerCache.set(key, g);
  return g;
}

// A small clump of flowers around (x, y, z).
export function clump(batch, x, y, z, r, petal, centre, n = 3, size = 1.6) {
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + r * 9;
    const d = 0.25 + (i % 2) * 0.2;
    batch.add(flowerGeo(petal, centre), xform(x + Math.cos(a) * d, y, z + Math.sin(a) * d, a, size * (0.8 + 0.4 * ((i * 0.37 + r) % 1))), null);
  }
}

// Round leafy tree: trunk plus overlapping blobs in two greens. `big` scales it.
const BLOB = new THREE.IcosahedronGeometry(1, 1);
export function tree(batch, x, y, z, scale = 1, seed = 0) {
  const r = rng(seed * 7 + 3);
  const h = 2.6 * scale;
  batch.add(cyl(0.45 * scale, 0.7 * scale, h, 7), xform(x, y + h / 2, z), CL.trunk);
  const greens = [0x3fa43a, 0x57c244, 0x4cb53f];
  const n = 5;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * 6.28 + r();
    const d = i === 0 ? 0 : 1.7 * scale * (0.6 + r() * 0.5);
    const rad = (2.3 - (i === 0 ? 0 : 0.5) + r() * 0.5) * scale;
    batch.add(BLOB, xform(x + Math.cos(a) * d, y + h + (i === 0 ? 1.6 : 0.6 + r() * 1.8) * scale, z + Math.sin(a) * d, 0, rad, rad * 0.88, rad), greens[i % 3]);
  }
}

export function bush(batch, x, y, z, scale = 1, seed = 0) {
  const r = rng(seed * 5 + 1);
  for (let i = 0; i < 3; i++) {
    const rad = (0.9 + r() * 0.5) * scale;
    batch.add(BLOB, xform(x + (i - 1) * 0.9 * scale, y + rad * 0.55, z + (r() - 0.5) * scale, 0, rad, rad * 0.8, rad), i === 1 ? 0x57c244 : 0x3fa43a);
  }
}

// Spatial cells: one Batch per `size` m square so far props cull as a unit (the world tick hides `prop:` groups by distance).
export function cells(size = 70) {
  const map = new Map();
  return {
    batchAt(x, z) {
      const key = `${Math.floor(x / size)}:${Math.floor(z / size)}`;
      if (!map.has(key)) map.set(key, new Batch());
      return map.get(key);
    },
    groups(kind, mat, opts) {
      return [...map.values()].map((b) => propGroup(kind, [b.mesh(mat, opts)]));
    },
  };
}

// Posts every `step` m with two rails, standing at lateral latFn(s) (m, + = right). For paths that are not the road's own limit.
export function fenceLine(track, batch, s0, s1, latFn, { step = 3, h = 1.1, post = CL.woodDark, rail = CL.wood } = {}) {
  const rows = rowsOf(track, s0, s1, 1);
  batch.add(sweep(rows, (row) => [0.45, 0.85].map((dy) => rect(latFn(row.s), dy * h / 1.1, 0.07, 0.08, rail))), null, null);
  const pg = box(0.3, h, 0.3);
  for (let s = s0; s <= s1 + 1e-6; s += step) {
    const [x, y, z] = rowsOf(track, s, s, 1)[0].at(latFn(s));
    batch.add(pg, xform(x, y + h / 2, z, -track.frameAt(s).h), post);
  }
}

// Soft elongated blob in (s, lateral) space: polar rows from the centre out to `radius(angle)` metres, following the road surface.
export function blobMesh(track, s, lat, len, wid, radius, colorAt, { rings = 3, seg = 28, lift = 0.05 } = {}) {
  const pos = [];
  const col = [];
  const idx = [];
  const c = new THREE.Color();
  const put = (ds, dl, k) => {
    const f = track.frameAt(s + ds);
    const l = Math.max(-f.halfWidth - 1, Math.min(f.halfWidth + 1, lat + dl));
    pos.push(f.x + f.rx * l, track.heightAt(f.s, l) + lift, f.z + f.rz * l);
    c.set(colorAt(k));
    col.push(c.r, c.g, c.b);
  };
  put(0, 0, 0);
  for (let r = 1; r <= rings; r++) {
    for (let i = 0; i < seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const k = r / rings;
      const rad = radius(a) * k;
      put(Math.cos(a) * (len / 2) * rad, Math.sin(a) * (wid / 2) * rad, k);
    }
  }
  for (let i = 0; i < seg; i++) idx.push(0, 1 + ((i + 1) % seg), 1 + i);
  for (let r = 1; r < rings; r++) {
    for (let i = 0; i < seg; i++) {
      const a = 1 + (r - 1) * seg + i;
      const b = 1 + (r - 1) * seg + ((i + 1) % seg);
      idx.push(a, b, a + seg, b, b + seg, a + seg);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Orange ramp / blue pad chevron textures: chevrons point toward increasing v (the driving direction).
export const chevTex = (base, line, repeat = 2) =>
  canvasTex(128, 128, (ctx, w, h) => {
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = line;
    ctx.lineWidth = 16;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(14, h * 0.82);
    ctx.lineTo(w / 2, h * 0.38);
    ctx.lineTo(w - 14, h * 0.82);
    ctx.stroke();
  }, { repeat: true });
