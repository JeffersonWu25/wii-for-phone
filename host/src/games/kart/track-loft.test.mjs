import test from 'node:test';
import assert from 'node:assert/strict';
import { luigiCircuit, poseAt, sampleTrack } from './track.js';
import { MATERIALS, assertSimple } from './track-loft.js';

function triGeom(positions, indices, k) {
  const ia = indices[k] * 3;
  const ib = indices[k + 1] * 3;
  const ic = indices[k + 2] * 3;
  const ux = positions[ib] - positions[ia];
  const uy = positions[ib + 1] - positions[ia + 1];
  const uz = positions[ib + 2] - positions[ia + 2];
  const vx = positions[ic] - positions[ia];
  const vy = positions[ic + 1] - positions[ia + 1];
  const vz = positions[ic + 2] - positions[ia + 2];
  const nx = uy * vz - uz * vy;
  const ny = uz * vx - ux * vz;
  const nz = ux * vy - uy * vx;
  const len = Math.hypot(nx, ny, nz) || 1;
  return { nx: nx / len, ny: ny / len, nz: nz / len, area: len / 2 };
}

test('lofted outline rings are simple polygons', () => {
  const vis = luigiCircuit.trackVisuals();
  assertSimple(vis.outline.inner, 'inner');
  assertSimple(vis.outline.outer, 'outer');
  for (const poly of vis.outline.sand) assertSimple(poly, 'sand');
});

test('the U-turn asphalt banks and sand stays off the finish line', () => {
  const mesh = luigiCircuit.trackVisuals().mesh;
  const asphalt = mesh.groups.find((group) => group.material === 'asphalt');
  let maxY = 0;
  let minY = Infinity;
  const seen = new Set();
  for (let k = asphalt.start; k < asphalt.start + asphalt.count; k++) {
    const vi = mesh.indices[k];
    if (seen.has(vi)) continue;
    seen.add(vi);
    const y = mesh.positions[vi * 3 + 1];
    if (y > maxY) maxY = y;
    if (y < minY) minY = y;
  }
  assert.ok(maxY > 0.899, `outer bank ${maxY}`);
  assert.ok(minY < 0.05, `inner lip ${minY}`);
  const start = luigiCircuit.poseAt(0);
  for (const poly of luigiCircuit.trackVisuals().outline.sand) {
    for (const p of poly) {
      assert.ok(Math.hypot(p.x - start.x, p.z - start.z) > 4, `${p.x},${p.z}`);
    }
  }
});

test('up-facing course triangles wind toward +Y and curb walls face their stored normal', () => {
  const { positions, normals, indices, groups } = luigiCircuit.trackVisuals().mesh;
  const grass = groups.find((g) => g.material === 'grass');
  const asphalt = groups.find((g) => g.material === 'asphalt');
  const grass0 = triGeom(positions, indices, grass.start);
  const asphalt0 = triGeom(positions, indices, asphalt.start);
  assert.ok(grass0.ny > 0, `first grass normal.y ${grass0.ny}`);
  assert.ok(asphalt0.ny > 0, `first asphalt normal.y ${asphalt0.ny}`);

  for (const group of groups) {
    for (let k = group.start; k < group.start + group.count; k += 3) {
      const geom = triGeom(positions, indices, k);
      if (geom.area < 1e-6) continue;
      const s = indices[k] * 3;
      const storedY = normals[s + 1];
      if (storedY > 0.5) {
        if (Math.abs(geom.ny) < 0.2) continue;
        assert.ok(geom.ny > 0.5, `${group.material} tri ${k} normal.y ${geom.ny.toFixed(3)}`);
      } else {
        const dot = geom.nx * normals[s] + geom.ny * storedY + geom.nz * normals[s + 2];
        assert.ok(dot > 0, `${group.material} tri ${k} faces against its stored normal (${dot.toFixed(3)})`);
      }
    }
  }
});

test('boost chevrons sit on dash spans, not the whole outer atlas', () => {
  const atlas = luigiCircuit.trackVisuals().atlas;
  const { width, height, rgba } = atlas;
  const orangeCol = new Uint8Array(width);
  let orange = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const isOrange = rgba[i] > 200 && rgba[i + 1] > 80 && rgba[i + 1] < 190 && rgba[i + 2] < 80;
      if (!isOrange) continue;
      orange += 1;
      if (y > height * 0.5) orangeCol[x] = 1;
      assert.ok(y > height * 0.4, `orange boost pixel in the inner half at ${x},${y}`);
    }
  }
  assert.ok(orange > 0, 'expected boost paint on the dash');
  let gap = 0;
  let maxGap = 0;
  let run = 0;
  for (let x = 0; x < width * 2; x++) {
    if (orangeCol[x % width]) {
      if (run > maxGap) maxGap = run;
      run = 0;
      gap += 1;
    } else {
      run += 1;
    }
  }
  assert.ok(maxGap > width / 3, `longest outer band without boost paint is ${maxGap}px of ${width}`);
});

test('lofted visuals expose mesh groups for every material id used', () => {
  const vis = luigiCircuit.trackVisuals();
  assert.ok(vis.mesh.positions.length > 0);
  assert.ok(vis.mesh.indices.length > 0);
  assert.ok(vis.atlas.width >= 64);
  const names = new Set(vis.mesh.groups.map((g) => g.material));
  for (const name of ['grass', 'asphalt', 'sand', 'curbInner', 'curbOuter']) {
    assert.ok(names.has(name), `missing group ${name}`);
  }
  for (const g of vis.mesh.groups) {
    assert.ok(MATERIALS.includes(g.material));
  }
});

test('baked mesh matches sampled contact within a centimeter', () => {
  const mesh = luigiCircuit.trackVisuals().mesh;
  const apex = widestPose();
  const nx = Math.cos(apex.pose.heading);
  const nz = -Math.sin(apex.pose.heading);
  const outerTarget = {
    x: apex.pose.x + nx * apex.pose.halfWidth,
    z: apex.pose.z + nz * apex.pose.halfWidth,
  };
  const asphalt = nearestIn(mesh, 'asphalt', outerTarget.x, outerTarget.z);
  const asphaltSample = sampleTrack(asphalt.x, asphalt.z, apex.t);
  assert.ok(Math.abs(asphalt.y - asphaltSample.y) < 0.01, `asphalt ${asphalt.y} vs ${asphaltSample.y}`);
  assert.ok(Math.abs(asphalt.nx) + Math.abs(asphalt.nz) > 1e-3, 'banked asphalt is not flat-shaded');

  const shelfTarget = {
    x: apex.pose.x - nx * (apex.pose.halfWidth + 12),
    z: apex.pose.z - nz * (apex.pose.halfWidth + 12),
  };
  const sand = nearestIn(mesh, 'sand', shelfTarget.x, shelfTarget.z);
  const sandSample = sampleTrack(sand.x, sand.z, apex.t);
  assert.ok(Math.abs(sand.y - sandSample.y) < 0.01, `sand ${sand.y} vs ${sandSample.y}`);

  const footTarget = {
    x: apex.pose.x + nx * (apex.pose.halfWidth + 8),
    z: apex.pose.z + nz * (apex.pose.halfWidth + 8),
  };
  const grass = nearestIn(mesh, 'grass', footTarget.x, footTarget.z);
  const grassSample = sampleTrack(grass.x, grass.z, apex.t);
  assert.ok(Math.abs(grass.y - grassSample.y) < 0.01, `berm ${grass.y} vs ${grassSample.y}`);
  assert.ok(asphalt.y > grass.y + 0.4, 'the berm closes up to the outer lip');
});

function widestPose() {
  let best = null;
  for (let i = 0; i < 360; i++) {
    const t = i / 360;
    const pose = poseAt(t);
    if (!best || pose.halfWidth > best.pose.halfWidth) best = { t, pose };
  }
  return best;
}

function nearestIn(mesh, material, x, z) {
  const group = mesh.groups.find((entry) => entry.material === material);
  let best = null;
  const seen = new Set();
  for (let k = group.start; k < group.start + group.count; k++) {
    const vi = mesh.indices[k];
    if (seen.has(vi)) continue;
    seen.add(vi);
    const px = mesh.positions[vi * 3];
    const py = mesh.positions[vi * 3 + 1];
    const pz = mesh.positions[vi * 3 + 2];
    const dist = (px - x) ** 2 + (pz - z) ** 2;
    if (!best || dist < best.dist) {
      best = {
        dist,
        x: px,
        y: py,
        z: pz,
        nx: mesh.normals[vi * 3],
        ny: mesh.normals[vi * 3 + 1],
        nz: mesh.normals[vi * 3 + 2],
      };
    }
  }
  assert.ok(best, material);
  return best;
}

test('visual dash outline is frozen and cloned from colliders', () => {
  const vis = luigiCircuit.trackVisuals();
  assert.ok(vis.outline.dashes.length > 0);
  assert.ok(Object.isFrozen(vis.outline.dashes[0][0]));
  assert.throws(() => {
    vis.outline.dashes[0][0].x = 9999;
  });
});
