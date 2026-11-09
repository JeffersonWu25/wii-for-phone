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
const meshes = (obj) => {
  const out = [];
  obj.traverse((o) => {
    if (o.geometry) out.push(o);
  });
  return out;
};
let createItemModel;
let disposeItemModels;
let ITEM_ICONS;

before(async () => {
  ({ createItemModel, disposeItemModels } = await import('./scene/itemModels.js'));
  ({ ITEM_ICONS } = await import('./itemIcons.js'));
});

// ── API and sharing ──────────────────────────────────────────────────────

test('createItemModel returns a fresh Object3D per call for every kind', () => {
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

test('geometry and material are shared per kind across calls', () => {
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

// ── origins and size ─────────────────────────────────────────────────────

test('green and red shells use different materials; disposeItemModels is callable and models rebuild after', () => {
  const g = meshes(createItemModel('green')).map((m) => m.material);
  const r = meshes(createItemModel('red')).map((m) => m.material);
  assert.ok(!g.some((m) => r.includes(m)), 'green and red share a material');
  assert.equal(typeof disposeItemModels, 'function');
  disposeItemModels();
  for (const k of KINDS) assert.ok(meshes(createItemModel(k)).length > 0, `${k} after dispose`);
});

// ── no loaders ───────────────────────────────────────────────────────────

// ── icons ────────────────────────────────────────────────────────────────

test('ITEM_ICONS has exactly the 4 SVG strings, viewBox 0 0 64 64, self-contained', () => {
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

test('host and phone itemIcons.js are identical', async () => {
  const host = new URL('./itemIcons.js', import.meta.url);
  const phone = new URL('../../../../phone/src/games/kart/itemIcons.js', import.meta.url);
  assert.equal(fs.readFileSync(phone, 'utf8'), fs.readFileSync(host, 'utf8'), 'file text differs');
  const mod = await import(phone.href);
  assert.deepEqual(mod.ITEM_ICONS, ITEM_ICONS);
});
