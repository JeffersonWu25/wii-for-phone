// Item models, painted-texture approach: smooth base shapes (lathe dome + torus rim, rounded cube, swept
// peel) with the detail (plate grooves, ridges, peel tints, "?" glyph, sparkle) painted into one canvas
// per kind, generated once, plus a bump map from the same drawing. createItemModel(kind) -> Object3D,
// origin at the bottom centre (box: centre). No `document` (node tests) -> models fall back to flat colours.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// ── Tunables ──
const PAL = {
  green: { plate: '#2fd14a', groove: '#1d6b1f' },
  red: { plate: '#e8401e', groove: '#7a1a10' },
  rim: '#f2f2ee',
  under: '#f0dfa0',
  underLine: '#b89f55',
  peel: '#f7e21b',
  peelTop: '#a6d43a',
  tip: '#6b3b1a',
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

// Banana: canvas y = 0 is the stalk top, 0.5 the stalk base / flap roots, 1 the flap tips.
function drawPeel(ctx, w, h, bump) {
  const stops = [
    [0, PAL.tip], [0.045, PAL.tip], [0.06, PAL.peelTop], [0.2, '#c8e030'], [0.34, PAL.peel],
    [0.5, PAL.peel], [0.93, PAL.peel], [0.945, PAL.tip], [1, PAL.tip],
  ];
  const g = ctx.createLinearGradient(0, 0, 0, h);
  for (const [o, c] of stops) g.addColorStop(o, bump ? '#d0d0d0' : c);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  for (let k = 0; k < 5; k++) {
    const x = ((k + 0.5) / 5) * w;
    ctx.fillStyle = bump ? '#000' : 'rgba(150,120,0,0.28)';
    ctx.fillRect(x - 3, h * 0.07, 6, h * 0.86);
  }
  if (!bump) {
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(w * 0.18, h * 0.08, w * 0.12, h * 0.84);
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

// Elliptical tube swept along a curve. `rad(t)` -> [ra, rb]: ra across `side`, rb across the other axis.
// Texture v runs s0 -> s1 (0 = canvas top) along the path; the ends are closed with zero-radius rings.
function sweep(points, side, rad, s0, s1, steps = 14, segs = 14) {
  const curve = new THREE.CatmullRomCurve3(points);
  const pos = [];
  const nor = [];
  const uv = [];
  const idx = [];
  const rings = [];
  for (let i = -1; i <= steps + 1; i++) rings.push(i);
  rings.forEach((i, ri) => {
    const t = Math.min(1, Math.max(0, i / steps));
    const cap = i < 0 || i > steps;
    const p = curve.getPointAt(t);
    const T = curve.getTangentAt(t);
    const S = side.clone().addScaledVector(T, -side.dot(T)).normalize();
    const N = new THREE.Vector3().crossVectors(T, S);
    const [ra, rb] = cap ? [1e-4, 1e-4] : rad(t);
    const s = s0 + (s1 - s0) * t;
    for (let j = 0; j <= segs; j++) {
      const phi = (j / segs) * Math.PI * 2;
      const c = Math.cos(phi);
      const sn = Math.sin(phi);
      pos.push(p.x + c * ra * S.x + sn * rb * N.x, p.y + c * ra * S.y + sn * rb * N.y, p.z + c * ra * S.z + sn * rb * N.z);
      const n = new THREE.Vector3().addScaledVector(S, c / Math.max(ra, 0.02)).addScaledVector(N, sn / Math.max(rb, 0.02)).normalize();
      if (cap) n.copy(T).multiplyScalar(i < 0 ? -1 : 1);
      nor.push(n.x, n.y, n.z);
      uv.push(j / segs, 1 - s);
      if (ri > 0 && j < segs) {
        const a = (ri - 1) * (segs + 1) + j;
        const b = ri * (segs + 1) + j;
        idx.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const smooth = (a, b, t) => {
  const k = Math.min(1, Math.max(0, (t - a) / (b - a)));
  return k * k * (3 - 2 * k);
};

function bananaGeo() {
  const parts = [];
  // Upright stalk, slightly bent: thin brown-tipped top swelling into the fat peel body.
  parts.push(sweep([V(-0.03, 0.8, 0), V(0.0, 0.64, 0), V(0.02, 0.46, 0), V(0, 0.3, 0)], V(1, 0, 0),
    (t) => [0.06 + 0.14 * smooth(0, 0.6, t), 0.05 + 0.11 * smooth(0, 0.6, t)], 0, 0.5, 14, 16));
  // Three flaps splayed out and down, tips curling back up.
  for (let k = 0; k < 3; k++) {
    const th = (k / 3) * Math.PI * 2 + 0.5;
    const d = V(Math.cos(th), 0, Math.sin(th));
    const at = (r, y) => V(d.x * r, y, d.z * r);
    parts.push(sweep([at(0, 0.36), at(0.1, 0.27), at(0.25, 0.13), at(0.4, 0.07), at(0.51, 0.11), at(0.56, 0.2)],
      V(-d.z, 0, d.x), (t) => [0.17 - 0.09 * t, 0.06 - 0.02 * t], 0.5, 1, 16, 14));
  }
  const g = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  return g;
}

// Box: rounded cube, plus 4 glyph quads just inside the walls, each facing outward.
function boxGeos() {
  const body = new RoundedBoxGeometry(1.3, 1.3, 1.3, 4, 0.14);
  const quads = [];
  for (let k = 0; k < 4; k++) {
    const q = new THREE.PlaneGeometry(0.78, 0.78);
    q.rotateY((k * Math.PI) / 2);
    const a = (k * Math.PI) / 2;
    q.translate(Math.sin(a) * 0.5, 0, Math.cos(a) * 0.5);
    quads.push(q);
  }
  const glyph = mergeGeometries(quads);
  quads.forEach((q) => q.dispose());
  return { body, glyph };
}

function drawBoxFace(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, 'rgba(176,246,190,0.8)');
  g.addColorStop(0.5, 'rgba(150,236,214,0.8)');
  g.addColorStop(1, 'rgba(168,240,240,0.8)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.fillStyle = 'rgba(255,255,255,0.18)';
  ctx.beginPath();
  ctx.moveTo(0, h * 0.62);
  ctx.lineTo(w * 0.62, 0);
  ctx.lineTo(w * 0.86, 0);
  ctx.lineTo(0, h * 0.86);
  ctx.fill();
  ctx.strokeStyle = '#e8fff0';
  ctx.lineWidth = 12;
  ctx.strokeRect(6, 6, w - 12, h - 12);
  ctx.fillStyle = '#fff';
  for (let i = 0; i < 14; i++) {
    const x = (Math.sin(i * 12.9898) * 43758.5453 % 1 + 1) % 1;
    const y = (Math.sin(i * 78.233) * 12345.678 % 1 + 1) % 1;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(14 + x * (w - 28), 14 + y * (h - 28), 3, 3);
  }
  ctx.globalAlpha = 1;
}

function drawGlyph(ctx, w, h) {
  ctx.clearRect(0, 0, w, h);
  ctx.font = '900 190px "Arial Black", Arial, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 26;
  ctx.strokeStyle = '#5aa0ff';
  ctx.strokeText('?', w / 2, h / 2 + 8);
  ctx.fillStyle = '#ffffff';
  ctx.fillText('?', w / 2, h / 2 + 8);
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

function buildBanana() {
  const mat = paintedMat(paintPair(256, 512, drawPeel), PAL.peel, { roughness: 0.4, clearcoat: 0.25, bumpScale: 0.4, glow: 0.85 });
  return { parts: [{ geo: bananaGeo(), mat }] };
}

function buildBox() {
  const { body, glyph } = boxGeos();
  const face = makeCanvas(256, 256);
  const gl = makeCanvas(256, 256);
  if (face) drawBoxFace(face.x, 256, 256);
  if (gl) drawGlyph(gl.x, 256, 256);
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: face ? 0xffffff : 0x9fe8a8, map: face ? toTexture(face.c, false) : null, transparent: true,
    opacity: face ? 0.58 : 0.45, roughness: 0.15, clearcoat: 1, iridescence: 1, iridescenceIOR: 1.6,
    side: THREE.DoubleSide, depthWrite: false,
  });
  const glyphMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, map: gl ? toTexture(gl.c, false) : null, transparent: true, depthWrite: false, toneMapped: false,
  });
  return { parts: [{ geo: body, mat: bodyMat, order: 1 }, { geo: glyph, mat: glyphMat, order: 0 }] };
}

const BUILDERS = { box: buildBox, green: () => buildShell('green'), red: () => buildShell('red'), banana: buildBanana };

function kindData(kind) {
  cache ??= {};
  return (cache[kind] ??= BUILDERS[kind]());
}

export function createItemModel(kind) {
  const g = new THREE.Group();
  for (const { geo, mat, order } of kindData(kind).parts) {
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = !mat.transparent;
    if (order !== undefined) mesh.renderOrder = order;
    g.add(mesh);
  }
  return g;
}

export function disposeItemModels() {
  for (const { parts } of Object.values(cache ?? {})) {
    for (const { geo, mat } of parts) {
      geo.dispose();
      for (const t of [mat.map, mat.bumpMap]) t?.dispose();
      mat.dispose();
    }
  }
  cache = null;
}
