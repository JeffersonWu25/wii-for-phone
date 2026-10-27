import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const assetDir = join(dirname(fileURLToPath(import.meta.url)), '../../../public/kart-items');

globalThis.self = globalThis;
if (typeof globalThis.ProgressEvent !== 'function') {
  globalThis.ProgressEvent = class ProgressEvent extends Event {
    constructor(type, init = {}) {
      super(type);
      this.lengthComputable = !!init.lengthComputable;
      this.loaded = init.loaded || 0;
      this.total = init.total || 0;
    }
  };
}
if (typeof globalThis.createImageBitmap !== 'function') {
  globalThis.createImageBitmap = async (blob) => {
    const bytes = typeof blob?.arrayBuffer === 'function' ? (await blob.arrayBuffer()).byteLength : 1;
    return { width: 8, height: 8, close() {}, byteLength: bytes };
  };
}

const realFetch = globalThis.fetch.bind(globalThis);
const OriginalRequest = globalThis.Request;

globalThis.Request = class extends OriginalRequest {
  constructor(input, init) {
    if (typeof input === 'string' && input.startsWith('/')) {
      input = `http://127.0.0.1${input}`;
    }
    super(input, init);
  }
};

function serveAssets() {
  globalThis.fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.url;
    if (url.startsWith('blob:') || url.startsWith('data:')) return realFetch(input, init);
    const name = new URL(url).pathname.split('/').pop();
    const buf = readFileSync(join(assetDir, name));
    const body = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    return new Response(body, {
      status: 200,
      headers: { 'Content-Type': 'model/gltf-binary' },
    });
  };
}

function named(root, name) {
  const found = [];
  root.traverse((obj) => {
    if (obj.name === name) found.push(obj);
  });
  return found;
}

function rigsNamed(scene, name) {
  return scene.children.filter((child) => child.name === name);
}

test('createItemView accepts the catalog before any GLB fetch', async () => {
  const { createItemView } = await import('./item-view.js');
  const view = createItemView();
  const THREE = await import('three');
  const scene = new THREE.Scene();
  const race = {
    timeMs: 0,
    entities: [{ id: 1, kind: 'box', x: 0, z: 0, roadY: 0, tier: 0, cooldown: 0 }],
    karts: [],
  };
  view.sync(scene, race, [], 0);
  assert.equal(scene.children.length, 0);
  view.release(scene);
  view.release(scene);
});

test('item view poses GLBs, bursts, held props, and the use flash', async () => {
  const { createItemView } = await import('./item-view.js');
  const THREE = await import('three');
  const scene = new THREE.Scene();
  const empty = {
    timeMs: 0,
    entities: [{ id: 1, kind: 'box', itemId: 'box', x: 0, z: 0, roadY: 0, tier: 0, cooldown: 0 }],
    karts: [],
  };

  globalThis.fetch = async () => {
    throw new Error('item glb failed');
  };
  const broken = createItemView();
  await broken.load();
  let throws = 0;
  for (let i = 0; i < 12; i++) {
    try {
      broken.sync(scene, empty, [], i);
    } catch (err) {
      assert.match(err.message, /item glb failed/);
      throws += 1;
    }
  }
  assert.equal(throws, 6);
  assert.doesNotThrow(() => broken.sync(scene, empty, [], 40));
  assert.equal(scene.children.length, 0);
  broken.release(scene);

  serveAssets();
  const view = createItemView();
  await view.load();

  const entities = [
    { id: 1, kind: 'box', x: 0, z: 0, roadY: 0, tier: 0, cooldown: 0 },
    { id: 2, kind: 'box', x: 0, z: 0, roadY: 0, tier: 1, cooldown: 0 },
    { id: 3, kind: 'banana', itemId: 'banana', x: 3, z: 4, roadY: 0.4 },
    { id: 4, kind: 'shell', itemId: 'green_shell', x: 1, z: 1, roadY: 0.2, vx: 0, vz: 1 },
    { id: 5, kind: 'shell', itemId: 'red_shell', x: 2, z: 2, roadY: 0.2, vx: 1, vz: 0 },
    { id: 6, kind: 'shell', itemId: 'not-a-shell', x: 9, z: 9, roadY: 0, vx: 0, vz: 1 },
  ];
  const race = { timeMs: 0, entities, karts: [] };
  view.sync(scene, race, [], 0);

  assert.deepEqual(
    scene.children.map((child) => child.name).sort(),
    ['banana', 'box', 'box', 'green_shell', 'red_shell'],
  );

  const boxes = rigsNamed(scene, 'box').sort((a, b) => a.position.y - b.position.y);
  const markA = named(boxes[0], 'question_mark_face_0_1')[0];
  const markB = named(boxes[1], 'question_mark_face_0_1')[0];
  assert.equal(markA.material.isMeshBasicMaterial, true);
  assert.notEqual(markA.geometry.uuid, markB.geometry.uuid);
  assert.notEqual(markA.material.uuid, markB.material.uuid);
  assert.ok(markA.material.map);
  assert.equal(markA.material.map.uuid, markB.material.map.uuid);

  const low = new THREE.Box3().setFromObject(boxes[0]);
  const high = new THREE.Box3().setFromObject(boxes[1]);
  assert.ok(high.min.y > low.max.y);
  assert.ok(low.min.y > 0.4);

  const y0 = boxes[0].position.y;
  view.sync(scene, race, [], 700);
  assert.ok(Math.abs(boxes[0].rotation.y - 1) < 1e-6);
  view.sync(scene, race, [], (900 * Math.PI) / 2);
  assert.ok(Math.abs(boxes[0].position.y - y0 - 0.08) < 1e-6);

  const banana = rigsNamed(scene, 'banana')[0];
  const bananaBox = new THREE.Box3().setFromObject(banana);
  assert.ok(Math.abs(bananaBox.min.y - 0.4) < 0.02);

  const green = rigsNamed(scene, 'green_shell')[0];
  const red = rigsNamed(scene, 'red_shell')[0];
  assert.ok(Math.abs(green.rotation.y - Math.atan2(0, 1)) < 1e-6);
  assert.ok(Math.abs(red.rotation.y - Math.atan2(1, 0)) < 1e-6);
  const shellSpinNow = (900 * Math.PI) / 2;
  assert.ok(Math.abs(green.children[0].rotation.y - shellSpinNow / 180) < 1e-6);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(green).min.y - 0.2) < 0.02);
  assert.ok(Math.abs(new THREE.Box3().setFromObject(red).min.y - 0.2) < 0.02);
  const greenDome = named(green, 'colored_dome')[0];
  const redDome = named(red, 'colored_dome')[0];
  assert.equal(greenDome.material.isMeshLambertMaterial, true);
  assert.ok(greenDome.material.color.g > greenDome.material.color.r);
  assert.ok(redDome.material.color.r > redDome.material.color.g);
  assert.notEqual(greenDome.material.uuid, redDome.material.uuid);

  entities[0].cooldown = 3;
  const burstAt = 2000;
  view.sync(scene, race, [], burstAt);
  assert.equal(boxes[0].visible, false);
  assert.equal(boxes[1].visible, true);
  assert.equal(scene.children.filter((child) => child.name === 'item-burst').length, 1);
  view.sync(scene, race, [], burstAt);
  assert.equal(scene.children.filter((child) => child.name === 'item-burst').length, 1);
  view.sync(scene, race, [], burstAt + 400);
  assert.equal(scene.children.filter((child) => child.name === 'item-burst').length, 0);
  entities[0].cooldown = 0;
  view.sync(scene, race, [], burstAt + 500);
  assert.equal(boxes[0].visible, true);
  assert.equal(scene.children.filter((child) => child.name === 'item-burst').length, 0);

  const racer = new THREE.Group();
  const kart = {
    playerId: 'p',
    modifiers: {},
    slots: { primary: { id: 'mushroom', readyAt: 10_000 }, secondary: null },
  };
  race.karts = [kart];
  race.timeMs = 0;
  view.sync(scene, race, [racer], 3000);
  assert.equal(racer.children.length, 0);

  race.timeMs = 10_000;
  view.sync(scene, race, [racer], 3010);
  assert.equal(racer.children.length, 1);
  assert.equal(racer.children[0].parent, racer);
  assert.ok(racer.children[0].position.z < 0);
  assert.ok(named(racer, 'cap').length > 0);

  kart.slots.primary = null;
  view.sync(scene, race, [racer], 3020);
  assert.equal(racer.children.length, 0);

  view.sync(scene, race, [racer], 3100);
  kart.modifiers = { speed: 1.5 };
  view.sync(scene, race, [racer], 3200);
  assert.ok(named(racer, 'cap').length > 0);
  view.sync(scene, race, [racer], 3200 + 349);
  assert.ok(named(racer, 'cap').length > 0);
  view.sync(scene, race, [racer], 3200 + 350);
  assert.equal(named(racer, 'cap').length, 0);
  assert.equal(kart.modifiers.speed, 1.5);

  kart.modifiers = { invuln: 5, speed: 5 };
  view.sync(scene, race, [racer], 4000);
  assert.ok(named(racer, 'star_body').length > 0);
  view.sync(scene, race, [racer], 4000 + 700);
  assert.equal(named(racer, 'star_body').length, 0);

  kart.modifiers = { spin: 1 };
  view.sync(scene, race, [racer], 5000);
  assert.equal(racer.children.length, 0);

  view.release(scene);
  view.dispose(scene);
  assert.equal(scene.children.length, 0);
  assert.equal(racer.children.length, 0);
});
