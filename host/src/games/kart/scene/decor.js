// Props: trees, bushes, flowers, grandstand + crowd, floodlight towers, start gantry, pond, rotating sign, balloon.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { rng } from './sky.js';
import { toonMat, canvasTex, bannerTexture, signTexture, startBoardTexture, balloonTexture, waterTexture } from './textures.js';

const M4 = new THREE.Matrix4();
const Q = new THREE.Quaternion();
const V3 = new THREE.Vector3();
const S3 = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function glowTexture() {
  return canvasTex(64, 64, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 1, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,250,220,1)');
    g.addColorStop(0.25, 'rgba(255,240,180,0.55)');
    g.addColorStop(1, 'rgba(255,240,180,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
}

function box(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(x, y, z);
  return g;
}

function bar(ax, ay, az, bx, by, bz, r) {
  const a = new THREE.Vector3(ax, ay, az);
  const b = new THREE.Vector3(bx, by, bz);
  const len = a.distanceTo(b);
  const g = new THREE.CylinderGeometry(r, r, len, 6);
  const q = new THREE.Quaternion().setFromUnitVectors(UP, b.clone().sub(a).normalize());
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), q, new THREE.Vector3(1, 1, 1)));
  return g;
}

// Pick the open infield spot farthest from any track edge (for the sign / balloon).
function infieldSpot(track) {
  let best = { x: 30, z: 85, d: -1 };
  for (let x = -30; x <= 110; x += 4) {
    for (let z = 30; z <= 140; z += 4) {
      const p = track.project(x, z);
      const lim = track.surfaceAt(p.s, p.lateral);
      const d = Math.abs(p.lateral) - (p.lateral >= 0 ? lim.limitR : lim.limitL);
      if (d > best.d) best = { x, z, d };
    }
  }
  return best;
}

export function buildDecor(track) {
  const group = new THREE.Group();
  const rand = rng(77);
  const spot = infieldSpot(track);
  const tickers = [];
  const clearOf = []; // circles trees must avoid: [x, z, r]

  // ── Pond inside the left S-bend ────────────────────────────────────────────
  {
    const { s0, s1 } = track.pieceRange('sLeft');
    const fr = track.frameAt((s0 + s1) / 2);
    const lim = track.surfaceAt(fr.s, -20).limitL;
    let r = 18;
    let cx;
    let cz;
    for (; r > 5; r -= 1) {
      const lat = -(lim + r + 4);
      cx = fr.x + fr.rx * lat;
      cz = fr.z + fr.rz * lat;
      let ok = true;
      for (let k = 0; k < 24 && ok; k++) {
        const a = (k / 24) * Math.PI * 2;
        const p = track.project(cx + Math.cos(a) * r * 1.35, cz + Math.sin(a) * r);
        const l = track.surfaceAt(p.s, p.lateral);
        if (Math.abs(p.lateral) - (p.lateral >= 0 ? l.limitR : l.limitL) < 5) ok = false;
      }
      if (ok) break;
    }
    const y = track.terrainHeight(cx, cz);
    const water = new THREE.Mesh(
      new THREE.CircleGeometry(1, 56),
      new THREE.MeshPhongMaterial({ map: waterTexture(), color: 0xffffff, specular: 0xbfe8ff, shininess: 120 })
    );
    water.rotation.x = -Math.PI / 2;
    water.scale.set(r * 1.35, r, 1);
    water.position.set(cx, y + 0.14, cz);
    water.rotation.z = fr.h;
    water.material.map.repeat.set(5, 5);
    water.receiveShadow = true;
    const beach = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1.0 + 2.6 / r, 56),
      new THREE.MeshLambertMaterial({ color: 0xf8e070, polygonOffset: true, polygonOffsetFactor: -2 })
    );
    beach.rotation.x = -Math.PI / 2;
    beach.rotation.z = fr.h;
    beach.scale.set(r * 1.35, r, 1);
    beach.position.set(cx, y + 0.1, cz);
    beach.receiveShadow = true;
    group.add(water, beach);
    tickers.push((t) => {
      water.material.map.offset.set(t * 0.012, t * 0.02);
    });
    clearOf.push([cx, cz, r * 1.35 + 4]);

    // lily pads
    const pads = new THREE.InstancedMesh(new THREE.CircleGeometry(0.55, 10), new THREE.MeshLambertMaterial({ color: 0x35b34a, side: THREE.DoubleSide }), 9);
    for (let i = 0; i < 9; i++) {
      const a = rand() * 6.28;
      const d = rand() * 0.7;
      const px = Math.cos(a) * r * 1.35 * d;
      const pz = Math.sin(a) * r * d;
      const cs = Math.cos(fr.h);
      const sn = Math.sin(fr.h);
      M4.compose(V3.set(cx + px * cs - pz * sn, y + 0.17, cz + px * sn + pz * cs), Q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2), S3.set(1, 1, 1));
      pads.setMatrixAt(i, M4);
    }
    group.add(pads);
  }

  // ── Grandstand with crowd (left side of the start straight) ───────────────
  {
    const X0 = -42;
    const X1 = 104;
    const LEN = X1 - X0;
    const cxm = (X0 + X1) / 2;
    const Z0 = -31;
    const TIERS = 6;
    const DEPTH = 2.4;
    const RISE = 1.15;
    const concrete = [];
    const seats = [];
    for (let i = 0; i < TIERS; i++) {
      const top = (i + 1) * RISE;
      concrete.push(box(LEN, top, DEPTH, cxm, top / 2, Z0 - DEPTH * (i + 0.5)));
      seats.push(box(LEN - 1, 0.12, DEPTH * 0.55, cxm, top + 0.06, Z0 - DEPTH * (i + 0.5) + 0.35));
    }
    const backZ = Z0 - DEPTH * TIERS;
    concrete.push(box(LEN, TIERS * RISE + 2.5, 0.6, cxm, (TIERS * RISE + 2.5) / 2, backZ - 0.3));
    const stand = new THREE.Mesh(mergeGeometries(concrete), toonMat({ color: 0xd9dee6, rim: 0.15 }));
    const seat = new THREE.Mesh(mergeGeometries(seats), toonMat({ color: 0x2f6fe0, rim: 0.1 }));
    stand.castShadow = stand.receiveShadow = true;
    seat.receiveShadow = true;
    group.add(stand, seat);

    // roof over the upper tiers
    const roofParts = [];
    const roofY = 9.4;
    roofParts.push(box(LEN + 2, 0.5, DEPTH * 3.6, cxm, roofY, Z0 - DEPTH * 4.3));
    const roof = new THREE.Mesh(mergeGeometries(roofParts), toonMat({ color: 0xf3f6fa, rim: 0.2 }));
    roof.castShadow = true;
    const trim = new THREE.Mesh(
      mergeGeometries([box(LEN + 2.2, 0.7, 0.4, cxm, roofY - 0.3, Z0 - DEPTH * 4.3 + DEPTH * 1.8), box(LEN + 2.2, 0.28, 0.45, cxm, roofY + 0.05, Z0 - DEPTH * 4.3 + DEPTH * 1.8 + 0.02)]),
      toonMat({ color: 0xe8272a, rim: 0.1 })
    );
    const poleGeos = [];
    for (let x = X0; x <= X1 + 1; x += 14) {
      poleGeos.push(bar(x, 0, Z0 - DEPTH * 5.6, x, roofY, Z0 - DEPTH * 5.6, 0.22));
      poleGeos.push(bar(x, 0, Z0 - DEPTH * 2.6, x, roofY, Z0 - DEPTH * 2.6, 0.18));
    }
    const poles = new THREE.Mesh(mergeGeometries(poleGeos), new THREE.MeshLambertMaterial({ color: 0xaab4c2 }));
    poles.castShadow = true;
    group.add(roof, trim, poles);

    // sponsor boards along the stand front
    const bt = bannerTexture().clone();
    bt.repeat.set(LEN / 24, 1);
    bt.needsUpdate = true;
    const board = new THREE.Mesh(new THREE.PlaneGeometry(LEN, 1.15), new THREE.MeshLambertMaterial({ map: bt, side: THREE.DoubleSide }));
    board.position.set(cxm, 0.7, Z0 + 0.05);
    group.add(board);

    // crowd (instanced bodies + heads)
    const spots = [];
    for (let i = 0; i < TIERS; i++) {
      const top = (i + 1) * RISE;
      for (let x = X0 + 1; x < X1 - 1; x += 0.8 + rand() * 0.2) {
        if (rand() < 0.07) continue;
        spots.push([x + (rand() - 0.5) * 0.1, top, Z0 - DEPTH * (i + 0.5) + 0.3]);
      }
    }
    const shirts = [0xe8272a, 0x2f6fe0, 0xffd23a, 0xffffff, 0x1fb85a, 0xff7a1a, 0xb04ae0, 0x2fd0e0, 0xf5509a];
    const skins = [0xf6d2b0, 0xe0a97a, 0xb97a4e, 0x7a4a2e, 0xffdcbc];
    const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(0.5, 0.62, 0.36), new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.19, 6, 4), new THREE.MeshLambertMaterial({ color: 0xffffff }), spots.length);
    const col = new THREE.Color();
    spots.forEach(([x, y, z], i) => {
      const jump = rand() < 0.2 ? 0.25 * rand() : 0;
      M4.makeTranslation(x, y + 0.4 + jump, z);
      bodies.setMatrixAt(i, M4);
      M4.makeTranslation(x, y + 0.9 + jump, z);
      heads.setMatrixAt(i, M4);
      bodies.setColorAt(i, col.setHex(shirts[Math.floor(rand() * shirts.length)]));
      heads.setColorAt(i, col.setHex(skins[Math.floor(rand() * skins.length)]));
    });
    group.add(bodies, heads);
    clearOf.push([cxm, -50, LEN / 2 + 8]);
  }

  // ── Floodlight towers ────────────────────────────────────────────────────
  {
    const frame = [];
    const lamps = [];
    const H = 27;
    for (const [tx, tz] of [[-36, -52], [96, -52]]) {
      const hw = 2.0;
      const tw = 0.9;
      for (const [sx, sz] of [[-1, -1], [-1, 1], [1, -1], [1, 1]]) {
        frame.push(bar(tx + sx * hw, 0, tz + sz * hw, tx + sx * tw, H, tz + sz * tw, 0.2));
      }
      for (let y = 4; y < H; y += 5) {
        const k = 1 - y / H;
        const w = tw + (hw - tw) * k;
        frame.push(bar(tx - w, y, tz - w, tx + w, y, tz - w, 0.07), bar(tx - w, y, tz + w, tx + w, y, tz + w, 0.07));
        frame.push(bar(tx - w, y, tz - w, tx - w, y, tz + w, 0.07), bar(tx + w, y, tz - w, tx + w, y, tz + w, 0.07));
      }
      frame.push(box(11, 6.2, 0.7, tx, H + 3.4, tz + 1.2));
      for (let i = 0; i < 5; i++) {
        for (let j = 0; j < 4; j++) lamps.push(box(1.6, 1.15, 0.2, tx - 4.4 + i * 2.2, H + 1.2 + j * 1.5, tz + 1.7));
      }
    }
    const tower = new THREE.Mesh(mergeGeometries(frame), new THREE.MeshLambertMaterial({ color: 0xc8d0da }));
    tower.castShadow = true;
    const lampMesh = new THREE.Mesh(mergeGeometries(lamps), new THREE.MeshBasicMaterial({ color: 0xfffbe0 }));
    group.add(tower, lampMesh);
    const glowTex = glowTexture();
    for (const [tx, tz] of [[-36, -52], [96, -52]]) {
      const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, opacity: 0.6 }));
      sp.scale.set(16, 16, 1);
      sp.position.set(tx, H + 4.5, tz + 2.6);
      group.add(sp);
    }
  }

  // ── Start gantry with five lights ────────────────────────────────────────
  const lampMats = [];
  const halos = [];
  {
    const parts = [];
    const hw = track.frameAt(0).halfWidth;
    const zL = hw + 1.5;
    parts.push(box(1.1, 9.6, 1.1, 0, 4.8, -zL), box(1.1, 9.6, 1.1, 0, 4.8, zL));
    parts.push(box(1.5, 1.5, zL * 2 + 1.6, 0, 9.6, 0));
    const frame = new THREE.Mesh(mergeGeometries(parts), toonMat({ color: 0xe9edf2, rim: 0.2 }));
    frame.castShadow = true;
    group.add(frame);
    const stripe = new THREE.Mesh(box(1.55, 0.35, zL * 2 + 1.7, 0, 9.0, 0), toonMat({ color: 0xe8272a }));
    group.add(stripe);
    const bt = startBoardTexture();
    for (const sgn of [-1, 1]) {
      const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshBasicMaterial({ map: bt }));
      b.position.set(sgn * 0.78, 11.0, 0);
      b.rotation.y = sgn > 0 ? Math.PI / 2 : -Math.PI / 2;
      group.add(b);
    }
    const housing = new THREE.CylinderGeometry(0.88, 0.88, 0.4, 20);
    housing.rotateZ(Math.PI / 2);
    const glowTex = glowTexture();
    for (let i = 0; i < 5; i++) {
      const z = (i - 2) * 2.3;
      const h = new THREE.Mesh(housing, new THREE.MeshLambertMaterial({ color: 0x111317 }));
      h.position.set(-0.7, 9.6, z);
      const lm = new THREE.MeshBasicMaterial({ color: 0x3a0d0d });
      const lens = new THREE.Mesh(new THREE.CircleGeometry(0.68, 24), lm);
      lens.rotation.y = -Math.PI / 2;
      lens.position.set(-0.93, 9.6, z);
      const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, blending: THREE.AdditiveBlending, depthWrite: false, color: 0xff3020, opacity: 0, fog: false }));
      halo.scale.set(5.5, 5.5, 1);
      halo.position.set(-1.1, 9.6, z);
      group.add(h, lens, halo);
      lampMats.push(lm);
      halos.push(halo);
    }
  }
  const lampOff = new THREE.Color(0x3a0d0d);
  const lampRed = new THREE.Color(0xff2a1a);
  const lampGreen = new THREE.Color(0x2aff55);
  function setStartLights(n) {
    lampMats.forEach((m, i) => {
      const lit = n === 'go' || (typeof n === 'number' && i < n);
      m.color.copy(lit ? (n === 'go' ? lampGreen : lampRed) : lampOff);
      halos[i].material.opacity = lit ? 0.9 : 0;
      halos[i].material.color.set(n === 'go' ? 0x30ff60 : 0xff3020);
    });
  }
  setStartLights(null);

  // ── Rotating sign + balloon ──────────────────────────────────────────────
  {
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.8, 1.4, 28), toonMat({ color: 0xf3f6fa }));
    base.position.set(spot.x, 0.7, spot.z);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.6, 15, 12), toonMat({ color: 0xdfe5ec }));
    pole.position.set(spot.x, 8.4, spot.z);
    const tex = signTexture();
    tex.wrapS = THREE.RepeatWrapping;
    const drum = new THREE.Mesh(
      new THREE.CylinderGeometry(5.2, 5.2, 3.6, 40, 1, true),
      new THREE.MeshLambertMaterial({ map: tex, side: THREE.DoubleSide, emissive: 0x335544, emissiveMap: tex, emissiveIntensity: 0.5 })
    );
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(5.3, 5.3, 0.4, 40), toonMat({ color: 0xffd23a }));
    const capB = cap.clone();
    const sign = new THREE.Group();
    drum.position.y = 0;
    cap.position.y = 2.0;
    capB.position.y = -2.0;
    sign.add(drum, cap, capB);
    sign.position.set(spot.x, 17.5, spot.z);
    drum.castShadow = true;
    pole.castShadow = true;
    group.add(base, pole, sign);
    tickers.push((t) => {
      drum.rotation.y = t * 0.35;
    });
    clearOf.push([spot.x, spot.z, 11]);

    // hot-air balloon
    const pts = [];
    for (let i = 0; i <= 20; i++) {
      const a = (i / 20) * Math.PI;
      // slightly pear-shaped
      const r = Math.sin(a) * (1 + 0.15 * Math.cos(a) * -1);
      pts.push(new THREE.Vector2(Math.max(0.001, r * 4.6), -Math.cos(a) * 5.4));
    }
    const env = new THREE.Mesh(new THREE.LatheGeometry(pts, 36), toonMat({ map: balloonTexture(), rim: 0.3 }));
    env.position.y = 6.2;
    env.castShadow = true;
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 1.6), toonMat({ color: 0xa0652a }));
    basket.position.y = -0.2;
    const ropes = new THREE.Mesh(
      mergeGeometries([bar(-0.7, 0.3, -0.7, -2.6, 3.6, -2.6, 0.04), bar(0.7, 0.3, -0.7, 2.6, 3.6, -2.6, 0.04), bar(-0.7, 0.3, 0.7, -2.6, 3.6, 2.6, 0.04), bar(0.7, 0.3, 0.7, 2.6, 3.6, 2.6, 0.04)]),
      new THREE.MeshLambertMaterial({ color: 0x5a3a1a })
    );
    const balloon = new THREE.Group();
    balloon.add(env, basket, ropes);
    balloon.scale.setScalar(1.5);
    group.add(balloon);
    tickers.push((t) => {
      const a = t * 0.045;
      balloon.position.set(spot.x + Math.cos(a) * 34, 58 + Math.sin(t * 0.4) * 1.5, spot.z + Math.sin(a) * 26);
      balloon.rotation.y = t * 0.05;
    });
  }

  // ── Trees, bushes, flowers ───────────────────────────────────────────────
  {
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 6);
    trunkGeo.translate(0, 1.2, 0);
    const crown = [];
    const add = (r, x, y, z, sy = 0.9) => {
      const g = new THREE.SphereGeometry(r, 8, 6);
      g.scale(1, sy, 1);
      g.translate(x, y, z);
      crown.push(g);
    };
    add(2.1, 0, 4.0, 0);
    add(1.4, 1.3, 3.5, 0.5, 0.85);
    add(1.3, -1.2, 3.6, -0.6, 0.85);
    add(1.1, 0.2, 5.0, -0.8, 0.8);
    const crownGeo = mergeGeometries(crown.map((g) => g.toNonIndexed()));

    const grid = new Map();
    const key = (x, z) => `${Math.floor(x / 5)},${Math.floor(z / 5)}`;
    const free = (x, z, minD) => {
      const gx = Math.floor(x / 5);
      const gz = Math.floor(z / 5);
      for (let i = -1; i <= 1; i++) {
        for (let j = -1; j <= 1; j++) {
          for (const p of grid.get(`${gx + i},${gz + j}`) ?? []) if ((p[0] - x) ** 2 + (p[1] - z) ** 2 < minD * minD) return false;
        }
      }
      return true;
    };
    const trees = [];
    for (let tries = 0; tries < 9000 && trees.length < 400; tries++) {
      const x = -300 + rand() * 640;
      const z = -140 + rand() * 450;
      if (clearOf.some(([cx, cz, r]) => (cx - x) ** 2 + (cz - z) ** 2 < r * r)) continue;
      const p = track.project(x, z);
      const l = track.surfaceAt(p.s, p.lateral);
      const gap = Math.abs(p.lateral) - (p.lateral >= 0 ? l.limitR : l.limitL);
      if (gap < 7) continue;
      if (rand() > Math.exp(-gap / 70) + 0.04) continue;
      if (!free(x, z, 6.5)) continue;
      const k = key(x, z);
      if (!grid.has(k)) grid.set(k, []);
      grid.get(k).push([x, z]);
      trees.push([x, track.terrainHeight(x, z), z, 0.85 + rand() * 0.75, rand() * 6.28, rand()]);
    }
    const trunks = new THREE.InstancedMesh(trunkGeo, toonMat({ color: 0x8a5a2c, rim: 0.1 }), trees.length);
    const crowns = new THREE.InstancedMesh(crownGeo, toonMat({ color: 0xffffff, rim: 0.12 }), trees.length);
    const palette = [0x49c21c, 0x7ed321, 0x2fae2f, 0xa6d82a, 0x58cf3a].map((h) => new THREE.Color(h));
    trees.forEach(([x, y, z, sc, rot, c], i) => {
      M4.compose(V3.set(x, y - 0.1, z), Q.setFromAxisAngle(UP, rot), S3.set(sc, sc, sc));
      trunks.setMatrixAt(i, M4);
      crowns.setMatrixAt(i, M4);
      crowns.setColorAt(i, palette[Math.floor(c * palette.length)]);
    });
    trunks.castShadow = crowns.castShadow = true;
    crowns.receiveShadow = true;
    group.add(trunks, crowns);

    // bushes and flowers hugging the outer scenery line
    const bushes = [];
    const flowers = [];
    for (const side of [-1, 1]) {
      for (let n = 0; n < track.samples.length - 1; n += 14) {
        if (rand() < 0.45) continue;
        const sp = track.samples[n];
        const lim = sp.halfWidth + (side > 0 ? sp.curbR + sp.runR : sp.curbL + sp.runL);
        const lat = side * (lim + 2 + rand() * 4);
        const x = sp.x - Math.sin(sp.h) * lat;
        const z = sp.z + Math.cos(sp.h) * lat;
        if (clearOf.some(([cx, cz, r]) => (cx - x) ** 2 + (cz - z) ** 2 < r * r)) continue;
        const y = track.terrainHeight(x, z);
        bushes.push([x, y, z, 0.8 + rand() * 0.7]);
        for (let f = 0; f < 5; f++) flowers.push([x + (rand() - 0.5) * 5, z + (rand() - 0.5) * 5]);
      }
    }
    const bush = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 8, 6), toonMat({ color: 0x2ea838, rim: 0.2 }), bushes.length);
    bushes.forEach(([x, y, z, sc], i) => {
      M4.compose(V3.set(x, y + 0.3, z), Q.identity(), S3.set(sc * 1.4, sc * 0.9, sc * 1.2));
      bush.setMatrixAt(i, M4);
    });
    bush.castShadow = true;
    const fl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.16, 6, 5), new THREE.MeshLambertMaterial({ color: 0xffffff }), flowers.length);
    const fcols = [0xff5fa8, 0xffffff, 0xffe14a, 0xff8a3a].map((h) => new THREE.Color(h));
    flowers.forEach(([x, z], i) => {
      fl.setMatrixAt(i, M4.makeTranslation(x, track.terrainHeight(x, z) + 0.22, z));
      fl.setColorAt(i, fcols[Math.floor(rand() * 4)]);
    });
    group.add(bush, fl);
  }

  return {
    group,
    setStartLights,
    tick(t) {
      for (const f of tickers) f(t);
    },
  };
}
