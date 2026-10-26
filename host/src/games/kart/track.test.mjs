import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIM, PROGRESS_CONTINUITY, followTrack, poseAt, sampleTrack } from './track.js';

test('progress budget is one tenth of a lap', () => {
  assert.equal(PROGRESS_CONTINUITY, 0.10);
});

test('perimeter stays a short arcade lap', () => {
  assert.ok(PERIM > 190 && PERIM < 245, `PERIM ${PERIM}`);
});

test('poseAt and sampleTrack agree on the racing line', () => {
  for (let i = 0; i < 80; i++) {
    const t = i / 80;
    const pose = poseAt(t);
    const sample = sampleTrack(pose.x, pose.z);
    assert.ok(pose.halfWidth > 0, `width at ${t}`);
    assert.ok(Math.abs(sample.lateral) < 0.05, `lateral ${sample.lateral} at ${t}`);
    const dp = Math.abs(sample.progress - t);
    const wrapped = Math.min(dp, 1 - dp);
    assert.ok(wrapped < 0.02, `progress ${sample.progress} vs ${t}`);
  }
});

test('a seeded cut across the wide turn keeps progress monotonic', () => {
  const apex = widest();
  assert.ok(apex.pose.halfWidth > poseAt(0).halfWidth + 1, 'final turn is the wide one');
  let enter = apex.t;
  let exit = apex.t;
  for (let i = 1; i < 160; i++) {
    const t = (apex.t - i / 360 + 1) % 1;
    if (poseAt(t).halfWidth < apex.pose.halfWidth * 0.84) break;
    enter = t;
  }
  for (let i = 1; i < 160; i++) {
    const t = (apex.t + i / 360) % 1;
    if (poseAt(t).halfWidth < apex.pose.halfWidth * 0.84) break;
    exit = t;
  }
  const path = bend(
    inward(poseAt(enter), poseAt(enter).halfWidth + 5),
    inward(apex.pose, apex.pose.halfWidth + 7),
    inward(poseAt(exit), poseAt(exit).halfWidth + 5),
    28,
  );
  let seed = enter;
  let prev = null;
  for (let i = 1; i < path.length; i++) {
    const hit = followTrack({
      x0: path[i - 1].x,
      z0: path[i - 1].z,
      x1: path[i].x,
      z1: path[i].z,
      seedProgress: seed,
    });
    assert.equal(hit.surface, 'sand');
    if (prev != null) {
      let dp = hit.progress - prev;
      if (dp < -0.5) dp += 1;
      if (dp > 0.5) dp -= 1;
      assert.ok(dp >= -0.002, `progress went backwards ${dp}`);
      assert.ok(dp < 0.15, `progress jump ${dp}`);
    }
    prev = hit.progress;
    seed = hit.progress;
  }
  let gained = seed - enter;
  if (gained < -0.5) gained += 1;
  if (gained < 0) gained += 1;
  assert.ok(gained > 0.04, `gained ${gained}`);
});

test('dash contact is a single rising edge', () => {
  const apex = widest();
  let found = null;
  for (let i = -60; i <= 60 && !found; i++) {
    const t = (apex.t + i / 200 + 1) % 1;
    const pose = poseAt(t);
    const tx = Math.sin(pose.heading);
    const tz = Math.cos(pose.heading);
    for (const frac of [0.35, 0.55, 0.75]) {
      const at = inward(pose, -pose.halfWidth * frac);
      const before = { x: at.x - tx * 3, z: at.z - tz * 3 };
      const hit = followTrack({
        x0: before.x,
        z0: before.z,
        x1: at.x,
        z1: at.z,
        seedProgress: t,
      });
      if (hit.dashEntered) {
        found = { before, at, t, heading: pose.heading };
        break;
      }
    }
  }
  assert.ok(found, 'outer final turn has a dash pad');
  const stay = followTrack({
    x0: found.at.x,
    z0: found.at.z,
    x1: found.at.x + Math.sin(found.heading) * 0.4,
    z1: found.at.z + Math.cos(found.heading) * 0.4,
    seedProgress: found.t,
  });
  assert.equal(stay.dashEntered, false);
});

function widest() {
  let best = null;
  for (let i = 0; i < 360; i++) {
    const t = i / 360;
    const pose = poseAt(t);
    if (!best || pose.halfWidth > best.pose.halfWidth) best = { t, pose };
  }
  assert.equal(typeof best.pose.halfWidth, 'number');
  return best;
}

function inward(pose, meters) {
  const nx = Math.cos(pose.heading);
  const nz = -Math.sin(pose.heading);
  return { x: pose.x - nx * meters, z: pose.z - nz * meters };
}

function bend(a, m, b, steps) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const u = i / steps;
    const p0 = lerp(a, m, u);
    const p1 = lerp(m, b, u);
    pts.push(lerp(p0, p1, u));
  }
  return pts;
}

function lerp(a, b, u) {
  return { x: a.x + (b.x - a.x) * u, z: a.z + (b.z - a.z) * u };
}
