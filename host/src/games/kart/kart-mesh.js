import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PIVOT_Y } from './camera.js';
import { attachKartFx } from './kart-fx.js';

const WHEEL_Y = 0.3;
const WHEEL_R = 0.3;

export function makeRacer(character) {
  const group = new THREE.Group();
  const body = new THREE.Group();
  body.position.y = PIVOT_Y;
  group.add(body);

  const mats = makeMaterials(character);
  const buckets = new Map();
  // y is height above the ground. The body origin is the roll pivot.
  // Same-material parts merge into one mesh so four split-screen views stay cheap.
  const put = (mesh, x, y, z) => {
    mesh.position.set(x, y - PIVOT_Y, z);
    mesh.updateMatrix();
    const geo = mesh.geometry.clone();
    geo.applyMatrix4(mesh.matrix);
    const list = buckets.get(mesh.material);
    if (list) list.push(geo);
    else buckets.set(mesh.material, [geo]);
  };

  addBody(put, mats);
  addNose(put, mats);
  addExhaust(put, mats);
  addWheels(put, mats);
  addDriver(put, mats);
  flushParts(body, buckets);

  const fx = attachKartFx(body);
  group.userData.body = body;
  group.userData.sparks = fx.sparks;
  group.userData.glow = fx.glow;
  group.userData.fx = fx;
  return group;
}

function flushParts(body, buckets) {
  for (const [material, geos] of buckets) {
    const merged = mergeGeometries(geos);
    if (!merged) throw new Error('kart part merge failed');
    for (const geo of geos) geo.dispose();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  }
}

function addBody(put, mats) {
  for (const spec of BODY_PANELS) addBox(put, mats, spec);
}

const BODY_PANELS = [
  { mat: 'body', w: 0.92, h: 0.18, d: 1.22, x: 0, y: 0.36, z: 0 },
  { mat: 'dark', w: 0.68, h: 0.08, d: 1.02, x: 0, y: 0.24, z: 0.02 },
  { mat: 'body', w: 0.2, h: 0.16, d: 0.9, x: 0.5, y: 0.36, z: 0.04, mirror: true },
  { mat: 'hat', w: 0.05, h: 0.045, d: 0.76, x: 0.6, y: 0.42, z: 0.04, mirror: true },
  { mat: 'body', w: 0.66, h: 0.1, d: 0.52, x: 0, y: 0.5, z: 0.5, rx: 0.4 },
  { mat: 'hat', w: 0.1, h: 0.025, d: 0.4, x: 0, y: 0.56, z: 0.52, rx: 0.4 },
  { mat: 'dark', w: 1.02, h: 0.08, d: 0.12, x: 0, y: 0.26, z: 1.1 },
  { mat: 'body', w: 0.1, h: 0.14, d: 0.16, x: 0.46, y: 0.32, z: 1.06, mirror: true },
  { mat: 'lamp', w: 0.12, h: 0.07, d: 0.05, x: 0.22, y: 0.4, z: 1.16, mirror: true },
  { mat: 'body', w: 0.76, h: 0.16, d: 0.34, x: 0, y: 0.42, z: -0.7 },
  { mat: 'dark', w: 0.34, h: 0.14, d: 0.22, x: 0, y: 0.56, z: -0.62 },
  { mat: 'dark', w: 0.88, h: 0.08, d: 0.1, x: 0, y: 0.28, z: -0.9 },
  { mat: 'tail', w: 0.1, h: 0.07, d: 0.04, x: 0.4, y: 0.38, z: -0.96, mirror: true },
  { mat: 'seat', w: 0.46, h: 0.08, d: 0.36, x: 0, y: 0.5, z: -0.06 },
  { mat: 'seat', w: 0.46, h: 0.22, d: 0.08, x: 0, y: 0.62, z: -0.18 },
  { mat: 'seat', w: 0.06, h: 0.16, d: 0.32, x: 0.24, y: 0.56, z: -0.06, mirror: true },
  { mat: 'dark', w: 0.48, h: 0.08, d: 0.12, x: 0, y: 0.56, z: 0.24 },
  { mat: 'glass', w: 0.52, h: 0.34, d: 0.025, x: 0, y: 0.84, z: 0.46, rx: -0.62 },
  { mat: 'dark', w: 0.07, h: 0.58, d: 0.07, x: 0.46, y: 0.76, z: -0.84, mirror: true },
  { mat: 'dark', w: 0.06, h: 0.4, d: 0.06, x: 0, y: 0.78, z: -0.78 },
  { mat: 'hat', w: 1.28, h: 0.05, d: 0.36, x: 0, y: 1.02, z: -0.9, rx: 0.38 },
  { mat: 'hat', w: 0.05, h: 0.22, d: 0.34, x: 0.64, y: 1.02, z: -0.9, rx: 0.38, mirror: true },
  { mat: 'hat', w: 0.3, h: 0.16, d: 0.03, x: 0, y: 0.46, z: -0.94 },
];

function addNose(put, mats) {
  const cone = new THREE.Mesh(new THREE.ConeGeometry(0.22, 0.46, 8), mats.body);
  cone.rotation.x = Math.PI / 2;
  put(cone, 0, 0.4, 1.02);
}

function addExhaust(put, mats) {
  const geo = new THREE.CylinderGeometry(0.05, 0.07, 0.28, 8);
  for (const side of [-1, 1]) {
    const pipe = new THREE.Mesh(geo, mats.metal);
    pipe.rotation.x = Math.PI / 2;
    put(pipe, side * 0.28, 0.4, -1.0);
  }
}

function addWheels(put, mats) {
  const tireGeo = new THREE.CylinderGeometry(WHEEL_R, WHEEL_R, 0.22, 20);
  const lipGeo = new THREE.TorusGeometry(0.2, 0.028, 6, 16);
  const diskGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.04, 16);
  const capGeo = new THREE.CylinderGeometry(0.065, 0.065, 0.045, 12);
  const spokeGeo = new THREE.BoxGeometry(0.028, 0.2, 0.03);
  const archGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.24, 12, 1, true, 0, Math.PI);
  const spots = [
    [0.66, 0.7],
    [-0.66, 0.7],
    [0.66, -0.68],
    [-0.66, -0.68],
  ];

  for (const [x, z] of spots) {
    const side = Math.sign(x);
    const tire = new THREE.Mesh(tireGeo, mats.rubber);
    tire.rotation.z = Math.PI / 2;
    put(tire, x, WHEEL_Y, z);

    const lip = new THREE.Mesh(lipGeo, mats.metal);
    lip.rotation.y = Math.PI / 2;
    put(lip, x + side * 0.1, WHEEL_Y, z);

    const disk = new THREE.Mesh(diskGeo, mats.metal);
    disk.rotation.z = Math.PI / 2;
    put(disk, x + side * 0.125, WHEEL_Y, z);

    for (let i = 0; i < 3; i++) {
      const spoke = new THREE.Mesh(spokeGeo, mats.dark);
      spoke.rotation.x = (i * 2 * Math.PI) / 3;
      put(spoke, x + side * 0.15, WHEEL_Y, z);
    }

    const cap = new THREE.Mesh(capGeo, mats.hat);
    cap.rotation.z = Math.PI / 2;
    put(cap, x + side * 0.17, WHEEL_Y, z);

    const arch = new THREE.Mesh(archGeo, mats.fender);
    arch.rotation.z = Math.PI / 2;
    put(arch, x, WHEEL_Y, z);
  }
}

function addDriver(put, mats) {
  addBox(put, mats, { mat: 'body', w: 0.32, h: 0.14, d: 0.22, x: 0, y: 0.6, z: -0.02 });
  addBox(put, mats, { mat: 'hat', w: 0.36, h: 0.28, d: 0.22, x: 0, y: 0.84, z: 0.04, rx: 0.22 });
  addBox(put, mats, { mat: 'body', w: 0.07, h: 0.16, d: 0.03, x: 0.08, y: 0.86, z: -0.08, mirror: true });

  put(new THREE.Mesh(new THREE.SphereGeometry(0.2, 14, 12), mats.skin), 0, 1.12, 0.06);
  put(
    new THREE.Mesh(new THREE.SphereGeometry(0.22, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), mats.hat),
    0,
    1.16,
    0.06,
  );
  put(new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.035, 16), mats.hat), 0, 1.14, 0.07);
  put(new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.08, 8), mats.skin), 0, 0.98, 0.05);

  for (const side of [-1, 1]) {
    const shoulder = [side * 0.16, 0.86, 0.08];
    const elbow = [side * 0.22, 0.74, 0.2];
    const hand = [side * 0.13, 0.7, 0.34];
    spanBox(put, 0.09, mats.hat, shoulder, elbow);
    spanBox(put, 0.07, mats.skin, elbow, hand);
    put(new THREE.Mesh(new THREE.SphereGeometry(0.055, 8, 6), mats.skin), hand[0], hand[1], hand[2]);
  }

  const steer = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.026, 6, 16), mats.dark);
  steer.rotation.x = 1.05;
  put(steer, 0, 0.72, 0.36);
  spanBox(put, 0.035, mats.dark, [0, 0.58, 0.24], [0, 0.7, 0.34]);
}

function spanBox(put, thick, mat, from, to) {
  const mid = [
    (from[0] + to[0]) / 2,
    (from[1] + to[1]) / 2,
    (from[2] + to[2]) / 2,
  ];
  const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(thick, thick, Math.max(len, 0.04)), mat);
  mesh.position.set(mid[0], mid[1], mid[2]);
  mesh.lookAt(to[0], to[1], to[2]);
  put(mesh, mid[0], mid[1], mid[2]);
}

function addBox(put, mats, spec) {
  const geo = new THREE.BoxGeometry(spec.w, spec.h, spec.d);
  const xs = spec.mirror ? [spec.x, -spec.x] : [spec.x];
  for (const x of xs) {
    const mesh = new THREE.Mesh(geo, mats[spec.mat]);
    if (spec.rx) mesh.rotation.x = spec.rx;
    put(mesh, x, spec.y, spec.z);
  }
}

function makeMaterials(character) {
  return {
    body: lambert(character.body),
    hat: lambert(character.hat),
    skin: lambert(character.skin),
    rubber: lambert(0x141418),
    metal: lambert(0xd5dbe3),
    dark: lambert(0x23232a),
    seat: lambert(0x2a241e),
    glass: lambert(0x8ecae6),
    lamp: lambert(0xfff4cc, { emissive: 0xffe08a, emissiveIntensity: 0.7 }),
    tail: lambert(0xff3b30, { emissive: 0xff2a22, emissiveIntensity: 0.45 }),
    fender: lambert(character.body, { side: THREE.DoubleSide }),
  };
}

function lambert(color, extra) {
  return new THREE.MeshLambertMaterial({ color, ...extra });
}
