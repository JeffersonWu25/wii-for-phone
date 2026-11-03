// Dev page for the item art: no relay, no race.
//   /item-showcase.html?view=models   box, green, red, banana in a row, 3/4 front camera
//   /item-showcase.html?view=shells   green and red shells spinning
//   /item-showcase.html?view=banana   one resting banana, one thrown on a loop (arc, landing squash)
//   /item-showcase.html?view=far      chase-camera view (height 2.4 m, FOV 60): box at 5 m, then green, red, banana 2 m apart
//   /item-showcase.html?view=icons    the 4 HUD icons in TV-sized slots on mid-grey
// Sets window.__showcaseReady after the first render. Lighting copies scene/world.js.
import * as THREE from 'three';
import { createItemModel, disposeItemModels } from './scene/itemModels.js';
import { ITEM_ICONS } from './itemIcons.js';

const view = new URLSearchParams(location.search).get('view') || 'models';
const app = document.getElementById('app');

// ── Icons ────────────────────────────────────────────────────────────────────

function showIcons() {
  app.style.cssText = 'display:flex;gap:40px;align-items:center;justify-content:center;background:#808080';
  for (const [kind, svg] of Object.entries(ITEM_ICONS)) {
    const slot = document.createElement('div');
    slot.dataset.kind = kind;
    slot.style.cssText = 'width:96px;height:96px;padding:10px;box-sizing:border-box;border-radius:18px;background:rgba(0,0,0,0.45);border:3px solid rgba(255,255,255,0.8)';
    slot.innerHTML = svg;
    slot.firstChild.style.cssText = 'width:100%;height:100%';
    app.appendChild(slot);
  }
  requestAnimationFrame(() => { window.__showcaseReady = true; });
}

// ── 3D ───────────────────────────────────────────────────────────────────────

const GROUND_Y = 0;
const BOX_Y = 1;

function layout(name) {
  const items = [];
  const add = (kind, x, y, z, extra = {}) => {
    const m = createItemModel(kind);
    m.position.set(x, y, z);
    items.push({ kind, m, ...extra });
    return m;
  };
  let cam = { pos: [0, 2.2, 6.5], look: [0, 0.6, 0], fov: 40 };
  if (name === 'models') {
    add('box', -3.2, BOX_Y, 0, { spin: 1 / 3 });
    add('green', -1, 0.0, 0);
    add('red', 1, 0.0, 0);
    add('banana', 3.2, 0, 0);
    cam = { pos: [3.5, 3, 8], look: [0, 0.6, 0], fov: 40 };
  } else if (name === 'shells') {
    add('green', -1, 0, 0, { spin: 3 });
    add('red', 1, 0, 0, { spin: 3 });
    cam = { pos: [0, 2.2, 4.5], look: [0, 0.3, 0], fov: 40 };
  } else if (name === 'banana') {
    add('banana', -1.5, 0, 0, { wobble: true });
    add('banana', 1.5, 0, 0, { throwLoop: true });
    cam = { pos: [0, 2.4, 6], look: [0, 0.8, 0], fov: 40 };
  } else if (name === 'far') {
    add('box', -1.2, BOX_Y, -5, { spin: 1 / 3 });
    add('green', 1.2, 0, -7);
    add('red', -1.2, 0, -9);
    add('banana', 1.2, 0, -11);
    cam = { pos: [0, 2.4, 0], look: [0, 0.8, -8], fov: 60 };
  }
  return { items, cam };
}

function show3d() {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  app.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xbcd8ee);
  const sun = new THREE.DirectionalLight(0xfff0d0, 2.6);
  sun.position.set(12, 18, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -15, right: 15, top: 15, bottom: -15, near: 1, far: 80 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.06;
  scene.add(sun, new THREE.HemisphereLight(0xa8d4ff, 0x7fb04a, 1.5));

  const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x7d838a, roughness: 0.9 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = GROUND_Y;
  ground.receiveShadow = true;
  scene.add(ground);

  const { items, cam } = layout(view);
  for (const it of items) scene.add(it.m);
  const camera = new THREE.PerspectiveCamera(cam.fov, 1, 0.1, 200);
  camera.position.set(...cam.pos);
  camera.lookAt(...cam.look);

  function resize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  }
  resize();
  window.addEventListener('resize', resize);

  const t0 = performance.now();
  function frame(now) {
    const t = (now - t0) / 1000;
    for (const it of items) {
      if (it.spin) it.m.rotation.y = t * it.spin * Math.PI * 2;
      if (it.kind === 'box') it.m.position.y = BOX_Y + Math.sin(t * 0.6 * Math.PI * 2) * 0.15;
      if (it.wobble) it.m.rotation.z = Math.sin(t * 4) * 0.05;
      if (it.throwLoop) animateThrow(it.m, t % 1.6);
    }
    renderer.render(scene, camera);
    window.__showcaseReady = true;
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  window.addEventListener('pagehide', () => { disposeItemModels(); renderer.dispose(); });
}

// Arc over 0.6 s, squash for 0.2 s on landing, then rest.
function animateThrow(m, u) {
  const flight = 0.6;
  if (u < flight) {
    const k = u / flight;
    m.position.set(1.5 + (k - 0.5) * 3, 6 * u - 10 * u * u, 0);
    m.scale.set(1, 1, 1);
  } else {
    m.position.set(3, 0, 0);
    const sq = Math.min(1, (u - flight) / 0.2);
    m.scale.set(1, 0.6 + 0.4 * sq, 1);
  }
}

if (view === 'icons') showIcons();
else show3d();
