import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { HALF, poseAt } from './track.js';
import { viewports } from './layout.js';
import { driftView } from './race.js';

const CAM_DIST = 6.8;
const CAM_HEIGHT = 2.95;
const LOOK_AHEAD = 6.0;
const LOOK_Y = 0.7;
const FOV = 58;
const PIVOT_Y = 0.42;
const TRACK_HALF = 0.58;

function ribbon(halfWidth, y, color) {
  const n = 180;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= n; i++) {
    const pose = poseAt(i / n);
    const rx = Math.cos(pose.heading);
    const rz = -Math.sin(pose.heading);
    positions.push(
      pose.x + rx * halfWidth, y, pose.z + rz * halfWidth,
      pose.x - rx * halfWidth, y, pose.z - rz * halfWidth,
    );
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  return mesh;
}

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

function addScenery(scene) {
  const hedgeMat = new THREE.MeshLambertMaterial({ color: 0x2f8f3a });
  const flowerMat = new THREE.MeshLambertMaterial({ color: 0xd94b4b });
  for (let i = 0; i < 18; i++) {
    const pose = poseAt((i + 0.12) / 18);
    const rx = Math.cos(pose.heading);
    const rz = -Math.sin(pose.heading);
    const side = i % 2 === 0 ? 1 : -1;
    const dist = HALF + 2.4 + (i % 3) * 0.35;
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.7), hedgeMat);
    hedge.position.set(
      pose.x + rx * side * dist,
      0.55,
      pose.z + rz * side * dist,
    );
    hedge.rotation.y = pose.heading;
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    scene.add(hedge);
    if (i % 3 === 0) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), flowerMat);
      bloom.position.copy(hedge.position);
      bloom.position.y = 1.2;
      scene.add(bloom);
    }
  }
}

function addTrack(scene) {
  scene.background = new THREE.Color(0x7ec8f5);
  scene.fog = new THREE.Fog(0x7ec8f5, 70, 160);

  const hemi = new THREE.HemisphereLight(0xfff2d4, 0x3a7a3a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1c8, 1.35);
  sun.position.set(40, 55, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = 160;
  sun.shadow.camera.left = -70;
  sun.shadow.camera.right = 70;
  sun.shadow.camera.top = 70;
  sun.shadow.camera.bottom = -70;
  scene.add(sun);

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(95, 64),
    new THREE.MeshLambertMaterial({ color: 0x45b34f }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  scene.add(ribbon(HALF + 1.15, 0.02, 0xf0ebe0));
  scene.add(ribbon(HALF + 0.35, 0.04, 0xe4d5b5));
  scene.add(ribbon(HALF, 0.07, 0xd2b48c));

  const start = poseAt(0);
  const checker = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2, 0.06, 1.1),
    new THREE.MeshLambertMaterial({ color: 0xf7f7f7 }),
  );
  checker.position.set(start.x, 0.11, start.z);
  checker.rotation.y = start.heading;
  checker.receiveShadow = true;
  scene.add(checker);

  addScenery(scene);
}

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

function placeRacer(mesh, kart) {
  const view = driftView(kart);
  const body = mesh.userData.body;
  const sparks = mesh.userData.sparks;
  const glow = mesh.userData.glow;
  mesh.position.set(kart.x, 0, kart.z);
  mesh.rotation.set(0, view.facing, 0);
  body.position.y = PIVOT_Y + Math.abs(view.roll) * TRACK_HALF;
  body.rotation.set(0, 0, view.roll);
  sparks.material.opacity = view.charge;
  sparks.material.color.set(view.charged ? 0xff8a2a : 0x9ecbff);
  glow.visible = view.phase === 'boosting';
}

export default function KartScene({ raceRef }) {
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
    addTrack(scene);

    const racers = [];
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
        placeRacer(mesh, kart);
      });

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
      scene.traverse((obj) => {
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
  }, [raceRef]);

  return <div className="kart-canvas" ref={wrapRef} />;
}
