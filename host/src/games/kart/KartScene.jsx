import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { EDGE, GRASS_OUT, GROUND, HALF, PERIM, poseAt, surfaceY } from './track.js';
import { viewports } from './layout.js';
import { driftView } from './race.js';

const CAM_DIST = 6.8;
const CAM_HEIGHT = 2.95;
const LOOK_AHEAD = 6.0;
const LOOK_Y = 0.7;
const FOV = 58;
const PIVOT_Y = 0.42;
const TRACK_HALF = 0.58;
const ROAD = 0xd2b48c;
const SAND = 0xe4d5b5;
const CURB = 0xf0ebe0;
const GRASS = 0x45b34f;
const SHOULDER_STEPS = 8;

// Lateral layout of the terrain strip, from the centerline outward. A repeated
// offset marks a color edge, so every band keeps a hard boundary.
const SIDE = (() => {
  const out = [
    { o: 0, c: ROAD },
    { o: HALF, c: ROAD },
    { o: HALF, c: SAND },
    { o: HALF + 0.35, c: SAND },
    { o: HALF + 0.35, c: CURB },
    { o: EDGE, c: CURB },
    { o: EDGE, c: GRASS },
  ];
  for (let k = 1; k <= SHOULDER_STEPS; k++) {
    out.push({ o: EDGE + ((GRASS_OUT - EDGE) * k) / SHOULDER_STEPS, c: GRASS });
  }
  return out;
})();
const LATERAL = [
  ...SIDE.slice(1).reverse().map(({ o, c }) => ({ o: -o, c })),
  ...SIDE,
];

const TRACK_BOUNDS = (() => {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < 1000; i++) {
    const pose = poseAt(i / 1000);
    minX = Math.min(minX, pose.x);
    maxX = Math.max(maxX, pose.x);
    minZ = Math.min(minZ, pose.z);
    maxZ = Math.max(maxZ, pose.z);
  }
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  const radius = Math.hypot(maxX - cx, maxZ - cz) + GRASS_OUT;
  return { cx, cz, radius };
})();

// One mesh for the road, curb, sand, and grass, so the bands share edges and
// nothing sits coplanar with anything else.
function terrainStrip() {
  const rings = Math.round(PERIM);
  const perRing = LATERAL.length;
  const positions = [];
  const colors = [];
  const color = new THREE.Color();
  for (let i = 0; i < rings; i++) {
    const pose = poseAt(i / rings);
    const nx = Math.cos(pose.heading);
    const nz = -Math.sin(pose.heading);
    for (const { o, c } of LATERAL) {
      positions.push(pose.x + nx * o, surfaceY(pose.y, pose.bank, o), pose.z + nz * o);
      color.setHex(c);
      colors.push(color.r, color.g, color.b);
    }
  }
  const indices = [];
  for (let i = 0; i < rings; i++) {
    const next = (i + 1) % rings;
    for (let j = 0; j < perRing - 1; j++) {
      const a = i * perRing + j;
      const c = next * perRing + j;
      indices.push(a, c, a + 1, a + 1, c, c + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ vertexColors: true }));
  mesh.receiveShadow = true;
  return mesh;
}

function makeRacer(character) {
  const group = new THREE.Group();
  group.rotation.order = 'YXZ';
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
  const count = 30;
  for (let i = 0; i < count; i++) {
    const pose = poseAt((i + 0.12) / count);
    const rx = Math.cos(pose.heading);
    const rz = -Math.sin(pose.heading);
    const side = i % 2 === 0 ? 1 : -1;
    const lateral = side * (HALF + 2.4 + (i % 3) * 0.35);
    const hedge = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.7), hedgeMat);
    hedge.position.set(
      pose.x + rx * lateral,
      surfaceY(pose.y, pose.bank, lateral) + 0.55,
      pose.z + rz * lateral,
    );
    hedge.rotation.y = pose.heading;
    hedge.castShadow = true;
    hedge.receiveShadow = true;
    scene.add(hedge);
    if (i % 3 === 0) {
      const bloom = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), flowerMat);
      bloom.position.copy(hedge.position);
      bloom.position.y += 0.65;
      scene.add(bloom);
    }
  }
}

function addTrack(scene) {
  const { cx, cz, radius } = TRACK_BOUNDS;
  scene.background = new THREE.Color(0x7ec8f5);
  scene.fog = new THREE.Fog(0x7ec8f5, radius * 0.9, radius * 2);

  const hemi = new THREE.HemisphereLight(0xfff2d4, 0x3a7a3a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1c8, 1.35);
  sun.position.set(cx + 40, 55, cz + 18);
  sun.target.position.set(cx, 0, cz);
  scene.add(sun.target);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = radius * 2.5;
  sun.shadow.camera.left = -radius;
  sun.shadow.camera.right = radius;
  sun.shadow.camera.top = radius;
  sun.shadow.camera.bottom = -radius;
  scene.add(sun);

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(radius * 2, 64),
    new THREE.MeshLambertMaterial({ color: GRASS }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.position.set(cx, GROUND - 0.02, cz);
  grass.receiveShadow = true;
  scene.add(grass);

  scene.add(terrainStrip());

  const start = poseAt(0);
  const checker = new THREE.Mesh(
    new THREE.BoxGeometry(HALF * 2, 0.06, 1.1),
    new THREE.MeshLambertMaterial({ color: 0xf7f7f7 }),
  );
  checker.position.set(start.x, start.y + 0.11, start.z);
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
    kart.y + CAM_HEIGHT,
    kart.z - backZ * CAM_DIST,
  );
  camera.lookAt(
    kart.x + backX * LOOK_AHEAD,
    kart.y + LOOK_Y,
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
  mesh.position.set(kart.x, kart.y, kart.z);
  mesh.rotation.set(kart.pitch, view.facing, kart.roll);
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
