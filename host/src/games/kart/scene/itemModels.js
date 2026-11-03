// Item models, painted-texture approach for the two shells: lathe dome + torus rim with the plate grooves and
// ridges painted into one canvas per kind (generated once, plus a bump map). Box and banana are sculpted
// (sculptedModels.js). createItemModel(kind) -> Object3D, origin at the bottom centre (box: centre).
// No `document` (node tests) -> shells fall back to flat colours.
import * as THREE from 'three';
import { createSculptedModel, disposeSculptedModels } from './sculptedModels.js';

// ── Tunables ──
const PAL = {
  green: { plate: '#2fd14a', groove: '#1d6b1f' },
  red: { plate: '#e8401e', groove: '#7a1a10' },
  rim: '#f2f2ee',
  under: '#f0dfa0',
  underLine: '#b89f55',
};
const SHELL = { R: 0.4, H: 0.54, rimY: 0.2, rimTube: 0.085, underR: 0.36 };

// ── Canvas painting helpers ──
function makeCanvas(w, h) {
  if (typeof document === 'undefined') return null;
  try {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const x = c.getContext('2d');
    return x ? { c, x } : null;
  } catch {
    return null;
  }
}

function toTexture(canvas, repeatU = true) {
  const t = new THREE.CanvasTexture(canvas);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeatU) t.wrapS = THREE.RepeatWrapping;
  return t;
}

// Paint twice from one drawing function: colour map and a grey bump map.
function paintPair(w, h, draw) {
  const col = makeCanvas(w, h);
  const bump = makeCanvas(w, h);
  if (!col || !bump) return null;
  draw(col.x, w, h, false);
  draw(bump.x, w, h, true);
  const bumpTex = toTexture(bump.c);
  bumpTex.colorSpace = THREE.NoColorSpace;
  return { map: toTexture(col.c), bump: bumpTex };
}

const lighten = (hex, k) => {
  const n = parseInt(hex.slice(1), 16);
  const f = (v) => Math.round(v + (255 - v) * k);
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
};

function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Shell dome: canvas y = 0 is the apex, y = h the rim. A top plate, 5 plates, 10 staggered plates, skirt.
const PLATE_RINGS = [
  { v0: 0, v1: 0.2, n: 1, off: 0 },
  { v0: 0.2, v1: 0.58, n: 5, off: 0 },
  { v0: 0.58, v1: 0.92, n: 10, off: 0.5 },
];
function drawDome(pal) {
  return (ctx, w, h, bump) => {
    ctx.fillStyle = bump ? '#000' : pal.groove;
    ctx.fillRect(0, 0, w, h);
    const gx = 6;
    const gy = 10;
    for (const { v0, v1, n, off } of PLATE_RINGS) {
      for (let k = -1; k <= n; k++) {
        const x0 = ((k + off) / n) * w + (n === 1 ? 0 : gx);
        const x1 = ((k + 1 + off) / n) * w - (n === 1 ? 0 : gx);
        const y0 = v0 * h + (v0 === 0 ? 0 : gy);
        const y1 = v1 * h - gy;
        if (n === 1 && k !== 0) continue;
        const cx = (x0 + x1) / 2;
        const cy = (y0 + y1) / 2;
        const grad = ctx.createRadialGradient(cx, cy - (y1 - y0) * 0.12, 0, cx, cy, Math.max(x1 - x0, (y1 - y0) * 1.4) * 0.6);
        if (bump) {
          grad.addColorStop(0, '#fff');
          grad.addColorStop(1, '#b0b0b0');
        } else {
          grad.addColorStop(0, lighten(pal.plate, 0.28));
          grad.addColorStop(0.6, pal.plate);
          grad.addColorStop(1, pal.plate);
        }
        ctx.fillStyle = grad;
        roundRect(ctx, x0, y0, x1 - x0, y1 - y0, 26);
        ctx.fill();
      }
    }
  };
}

// Underside: cream with ridge rings. Canvas y = 0 at the rim, y = h at the bottom pole.
function drawUnder(ctx, w, h, bump) {
  ctx.fillStyle = bump ? '#c8c8c8' : PAL.under;
  ctx.fillRect(0, 0, w, h);
  for (let i = 1; i <= 7; i++) {
    const y = (i / 8) * h;
    ctx.fillStyle = bump ? '#000' : PAL.underLine;
    ctx.fillRect(0, y - 4, w, 8);
    if (!bump) {
      ctx.fillStyle = lighten(PAL.under, 0.5);
      ctx.fillRect(0, y + 4, w, 3);
    }
  }
}

// ── Geometry builders ──
function lathe(pts, segs = 28) {
  return new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), segs);
}

function domeGeo() {
  const pts = [];
  const N = 16;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push([Math.max(1e-4, SHELL.R * Math.cos(a)), SHELL.rimY + SHELL.H * Math.sin(a)]);
  }
  return lathe(pts, 32);
}

function underGeo() {
  const pts = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * (Math.PI / 2);
    pts.push([Math.max(1e-4, SHELL.underR * Math.sin(a)), SHELL.rimY * (1 - Math.cos(a))]);
  }
  return lathe(pts, 24);
}

function rimGeo() {
  const g = new THREE.TorusGeometry(SHELL.R, SHELL.rimTube, 10, 32);
  g.rotateX(Math.PI / 2);
  g.scale(1, 0.9, 1);
  g.translate(0, SHELL.rimY, 0);
  return g;
}

// ── Per-kind cache: geometry, materials and textures built once, shared by every model ──
let cache = null;

function paintedMat(pair, fallback, extra = {}) {
  const m = new THREE.MeshPhysicalMaterial({
    color: pair ? 0xffffff : fallback, roughness: 0.32, clearcoat: 0.8, clearcoatRoughness: 0.2, ...extra,
  });
  if (pair) {
    m.map = pair.map;
    m.bumpMap = pair.bump;
    m.bumpScale = extra.bumpScale ?? 1.5;
    m.emissive.set(0xffffff);
    m.emissiveMap = pair.map;
    m.emissiveIntensity = extra.glow ?? 0.22;
  }
  return m;
}

function buildShell(kind) {
  const pal = PAL[kind];
  const dome = paintedMat(paintPair(1024, 512, drawDome(pal)), pal.plate, { bumpScale: 3 });
  const under = paintedMat(paintPair(256, 128, drawUnder), PAL.under, { clearcoat: 0.3, bumpScale: 2 });
  const rim = new THREE.MeshPhysicalMaterial({ color: PAL.rim, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.15 });
  return {
    parts: [
      { geo: domeGeo(), mat: dome },
      { geo: underGeo(), mat: under },
      { geo: rimGeo(), mat: rim },
    ],
  };
}

// Box and banana scored higher sculpted than painted, so they come from sculptedModels.js.
const SCULPTED = new Set(['box', 'banana']);
const BUILDERS = { green: () => buildShell('green'), red: () => buildShell('red') };

function kindData(kind) {
  cache ??= {};
  return (cache[kind] ??= BUILDERS[kind]());
}

export function createItemModel(kind) {
  if (SCULPTED.has(kind)) return createSculptedModel(kind);
  const g = new THREE.Group();
  for (const { geo, mat } of kindData(kind).parts) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !mat.transparent;
    g.add(mesh);
  }
  return g;
}

export function disposeItemModels() {
  disposeSculptedModels();
  for (const { parts } of Object.values(cache ?? {})) {
    for (const { geo, mat } of parts) {
      geo.dispose();
      for (const t of [mat.map, mat.bumpMap]) t?.dispose();
      mat.dispose();
    }
  }
  cache = null;
}
