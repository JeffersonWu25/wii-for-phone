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

function buildEndWall(group, renderer) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3e });
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x25663a });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x5aa34f });
  const backLen = WALL_X * 2 + 1;
  const back = box(backLen, WALL_H, 0.5, wallMat, 0, WALL_H / 2, WALL_BACK_Z);
  const backBase = box(backLen, 0.5, 0.56, baseMat, 0, 0.25, WALL_BACK_Z - 0.03);
  const backCap = box(backLen, 0.18, 0.7, capMat, 0, WALL_H + 0.09, WALL_BACK_Z);
  back.receiveShadow = true;
  group.add(back, backBase, backCap);

  const plate = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshBasicMaterial({ map: makeWordmarkTexture(renderer), transparent: true }),
  );
  plate.position.set(0, 1.95, WALL_BACK_Z - 0.26);
  plate.rotation.y = Math.PI;
  plate.scale.x = -1;
  group.add(plate);
}

function buildStands(group) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3e });
  const boothMat = new THREE.MeshLambertMaterial({ color: 0x3a8a47 });
  const ledgeMat = new THREE.MeshLambertMaterial({ color: 0xe8d98a });
  for (const s of [-1, 1]) {
    const boothZ0 = 3.5;
    const boothZ1 = 14.8;
    const boothW = 3.4;
    const deck = box(boothW, 0.5, boothZ1 - boothZ0, boothMat, s * (WALL_X + 0.25 + boothW / 2), 0.25, (boothZ0 + boothZ1) / 2);
    const ledge = box(0.35, 0.08, boothZ1 - boothZ0, ledgeMat, s * (WALL_X + 0.6), SIDE_WALL_H + 0.24, (boothZ0 + boothZ1) / 2);
    const backRail = box(0.3, 1.9, boothZ1 - boothZ0, wallMat, s * (WALL_X + 0.25 + boothW), 0.95 + 0.5, (boothZ0 + boothZ1) / 2);
    group.add(deck, ledge, backRail);
  }
}

function buildEnclosure(group, renderer) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3e });
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x25663a });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x5aa34f });

  buildEndWall(group, renderer);

  const sideLen = WALL_BACK_Z - SIDE_WALL_FRONT_Z;
  const sideMid = (WALL_BACK_Z + SIDE_WALL_FRONT_Z) / 2;
  for (const s of [-1, 1]) {
    const wall = box(0.5, SIDE_WALL_H, sideLen, wallMat, s * WALL_X, SIDE_WALL_H / 2, sideMid);
    const base = box(0.56, 0.35, sideLen, baseMat, s * (WALL_X - 0.03), 0.175, sideMid);
    const cap = box(0.7, 0.16, sideLen, capMat, s * WALL_X, SIDE_WALL_H + 0.08, sideMid);
    wall.receiveShadow = true;
    group.add(wall, base, cap);
  }
  buildStands(group);
}

// Side B's pane looks back down the court, so the end behind side A gets the same wall, stands, hedges, crowd and
// trees as the end behind side B. buildFarEnd is built once more and turned half a turn about the net.
function buildSideWallExtension(group) {
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x2f7a3e });
  const baseMat = new THREE.MeshLambertMaterial({ color: 0x25663a });
  const capMat = new THREE.MeshLambertMaterial({ color: 0x5aa34f });
  const z0 = -WALL_BACK_Z;
  const z1 = SIDE_WALL_FRONT_Z;
  const c = (z0 + z1) / 2;
  const l = z1 - z0;
  for (const s of [-1, 1]) {
    const wall = box(0.5, SIDE_WALL_H, l, wallMat, s * WALL_X, SIDE_WALL_H / 2, c);
    const base = box(0.56, 0.35, l, baseMat, s * (WALL_X - 0.03), 0.175, c);
    const cap = box(0.7, 0.16, l, capMat, s * WALL_X, SIDE_WALL_H + 0.08, c);
    wall.receiveShadow = true;
    group.add(wall, base, cap);
  }
}

function buildHedges(group, sideFrom = -12, seed = 42) {
  const rand = seeded(seed);
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
    for (let z = sideFrom; z <= WALL_BACK_Z; z += 1.1) {
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
  for (let i = 4; i < size; i += 10) {
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

// Body proportions, in metres. Upper-body parts live in a group whose origin is the hip, so the whole trunk can turn,
// lean and bob over the legs. The arm is two bones joined at an elbow; the racket sits in the hand.
const HIP_Y = 0.5;
const SHOULDER_X = 0.24;
const SHOULDER_Y = 0.4;
const ARM_UPPER = 0.29;
const ARM_FORE = 0.29;
const ARM_REACH = ARM_UPPER + ARM_FORE;
const LEG_HIP_Y = 0.36;
const LEG_THIGH = 0.18;
const LEG_SHIN = 0.17;

// Racket frame, in racket space: +y runs from the hand up the shaft to the head, +z is the palm-side face.
// The hoop is 1.8 times the old 0.172 x 0.231 oval, so it reads about as big as the torso from the low camera.
const HOOP_RX = 0.31;
const HOOP_RY = 0.416;
const HOOP_BOTTOM = 0.44;
const RACKET_CENTER = HOOP_BOTTOM + HOOP_RY;

class OvalCurve extends THREE.Curve {
  constructor(rx, ry) {
    super();
    this.rx = rx;
    this.ry = ry;
  }

  getPoint(t, target = new THREE.Vector3()) {
    const a = t * Math.PI * 2;
    return target.set(Math.cos(a) * this.rx, Math.sin(a) * this.ry, 0);
  }
}

function bar(from, to, radius, material) {
  const dir = new THREE.Vector3().subVectors(to, from);
  const len = dir.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, len, 8), material);
  m.position.copy(from).addScaledVector(dir, 0.5);
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function makeContactMark() {
  const shape = new THREE.Shape();
  const spikes = 9;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? 0.17 : 0.065;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    if (i === 0) shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else shape.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  shape.closePath();
  const mat = new THREE.MeshBasicMaterial({
    color: 0xfff6b0,
    transparent: true,
    opacity: 0.95,
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
  });
  const mark = new THREE.Mesh(new THREE.ShapeGeometry(shape), mat);
  mark.renderOrder = 6;
  mark.visible = false;
  return mark;
}

function makeRacket(frameColor) {
  const g = new THREE.Group();
  const gripMat = new THREE.MeshLambertMaterial({ color: 0x1b1b1b });
  const frameMat = new THREE.MeshLambertMaterial({ color: frameColor });
  const palmMat = new THREE.MeshLambertMaterial({ color: 0xf2c230 });
  const stringMat = new THREE.MeshBasicMaterial({
    map: makeStringTexture(),
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });

  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.034, 0.04, 0.36, 10), gripMat);
  grip.position.y = 0.02;
  const butt = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.046, 0.04, 10), frameMat);
  butt.position.y = -0.17;
  const gripTop = 0.2;
  const forkTop = HOOP_BOTTOM + 0.02;
  const throatL = bar(
    new THREE.Vector3(-0.02, gripTop, 0),
    new THREE.Vector3(-HOOP_RX * 0.62, forkTop, 0),
    0.022,
    frameMat,
  );
  const throatR = bar(
    new THREE.Vector3(0.02, gripTop, 0),
    new THREE.Vector3(HOOP_RX * 0.62, forkTop, 0),
    0.022,
    frameMat,
  );
  const hoop = new THREE.Mesh(new THREE.TubeGeometry(new OvalCurve(HOOP_RX, HOOP_RY), 56, 0.03, 8, true), frameMat);
  hoop.position.y = RACKET_CENTER;
  const bed = new THREE.Mesh(new THREE.CircleGeometry(1, 36), stringMat);
  bed.scale.set(HOOP_RX - 0.026, HOOP_RY - 0.026, 1);
  bed.position.y = RACKET_CENTER;
  bed.renderOrder = 3;
  // A yellow bridge on the palm-side throat tells a forehand grip from a backhand one.
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.05, 0.02), palmMat);
  bridge.position.set(0, forkTop + 0.02, 0.025);
  for (const m of [grip, butt, throatL, throatR, hoop]) m.castShadow = true;

  const mark = makeContactMark();
  mark.position.set(0, RACKET_CENTER, 0.01);

  g.add(grip, butt, throatL, throatR, hoop, bed, bridge, mark);
  g.userData.mark = mark;
  return g;
}

function makeArm(skinMat, shirtMat, side) {
  const shoulder = new THREE.Group();
  shoulder.position.set(side * SHOULDER_X, SHOULDER_Y, 0);
  const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(0.078, 0.07, 0.17, 8), shirtMat);
  sleeve.position.y = -0.065;
  const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.046, ARM_UPPER, 8), skinMat);
  upper.position.y = -ARM_UPPER / 2;
  const joint = new THREE.Mesh(new THREE.SphereGeometry(0.052, 10, 8), skinMat);
  joint.position.y = -ARM_UPPER;
  const elbow = new THREE.Group();
  elbow.position.y = -ARM_UPPER;
  const fore = new THREE.Mesh(new THREE.CylinderGeometry(0.046, 0.04, ARM_FORE, 8), skinMat);
  fore.position.y = -ARM_FORE / 2;
  const hand = new THREE.Mesh(new THREE.SphereGeometry(0.068, 10, 8), skinMat);
  hand.position.y = -ARM_FORE;
  elbow.add(fore, hand);
  for (const m of [sleeve, upper, joint, fore, hand]) m.castShadow = true;
  shoulder.add(sleeve, upper, joint, elbow);
  return { shoulder, elbow, hand };
}

function buildPerson({ shirt, skin, hair, legs = true, racketColor = null, ponytail = false }) {
  const g = new THREE.Group();
  const upper = new THREE.Group();
  upper.position.y = HIP_Y;
  g.add(upper);
  const shirtMat = new THREE.MeshLambertMaterial({ color: shirt });
  const skinMat = new THREE.MeshLambertMaterial({ color: skin });
  const hairMat = new THREE.MeshLambertMaterial({ color: hair });
  const whiteMat = new THREE.MeshLambertMaterial({ color: 0xf4f4f0 });
  const put = (m, cast = true) => {
    m.castShadow = cast;
    m.position.y -= HIP_Y;
    upper.add(m);
    return m;
  };

  const legRigs = [];
  if (legs) {
    for (const s of [-1, 1]) {
      const hip = new THREE.Group();
      hip.position.set(s * 0.1, LEG_HIP_Y, 0);
      const thigh = new THREE.Mesh(new THREE.CylinderGeometry(0.066, 0.06, LEG_THIGH, 8), whiteMat);
      thigh.position.y = -LEG_THIGH / 2;
      const knee = new THREE.Group();
      knee.position.y = -LEG_THIGH;
      const shin = new THREE.Mesh(new THREE.CylinderGeometry(0.058, 0.054, LEG_SHIN, 8), whiteMat);
      shin.position.y = -LEG_SHIN / 2;
      const shoe = new THREE.Mesh(new THREE.SphereGeometry(0.1, 10, 8), whiteMat);
      shoe.scale.set(0.95, 0.6, 1.5);
      shoe.position.set(0, -LEG_SHIN - 0.0, 0.05);
      for (const m of [thigh, shin, shoe]) m.castShadow = true;
      knee.add(shin, shoe);
      hip.add(thigh, knee);
      g.add(hip);
      legRigs.push({ hip, knee, side: s });
    }
    const shorts = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.22, 0.24, 12), whiteMat);
    shorts.position.y = 0.46;
    put(shorts);
  }

  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.21, 0.42, 12), shirtMat);
  torso.position.y = 0.77;
  put(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.4, 24, 18), skinMat);
  head.position.y = 1.3;
  put(head);
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(0.425, 24, 18), hairMat);
  hairCap.position.set(0, 1.35, -0.075);
  put(hairCap);
  // Reference face, scaled from head radius 0.28 up to this head (0.4) and nudged forward of the hair cap.
  const k = 0.4 / 0.28;
  const hy = (gy) => 1.3 + (gy - 1.44) * k;
  const eyeWhiteMat = new THREE.MeshBasicMaterial({ color: 0xf7f7f7 });
  const pupilMat = new THREE.MeshBasicMaterial({ color: 0x1a1a1a });
  for (const s of [-1, 1]) {
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.055 * k, 10, 8), skinMat);
    ear.position.set(s * (0.27 * k + 0.04), hy(1.42), 0.08);
    put(ear);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.045 * k, 10, 8), eyeWhiteMat);
    eye.scale.set(1, 1.15, 0.45);
    eye.position.set(s * 0.09 * k, hy(1.48), 0.24 * k + 0.045);
    put(eye, false);
    const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.024 * k, 8, 8), pupilMat);
    pupil.position.set(s * 0.09 * k, hy(1.475), 0.255 * k + 0.06);
    put(pupil, false);
  }
  const smile = new THREE.Mesh(new THREE.TorusGeometry(0.055 * k, 0.012 * k, 6, 10, Math.PI), pupilMat);
  smile.position.set(0, hy(1.36), 0.25 * k + 0.045);
  smile.rotation.z = Math.PI;
  smile.rotation.x = 0.15;
  put(smile, false);
  if (ponytail) {
    const tie = new THREE.Mesh(new THREE.SphereGeometry(0.1 * k, 12, 10), hairMat);
    const tail = new THREE.Mesh(new THREE.CylinderGeometry(0.045 * k, 0.07 * k, 0.28 * k, 8), hairMat);
    // Same tie-and-tail as the reference, shifted off the back-left so it clears the head
    // from the front-facing broadcast and wall cameras.
    const hx = -0.32;
    tie.position.set(hx, hy(1.34), -0.22 * k);
    tail.position.set(hx, hy(1.16), -0.24 * k);
    put(tie);
    put(tail);
  }

  const right = makeArm(skinMat, shirtMat, 1);
  const left = makeArm(skinMat, shirtMat, -1);
  upper.add(right.shoulder, left.shoulder);
  // Relaxed hang for spectators and for anyone not being posed.
  right.shoulder.rotation.z = 0.12;
  left.shoulder.rotation.z = -0.12;

  let racket = null;
  if (racketColor !== null) {
    racket = makeRacket(racketColor);
    upper.add(racket);
    racket.visible = true;
  }
  return {
    group: g,
    upper,
    rightArm: right.shoulder,
    leftArm: left.shoulder,
    arms: { right, left },
    legs: legRigs,
    racket,
    shirtMat,
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Posing. Everything below works in the trunk's own space: x is the player's right, y up, z toward the net, origin at
// the hip. A pose is where the racket hand goes, how the racket is held, where the free hand goes, and how the trunk
// turns (yaw about y, lean about x). Swings are keyframes over swingT; contact is solved against the ball.

const V3 = THREE.Vector3;
const Q4 = THREE.Quaternion;

const SWING_CONTACT_T = 0.42;
const SWING_SECONDS_VIEW = 0.35;
const HOLD_BLEND_SECONDS = 0.15;
const REACH_FROM_ORIGIN = 1.8;
const STRIDE_METRES = 2.2;
const MOVING_SPEED = 0.15;

const _bx = new V3();
const _by = new V3();
const _bz = new V3();
const _bm = new THREE.Matrix4();

function racketQuat(shaft, normal, out = new Q4()) {
  _by.copy(shaft).normalize();
  _bz.copy(normal).addScaledVector(_by, -normal.dot(_by));
  if (_bz.lengthSq() < 1e-6) {
    _bz.set(0, 0, 1);
    _bz.addScaledVector(_by, -_bz.dot(_by));
    if (_bz.lengthSq() < 1e-6) _bz.set(1, 0, 0);
  }
  _bz.normalize();
  _bx.crossVectors(_by, _bz);
  _bm.makeBasis(_bx, _by, _bz);
  return out.setFromRotationMatrix(_bm);
}

function key(t, hand, shaft, normal, free, yaw, lean, ballArm = 0) {
  return {
    t,
    hand: new V3(...hand),
    rq: racketQuat(new V3(...shaft), new V3(...normal)),
    free: new V3(...free),
    yaw,
    lean,
    ballArm,
  };
}

const READY = key(0, [0.46, 0.22, 0.44], [0.4, 0.9, -0.12], [0, 0.1, 1], [-0.28, 0.14, 0.38], 0, 0.04);

// Face normals point at the net (+z) on every forehand and backhand key, the same rule as the
// readable string bed: shaft and face stay nearly perpendicular, so the hoop never turns edge-on.
const FOREHAND = [
  READY,
  key(0.2, [0.58, 0.36, -0.12], [0.5, 0.55, -0.65], [0.12, 0.32, 0.55], [-0.16, 0.48, 0.5], 0.62, 0.02),
  key(SWING_CONTACT_T, [0.42, 0.32, 0.16], [-0.15, 0.35, 0.25], [0, 0.16, 0.99], [-0.38, 0.3, 0.3], -0.08, 0.12),
  key(0.7, [-0.04, 0.66, 0.4], [-0.45, 0.8, -0.2], [-0.08, 0.22, 0.9], [-0.4, 0.14, 0.18], -0.62, 0.1),
  key(1, [0.0, 0.6, 0.38], [-0.45, 0.8, -0.2], [-0.12, 0.16, 0.75], [-0.34, 0.12, 0.24], -0.55, 0.08),
];

const BACKHAND = [
  READY,
  key(0.2, [-0.24, 0.42, 0.3], [-0.75, 0.3, -0.4], [-0.05, 0.2, 0.55], [-0.62, 0.42, 0.12], -0.72, 0.02),
  key(SWING_CONTACT_T, [0.3, 0.4, 0.2], [-0.35, 0.4, 0.3], [0, 0.12, 0.99], [-0.6, 0.32, -0.02], -0.3, 0.12),
  key(0.7, [-0.2, 0.6, 0.3], [-0.7, 0.62, -0.1], [0.12, 0.18, 0.85], [-0.56, 0.22, 0.0], -0.05, 0.08),
  key(1, [-0.18, 0.56, 0.3], [-0.7, 0.62, -0.1], [0.18, 0.12, 0.7], [-0.5, 0.18, 0.06], -0.02, 0.06),
];

const SERVE = [
  key(0, [0.5, 0.62, 0.05], [0.12, 0.75, -0.65], [1, 0, 0], [-0.5, 0.9, 0.22], 0.75, -0.04, 0.35),
  key(0.22, [0.4, 0.82, -0.1], [0.2, -0.5, -0.85], [1, 0, 0.1], [-0.5, 0.95, 0.2], 0.9, -0.2, 0.35),
  key(SWING_CONTACT_T, [0.3, 0.95, 0.15], [0.1, 1, 0.2], [0, -0.2, 1], [-0.55, 1.0, 0.2], 0, 0.15, 0),
  key(0.7, [-0.1, 0.16, 0.48], [-0.6, -0.7, 0.3], [0, 0, 1], [-0.32, 0.3, 0.38], -0.5, 0.35, 0),
  key(1, [-0.08, 0.2, 0.46], [-0.6, -0.7, 0.3], [0, 0, 1], [-0.3, 0.2, 0.32], -0.46, 0.3, 0),
];

const TOSS_HOLD = SERVE[0];

function smooth(x) {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

function blendU(u) {
  return 0.5 * u + 0.5 * smooth(u);
}

function makePose() {
  return { hand: new V3(), rq: new Q4(), free: new V3(), yaw: 0, lean: 0, ballArm: 0 };
}

function copyPose(to, from) {
  to.hand.copy(from.hand);
  to.rq.copy(from.rq);
  to.free.copy(from.free);
  to.yaw = from.yaw;
  to.lean = from.lean;
  to.ballArm = from.ballArm;
  return to;
}

function lerpPose(out, a, b, u) {
  out.hand.lerpVectors(a.hand, b.hand, u);
  out.rq.slerpQuaternions(a.rq, b.rq, u);
  out.free.lerpVectors(a.free, b.free, u);
  out.yaw = a.yaw + (b.yaw - a.yaw) * u;
  out.lean = a.lean + (b.lean - a.lean) * u;
  out.ballArm = a.ballArm + (b.ballArm - a.ballArm) * u;
  return out;
}

function sampleKeys(out, keys, t) {
  if (t <= keys[0].t) return copyPose(out, keys[0]);
  const last = keys[keys.length - 1];
  if (t >= last.t) return copyPose(out, last);
  let i = 0;
  while (keys[i + 1].t < t) i++;
  const a = keys[i];
  const b = keys[i + 1];
  return lerpPose(out, a, b, blendU((t - a.t) / (b.t - a.t)));
}

function contactWeight(t) {
  const up = smooth((t - 0.2) / 0.16);
  const down = 1 - smooth((t - 0.5) / 0.14);
  return Math.min(up, down);
}

const _tmpA = new V3();
const _tmpB = new V3();
const _tmpC = new V3();
const _inv = new THREE.Matrix4();
const _up = new V3(0, -1, 0);
const _q1 = new Q4();
const _q2 = new Q4();
const _q1i = new Q4();

// Two-bone arm that reaches `target` in trunk space. The elbow drops toward `pole`.
function solveArm(arm, shoulderPos, target, pole, handOut) {
  const d = _tmpA.subVectors(target, shoulderPos);
  const full = d.length();
  const dist = Math.min(Math.max(full, 0.08), ARM_REACH - 0.004);
  const axis = d.divideScalar(full || 1);
  handOut.copy(shoulderPos).addScaledVector(axis, dist);
  const a1 = (ARM_UPPER * ARM_UPPER - ARM_FORE * ARM_FORE + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(ARM_UPPER * ARM_UPPER - a1 * a1, 0));
  const perp = _tmpB.copy(pole).addScaledVector(axis, -pole.dot(axis));
  if (perp.lengthSq() < 1e-6) perp.set(0, -1, 0).addScaledVector(axis, axis.y);
  perp.normalize();
  const elbowPos = _tmpC.copy(shoulderPos).addScaledVector(axis, a1).addScaledVector(perp, h);

  const upperDir = new V3().subVectors(elbowPos, shoulderPos).normalize();
  const foreDir = new V3().subVectors(handOut, elbowPos).normalize();
  _q1.setFromUnitVectors(_up, upperDir);
  _q1i.copy(_q1).invert();
  _q2.setFromUnitVectors(_up, foreDir);
  arm.shoulder.quaternion.copy(_q1);
  arm.elbow.quaternion.copy(_q1i).multiply(_q2);
}

const RIGHT_POLE = new V3(0.8, -0.8, -0.35);
const LEFT_POLE = new V3(-0.8, -0.8, -0.35);
const RIGHT_SHOULDER = new V3(SHOULDER_X, SHOULDER_Y, 0);
const LEFT_SHOULDER = new V3(-SHOULDER_X, SHOULDER_Y, 0);

// Racket centre lands on `ball` (trunk space): find a hand spot at racket-centre distance from the ball that the arm can
// reach, starting from the keyed hand and moving as little as possible.
function solveContact(ball, shoulder, nominalHand, nominalQ, handOut, quatOut, faceDir) {
  const h = _tmpA.copy(nominalHand);
  const lo = 0.1;
  const hi = ARM_REACH - 0.01;
  for (let i = 0; i < 10; i++) {
    const fromBall = _tmpB.subVectors(h, ball);
    const lenB = fromBall.length() || 1;
    h.copy(ball).addScaledVector(fromBall, RACKET_CENTER / lenB);
    const fromShoulder = _tmpB.subVectors(h, shoulder);
    const lenS = fromShoulder.length() || 1;
    const clamped = Math.min(Math.max(lenS, lo), hi);
    h.copy(shoulder).addScaledVector(fromShoulder, clamped / lenS);
  }
  const fromBall = _tmpB.subVectors(h, ball);
  const lenB = fromBall.length() || 1;
  h.copy(ball).addScaledVector(fromBall, RACKET_CENTER / lenB);
  handOut.copy(h);
  const shaft = _tmpC.subVectors(ball, h).normalize();
  const nominalNormal = new V3(0, 0, 1).applyQuaternion(nominalQ);
  if (faceDir) nominalNormal.lerp(faceDir, 0.55);
  racketQuat(shaft, nominalNormal, quatOut);
}

function createAnimator(person) {
  const state = {
    person,
    out: makePose(),
    scratch: makePose(),
    from: makePose(),
    target: makePose(),
    mode: 'ready',
    blendT: 1,
    walk: 0,
    travel: 0,
    prevX: null,
    prevZ: null,
    dirX: 0,
    dirZ: 1,
    speedEst: 0,
    swing: { active: false, kind: 'forehand', start: 0, lock: null, lockSet: false, t: 0 },
    markT: 0,
    prevPhase: null,
    fresh: true,
  };
  copyPose(state.out, READY);
  return state;
}

// Which hold the player is in when not swinging.
function holdFor(view, pl) {
  return view.phase === 'toss' && pl.id === view.serverId ? 'toss' : 'ready';
}

function animatePlayer(state, pl, view, ball, dt, now) {
  const { person } = state;
  const lefty = pl.handed === 'left';
  const sideSign = pl.side === 'B' ? -1 : 1;

  // Ball in the player's root frame (x right, z toward the net), or null.
  let ballRoot = null;
  if (ball) {
    const dx = ball.x - pl.x;
    const dz = ball.z - pl.z;
    ballRoot = new V3(dx * sideSign, ball.y, dz * sideSign);
  }

  // Swing progress: use the view's swingT when it is a number, otherwise time the swing here.
  const hasT = typeof pl.swingT === 'number' && Number.isFinite(pl.swingT);
  const sw = state.swing;
  const wasActive = sw.active;
  let swingT = -1;
  if (hasT) {
    swingT = pl.swingT;
    sw.active = swingT >= 0 && swingT <= 1;
  } else {
    sw.active = !!pl.swinging;
    if (sw.active) {
      if (!wasActive) sw.start = now;
      swingT = Math.min(1, (now - sw.start) / SWING_SECONDS_VIEW);
    }
  }
  if (sw.active && !wasActive) {
    sw.lock = null;
    sw.lockSet = false;
    if (pl.shape === 'serve' || (!pl.shape && state.prevPhase === 'toss' && pl.id === view.serverId)) sw.kind = 'serve';
    else if (pl.hand === 'backhand') sw.kind = 'backhand';
    else if (pl.hand === 'forehand') sw.kind = 'forehand';
    else {
      const localX = ballRoot ? ballRoot.x * (lefty ? -1 : 1) : 0;
      sw.kind = localX < -0.05 ? 'backhand' : 'forehand';
    }
  }
  if (sw.active && pl.shape === 'serve') sw.kind = 'serve';
  if (sw.active && (pl.hand === 'backhand' || pl.hand === 'forehand') && sw.kind !== 'serve') sw.kind = pl.hand;
  // The ball is followed up to contact, then the strings keep the spot where it was struck.
  if (sw.active && ballRoot && swingT <= SWING_CONTACT_T + 0.02) {
    sw.lock = ballRoot.clone();
    sw.lockSet = true;
  } else if (sw.active && !sw.lockSet && ballRoot) {
    sw.lock = ballRoot.clone();
    sw.lockSet = true;
  }
  sw.t = swingT;

  // Mode, with a short blend when the hold changes.
  const mode = sw.active ? 'swing' : holdFor(view, pl);
  if (mode !== state.mode) {
    if (mode !== 'swing' && !state.fresh) {
      copyPose(state.from, state.out);
      state.blendT = 0;
    } else {
      state.blendT = 1;
    }
    state.mode = mode;
  }

  // Base pose.
  const target = state.target;
  if (mode === 'swing') {
    const keys = sw.kind === 'serve' ? SERVE : sw.kind === 'backhand' ? BACKHAND : FOREHAND;
    sampleKeys(target, keys, Math.min(1, Math.max(0, swingT)));
  } else {
    copyPose(target, mode === 'toss' ? TOSS_HOLD : READY);
  }

  // Movement: speed and travel come from the view when present, otherwise from the change in position.
  let speed = typeof pl.speed === 'number' && Number.isFinite(pl.speed) ? pl.speed : null;
  if (state.prevX !== null && dt > 1e-4) {
    const mx = (pl.x - state.prevX) * sideSign;
    const mz = (pl.z - state.prevZ) * sideSign;
    const md = Math.hypot(mx, mz);
    if (md > 1e-5) {
      const k = Math.min(1, dt * 10);
      state.dirX += (mx / md - state.dirX) * k;
      state.dirZ += (mz / md - state.dirZ) * k;
    }
    const est = md / dt;
    state.speedEst += (est - state.speedEst) * Math.min(1, dt * 12);
    if (speed === null) speed = state.speedEst;
  }
  if (speed === null) speed = 0;
  state.prevX = pl.x;
  state.prevZ = pl.z;
  if (!(Math.hypot(state.dirX, state.dirZ) > 1e-3)) {
    state.dirX = 0;
    state.dirZ = 1;
  }
  const dl = Math.hypot(state.dirX, state.dirZ) || 1;
  const fx = state.dirX / dl;
  const fz = state.dirZ / dl;
  const moving = mode !== 'swing' && speed > MOVING_SPEED;
  if (typeof pl.travel === 'number' && Number.isFinite(pl.travel)) state.travel = pl.travel;
  else state.travel += speed * dt;
  const walkTarget = moving ? Math.min(1, 0.35 + speed / 3.5) : 0;
  if (state.fresh) state.walk = walkTarget;
  else state.walk += (walkTarget - state.walk) * Math.min(1, dt * 9);
  const walk = state.walk < 0.01 ? 0 : state.walk;
  const phase = (state.travel / STRIDE_METRES) * Math.PI * 2;
  const stepSin = Math.sin(phase);
  const armWalk = mode === 'swing' ? 0 : walk;
  const bob = Math.abs(stepSin) * 0.04 * armWalk;
  const sway = stepSin * 0.05 * armWalk;

  // Trunk transform before contact correction.
  const mirror = lefty ? -1 : 1;
  const upper = person.upper;
  const lockRoot = sw.active && sw.lock ? sw.lock : mode === 'toss' && ballRoot ? ballRoot : null;
  let shiftX = 0;
  let shiftY = 0;
  let shiftZ = 0;
  let jump = 0;

  const applyTrunk = (pose) => {
    upper.rotation.set(pose.lean, pose.yaw * mirror, 0, 'YXZ');
    upper.scale.set(mirror, 1, 1);
    upper.position.set(shiftX, HIP_Y + shiftY, shiftZ);
    upper.updateMatrix();
  };

  const w = mode === 'swing' ? contactWeight(Math.min(1, Math.max(0, swingT))) : 0;
  let reachW = 0;
  if (lockRoot) {
    const dist = Math.hypot(lockRoot.x, lockRoot.y - 0.9, lockRoot.z);
    reachW = 1 - smooth((dist - REACH_FROM_ORIGIN) / 0.35);
  }
  const wc = w * reachW;

  if (mode === 'swing' && lockRoot && wc > 0) {
    applyTrunk(target);
    const shoulderRoot = new V3().copy(RIGHT_SHOULDER).applyMatrix4(upper.matrix);
    const toBall = new V3().subVectors(lockRoot, shoulderRoot);
    const dist = toBall.length();
    const comfort = ARM_REACH + RACKET_CENTER - 0.1;
    const excess = Math.max(0, dist - comfort);
    if (excess > 0) {
      const push = Math.min(excess, 0.5) * wc;
      toBall.normalize();
      shiftX = toBall.x * push;
      shiftZ = toBall.z * push;
      const up = toBall.y * push;
      if (up > 0) {
        jump = Math.min(up * 0.5, 0.12);
        shiftY = up - jump;
      } else {
        shiftY = Math.max(up, -0.1);
      }
    }
  }

  // Contact: strings through the ball. The whole body may be lifted by a jump, so the ball is measured from there.
  if (mode === 'swing' && lockRoot && wc > 0) {
    applyTrunk(target);
    _inv.copy(upper.matrix).invert();
    const ballU = new V3().copy(lockRoot).sub(new V3(0, jump + bob, 0)).applyMatrix4(_inv);
    const contactHand = new V3();
    const contactQ = new Q4();
    let face = null;
    if (typeof pl.faceYaw === 'number' && Number.isFinite(pl.faceYaw)) {
      const pitch = typeof pl.facePitch === 'number' && Number.isFinite(pl.facePitch) ? pl.facePitch : 0;
      const dirX = Math.sin(pl.faceYaw) * Math.cos(pitch) * sideSign;
      const dirZ = Math.cos(pl.faceYaw) * Math.cos(pitch) * sideSign;
      face = new V3(dirX * mirror, Math.sin(pitch), dirZ);
      // Forehand and backhand both keep the string bed toward the net. A backhand used to
      // flip this normal, and the blend from the key then turned the hoop edge-on.
      if (face.z < 0.2) face = null;
    }
    solveContact(ballU, RIGHT_SHOULDER, target.hand, target.rq, contactHand, contactQ, face);
    target.hand.lerp(contactHand, wc);
    target.rq.slerp(contactQ, wc);
  }

  // Ball arm: the free hand points at the ball while it is tossed.
  if (lockRoot && target.ballArm > 0) {
    applyTrunk(target);
    _inv.copy(upper.matrix).invert();
    const ballU = new V3().copy(lockRoot).sub(new V3(0, jump + bob, 0)).applyMatrix4(_inv);
    const toBall = new V3().subVectors(ballU, LEFT_SHOULDER);
    const len = toBall.length();
    if (len > 0.05 && len < 4) {
      const pointTo = new V3().copy(LEFT_SHOULDER).addScaledVector(toBall, Math.min(ARM_REACH - 0.02, len) / len);
      target.free.lerp(pointTo, target.ballArm);
    }
  }

  // Output pose: hold changes blend over 0.15 s, swings follow their keys directly.
  const out = state.out;
  if (mode === 'swing') {
    copyPose(out, target);
  } else if (state.blendT < 1) {
    state.blendT = Math.min(1, state.blendT + dt / HOLD_BLEND_SECONDS);
    lerpPose(out, state.from, target, smooth(state.blendT));
  } else {
    copyPose(out, target);
  }

  // Trunk, with the walk added on top of the pose. A swing owns the trunk and arms, so the walk only drives legs then.
  const poseNow = state.scratch;
  copyPose(poseNow, out);
  poseNow.yaw += sway * 1.2;
  poseNow.lean += 0.06 * armWalk;
  const free = poseNow.free;
  const hand = poseNow.hand;
  // Free arm swings against the legs; the racket hand stays in its hold with a small counter-motion.
  free.z += -stepSin * 0.16 * armWalk;
  free.y += Math.abs(stepSin) * 0.04 * armWalk;
  hand.z += stepSin * 0.035 * armWalk;
  hand.y += bob * 0.8;

  upper.rotation.set(poseNow.lean, poseNow.yaw * mirror, 0, 'YXZ');
  upper.scale.set(mirror, 1, 1);
  upper.position.set(shiftX, HIP_Y + shiftY, shiftZ);
  upper.updateMatrix();
  person.group.position.y = jump + bob;

  // Arms.
  const handPos = new V3();
  solveArm(person.arms.right, RIGHT_SHOULDER, poseNow.hand, RIGHT_POLE, handPos);
  const freeHand = new V3();
  solveArm(person.arms.left, LEFT_SHOULDER, poseNow.free, LEFT_POLE, freeHand);
  if (person.racket) {
    person.racket.quaternion.copy(poseNow.rq);
    person.racket.position.copy(handPos);
  }

  // Legs: opposite phases, knees lift on the recovery swing, legs stretch or fold with the trunk.
  const legScale = (LEG_HIP_Y + shiftY) / LEG_HIP_Y;
  const amp = 0.62 * Math.min(1, 0.45 + speed / 4) * walk;
  for (const leg of person.legs) {
    const ph = phase + (leg.side > 0 ? Math.PI : 0);
    const swing = Math.sin(ph) * amp;
    leg.hip.rotation.set(-swing * fz, 0, swing * fx * 1.1);
    leg.knee.rotation.x = Math.max(0, Math.cos(ph)) * 1.0 * amp;
    leg.hip.position.y = LEG_HIP_Y + shiftY;
    leg.hip.scale.y = legScale;
  }

  // Contact mark.
  if (person.racket) {
    if (pl.struck) state.markT = 0.12;
    else state.markT = Math.max(0, state.markT - dt);
    const mark = person.racket.userData.mark;
    mark.visible = !!pl.struck || state.markT > 0;
    mark.scale.setScalar(1 + (pl.struck ? 0 : (1 - state.markT / 0.12) * 0.3));
  }

  state.prevPhase = view.phase;
  state.fresh = false;
}

const BASELINE_PLAYER_Z = 11.185;
// Each pane's camera stays on its own baseline centre. Players run inside a still frame, the way the console's court
// camera holds still. Height, setback and field of view are the numbers that make the near player and racket large.
const COURT_CAMERA = {
  y: 1.9,
  behindPlayer: 3.2,
  fov: 48,
  pitchDown: (6.7 * Math.PI) / 180,
};

function courtCameraFor(side) {
  const toward = side === 'B' ? -1 : 1;
  const z = -toward * (BASELINE_PLAYER_Z + COURT_CAMERA.behindPlayer);
  const reach = 20;
  return {
    pos: [0, COURT_CAMERA.y, z],
    at: [0, COURT_CAMERA.y - reach * Math.tan(COURT_CAMERA.pitchDown), z + toward * reach],
    fov: COURT_CAMERA.fov,
  };
}

function buildCrowd(group) {
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
    group.add(p.group);
  }
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

  const camera = new THREE.PerspectiveCamera(COURT_CAMERA.fov, 16 / 9, 0.1, 400);

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
  buildSideWallExtension(enclosure);
  world.add(enclosure);

  const hedges = new THREE.Group();
  buildHedges(hedges);
  world.add(hedges);

  const backdrop = new THREE.Group();
  buildBackdrop(backdrop);
  world.add(backdrop);

  const crowd = new THREE.Group();
  buildCrowd(crowd);
  world.add(crowd);

  const nearEnd = new THREE.Group();
  buildEndWall(nearEnd, renderer);
  buildStands(nearEnd);
  buildHedges(nearEnd, 12, 17);
  buildBackdrop(nearEnd);
  buildCrowd(nearEnd);
  nearEnd.rotation.y = Math.PI;
  world.add(nearEnd);

  const ball = new THREE.Mesh(
    new THREE.SphereGeometry(0.12, 16, 12),
    new THREE.MeshLambertMaterial({ color: 0xd4f23a, emissive: 0x3a4a00 }),
  );
  ball.castShadow = true;
  ball.visible = false;
  world.add(ball);

  if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

  const divider = document.createElement('div');
  Object.assign(divider.style, {
    position: 'absolute',
    top: '0',
    bottom: '0',
    left: '50%',
    width: '2px',
    marginLeft: '-1px',
    background: '#070a08',
    pointerEvents: 'none',
    display: 'none',
  });
  container.appendChild(divider);

  const score = document.createElement('div');
  Object.assign(score.style, {
    position: 'absolute',
    top: '10px',
    left: '50%',
    transform: 'translateX(-50%)',
    zIndex: '3',
    padding: '6px 16px 7px',
    borderRadius: '10px',
    background: 'rgba(10, 30, 14, 0.62)',
    color: '#ffffff',
    font: '700 22px/1.1 system-ui, -apple-system, "Segoe UI", Arial, sans-serif',
    letterSpacing: '0.02em',
    textAlign: 'center',
    pointerEvents: 'none',
    textShadow: '0 1px 2px rgba(0,0,0,0.5)',
  });
  container.appendChild(score);

  const players = new Map();
  let width = 0;
  let height = 0;
  let manualCamera = null;
  let split = false;
  let lastNow = null;
  let entrySides = new Set();

  function resize() {
    const w = Math.max(1, container.clientWidth);
    const h = Math.max(1, container.clientHeight);
    if (w === width && h === height) return;
    width = w;
    height = h;
    renderer.setSize(w, h, false);
  }

  function aim({ pos, at, fov }) {
    camera.position.set(-pos[0], pos[1], pos[2]);
    if (fov) camera.fov = fov;
    camera.lookAt(-at[0], at[1], at[2]);
  }

  function lookAt(cfg) {
    manualCamera = cfg;
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
    const now = performance.now() / 1000;
    const dt = lastNow === null ? 0 : Math.min(0.1, Math.max(0, now - lastNow));
    lastNow = now;

    const b = view.ball;
    ball.visible = Boolean(b);
    if (b) ball.position.set(b.x, b.y, b.z);

    const seen = new Set();
    const sides = new Set();
    for (const pl of view.players || []) {
      seen.add(pl.id);
      sides.add(pl.side);
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
        entry = { person, anim: createAnimator(person) };
        players.set(pl.id, entry);
      }
      const { person } = entry;
      person.shirtMat.color.set(pl.color || '#2f9e44');
      person.group.position.set(pl.x, 0, pl.z);
      person.group.rotation.y = pl.side === 'B' ? Math.PI : 0;
      animatePlayer(entry.anim, pl, view, b, dt, now);
    }
    for (const id of [...players.keys()]) if (!seen.has(id)) removePlayer(id);

    split = sides.has('A') && sides.has('B');
    entrySides = sides;
    divider.style.display = split && !manualCamera ? 'block' : 'none';

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

  function drawPane(x, w, cfg) {
    renderer.setViewport(x, 0, w, height);
    renderer.setScissor(x, 0, w, height);
    camera.aspect = w / height;
    aim(cfg);
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }

  function render() {
    renderer.setScissorTest(true);
    if (manualCamera) {
      drawPane(0, width, manualCamera);
      return;
    }
    if (split) {
      const left = Math.floor(width / 2);
      drawPane(0, left, courtCameraFor('A'));
      drawPane(left, width - left, courtCameraFor('B'));
      return;
    }
    drawPane(0, width, courtCameraFor(entrySides.has('B') && !entrySides.has('A') ? 'B' : 'A'));
  }

  function cameraInfo() {
    return {
      y: COURT_CAMERA.y,
      behindPlayer: COURT_CAMERA.behindPlayer,
      fov: COURT_CAMERA.fov,
      pitchDown: COURT_CAMERA.pitchDown,
      split: split && !manualCamera,
    };
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
    divider.remove();
  }

  resize();
  return { resize, dispose, render, setView, lookAt, cameraInfo };
}
