// Renderer, camera rig and kart syncing. Visual work goes in world.js / kartMesh.js and the renderer settings below.
import * as THREE from 'three';
import { buildWorld } from './world.js';
import { createKartMesh, updateKartMesh } from './kartMesh.js';
import { shotCamera } from '../shots.js';
import { viewFov, viewRect } from './views.js';
import { createItemsView } from './itemsView.js';

// ── Chase camera ─────────────────────────────────────────────────────────────

const CHASE_BACK = 5.5;
const CHASE_UP = 2.4;
const CHASE_LOOK_AHEAD = 6;
const POS_LAG = 5; // 1/s, higher = stiffer
const LOOK_LAG = 9;
const FOV_KICK = 8; // deg while a mushroom boost runs
const FOV_KICK_RATE = 6; // 1/s
const SHAKE_TIME = 0.25; // s after a hit
const SHAKE_AMP = 0.15; // m
const SUN_OFFSET = new THREE.Vector3(120, 180, 60);

export function createKartScene(container, track) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const world = buildWorld(track, renderer);
  scene.add(world.group);
  if (world.background) scene.background = world.background;
  if (world.fog) scene.fog = new THREE.Fog(world.fog.color, world.fog.near, world.fog.far);

  const itemsView = createItemsView(scene);
  window.__kartInfo = renderer.info; // dev-only: lets screenshot tooling read draw calls / triangles
  const meshes = new Map();
  let views = [];
  let shotName = null;
  let time = 0;
  let width = 1;
  let height = 1;

  function setKarts(list) {
    for (const m of meshes.values()) scene.remove(m);
    meshes.clear();
    for (const k of list) {
      const m = createKartMesh(k.color);
      m.rotation.order = 'YZX';
      scene.add(m);
      meshes.set(k.id, m);
    }
  }

  // Each view is a screen rectangle in fractions (y from the top) with its own chase camera following kart `id`.
  function setViews(list) {
    views = list.map((v) => ({
      ...v,
      camera: new THREE.PerspectiveCamera(60, 16 / 9, 0.6, 3200),
      camPos: new THREE.Vector3(),
      camLook: new THREE.Vector3(),
      ready: false,
      kick: 0,
    }));
    views.forEach(fitCamera);
  }

  function setShot(name) {
    shotName = name || null;
    for (const v of views) v.ready = false;
  }

  function fitCamera(v) {
    const aspect = (v.w * width) / (v.h * height);
    v.camera.aspect = aspect;
    v.baseFov = viewFov(aspect);
    v.camera.fov = v.baseFov + v.kick;
    v.camera.updateProjectionMatrix();
  }

  function resize() {
    width = container.clientWidth || window.innerWidth;
    height = container.clientHeight || window.innerHeight;
    renderer.setSize(width, height);
    views.forEach(fitCamera);
  }

  function syncKarts(race, dt) {
    for (const kart of race.karts) {
      const m = meshes.get(kart.id);
      if (!m) continue;
      m.position.set(kart.x, kart.y, kart.z);
      m.rotation.set(kart.roll, -kart.h, kart.pitch);
      updateKartMesh(m, kart, dt);
    }
  }

  function placeCamera(v, race, dt, useShot) {
    const { camera } = v;
    if (useShot) {
      const shot = shotCamera(track, shotName);
      if (shot) {
        camera.position.set(shot.position.x, shot.position.y, shot.position.z);
        camera.lookAt(shot.target.x, shot.target.y, shot.target.z);
        return;
      }
    }
    const kart = race.karts.find((k) => k.id === v.id) ?? race.karts[0];
    if (!kart) return;
    const fx = Math.cos(kart.h);
    const fz = Math.sin(kart.h);
    // On the grid, pull back and tilt up so the start-light gantry over the line is in frame.
    const grid = race.phase === 'countdown';
    const back = grid ? CHASE_BACK + 7 : CHASE_BACK;
    const wantPos = new THREE.Vector3(kart.x - fx * back, kart.y + CHASE_UP + (grid ? 3.6 : 0), kart.z - fz * back);
    wantPos.y = Math.max(wantPos.y, track.terrainHeight(wantPos.x, wantPos.z) + 1);
    const wantLook = new THREE.Vector3(kart.x + fx * CHASE_LOOK_AHEAD, kart.y + (grid ? 2.4 : 1), kart.z + fz * CHASE_LOOK_AHEAD);
    if (!v.ready) {
      v.camPos.copy(wantPos);
      v.camLook.copy(wantLook);
      v.ready = true;
    } else {
      v.camPos.lerp(wantPos, 1 - Math.exp(-POS_LAG * dt));
      v.camLook.lerp(wantLook, 1 - Math.exp(-LOOK_LAG * dt));
    }
    camera.position.copy(v.camPos);
    camera.lookAt(v.camLook);
  }

  // Per-view camera effects for that view's kart: FOV kick during a mushroom, a short shake after a hit.
  function applyViewFx(v, race, dt) {
    dt = Math.max(0, dt);
    const kart = race.karts.find((k) => k.id === v.id) ?? race.karts[0];
    v.kick += ((kart?.mushroom > 0 ? FOV_KICK : 0) - v.kick) * (1 - Math.exp(-FOV_KICK_RATE * dt));
    const fov = (v.baseFov ?? v.camera.fov) + v.kick;
    if (Math.abs(fov - v.camera.fov) > 1e-3) {
      v.camera.fov = fov;
      v.camera.updateProjectionMatrix();
    }
    const hit = kart?.hit;
    const since = hit ? hit.total - hit.t : Infinity;
    if (since < SHAKE_TIME) {
      const amp = SHAKE_AMP * (1 - since / SHAKE_TIME);
      v.camera.position.x += Math.sin(time * 97) * amp;
      v.camera.position.y += Math.sin(time * 131 + 1.3) * amp;
      v.camera.position.z += Math.sin(time * 113 + 2.1) * amp;
    }
  }

  // The shadow map re-renders on every render call, so the sun follows the view being drawn.
  function focusSun(v, useShot) {
    if (!world.sun) return;
    // Chase: tight frustum around the followed kart. Overview shot: wide frustum over the whole infield.
    const wide = useShot && (shotName === 'overview' || shotName === 'ccOverview');
    const focus = wide ? new THREE.Vector3(world.center.x, 0, world.center.z) : useShot ? v.camera.position : meshes.get(v.id)?.position ?? v.camera.position;
    const ext = wide ? (track.length > 900 ? 330 : 230) : 45;
    const cam = world.sun.shadow.camera;
    if (cam.right !== ext) {
      Object.assign(cam, { left: -ext, right: ext, top: ext, bottom: -ext });
      cam.updateProjectionMatrix();
    }
    world.sun.target.position.copy(focus);
    world.sun.position.copy(focus).add(SUN_OFFSET);
  }

  function update(race, dt) {
    time += dt;
    syncKarts(race, dt);
    itemsView.update(race, dt, time);
    renderer.setScissorTest(true);
    views.forEach((v, i) => {
      const useShot = !!shotName && i === 0; // debug shots take over the first view only
      placeCamera(v, race, dt, useShot);
      if (!useShot) applyViewFx(v, race, dt);
      world.tick?.(time, v.camera);
      focusSun(v, useShot);
      const { x, y, w, h } = viewRect(v, width, height);
      renderer.setViewport(x, y, w, h);
      renderer.setScissor(x, y, w, h);
      renderer.render(scene, v.camera); // autoClear clears just this scissored pane
    });
  }

  function dispose() {
    itemsView.dispose();
    scene.traverse((o) => {
      o.geometry?.dispose();
      const mats = Array.isArray(o.material) ? o.material : o.material ? [o.material] : [];
      for (const mat of mats) {
        for (const v of Object.values(mat)) if (v?.isTexture) v.dispose();
        mat.dispose();
      }
    });
    renderer.forceContextLoss();
    renderer.dispose();
    renderer.domElement.remove();
  }

  resize();
  return { setKarts, update, setViews, setShot, resize, dispose, setStartLights: (n) => world.setStartLights?.(n), renderer };
}
