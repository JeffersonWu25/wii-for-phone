// Mesh-first Wii Sports style tennis court: every line, net strand, wall, hedge, spectator and player is its own geometry.
// Canvas textures are the repeating grass stripe tile, the wall wordmark, and the racket string bed.
import * as THREE from 'three';

const HALF_LENGTH = 11.885;
const HALF_WIDTH_DOUBLES = 5.485;
const HALF_WIDTH_SINGLES = 4.115;
const SERVICE_Z = 6.4;
const LINE_W = 0.1;
const NET_CENTER_H = 0.914;
const NET_POST_H = 1.07;
const NET_POST_X = HALF_WIDTH_DOUBLES + 0.2;

const WALL_X = 11.5;
const WALL_BACK_Z = 15.5;
const WALL_H = 3.0;
const SIDE_WALL_H = 1.3;
const SIDE_WALL_FRONT_Z = -14;

const SKIN_TONES = ['#f2c9a0', '#d9a273', '#a56b45', '#f6d6b8'];
const HAIR_TONES = ['#1d1612', '#3a2416', '#101010', '#6b3a1c'];

function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function makeGrassTexture(renderer) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  // 4.8 m tile, mowed baseline to baseline: 0.8 m stripes run along V (world Z) and alternate along U (left to right).
  // Starts from #b5dc62 / #69b03a. Those two read neon next to the hedges under this light,
  // so they are darkened toward the photo's lawn. The step between them stays wide.
  const bands = 6;
  const band = size / bands;
  const light = '#8fb04e';
  const dark = '#648a3c';
  for (let i = 0; i < bands; i++) {
    g.fillStyle = i % 2 === 0 ? light : dark;
    g.fillRect(i * band, 0, band + 1, size);
  }
  const edge = Math.max(6, Math.round((band * 18) / 256));
  const blend = (x, from, to) => {
    const grad = g.createLinearGradient(x - edge, 0, x + edge, 0);
    grad.addColorStop(0, from);
    grad.addColorStop(1, to);
    g.fillStyle = grad;
    const left = Math.max(0, x - edge);
    const right = Math.min(size, x + edge);
    if (right > left) g.fillRect(left, 0, right - left, size);
  };
  for (let i = 0; i < bands; i++) {
    const from = i % 2 === 0 ? dark : light;
    const to = i % 2 === 0 ? light : dark;
    blend(i * band, from, to);
    if (i === 0) blend(size, from, to);
  }
  const rand = seeded(7);
  for (let i = 0; i < 9000; i++) {
    const x = rand() * size;
    const y = rand() * size;
    g.fillStyle = rand() < 0.5 ? 'rgba(255,255,170,0.10)' : 'rgba(20,70,10,0.12)';
    g.fillRect(x, y, 1 + rand() * 1.5, 2 + rand() * 5);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function makeWordmarkTexture(renderer) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 256;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, 1024, 256);
  g.font = '900 170px "Arial Black", "Helvetica Neue", Arial, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillText('Wii Sports', 518, 140);
  g.fillStyle = '#eef6ea';
  g.fillText('Wii Sports', 512, 132);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

function box(w, h, d, material, x, y, z) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  return m;
}

function buildLines(group) {
  const mat = new THREE.MeshBasicMaterial({ color: 0xf6f6ee });
  const y = 0.012;
  const add = (cx, cz, w, d) => {
    const m = box(w, 0.012, d, mat, cx, y, cz);
    m.receiveShadow = false;
    group.add(m);
  };
  const full = HALF_LENGTH * 2 + LINE_W;
  for (const s of [-1, 1]) {
    add(0, s * HALF_LENGTH, HALF_WIDTH_DOUBLES * 2 + LINE_W, LINE_W);
    add(s * HALF_WIDTH_DOUBLES, 0, LINE_W, full);
    add(s * HALF_WIDTH_SINGLES, 0, LINE_W, full);
    add(0, s * SERVICE_Z, HALF_WIDTH_SINGLES * 2 + LINE_W, LINE_W);
    add(0, s * (HALF_LENGTH - 0.1), LINE_W, 0.2);
  }
  add(0, 0, LINE_W, SERVICE_Z * 2 + LINE_W);
}

function netTopAt(x) {
  const t = x / NET_POST_X;
  return NET_CENTER_H + (NET_POST_H - NET_CENTER_H) * t * t;
}

function buildNet(group) {
  const strandMat = new THREE.MeshLambertMaterial({ color: 0x1f2a24 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0xfafafa });
  const postMat = new THREE.MeshLambertMaterial({ color: 0x2c7a3c });
  const capMat = new THREE.MeshLambertMaterial({ color: 0xe9f1e6 });
  const bottom = 0.03;

  const strandGeo = new THREE.BoxGeometry(0.022, 1, 0.022);
  for (let x = -NET_POST_X + 0.06; x < NET_POST_X; x += 0.12) {
    const top = netTopAt(x) - 0.06;
    const m = new THREE.Mesh(strandGeo, strandMat);
    m.scale.y = top - bottom;
    m.position.set(x, bottom + (top - bottom) / 2, 0);
    group.add(m);
  }

  const rows = 8;
  const segs = 16;
  const rowGeo = new THREE.BoxGeometry(1, 0.02, 0.022);
  for (let r = 0; r < rows; r++) {
    const f = r / rows;
    for (let i = 0; i < segs; i++) {
      const x0 = -NET_POST_X + (i / segs) * NET_POST_X * 2;
      const x1 = -NET_POST_X + ((i + 1) / segs) * NET_POST_X * 2;
      const y0 = bottom + (netTopAt(x0) - 0.06 - bottom) * f;
      const y1 = bottom + (netTopAt(x1) - 0.06 - bottom) * f;
      const m = new THREE.Mesh(rowGeo, strandMat);
      m.scale.x = Math.hypot(x1 - x0, y1 - y0) + 0.01;
      m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
      m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
      group.add(m);
    }
  }

  const bandSegs = 28;
  const bandGeo = new THREE.BoxGeometry(1, 0.13, 0.04);
  for (let i = 0; i < bandSegs; i++) {
    const x0 = -NET_POST_X + (i / bandSegs) * NET_POST_X * 2;
    const x1 = -NET_POST_X + ((i + 1) / bandSegs) * NET_POST_X * 2;
    const y0 = netTopAt(x0) - 0.06;
    const y1 = netTopAt(x1) - 0.06;
    const m = new THREE.Mesh(bandGeo, bandMat);
    m.scale.x = Math.hypot(x1 - x0, y1 - y0) + 0.01;
    m.position.set((x0 + x1) / 2, (y0 + y1) / 2, 0);
    m.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    m.castShadow = true;
    group.add(m);
  }

  const strap = box(0.06, NET_CENTER_H - 0.06 - bottom, 0.03, bandMat, 0, bottom + (NET_CENTER_H - 0.06 - bottom) / 2, 0);
  group.add(strap);

  for (const s of [-1, 1]) {
    const post = box(0.16, NET_POST_H + 0.04, 0.16, postMat, s * NET_POST_X, (NET_POST_H + 0.04) / 2, 0);
    post.castShadow = true;
    const cap = box(0.2, 0.05, 0.2, capMat, s * NET_POST_X, NET_POST_H + 0.065, 0);
    const plate = box(0.1, 0.22, 0.01, capMat, s * NET_POST_X, NET_POST_H * 0.55, -0.085);
    const plateB = plate.clone();
    plateB.position.z = 0.085;
    group.add(post, cap, plate, plateB);
  }
}

function buildEnclosure(group, renderer) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3e });
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x25663a });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x5aa34f });
  const boothMat = new THREE.MeshLambertMaterial({ color: 0x3a8a47 });
  const ledgeMat = new THREE.MeshLambertMaterial({ color: 0xe8d98a });

  const backLen = WALL_X * 2 + 1;
  const back = box(backLen, WALL_H, 0.5, wallMat, 0, WALL_H / 2, WALL_BACK_Z);
  const backBase = box(backLen, 0.5, 0.56, baseMat, 0, 0.25, WALL_BACK_Z - 0.03);
  const backCap = box(backLen, 0.18, 0.7, capMat, 0, WALL_H + 0.09, WALL_BACK_Z);
  back.receiveShadow = true;
  group.add(back, backBase, backCap);

  const sideLen = WALL_BACK_Z - SIDE_WALL_FRONT_Z;
  const sideMid = (WALL_BACK_Z + SIDE_WALL_FRONT_Z) / 2;
  for (const s of [-1, 1]) {
    const wall = box(0.5, SIDE_WALL_H, sideLen, wallMat, s * WALL_X, SIDE_WALL_H / 2, sideMid);
    const base = box(0.56, 0.35, sideLen, baseMat, s * (WALL_X - 0.03), 0.175, sideMid);
    const cap = box(0.7, 0.16, sideLen, capMat, s * WALL_X, SIDE_WALL_H + 0.08, sideMid);
    wall.receiveShadow = true;
    group.add(wall, base, cap);

    const boothZ0 = 3.5;
    const boothZ1 = 14.8;
    const boothW = 3.4;
    const deck = box(boothW, 0.5, boothZ1 - boothZ0, boothMat, s * (WALL_X + 0.25 + boothW / 2), 0.25, (boothZ0 + boothZ1) / 2);
    const ledge = box(0.35, 0.08, boothZ1 - boothZ0, ledgeMat, s * (WALL_X + 0.6), SIDE_WALL_H + 0.24, (boothZ0 + boothZ1) / 2);
    const backRail = box(0.3, 1.9, boothZ1 - boothZ0, wallMat, s * (WALL_X + 0.25 + boothW), 0.95 + 0.5, (boothZ0 + boothZ1) / 2);
    group.add(deck, ledge, backRail);
  }

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshBasicMaterial({ map: makeWordmarkTexture(renderer), transparent: true }),
  );
  plate.position.set(0, 1.95, WALL_BACK_Z - 0.26);
  plate.rotation.y = Math.PI;
  plate.scale.x = -1;
  group.add(plate);
}

function buildHedges(group) {
  const rand = seeded(42);
  const greens = [0x2f8a34, 0x3d9a3a, 0x2a7a30, 0x4aa63f, 0x358f37];
  const mats = greens.map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const geo = new THREE.SphereGeometry(1, 12, 9);
  const blob = (x, y, z, r, sy = 0.85) => {
    const m = new THREE.Mesh(geo, mats[Math.floor(rand() * mats.length)]);
    m.position.set(x, y, z);
    m.scale.set(r * 1.1, r * sy, r);
    m.castShadow = true;
    group.add(m);
  };
  for (let x = -WALL_X - 0.5; x <= WALL_X + 0.5; x += 0.95) {
    blob(x + rand() * 0.3, WALL_H + 0.45 + rand() * 0.25, WALL_BACK_Z + 0.9, 0.85 + rand() * 0.25);
    blob(x + 0.4 + rand() * 0.3, WALL_H + 1.0 + rand() * 0.4, WALL_BACK_Z + 2.0, 1.1 + rand() * 0.3);
  }
  for (const s of [-1, 1]) {
    for (let z = -12; z <= WALL_BACK_Z; z += 1.1) {
      blob(s * (WALL_X + 4.6) + rand() * 0.3, 2.35 + rand() * 0.5, z, 0.95 + rand() * 0.25, 0.95);
    }
  }
}

function buildBackdrop(group) {
  const rand = seeded(99);
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x6b4a2a });
  const leafMats = [0x2e8a3a, 0x3f9d3f, 0x278033, 0x4faa44].map((c) => new THREE.MeshLambertMaterial({ color: c }));
  const trunkGeo = new THREE.CylinderGeometry(0.35, 0.5, 1, 8);
  const leafGeo = new THREE.SphereGeometry(1, 12, 9);
  for (let x = -34; x <= 34; x += 4.4) {
    const z = 21 + rand() * 4;
    const h = 5 + rand() * 2.5;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.scale.y = h;
    trunk.position.set(x, h / 2, z);
    group.add(trunk);
    for (let i = 0; i < 3; i++) {
      const leaf = new THREE.Mesh(leafGeo, leafMats[Math.floor(rand() * leafMats.length)]);
      const r = 2.3 + rand() * 1.1;
      leaf.position.set(x + (rand() - 0.5) * 2.4, h + 0.8 + rand() * 1.8, z + (rand() - 0.5) * 1.5);
      leaf.scale.set(r, r * 0.9, r);
      group.add(leaf);
    }
  }
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0xe6ece4 });
  const bandMat = new THREE.MeshLambertMaterial({ color: 0x8fa6a8 });
  group.add(box(34, 9, 6, bodyMat, 0, 4.5, 38), box(34, 1.4, 6.2, bandMat, 0, 6.6, 38));
}

function makeStringTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, size, size);
  g.strokeStyle = 'rgba(244, 244, 236, 0.95)';
  g.lineWidth = 3;
  for (let i = 6; i < size; i += 12) {
    g.beginPath();
    g.moveTo(i, 0);
    g.lineTo(i, size);
    g.stroke();
    g.beginPath();
    g.moveTo(0, i);
    g.lineTo(size, i);
    g.stroke();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function makeRacket(frameColor) {
  const g = new THREE.Group();
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
  const frameMat = new THREE.MeshLambertMaterial({ color: frameColor });
  const stringMat = new THREE.MeshBasicMaterial({
    map: makeStringTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 8), gripMat);
  grip.position.y = 0.1;
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.028, 0.14, 8), frameMat);
  throat.position.y = 0.32;
  const headR = 0.21;
  const head = new THREE.Mesh(new THREE.TorusGeometry(headR, 0.024, 8, 24), frameMat);
  head.scale.set(0.82, 1.1, 1);
  head.position.y = 0.4 + headR * 1.1;
  // Circle sits inside the tube the way the reference hoop does (0.172 vs torus radius 0.2).
  const face = new THREE.Mesh(new THREE.CircleGeometry(headR * (0.172 / 0.2), 28), stringMat);
  face.scale.set(0.82, 1.1, 1);
  face.position.copy(head.position);
  face.renderOrder = 3;
  for (const m of [grip, throat, head]) m.castShadow = true;
  g.add(grip, throat, head, face);
  return g;
}

function buildPerson({ shirt, skin, hair, legs = true, racketColor = null, ponytail = false }) {
  const g = new THREE.Group();
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
  const add = (m) => {
    m.castShadow = true;
    g.add(m);
    return m;
  };

  if (legs) {
    for (const s of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.32, 8), whiteMat);
      leg.position.set(s * 0.1, 0.18, 0);
      add(leg);
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), whiteMat);
      shoe.scale.set(0.95, 0.6, 1.5);
      shoe.position.set(s * 0.1, 0.05, 0.05);
      add(shoe);
    }
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.24, 12), whiteMat);
    shorts.position.y = 0.46;
    add(shorts);
  }

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.42, 12), shirtMat);
  torso.position.y = 0.77;
  add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), skinMat);
  head.position.y = 1.3;
  add(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.425, 24, 18), hairMat);
  hairCap.position.set(0, 1.35, -0.075);
  add(hairCap);
  // Reference face, scaled from head radius 0.28 up to this head (0.4) and nudged forward of the hair cap.
  const k = 0.4 / 0.28;
  const hy = (gy) => 1.3 + (gy - 1.44) * k;
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf7f7f7 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055 * k, 10, 8), skinMat);
    ear.position.set(s * (0.27 * k + 0.04), hy(1.42), 0.08);
    ear.castShadow = true;
    g.add(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * k, 10, 8), eyeWhiteMat);
    eye.scale.set(1, 1.15, 0.45);
    eye.position.set(s * 0.09 * k, hy(1.48), 0.24 * k + 0.045);
    g.add(eye);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024 * k, 8, 8), pupilMat);
    pupil.position.set(s * 0.09 * k, hy(1.475), 0.255 * k + 0.06);
    g.add(pupil);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055 * k, 0.012 * k, 6, 10, Math.PI), pupilMat);
  smile.position.set(0, hy(1.36), 0.25 * k + 0.045);
  smile.rotation.z = Math.PI;
  smile.rotation.x = 0.15;
  g.add(smile);
  if (ponytail) {
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.1 * k, 12, 10), hairMat);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * k, 0.07 * k, 0.28 * k, 8), hairMat);
    // Same tie-and-tail as the reference, shifted off the back-left so it clears the head
    // from the front-facing broadcast and wall cameras.
    const hx = -0.32;
    tie.position.set(hx, hy(1.34), -0.22 * k);
    tail.position.set(hx, hy(1.16), -0.24 * k);
    add(tie);
    add(tail);
  }

  const makeArm = (side) => {
    const pivot = new THREE.Group();
    pivot.position.set(side * 0.24, 0.9, 0);
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.07, 0.16, 8), shirtMat);
    sleeve.position.y = -0.07;
    const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.048, 0.044, 0.34, 8), skinMat);
    arm.position.y = -0.2;
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.065, 10, 8), skinMat);
    hand.position.y = -0.4;
    for (const m of [sleeve, arm, hand]) {
      m.castShadow = true;
      pivot.add(m);
    }
    g.add(pivot);
    return pivot;
  };
  const rightArm = makeArm(1);
  const leftArm = makeArm(-1);
  leftArm.rotation.z = -0.12;
  rightArm.rotation.z = 0.12;

  let racket = null;
  if (racketColor !== null) {
    racket = makeRacket(racketColor);
    racket.position.y = -0.4;
    rightArm.add(racket);
  }
  return { group: g, rightArm, leftArm, racket, shirtMat };
}

function poseRacketArm(person, swinging, role) {
  const { rightArm, leftArm, racket } = person;
  const armTheta = swinging ? -2.7 : role === 'net' ? -1.45 : -1.1;
  const racketWorld = swinging ? 1.1 : 0.45;
  rightArm.rotation.x = armTheta;
  rightArm.rotation.z = swinging ? 0.35 : 0.12;
  if (racket) racket.rotation.x = racketWorld - armTheta;
  leftArm.rotation.x = swinging ? -0.6 : -0.35;
}

export function createTennisScene(container) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0xa6d8f2);

  const camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 400);

  const sun = new THREE.DirectionalLight(0xfff4dc, 2.4);
  sun.position.set(14, 24, 10);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.left = -20;
  sun.shadow.camera.right = 20;
  sun.shadow.camera.top = 20;
  sun.shadow.camera.bottom = -20;
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 70;
  sun.shadow.radius = 4;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  scene.add(sun, sun.target, new THREE.HemisphereLight(0xdff0ff, 0x7fb04a, 1.9));

  // The contract has +x on the right when looking from side A toward side B. Three.js is right-handed, so +x would be on
  // the left for that view; the whole court lives in a mirrored root and lookAt mirrors the camera to match.
  const world = new THREE.Group();
  world.scale.x = -1;
  scene.add(world);

  const grassTex = makeGrassTexture(renderer);
  const tile = 4.8;
  grassTex.repeat.set(160 / tile, 160 / tile);
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(160, 160),
    new THREE.MeshLambertMaterial({ map: grassTex }),
  );
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  world.add(ground);

  const lines = new THREE.Group();
  buildLines(lines);
  world.add(lines);

  const net = new THREE.Group();
  buildNet(net);
  world.add(net);

  const enclosure = new THREE.Group();
  buildEnclosure(enclosure, renderer);
  world.add(enclosure);

  const hedges = new THREE.Group();
  buildHedges(hedges);
  world.add(hedges);

  const backdrop = new THREE.Group();
  buildBackdrop(backdrop);
  world.add(backdrop);

  const crowd = new THREE.Group();
  const crowdShirts = [0xf2f2f2, 0xe8b830, 0x3f7bd8, 0xd8503f, 0xf0f0f0, 0x7a4fc8];
  const boothX = WALL_X + 1.9;
  const spectators = [
    { x: -boothX, z: 6.2, i: 0 },
    { x: -boothX - 0.2, z: 8.4, i: 1, cheer: true },
    { x: -boothX, z: 10.9, i: 2 },
    { x: -boothX - 0.1, z: 13, i: 3 },
    { x: boothX, z: 6.8, i: 4 },
    { x: boothX + 0.1, z: 9.4, i: 5, cheer: true },
    { x: boothX, z: 11.8, i: 0 },
    { x: boothX + 0.1, z: 13.7, i: 2 },
  ];
  for (const sp of spectators) {
    const p = buildPerson({
      shirt: crowdShirts[sp.i % crowdShirts.length],
      skin: SKIN_TONES[(sp.i + 1) % SKIN_TONES.length],
      hair: HAIR_TONES[sp.i % HAIR_TONES.length],
      legs: false,
    });
    p.group.position.set(sp.x, 0.5, sp.z);
    p.group.rotation.y = sp.x < 0 ? Math.PI / 2 : -Math.PI / 2;
    p.group.scale.setScalar(1.05);
    if (sp.cheer) {
      p.rightArm.rotation.x = -3.0;
      p.leftArm.rotation.x = -2.8;
    }
    crowd.add(p.group);
  }
  world.add(crowd);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xd4f23a, emissive: 0x3a4a00 }),
  );
  ball.castShadow = true;
  ball.visible = false;
  world.add(ball);

  const score = document.createElement('div');
  Object.assign(score.style, {
    position: 'absolute',
    top: '14px',
    left: '16px',
    padding: '6px 12px 7px',
    borderRadius: '10px',
    background: 'rgba(10, 30, 14, 0.55)',
    color: '#ffffff',
    font: '700 22px/1.1 system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    letterSpacing: '0.02em',
    pointerEvents: 'none',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  });
  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
  container.appendChild(score);

  const players = new Map();
  let width = 0;
  let height = 0;

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  function lookAt({ pos, at, fov }) {
    camera.position.set(-pos[0], pos[1], pos[2]);
    if (fov) camera.fov = fov;
    camera.lookAt(-at[0], at[1], at[2]);
    camera.updateProjectionMatrix();
  }

  function removePlayer(id) {
    const p = players.get(id);
    if (!p) return;
    world.remove(p.person.group);
    p.person.group.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    players.delete(id);
  }

  function setView(view) {
    const b = view.ball;
    ball.visible = Boolean(b);
    if (b) ball.position.set(b.x, b.y, b.z);

    const seen = new Set();
    for (const pl of view.players || []) {
      seen.add(pl.id);
      let entry = players.get(pl.id);
      if (!entry) {
        const h = hash(pl.id);
        const person = buildPerson({
          shirt: pl.color || '#2f9e44',
          skin: SKIN_TONES[h % SKIN_TONES.length],
          hair: HAIR_TONES[(h >>> 3) % HAIR_TONES.length],
          racketColor: pl.side === 'A' ? 0x2f6fe0 : 0xe8e8e8,
          ponytail: pl.side === 'B' && pl.role !== 'net',
        });
        world.add(person.group);
        entry = { person };
        players.set(pl.id, entry);
      }
      const { person } = entry;
      person.shirtMat.color.set(pl.color || '#2f9e44');
      person.group.position.set(pl.x, 0, pl.z);
      person.group.rotation.y = pl.side === 'B' ? Math.PI : 0;
      poseRacketArm(person, !!pl.swinging, pl.role);
    }
    for (const id of [...players.keys()]) if (!seen.has(id)) removePlayer(id);

    const s = view.score;
    if (s) {
      score.replaceChildren();
      const main = document.createElement('div');
      main.textContent = `${s.pointsA} \u2013 ${s.pointsB}`;
      const games = document.createElement('div');
      games.textContent = `Games ${s.gamesA} \u2013 ${s.gamesB}`;
      Object.assign(games.style, { font: '600 13px/1.3 system-ui, Arial, sans-serif', opacity: '0.85', marginTop: '2px' });
      score.append(main, games);
    }
  }

  function render() {
    renderer.render(scene, camera);
  }

  function dispose() {
    for (const id of [...players.keys()]) removePlayer(id);
    scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    renderer.dispose();
    renderer.domElement.remove();
    score.remove();
  }

  resize();
  return { resize, dispose, render, setView, lookAt };
}
