// Sculpted item box and banana (from the D2 sculpted candidate); itemModels.js delegates these two kinds here.
// flat-colored glossy materials (vertex colors only mark plate vs groove, peel tint, tips). No textures.
// createItemModel(kind) -> Object3D, origin at the bottom centre (box: centre). Geometry and materials are
// built once per kind and shared by every call; disposeItemModels() frees them (they rebuild on demand).
import * as THREE from 'three';

// ── Tunables ──
const PAL = {
  green: { plate: 0x2fd14a, groove: 0x1d6b1f },
  red: { plate: 0xe8401e, groove: 0x7a1a10 },
  rim: 0xf2f2ee, under: 0xf0dfa0, underDark: 0xc9b46a,
  peel: 0xf7e21b, tint: 0xa6d43a, tip: 0x6b3b1a,
  boxA: 0x9fe8a8, boxB: 0x8fe8ee, edge: 0xe8fff0, glyph: 0xffffff, glyphLine: 0x5aa0ff,
};
const SHELL = { rimY: 0.2, domeR: 0.41, domeH: 0.48, rimR: 0.37, rimTube: 0.1, rings: 18, around: 48 };
const BOX = { half: 0.65, round: 0.2, segs: 8 };

// ── Helpers ──
const col = (hex) => new THREE.Color(hex);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const gloss = (extra = {}) => new THREE.MeshPhysicalMaterial({ roughness: 0.28, metalness: 0, clearcoat: 0.7, clearcoatRoughness: 0.15, ...extra });
const flat = (hex, extra = {}) => new THREE.MeshStandardMaterial({ color: hex, roughness: 0.4, ...extra });

// Wrapped (u rows x v columns, v loops) grid -> indexed geometry. fn(i, j) -> { p:[x,y,z], c:Color }.
function grid(rows, cols, fn, flip = false) {
  const pos = [], rgb = [], idx = [];
  for (let i = 0; i <= rows; i++) for (let j = 0; j < cols; j++) {
    const { p, c } = fn(i, j);
    pos.push(...p); rgb.push(c.r, c.g, c.b);
  }
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const a = i * cols + j, b = i * cols + ((j + 1) % cols), c = a + cols, d = b + cols;
    if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

// Swept tube with rounded closed ends. size(t) -> { w, h } half extents; ridge adds peel ribs; tint(t) -> Color.
function tube(points, rings, seg, size, tint, { ridge = 0, ribs = 5, fixedUp = null } = {}) {
  const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)));
  const e = 0.06;
  return grid(rings, seg, (i, j) => {
    const t = i / rings;
    const P = curve.getPoint(t), T = curve.getTangent(t);
    const up = fixedUp ? new THREE.Vector3(...fixedUp) : new THREE.Vector3(0, 1, 0);
    let side = new THREE.Vector3().crossVectors(T, up);
    if (side.lengthSq() < 0.25) side.set(1, 0, 0);
    side.normalize();
    const nrm = new THREE.Vector3().crossVectors(side, T).normalize();
    const cap = t < e ? Math.sqrt(1 - (1 - t / e) ** 2) : t > 1 - e ? Math.sqrt(1 - (1 - (1 - t) / e) ** 2) : 1;
    const a = (j / seg) * Math.PI * 2;
    const { w, h } = size(t);
    const k = cap * (1 + ridge * Math.cos(ribs * a));
    const v = P.clone().addScaledVector(side, Math.cos(a) * w * k).addScaledVector(nrm, Math.sin(a) * h * k);
    return { p: [v.x, v.y, v.z], c: tint(t) };
  });
}

// ── Shell ──
function shellGeometries(kind) {
  const { plate, groove } = PAL[kind];
  const seeds = [new THREE.Vector3(0, 1, 0)];
  for (let k = 0; k < 5; k++) {
    for (const [pol, off] of [[0.8, 0], [1.42, 0.5]]) {
      const az = ((k + off) / 5) * Math.PI * 2;
      seeds.push(new THREE.Vector3(Math.sin(pol) * Math.cos(az), Math.cos(pol), Math.sin(pol) * Math.sin(az)));
    }
  }
  const cPlate = col(plate), cGroove = col(groove), n = new THREE.Vector3();
  const { rings, around, domeR, domeH, rimY } = SHELL;
  const dome = grid(rings, around, (i, j) => {
    const th = (i / rings) * 1.72, ph = (j / around) * Math.PI * 2;
    n.set(Math.sin(th) * Math.cos(ph), Math.cos(th), Math.sin(th) * Math.sin(ph));
    let a1 = 9, a2 = 9;
    for (const s of seeds) {
      const a = Math.acos(Math.min(1, n.dot(s)));
      if (a < a1) { a2 = a1; a1 = a; } else if (a < a2) a2 = a;
    }
    const border = (a2 - a1) / 2;
    const raise = smooth(0.02, 0.3, border) * 0.05 - 0.03;
    const r = 1 + raise;
    return {
      p: [n.x * domeR * r, rimY + n.y * domeH * r, n.z * domeR * r],
      c: cGroove.clone().lerp(cPlate, smooth(0.03, 0.085, border)),
    };
  }, true);

  const rim = new THREE.TorusGeometry(SHELL.rimR, SHELL.rimTube, 6, 20);
  rim.rotateX(Math.PI / 2); rim.scale(1, 0.9, 1); rim.translate(0, rimY, 0);
  const profile = [[0, 0], [0.15, 0], [0.26, 0.04], [0.33, 0.12], [0.34, rimY]];
  const under = new THREE.LatheGeometry(profile.map(([x, y]) => new THREE.Vector2(x, y)), 24);
  const ridges = [[0.33, 0.12], [0.285, 0.07], [0.215, 0.025]].map(([r, y]) => {
    const g = new THREE.TorusGeometry(r, 0.02, 4, 20); g.rotateX(Math.PI / 2); g.translate(0, y, 0); return g;
  });
  return { dome, rim, under, ridges };
}

function buildShell(kind, store) {
  const g = (store[kind] ??= (() => {
    const geo = shellGeometries(kind);
    return {
      geo,
      domeMat: gloss({ vertexColors: true, roughness: 0.22 }),
      rimMat: gloss({ color: PAL.rim, roughness: 0.3 }),
      underMat: flat(PAL.under),
      ridgeMat: flat(PAL.underDark),
    };
  })());
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g.geo.dome, g.domeMat), new THREE.Mesh(g.geo.rim, g.rimMat), new THREE.Mesh(g.geo.under, g.underMat));
  for (const r of g.geo.ridges) grp.add(new THREE.Mesh(r, g.ridgeMat));
  return grp;
}

// ── Banana ──
function bananaGeometries() {
  const cPeel = col(PAL.peel), cTint = col(PAL.tint), cTip = col(PAL.tip);
  const bodyTint = (t) => {
    const c = cPeel.clone().lerp(cTint, smooth(0.45, 0.95, t) * 0.9);
    return t > 0.955 ? cTip.clone() : c;
  };
  const body = tube(
    [[0, 0.3, 0], [0.03, 0.42, 0], [0.07, 0.55, 0], [0.07, 0.68, 0], [0.03, 0.8, 0]],
    20, 10,
    (t) => { const k = (1 - smooth(0, 1, t)) ** 1.3; return { w: 0.035 + 0.12 * k, h: 0.03 + 0.1 * k }; },
    bodyTint, { ridge: 0.06, fixedUp: [0, 0, 1] },
  );
  const flaps = [];
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + 0.5, dx = Math.cos(a), dz = Math.sin(a);
    const pts = [[0.02, 0.38], [0.14, 0.33], [0.3, 0.2], [0.45, 0.1], [0.58, 0.15]].map(([r, y]) => [dx * r, y, dz * r]);
    flaps.push(tube(
      pts, 16, 8,
      (t) => ({ w: lerp(0.15, 0.05, t ** 0.8), h: lerp(0.075, 0.035, t) }),
      (t) => (t > 0.93 ? cTip.clone() : cPeel.clone().lerp(col(0xe9d012), t * 0.4)),
      { ridge: 0.04, ribs: 3 },
    ));
  }
  return { body, flaps };
}

function buildBanana(store) {
  const g = (store.banana ??= { geo: bananaGeometries(), mat: gloss({ vertexColors: true, roughness: 0.3 }) });
  const grp = new THREE.Group();
  grp.add(new THREE.Mesh(g.geo.body, g.mat));
  for (const f of g.geo.flaps) grp.add(new THREE.Mesh(f, g.mat));
  return grp;
}

// ── Item box ──
function roundedCube() {
  const { half, round, segs } = BOX;
  const g = new THREE.BoxGeometry(half * 2, half * 2, half * 2, segs, segs, segs);
  const p = g.attributes.position, inner = half - round, v = new THREE.Vector3(), c = new THREE.Vector3();
  const rgb = [], a = col(PAL.boxA), b = col(PAL.boxB), tmp = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    c.set(Math.max(-inner, Math.min(inner, v.x)), Math.max(-inner, Math.min(inner, v.y)), Math.max(-inner, Math.min(inner, v.z)));
    v.sub(c).normalize().multiplyScalar(round).add(c);
    p.setXYZ(i, v.x, v.y, v.z);
    tmp.copy(a).lerp(b, 0.5 + 0.5 * Math.sin((v.x + v.y * 1.3 - v.z * 0.7) * 3.2));
    rgb.push(tmp.r, tmp.g, tmp.b);
  }
  g.setAttribute('color', new THREE.Float32BufferAttribute(rgb, 3));
  g.computeVertexNormals();
  return g;
}

function boxEdges() {
  const out = [], d = BOX.half - BOX.round + BOX.round * Math.SQRT1_2, len = (BOX.half - BOX.round) * 2;
  for (const axis of [0, 1, 2]) for (const s1 of [-1, 1]) for (const s2 of [-1, 1]) {
    const g = new THREE.CylinderGeometry(0.02, 0.02, len, 5, 1, true);
    if (axis === 0) { g.rotateZ(Math.PI / 2); g.translate(0, s1 * d, s2 * d); }
    else if (axis === 1) g.translate(s1 * d, 0, s2 * d);
    else { g.rotateX(Math.PI / 2); g.translate(s1 * d, s2 * d, 0); }
    out.push(g);
  }
  for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) {
    const g = new THREE.SphereGeometry(0.03, 5, 4);
    g.translate(x * d, y * d, z * d);
    out.push(g);
  }
  return out;
}

// "?" glyph: hook + stem stroke and a dot, in a blue outline layer and a slightly proud white layer.
function glyphGeometries() {
  const hook = [[-0.17, 0.1], [-0.17, 0.23], [-0.08, 0.32], [0.04, 0.33], [0.14, 0.26], [0.14, 0.14], [0.06, 0.05], [0, -0.03], [0, -0.1]]
    .map(([x, y]) => [x * 1.1, (y - 0.06) * 1.1, 0]);
  const layer = (r, depth, hex) => {
    const c = col(hex);
    const stroke = tube(hook, 10, 6, () => ({ w: r, h: depth }), () => c, { fixedUp: [0, 0, 1] });
    const dot = new THREE.SphereGeometry(r * 1.12, 8, 4);
    dot.scale(1, 1, depth / r); dot.translate(0, -0.27 * 1.1, 0);
    return { stroke, dot };
  };
  return { line: layer(0.088, 0.04, PAL.glyphLine), fill: layer(0.062, 0.056, PAL.glyph) };
}

function buildBox(store) {
  const g = (store.box ??= {
    body: roundedCube(),
    edges: boxEdges(),
    glyph: glyphGeometries(),
    bodyMat: new THREE.MeshPhysicalMaterial({
      color: 0xffffff, vertexColors: true, transparent: true, opacity: 0.45, roughness: 0.08, metalness: 0,
      iridescence: 1, iridescenceIOR: 1.35, iridescenceThicknessRange: [200, 650], clearcoat: 1, clearcoatRoughness: 0.05, depthWrite: false,
    }),
    edgeMat: flat(PAL.edge, { emissive: PAL.edge, emissiveIntensity: 0.25, roughness: 0.2 }),
    glyphMat: flat(PAL.glyph, { emissive: 0xffffff, emissiveIntensity: 0.55, roughness: 0.3 }),
    lineMat: flat(PAL.glyphLine, { emissive: PAL.glyphLine, emissiveIntensity: 0.3, roughness: 0.3 }),
  });
  const grp = new THREE.Group();
  const glyph = new THREE.Group();
  glyph.add(new THREE.Mesh(g.glyph.line.stroke, g.lineMat), new THREE.Mesh(g.glyph.line.dot, g.lineMat));
  glyph.add(new THREE.Mesh(g.glyph.fill.stroke, g.glyphMat), new THREE.Mesh(g.glyph.fill.dot, g.glyphMat));
  for (let k = 0; k < 4; k++) {
    const s = glyph.clone();
    s.rotation.y = (k * Math.PI) / 2;
    s.position.set(Math.sin(s.rotation.y), 0, Math.cos(s.rotation.y)).multiplyScalar(0.5);
    s.scale.setScalar(1.3);
    grp.add(s);
  }
  for (const e of g.edges) grp.add(new THREE.Mesh(e, g.edgeMat));
  const body = new THREE.Mesh(g.body, g.bodyMat);
  body.renderOrder = 2;
  grp.add(body);
  return grp;
}

// ── API ──
let store = {};

export function createSculptedModel(kind) {
  let g;
  if (kind === 'box') g = buildBox(store);
  else if (kind === 'banana') g = buildBanana(store);
  else g = buildShell(kind, store);
  g.traverse((o) => { o.castShadow = o.isMesh && kind !== 'box'; });
  return g;
}

export function disposeSculptedModels() {
  const seen = new Set();
  const free = (o) => {
    if (Array.isArray(o)) return o.forEach(free);
    if (!o || typeof o !== 'object' || seen.has(o)) return;
    seen.add(o);
    if (o.isBufferGeometry || o.isMaterial) o.dispose();
    else for (const v of Object.values(o)) free(v);
  };
  free(store);
  store = {};
}
