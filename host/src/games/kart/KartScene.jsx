import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { trackVisuals } from './track.js';
import { viewports } from './layout.js';
import { driftView } from './race.js';

const CAM_DIST = 6.8;
const CAM_HEIGHT = 2.95;
const LOOK_AHEAD = 6.0;
const LOOK_Y = 0.7;
const FOV = 58;
const PIVOT_Y = 0.42;
const TRACK_HALF = 0.58;

function lambert(color, extra) {
  return new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide, ...extra });
}

function meshFrom(positions, indices, material, colors) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  if (colors) geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  const mesh = new THREE.Mesh(geo, material);
  mesh.receiveShadow = true;
  return mesh;
}

function right(heading) {
  return [Math.cos(heading), -Math.sin(heading)];
}

function closedStrip(samples, pointAt) {
  const n = samples.length;
  const positions = [];
  const indices = [];
  for (let i = 0; i <= n; i++) {
    const pose = samples[i % n];
    positions.push(...pointAt(pose));
  }
  for (let i = 0; i < n; i++) {
    const a = i * 2;
    indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
  }
  return { positions, indices };
}

function sandPositions(polys, y) {
  const positions = [];
  const indices = [];
  for (const poly of polys) {
    const half = poly.length / 2;
    if (half < 2 || poly.length % 2 !== 0) continue;
    const base = positions.length / 3;
    for (const p of poly) positions.push(p.x, y, p.z);
    for (let i = 0; i < half - 1; i++) {
      const l0 = base + i;
      const l1 = base + i + 1;
      const r0 = base + (poly.length - 1 - i);
      const r1 = base + (poly.length - 2 - i);
      indices.push(l0, r0, l1, l1, r0, r1);
    }
  }
  return { positions, indices };
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
      const cx = (col + 0.5 - cols / 2) * cw;
      const cz = (row + 0.5 - rows / 2) * cd;
      const ox = start.x + rx * cx + fx * cz;
      const oz = start.z + rz * cx + fz * cz;
      const base = positions.length / 3;
      for (const [sx, sz] of [[-0.5, -0.5], [0.5, -0.5], [0.5, 0.5], [-0.5, 0.5]]) {
        positions.push(
          ox + rx * sx * cw + fx * sz * cd,
          0.11,
          oz + rz * sx * cw + fz * sz * cd,
        );
        const tone = dark ? 0.08 : 0.95;
        colors.push(tone, tone, tone);
      }
      indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  }
  return meshFrom(positions, indices, lambert(0xffffff, { vertexColors: true }), colors);
}

function addTrack(scene) {
  const vis = trackVisuals();
  const reach = vis.grassRadius + 12;
  scene.background = new THREE.Color(0x7ec8f5);
  scene.fog = new THREE.Fog(0x7ec8f5, 90, reach * 2.4);

  const hemi = new THREE.HemisphereLight(0xfff2d4, 0x3a7a3a, 0.85);
  scene.add(hemi);

  const sun = new THREE.DirectionalLight(0xfff1c8, 1.35);
  sun.position.set(40, 55, 18);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 5;
  sun.shadow.camera.far = reach * 3;
  sun.shadow.camera.left = -reach;
  sun.shadow.camera.right = reach;
  sun.shadow.camera.top = reach;
  sun.shadow.camera.bottom = -reach;
  scene.add(sun);

  const grass = new THREE.Mesh(
    new THREE.CircleGeometry(vis.grassRadius, 72),
    new THREE.MeshLambertMaterial({ color: 0x45b34f }),
  );
  grass.rotation.x = -Math.PI / 2;
  grass.receiveShadow = true;
  scene.add(grass);

  const sand = sandPositions(vis.sand, 0.03);
  scene.add(meshFrom(sand.positions, sand.indices, lambert(0xd2b48c)));

  const asphalt = closedStrip(vis.road, (pose) => {
    const [rx, rz] = right(pose.heading);
    const y = 0.06;
    return [
      pose.x + rx * pose.halfWidth, y, pose.z + rz * pose.halfWidth,
      pose.x - rx * pose.halfWidth, y, pose.z - rz * pose.halfWidth,
    ];
  });
  scene.add(meshFrom(asphalt.positions, asphalt.indices, lambert(0x6d727a)));

  const outerCurb = closedStrip(vis.road, (pose) => {
    const [rx, rz] = right(pose.heading);
    const lip = pose.visualOuterY || 0;
    const x0 = pose.x + rx * pose.halfWidth;
    const z0 = pose.z + rz * pose.halfWidth;
    return [
      x0 + rx * 0.42, 0.08 + lip, z0 + rz * 0.42,
      x0, 0.08, z0,
    ];
  });
  scene.add(meshFrom(outerCurb.positions, outerCurb.indices, lambert(0xf4f4f4)));

  const innerLine = closedStrip(vis.road, (pose) => {
    const [rx, rz] = right(pose.heading);
    const edge = -pose.halfWidth;
    const y = 0.09;
    return [
      pose.x + rx * edge, y, pose.z + rz * edge,
      pose.x + rx * (edge + 0.35), y, pose.z + rz * (edge + 0.35),
    ];
  });
  scene.add(meshFrom(innerLine.positions, innerLine.indices, lambert(0xf4f4f4)));

  const dashPositions = [];
  const dashIndices = [];
  for (const quad of vis.dashes) {
    const base = dashPositions.length / 3;
    for (const p of quad) dashPositions.push(p.x, 0.1, p.z);
    dashIndices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  scene.add(meshFrom(dashPositions, dashIndices, lambert(0xf27a12)));

  scene.add(checkerMesh(vis.startFinish));

  const slotGeo = new THREE.BoxGeometry(1.05, 0.02, 1.55);
  const slotMat = new THREE.MeshLambertMaterial({ color: 0xf7f7f7 });
  for (const mark of vis.gridMarks) {
    const slot = new THREE.Mesh(slotGeo, slotMat);
    slot.position.set(mark.x, 0.1, mark.z);
    slot.rotation.y = mark.heading;
    slot.receiveShadow = true;
    scene.add(slot);
  }
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
