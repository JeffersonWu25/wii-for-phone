import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { viewports } from './layout.js';
import { driftView, effectView } from './race.js';
import { attachCourse } from './track-view.js';

const CAM_DIST = 6.8;
const CAM_HEIGHT = 2.95;
const LOOK_AHEAD = 6.0;
const LOOK_Y = 0.7;
const FOV = 58;
const PIVOT_Y = 0.42;
const TRACK_HALF = 0.58;

function makeRacer(character) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = PIVOT_Y;
  group.add(body);

  const bodyMat = new THREE.MeshLambertMaterial({ color: character.body });
  const accentMat = new THREE.MeshLambertMaterial({ color: character.hat });
  const skinMat = new THREE.MeshLambertMaterial({ color: character.skin });
  const darkMat = new THREE.MeshLambertMaterial({ color: 0x1c1c22 });
  const metalMat = new THREE.MeshLambertMaterial({ color: 0x8a919c });

  function add(mesh, x, y, z) {
    mesh.position.set(x, y - PIVOT_Y, z);
    mesh.castShadow = true;
    body.add(mesh);
    return mesh;
  }

  add(new THREE.Mesh(new THREE.BoxGeometry(1.15, 0.32, 1.85), bodyMat), 0, 0.42, 0);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.22, 0.55), bodyMat), 0, 0.4, 0.95);
  add(new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.28, 0.55), darkMat), 0, 0.62, -0.15);

  const spoilerPostL = add(new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.08), metalMat), -0.35, 0.72, -0.85);
  const spoilerPostR = spoilerPostL.clone();
  spoilerPostR.position.x = 0.35;
  body.add(spoilerPostR);
  add(new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.08, 0.28), accentMat), 0, 0.92, -0.88);

  add(new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.42, 0.38), accentMat), 0, 0.95, -0.05);
  add(new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), skinMat), 0, 1.28, -0.02);
  add(
    new THREE.Mesh(
      new THREE.SphereGeometry(0.3, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      accentMat,
    ),
    0,
    1.38,
    -0.02,
  );
  add(new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.05, 16), accentMat), 0, 1.36, -0.02);

  const wheelGeo = new THREE.CylinderGeometry(0.3, 0.3, 0.26, 14);
  for (const [wx, wz] of [[-0.58, 0.62], [0.58, 0.62], [-0.58, -0.62], [0.58, -0.62]]) {
    const wheel = new THREE.Mesh(wheelGeo, darkMat);
    wheel.rotation.z = Math.PI / 2;
    add(wheel, wx, 0.3, wz);
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.28, 10), metalMat);
    hub.rotation.z = Math.PI / 2;
    add(hub, wx, 0.3, wz);
  }

  const sparks = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 6),
    new THREE.MeshLambertMaterial({
      color: 0x9ecbff,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  sparks.position.set(0, 0.05, -0.95);
  body.add(sparks);

  const glow = new THREE.Mesh(
    new THREE.ConeGeometry(0.22, 0.55, 10),
    new THREE.MeshLambertMaterial({ color: 0xffb15a }),
  );
  glow.rotation.x = Math.PI / 2;
  glow.position.set(0, 0.05, -1.15);
  glow.visible = false;
  glow.castShadow = false;
  body.add(glow);

  group.userData.body = body;
  group.userData.sparks = sparks;
  group.userData.glow = glow;
  return group;
}

function checkerMesh(start) {
  const cols = 12;
  const rows = 2;
  const cw = start.width / cols;
  const cd = start.depth / rows;
  const [rx, rz] = right(start.heading);
  const fx = Math.sin(start.heading);
  const fz = Math.cos(start.heading);
  const positions = [];
  const indices = [];
  const colors = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const dark = (row + col) % 2 === 0;

function placeCamera(camera, kart, travel) {
  const backX = Math.sin(travel);
  const backZ = Math.cos(travel);
  camera.position.set(
    kart.x - backX * CAM_DIST,
    CAM_HEIGHT,
    kart.z - backZ * CAM_DIST,
  );
  camera.lookAt(
    kart.x + backX * LOOK_AHEAD,
    LOOK_Y,
    kart.z + backZ * LOOK_AHEAD,
  );
  camera.up.set(0, 1, 0);
  camera.fov = FOV;
}

function placeRacer(mesh, kart, now) {
  const view = driftView(kart);
  const fx = effectView(kart);
  const body = mesh.userData.body;
  const sparks = mesh.userData.sparks;
  const glow = mesh.userData.glow;
  mesh.position.set(kart.x, 0, kart.z);
  mesh.rotation.set(0, view.facing, 0);
  body.position.y = PIVOT_Y + Math.abs(view.roll) * TRACK_HALF;
  body.rotation.set(0, 0, fx === 'spin' ? Math.sin(now / 80) * 0.4 : view.roll);
  sparks.material.opacity = view.charge;
  sparks.material.color.set(view.charged ? 0xff8a2a : 0x9ecbff);
  glow.visible = view.phase === 'boosting' || fx === 'boost' || fx === 'star';
  glow.material.color.set(fx === 'star' ? 0xffe566 : 0xffb15a);
}

function makeEntity(kind) {
  let geo;
  let y = 0.4;
  if (kind === 'box') {
    geo = new THREE.BoxGeometry(1.25, 1.25, 1.25);
    y = 1.15;
  } else if (kind === 'banana') {
    geo = new THREE.TorusGeometry(0.55, 0.18, 8, 10, Math.PI);
    y = 0.28;
  } else if (kind === 'shell') {
    geo = new THREE.SphereGeometry(0.42, 12, 10);
    y = 0.42;
  } else {
    throw new Error(`unknown entity kind ${kind}`);
  }
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial());
  mesh.castShadow = true;
  mesh.userData.y = y;
  mesh.userData.kind = kind;
  if (kind === 'banana') mesh.rotation.x = -Math.PI / 2;
  return mesh;
}

function syncEntities(scene, pool, entities, now) {
  const live = new Set();
  for (const entity of entities || []) {
    live.add(entity.id);
    let mesh = pool.get(entity.id);
    if (!mesh) {
      mesh = makeEntity(entity.kind);
      pool.set(entity.id, mesh);
      scene.add(mesh);
    }
    mesh.position.set(entity.x, mesh.userData.y, entity.z);
    mesh.visible = entity.kind !== 'box' || entity.cooldown <= 0;
    mesh.material.color.set(entity.color);
    if (entity.kind === 'box') mesh.rotation.y = now / 700;
  }
  for (const [id, mesh] of pool) {
    if (live.has(id)) continue;
    scene.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
    pool.delete(id);
  }
}

export default function KartScene({ raceRef, track }) {
  const wrapRef = useRef(null);

  useEffect(() => {
    const wrap = wrapRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 300);
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setScissorTest(true);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    wrap.appendChild(renderer.domElement);
    if (!track || typeof track.trackVisuals !== 'function') {
      throw new Error('KartScene requires a track with trackVisuals()');
    }
    const courseHandle = attachCourse(scene, track.trackVisuals());

    const racers = [];
    const entityPool = new Map();
    function ensureRacers(race) {
      if (racers.length === race.karts.length) return;
      for (const mesh of racers) scene.remove(mesh);
      racers.length = 0;
      for (const kart of race.karts) {
        const mesh = makeRacer(kart.character);
        scene.add(mesh);
        racers.push(mesh);
      }
    }
    if (raceRef.current) ensureRacers(raceRef.current);

    let frame = 0;
    let timer = 0;
    let last = performance.now();
    let lastTick = 0;
    let running = true;

    function resize() {
      renderer.setSize(wrap.clientWidth || 1, wrap.clientHeight || 1, false);
    }

    function animate(now) {
      if (!running) return;
      if (now - lastTick < 12) return;
      lastTick = now;
      try {
        animateFrame(now);
      } catch (err) {
        window.__kartError = String(err?.stack || err);
      }
    }

    function animateFrame(now) {
      last = now;
      const race = raceRef.current;
      if (!race) return;
      ensureRacers(race);

      race.karts.forEach((kart, i) => {
        const mesh = racers[i];
        if (!mesh) return;
        placeRacer(mesh, kart, now);
      });
      syncEntities(scene, entityPool, race.entities, now);

      const w = wrap.clientWidth || 1;
      const h = wrap.clientHeight || 1;
      const rects = viewports(race.karts.length, w, h);
      race.karts.forEach((kart, i) => {
        const rect = rects[i];
        renderer.setViewport(rect.x, rect.y, rect.w, rect.h);
        renderer.setScissor(rect.x, rect.y, rect.w, rect.h);
        camera.aspect = rect.w / Math.max(rect.h, 1);
        placeCamera(camera, kart, driftView(kart).travel);
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      });
    }

    function pump(now) {
      animate(now);
      if (!running) return;
      frame = requestAnimationFrame(pump);
    }

    function watchdog() {
      if (!running) return;
      timer = window.setTimeout(watchdog, 32);
      if (performance.now() - lastTick > 80) animate(performance.now());
    }

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    frame = requestAnimationFrame(pump);
    timer = window.setTimeout(watchdog, 32);

    return () => {
      running = false;
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      observer.disconnect();
      courseHandle.dispose();
      scene.traverse((obj) => {
        if (obj.parent?.name === 'luigi-course') return;
        obj.geometry?.dispose();
        if (obj.material) {
          const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
          for (const mat of mats) {
            mat.map?.dispose();
            mat.dispose();
          }
        }
      });
      renderer.dispose();
      if (renderer.domElement.parentNode === wrap) wrap.removeChild(renderer.domElement);
    };
  }, [raceRef, track]);

  return <div className="kart-canvas" ref={wrapRef} />;
}
