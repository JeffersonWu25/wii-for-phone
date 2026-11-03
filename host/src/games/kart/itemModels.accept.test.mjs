// Acceptance tests for D2 logic criterion M6 (scene/itemModels.js, itemIcons.js). Visual M1-M5 are scored from shots.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from 'three';

// Canvas-texture models may draw a glyph at module load or first call; give node a no-op 2D canvas.
const ctxStub = new Proxy({}, {
  get: (t, k) => (k === 'width' ? 10 : k in t ? t[k] : (...a) => ctxStub),
  set: (t, k, v) => ((t[k] = v), true),
});
const fakeCanvas = () => ({ width: 0, height: 0, style: {}, getContext: () => ctxStub, addEventListener() {}, toDataURL: () => 'data:,' });
globalThis.document ??= { createElement: fakeCanvas };
globalThis.OffscreenCanvas ??= class { constructor(w, h) { Object.assign(this, fakeCanvas(), { width: w, height: h }); } };

const KINDS = ['box', 'green', 'red', 'banana'];
let createItemModel;
let disposeItemModels;
let ITEM_ICONS;

before(async () => {
  ({ createItemModel, disposeItemModels } = await import('./scene/itemModels.js'));
  ({ ITEM_ICONS } = await import('./itemIcons.js'));
});

const strip = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const meshes = (obj) => {
  const out = [];
  obj.traverse((o) => {
    if (o.geometry) out.push(o);
  });
  return out;
};
const tris = (m) => {
  if (!m.isMesh) return 0;
  const g = m.geometry;
  return (g.index ? g.index.count : g.attributes.position.count) / 3;
};
const boxOf = (obj) => {
  obj.updateMatrixWorld(true);
  const b = new THREE.Box3().setFromObject(obj);
  return { b, size: b.getSize(new THREE.Vector3()), c: b.getCenter(new THREE.Vector3()) };
};

// ── M6: API and sharing ──────────────────────────────────────────────────────

test('M6: createItemModel returns a fresh Object3D per call for every kind', () => {
  for (const k of KINDS) {
    const a = createItemModel(k);
    const b = createItemModel(k);
    assert.ok(a instanceof THREE.Object3D, k);
    assert.ok(b instanceof THREE.Object3D, k);
    assert.notEqual(a, b, `${k}: same instance returned twice`);
    assert.ok(meshes(a).length > 0, `${k}: has meshes`);
    const set = new Set();
    a.traverse((o) => set.add(o));
    b.traverse((o) => assert.ok(!set.has(o), `${k}: shares a child object between calls`));
  }
});

test('M6: geometry and material are shared per kind across calls', () => {
  for (const k of KINDS) {
    const a = meshes(createItemModel(k));
    const b = meshes(createItemModel(k));
    assert.equal(a.length, b.length, `${k}: same mesh count`);
    a.forEach((m, i) => {
      assert.equal(m.geometry, b[i].geometry, `${k}[${i}] geometry`);
      assert.equal(m.material, b[i].material, `${k}[${i}] material`);
      if (m.material?.map) assert.equal(m.material.map, b[i].material.map, `${k}[${i}] texture`);
    });
  }
});

test('M6: each model is at most 3000 triangles', () => {
  for (const k of KINDS) {
    const t = meshes(createItemModel(k)).reduce((n, m) => n + tris(m), 0);
    assert.ok(t > 0 && t <= 3000, `${k}: ${t} triangles`);
  }
});

// ── M6: origins and size ─────────────────────────────────────────────────────

test('M6: item box is centred on its origin, about 1.3 m', () => {
  const { size, c } = boxOf(createItemModel('box'));
  for (const v of [c.x, c.y, c.z]) assert.ok(Math.abs(v) <= 0.12, `centre ${c.toArray()}`);
  for (const v of [size.x, size.y, size.z]) assert.ok(v >= 1.1 && v <= 1.6, `size ${size.toArray()}`);
});

for (const [kind, lo, hi] of [['green', 0.75, 1.1], ['red', 0.75, 1.1]]) {
  test(`M6: ${kind} shell sits on its origin (bottom centre), ~0.9 m across`, () => {
    const { b, size, c } = boxOf(createItemModel(kind));
    assert.ok(Math.abs(b.min.y) <= 0.06, `min y ${b.min.y}`);
    assert.ok(Math.abs(c.x) <= 0.15 && Math.abs(c.z) <= 0.15, `centre ${c.toArray()}`);
    assert.ok(size.x >= lo && size.x <= hi && size.z >= lo && size.z <= hi, `size ${size.toArray()}`);
    assert.ok(size.y >= 0.2 && size.y <= 0.9, `height ${size.y}`);
  });
}

test('M6: banana sits on its origin (bottom centre), ~0.8 m tall', () => {
  const { b, size, c } = boxOf(createItemModel('banana'));
  assert.ok(Math.abs(b.min.y) <= 0.06, `min y ${b.min.y}`);
  assert.ok(Math.abs(c.x) <= 0.3 && Math.abs(c.z) <= 0.3, `centre ${c.toArray()}`);
  assert.ok(size.y >= 0.65 && size.y <= 0.95, `height ${size.y}`);
  assert.ok(size.x <= 1.3 && size.z <= 1.3, `footprint ${size.toArray()}`);
});

test('M6: green and red shells use different materials; disposeItemModels is callable and models rebuild after', () => {
  const g = meshes(createItemModel('green')).map((m) => m.material);
  const r = meshes(createItemModel('red')).map((m) => m.material);
  assert.ok(!g.some((m) => r.includes(m)), 'green and red share a material');
  assert.equal(typeof disposeItemModels, 'function');
  disposeItemModels();
  for (const k of KINDS) assert.ok(meshes(createItemModel(k)).length > 0, `${k} after dispose`);
});

// ── M6: no loaders ───────────────────────────────────────────────────────────

test('M6: itemModels.js loads no files or textures', () => {
  const src = strip(fs.readFileSync(new URL('./scene/itemModels.js', import.meta.url), 'utf8'));
  for (const re of [/Loader\b/, /\bfetch\s*\(/, /new\s+Image\b/, /XMLHttpRequest/, /\.(png|jpe?g|webp|gif|glb|gltf|hdr|ktx2?)\b/i, /import\.meta\.url/, /\bimport\s*\(/]) {
    assert.ok(!re.test(src), `forbidden: ${re}`);
  }
});

// ── M6: icons ────────────────────────────────────────────────────────────────

test('M6: ITEM_ICONS has exactly the 4 SVG strings, viewBox 0 0 64 64, self-contained', () => {
  assert.deepEqual(Object.keys(ITEM_ICONS).sort(), ['banana', 'green', 'mushroom', 'red']);
  const seen = new Set();
  for (const [k, svg] of Object.entries(ITEM_ICONS)) {
    assert.equal(typeof svg, 'string', k);
    const t = svg.trim();
    assert.ok(t.startsWith('<svg') && t.endsWith('</svg>'), `${k}: single svg element`);
    assert.match(t, /viewBox=["']0 0 64 64["']/, `${k}: viewBox`);
    assert.ok(t.length > 200, `${k}: not a placeholder (${t.length} chars)`);
    const noNs = t.replace(/xmlns(:\w+)?=["'][^"']*["']/g, '');
    assert.ok(!/https?:|<image|<script|<foreignObject|href=["'](?!#)/.test(noNs), `${k}: external reference`);
    assert.ok(!seen.has(t), `${k}: duplicates another icon`);
    seen.add(t);
  }
});

test('M6: host and phone itemIcons.js are identical', async () => {
  const host = new URL('./itemIcons.js', import.meta.url);
  const phone = new URL('../../../../phone/src/games/kart/itemIcons.js', import.meta.url);
  assert.equal(fs.readFileSync(phone, 'utf8'), fs.readFileSync(host, 'utf8'), 'file text differs');
  const mod = await import(phone.href);
  assert.deepEqual(mod.ITEM_ICONS, ITEM_ICONS);
});
