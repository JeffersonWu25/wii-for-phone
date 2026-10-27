import test from 'node:test';
import assert from 'node:assert/strict';
import { luigiCircuit } from './track.js';
import { MATERIALS } from './track-loft.js';

test('lofted Luigi outline rings have far fewer self-crossings than the old strip', () => {
  const vis = luigiCircuit.trackVisuals();
  function crossings(ring) {
    let n = 0;
    const len = ring.length;
    const side = (p, q, r) => (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
    const cross = (a, b, c, d) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;
    for (let i = 0; i < len; i++) {
      for (let j = i + 1; j < len; j++) {
        if ((j + 1) % len === i || (i + 1) % len === j) continue;
        if (i === 0 && j === len - 1) continue;
        if (cross(ring[i], ring[(i + 1) % len], ring[j], ring[(j + 1) % len])) n += 1;
      }
    }
    return n;
  }
  const inner = crossings(vis.outline.inner);
  const outer = crossings(vis.outline.outer);
  // Chordal joins can leave a few local notches; old strip stacked ~359 m² of cover.
  assert.ok(inner <= 20, `inner crossings ${inner}`);
  assert.ok(outer <= 20, `outer crossings ${outer}`);
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

test('visual dash outline is frozen and cloned from colliders', () => {
  const vis = luigiCircuit.trackVisuals();
  assert.ok(vis.outline.dashes.length > 0);
  assert.ok(Object.isFrozen(vis.outline.dashes[0][0]));
  assert.throws(() => {
    vis.outline.dashes[0][0].x = 9999;
  });
});
