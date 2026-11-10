// Building blocks for the Coconut Coast world: track-swept geometry (a 2D cross-section profile swept along the road samples,
// so every edge follows curves, grades and banks), a merge-everything Batch for placed models, and shared materials.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { canvasTex } from '../textures.js';
import { rng } from '../sky.js';

export { rng };
export const SEA_LEVEL = -1.2;

export const COL = {
  wood: 0xb9783d,
  woodDark: 0x7a4a24,
  woodLight: 0xd9a05a,
  rope: 0xe9d8a6,
  rock: 0xd2d0cc,
  rockWarm: 0xe0cdb0,
  rockDark: 0x6c6c74,
  grass: 0x4fa83a,
  grassDark: 0x2e8a2e,
  sand: 0xf0d58a,
  sandWet: 0xd9bb70,
  red: 0xe63a2e,
  white: 0xf7f3ea,
  yellow: 0xffc933,
  teal: 0x23c2c9,
  thatch: 0xd9b45a,
  trunk: 0x8a5a2e,
  leaf: 0x2f9e3a,
  leafLight: 0x58c24a,
};

// ── Textures (canvas only) ───────────────────────────────────────────────────────────────────────────────────────────
const cache = new Map();
const once = (key, make) => {
  if (!cache.has(key)) cache.set(key, make());
  return cache.get(key);
};

// Boards run along the road (v). One tile = 4 m x 4 m: 8 planks across, butt joints staggered along v.
export const plankTex = () =>
  once('plank', () =>
    canvasTex(512, 512, (ctx, w, h) => {
      const r = rng(11);
      const pw = w / 8;
      for (let i = 0; i < 8; i++) {
        let y = r() * 140;
        while (y < h + 140) {
          const len = 150 + r() * 190;
          const tone = 0.82 + r() * 0.3;
          ctx.fillStyle = `rgb(${Math.round(205 * tone)},${Math.round(142 * tone)},${Math.round(78 * tone)})`;
          const y0 = y - 140;
          ctx.fillRect(i * pw + 2, y0 + 3, pw - 4, len - 4);
          ctx.strokeStyle = 'rgba(90,50,20,0.28)';
          ctx.lineWidth = 1.5;
          for (let g = 0; g < 4; g++) {
            const gx = i * pw + 8 + r() * (pw - 16);
            ctx.beginPath();
            ctx.moveTo(gx, y0 + 6);
            ctx.lineTo(gx + (r() - 0.5) * 6, y0 + len - 6);
            ctx.stroke();
          }
          ctx.fillStyle = 'rgba(60,35,15,0.55)';
          ctx.fillRect(i * pw + 6, y0 + 8, 3, 3);
          ctx.fillRect(i * pw + pw - 9, y0 + 8, 3, 3);
          y += len;
        }
        ctx.fillStyle = 'rgba(50,28,12,0.9)';
        ctx.fillRect(i * pw - 1.5, 0, 3, h);
      }
    }, { repeat: true })
  );

export const rockTex = () =>
  once('rock', () =>
    canvasTex(512, 512, (ctx, w, h) => {
      const r = rng(23);
      ctx.fillStyle = '#cfcbc4';
      ctx.fillRect(0, 0, w, h);
      for (let b = 0; b < 26; b++) {
        const y = (b / 26) * h;
        const tone = 170 + Math.floor(r() * 60);
        ctx.fillStyle = `rgba(${tone},${tone - 4},${tone - 8},0.55)`;
        ctx.beginPath();
        ctx.moveTo(0, y);
        for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.03 + b) * 5 + (r() - 0.5) * 4);
        ctx.lineTo(w, y + h / 26);
        for (let x = w; x >= 0; x -= 32) ctx.lineTo(x, y + h / 26 + Math.sin(x * 0.03 + b + 1) * 5);
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(40,40,50,0.5)';
      ctx.lineWidth = 2;
      for (let c = 0; c < 38; c++) {
        let x = r() * w;
        let y = r() * h;
        ctx.beginPath();
        ctx.moveTo(x, y);
        for (let k = 0; k < 4; k++) {
          x += (r() - 0.5) * 30;
          y += 14 + r() * 26;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      for (let n = 0; n < 1400; n++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
        ctx.fillRect(r() * w, r() * h, 3, 3);
      }
    }, { repeat: true })
  );

export const thatchTex = () =>
  once('thatch', () =>
    canvasTex(256, 256, (ctx, w, h) => {
      const r = rng(5);
      ctx.fillStyle = '#d9b457';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 90; i++) {
        const tone = 150 + Math.floor(r() * 90);
        ctx.strokeStyle = `rgba(${tone},${Math.floor(tone * 0.78)},${Math.floor(tone * 0.3)},0.8)`;
        ctx.lineWidth = 2 + r() * 2;
        const x = r() * w;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + (r() - 0.5) * 10, h);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(80,50,10,0.35)';
      for (let y = 0; y < h; y += 64) ctx.fillRect(0, y, w, 4);
    }, { repeat: true })
  );

// Four awning colourways, one per row (v = (row + 0.5) / 4): red, orange, teal, blue stripes on cream. u repeats 8 stripes.
export const AWNING = [['#e63a2e', '#fff5e0'], ['#ff9a1f', '#ffe9a8'], ['#1fb5b0', '#fff5e0'], ['#2f6fe0', '#fff5e0']];
export const awningTex = () =>
  once('awn', () =>
    canvasTex(128, 128, (ctx, w, h) => {
      AWNING.forEach(([a, b], row) => {
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? b : a;
          ctx.fillRect((i * w) / 8, row * 32, w / 8 + 1, 32);
        }
      });
    }, { repeat: true })
  );

export const signTex = () =>
  once('sign', () =>
    canvasTex(1024, 256, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, '#d9953f');
      g.addColorStop(1, '#a8652a');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(70,35,10,0.35)';
      ctx.lineWidth = 3;
      for (let y = 40; y < h; y += 44) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
        ctx.stroke();
      }
      ctx.lineWidth = 10;
      ctx.strokeStyle = '#5a3216';
      ctx.strokeRect(5, 5, w - 10, h - 10);
      ctx.font = '900 150px "Arial Black", Impact, Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = 22;
      ctx.strokeStyle = '#4a2a0e';
      ctx.strokeText('COCONUT COAST', w / 2, h / 2 + 6, w * 0.9);
      ctx.fillStyle = '#ffd84a';
      ctx.fillText('COCONUT COAST', w / 2, h / 2 + 6, w * 0.9);
    })
  );

export const chevronTex = () =>
  once('chevron', () =>
    canvasTex(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#d82a2a';
      ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 34;
      for (const x of [60, 138]) {
        ctx.beginPath();
        ctx.moveTo(x, 40);
        ctx.lineTo(x + 70, h / 2);
        ctx.lineTo(x, h - 40);
        ctx.stroke();
      }
      ctx.lineWidth = 12;
      ctx.strokeRect(6, 6, w - 12, h - 12);
    })
  );

// Dark wet road for the tunnel: u across the full width, v along 10 m. Edge lines, dashed centre, puddle glints.
export const wetRoadTex = () =>
  once('wet', () =>
    canvasTex(256, 512, (ctx, w, h) => {
      const r = rng(41);
      ctx.fillStyle = '#2b2f3a';
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) {
        const t = 30 + Math.floor(r() * 36);
        ctx.fillStyle = `rgb(${t},${t + 3},${t + 12})`;
        ctx.fillRect(r() * w, r() * h, 2 + r() * 3, 2 + r() * 3);
      }
      for (let i = 0; i < 9; i++) {
        const x = r() * w;
        const y = r() * h;
        const g = ctx.createRadialGradient(x, y, 2, x, y, 30 + r() * 40);
        g.addColorStop(0, 'rgba(150,190,230,0.5)');
        g.addColorStop(1, 'rgba(150,190,230,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 80, y - 80, 160, 160);
      }
      ctx.fillStyle = 'rgba(235,235,225,0.9)';
      ctx.fillRect(10, 0, 5, h);
      ctx.fillRect(w - 15, 0, 5, h);
      for (let k = 0; k < 2; k++) ctx.fillRect(w / 2 - 3, k * (h / 2) + 20, 6, h / 4);
    }, { repeat: true })
  );

export const waterfallTex = () =>
  once('fall', () =>
    canvasTex(128, 256, (ctx, w, h) => {
      const r = rng(77);
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, '#9fe6ff');
      g.addColorStop(0.5, '#e8fbff');
      g.addColorStop(1, '#9fe6ff');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) {
        const x = r() * w;
        ctx.strokeStyle = r() < 0.6 ? 'rgba(255,255,255,0.9)' : 'rgba(80,170,230,0.55)';
        ctx.lineWidth = 2 + r() * 4;
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
        ctx.stroke();
      }
    }, { repeat: true })
  );

// One atlas for the flat-coloured models with a few textured faces (sign, thatch, awnings), so a family of props costs one
// draw call. v from the bottom: [0, 1/16] white (default uv), [1/16, 1/16 + 4/16] awnings, then thatch, then the sign.
export const ATLAS = {
  awning: (row) => ({ u0: 0, u1: 1, v0: 1 / 16 + row * 0.0625 + 0.004, v1: 1 / 16 + (row + 1) * 0.0625 - 0.004 }),
  thatch: { u0: 0, u1: 1, v0: 0.33, v1: 0.58 },
  sign: { u0: 0, u1: 1, v0: 0.6, v1: 0.98 },
};
export function uvRegion(geo, r) {
  const uv = geo.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, r.u0 + uv.getX(i) * (r.u1 - r.u0), r.v0 + uv.getY(i) * (r.v1 - r.v0));
  return geo;
}
export const atlasTex = () =>
  once('atlas', () =>
    canvasTex(1024, 1024, (ctx, w, h) => {
      const rr = rng(5);
      const y = (v) => h - v * h; // canvas y for a v coordinate
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, y(1 / 16), w, (1 / 16) * h);
      AWNING.forEach(([a, b], row) => {
        const top = y(1 / 16 + (row + 1) * 0.0625);
        for (let i = 0; i < 8; i++) {
          ctx.fillStyle = i % 2 ? b : a;
          ctx.fillRect((i * w) / 8, top, w / 8 + 1, 0.0625 * h);
        }
      });
      // thatch
      const t0 = y(0.58);
      const th = 0.25 * h;
      ctx.fillStyle = '#d9b457';
      ctx.fillRect(0, t0, w, th);
      for (let i = 0; i < 160; i++) {
        const tone = 150 + Math.floor(rr() * 90);
        ctx.strokeStyle = `rgba(${tone},${Math.floor(tone * 0.78)},${Math.floor(tone * 0.3)},0.8)`;
        ctx.lineWidth = 3 + rr() * 3;
        const x = rr() * w;
        ctx.beginPath();
        ctx.moveTo(x, t0);
        ctx.lineTo(x + (rr() - 0.5) * 12, t0 + th);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(80,50,10,0.35)';
      for (let yy = 0; yy < th; yy += 64) ctx.fillRect(0, t0 + yy, w, 5);
      // sign
      const sTop = y(0.98);
      const sh = 0.38 * h;
      ctx.drawImage(signTex().image, 0, sTop, w, sh);
    })
  );
export const awningMatRow = null;

// ── Materials ────────────────────────────────────────────────────────────────────────────────────────────────────────
const lam = (opts) => new THREE.MeshLambertMaterial({ side: THREE.DoubleSide, ...opts });
const off = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
export const mats = {
  col: () => once('m:col', () => lam({ vertexColors: true })),
  wood: () => once('m:wood', () => lam({ vertexColors: true, map: plankTex(), ...off })),
  rock: () => once('m:rock', () => lam({ vertexColors: true, map: rockTex() })),
  thatch: () => once('m:thatch', () => lam({ vertexColors: true, map: thatchTex() })),
  awning: () => once('m:awning', () => lam({ vertexColors: true, map: awningTex() })),
  atlas: () => once('m:atlas', () => lam({ vertexColors: true, map: atlasTex() })),
  sign: () => once('m:sign', () => lam({ map: signTex() })),
  chevron: () => once('m:chev', () => lam({ map: chevronTex() })),
  wet: () => once('m:wet', () => lam({ map: wetRoadTex(), ...off })),
  sand: () => once('m:sand', () => lam({ vertexColors: true, ...off })),
  glow: () => once('m:glow', () => new THREE.MeshBasicMaterial({ vertexColors: true })),
};

// ── Batch: many small placed models merged into one geometry ─────────────────────────────────────────────────────────
const KEEP = ['position', 'normal', 'uv', 'color'];

export function tint(geo, color) {
  const n = geo.attributes.position.count;
  const c = new THREE.Color(color);
  const arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) arr.set([c.r, c.g, c.b], i * 3);
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return geo;
}

function normalize(geo) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!KEEP.includes(k)) g.deleteAttribute(k);
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

export class Batch {
  constructor() {
    this.geos = [];
  }

  // `geo` is cloned, transformed by `matrix` and coloured; color = null keeps an existing colour attribute.
  add(geo, matrix, color = 0xffffff, keepUv = false) {
    const g = normalize(geo.clone());
    if (color !== null && !keepUv) {
      const uv = g.attributes.uv;
      for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, 0.02); // the atlas's white band
    }
    if (matrix) g.applyMatrix4(matrix);
    if (color !== null) tint(g, color);
    this.geos.push(g);
    return this;
  }

  get size() {
    return this.geos.length;
  }

  geometry() {
    return this.geos.length ? mergeGeometries(this.geos) : null;
  }

  mesh(material, { shadow = false, receive = false } = {}) {
    if (!this.geos.length) return null;
    const m = new THREE.Mesh(mergeGeometries(this.geos), material);
    m.castShadow = shadow;
    m.receiveShadow = receive;
    return m;
  }
}

const Q = new THREE.Quaternion();
const V3 = new THREE.Vector3();
const S3 = new THREE.Vector3();
const EU = new THREE.Euler();
// Position, yaw, scale (+ optional pitch/roll) as a matrix.
export const xform = (x, y, z, ry = 0, sx = 1, sy = sx, sz = sx, rx = 0, rz = 0) => {
  EU.set(rx, ry, rz, 'YXZ');
  Q.setFromEuler(EU);
  return new THREE.Matrix4().compose(V3.set(x, y, z), Q, S3.set(sx, sy, sz));
};

// A prop group `prop:<kind>`. `cull` > 0 hides it when the camera is farther than that from `center` (see world tick).
export function propGroup(kind, meshes, cull = 0) {
  const g = new THREE.Group();
  g.name = `prop:${kind}`;
  for (const m of meshes) if (m) g.add(m);
  g.userData.cull = cull;
  return g;
}

// ── Track rows ───────────────────────────────────────────────────────────────────────────────────────────────────────
export function rowsOf(track, s0, s1, step = 1) {
  const ds = track.sampleStep;
  const N = track.samples.length - 1;
  const n = Math.max(1, Math.round((s1 - s0) / step));
  const out = [];
  for (let i = 0; i <= n; i++) {
    const s = s0 + ((s1 - s0) * i) / n;
    const f = track.frameAt(s);
    const sp = track.samples[Math.min(N, Math.round(f.s / ds))];
    out.push({
      s,
      sw: f.s,
      h: f.h,
      f,
      sp,
      hw: f.halfWidth,
      limL: f.halfWidth + sp.curbL + sp.runL,
      limR: f.halfWidth + sp.curbR + sp.runR,
      hardL: sp.runL < 0.3,
      hardR: sp.runR < 0.3,
      at(lat, dy = 0) {
        return [f.x + f.rx * lat, track.heightAt(f.s, lat) + dy, f.z + f.rz * lat];
      },
    });
  }
  return out;
}

// Sweep. `profile(row, i)` returns strips (arrays of points { lat, dy, u?, v?, c?, abs? }) or null to break the ribbon.
// dy is relative to the road surface at `lat`; `abs: [x, y, z]` places a point absolutely.
export function sweep(rows, profile, { uScale = 0.25, color = 0xffffff } = {}) {
  const pos = [];
  const uv = [];
  const col = [];
  const idx = [];
  const tmp = new THREE.Color();
  let prev = null;
  rows.forEach((row, ri) => {
    const strips = profile(row, ri);
    if (!strips) {
      prev = null;
      return;
    }
    const cur = strips.map((pts) =>
      pts.map((p) => {
        const at = p.abs ?? row.at(p.lat, p.dy ?? 0);
        const o = pos.length / 3;
        pos.push(at[0], at[1], at[2]);
        uv.push(p.u ?? row.sw * uScale, p.v ?? 0);
        tmp.set(p.c ?? color);
        col.push(tmp.r, tmp.g, tmp.b);
        return o;
      })
    );
    if (prev && prev.length === cur.length && prev.every((p, k) => p.length === cur[k].length)) {
      cur.forEach((strip, k) => {
        for (let j = 0; j < strip.length - 1; j++) {
          const a = prev[k][j];
          const b = prev[k][j + 1];
          const c = strip[j];
          const d = strip[j + 1];
          idx.push(a, c, b, b, c, d);
        }
      });
    }
    prev = cur;
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

export const ring = (lat, dy, r, n = 6, c) =>
  Array.from({ length: n + 1 }, (_, k) => {
    const a = (k / n) * Math.PI * 2;
    return { lat: lat + Math.cos(a) * r, dy: dy + Math.sin(a) * r, c };
  });

export function place(track, s, lat, dy = 0) {
  const f = track.frameAt(s);
  return { x: f.x + f.rx * lat, y: track.heightAt(f.s, lat) + dy, z: f.z + f.rz * lat, h: f.h, f };
}

export const lerp = (a, b, t) => a + (b - a) * t;
export const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
export function keyed(keys, s) {
  if (s <= keys[0][0]) return keys[0][1];
  for (let i = 0; i < keys.length - 1; i++) {
    const [a, va] = keys[i];
    const [b, vb] = keys[i + 1];
    if (s <= b) return lerp(va, vb, smooth(a, b, s));
  }
  return keys[keys.length - 1][1];
}

export function section(id) {
  const g = new THREE.Group();
  g.name = `section:${id}`;
  return g;
}

// Mark `obj` to be hidden when the camera is farther than `dist` m from (x, z). Keeps far small props out of the draw list.
export function lodAt(ctx, obj, x, z, dist) {

  return obj;
}
