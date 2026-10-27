import test from 'node:test';
import assert from 'node:assert/strict';
import { PERIM, PROGRESS_CONTINUITY, followTrack, poseAt, sampleTrack } from './track.js';
import { LUIGI_PLAN } from './tracks/luigi-circuit-plan.js';

test('progress budget is one tenth of a lap', () => {
  assert.equal(PROGRESS_CONTINUITY, 0.10);
});

test('perimeter stays a short arcade lap', () => {
  const [lo, hi] = LUIGI_PLAN.perimRange;
  assert.ok(PERIM > lo && PERIM < hi, `PERIM ${PERIM}`);
});

test('poseAt and sampleTrack agree on the racing line', () => {
  for (let i = 0; i < 80; i++) {
    const t = i / 80;
    const pose = poseAt(t);
    const sample = sampleTrack(pose.x, pose.z);
    assert.ok(pose.halfWidth > 0, `width at ${t}`);
    assert.ok(Math.abs(sample.lateral) < 0.05, `lateral ${sample.lateral} at ${t}`);
    assert.ok(Math.abs(sample.y - pose.y) < 1e-3, `y ${sample.y} vs ${pose.y} at ${t}`);
    assert.ok(sample.normal.y > 0, `normal.y at ${t}`);
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
  let belowCenter = 0;
  for (let i = 1; i < path.length; i++) {
    const hit = followTrack({
      x0: path[i - 1].x,
      z0: path[i - 1].z,
      x1: path[i].x,
      z1: path[i].z,
      seedProgress: seed,
    });
    assert.equal(hit.surface, 'sand');
    const lipPose = poseAt(hit.progress);
    const dx = hit.x - hit.cx;
    const dz = hit.z - hit.cz;
    const further = sampleTrack(hit.x + dx * 0.35, hit.z + dz * 0.35, hit.progress);
    assert.ok(Math.abs(further.y - hit.y) < 0.015, `shortcut y ${hit.y} vs deeper ${further.y}`);
    assert.ok(hit.y <= lipPose.y + 1e-4, `shelf ${hit.y} above center ${lipPose.y}`);
    const rx = Math.cos(lipPose.heading);
    const rz = -Math.sin(lipPose.heading);
    const cross = hit.normal.x * rx + hit.normal.z * rz;
    assert.ok(Math.abs(cross) < 1e-4, `shelf cross-slope ${cross}`);
    belowCenter = Math.max(belowCenter, lipPose.y - hit.y);
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
  assert.ok(belowCenter > 0.2, `shelf stayed near the centerline (${belowCenter})`);
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

test('the bank apex lifts the outer lip and leaves the infield on the inner lip', () => {
  const apex = widest();
  const authored = LUIGI_PLAN.waypoints.find((w) => w.id === 'u270');
  const lip = authored.centerY + authored.bankOuterY;
  assert.ok(authored.bankOuterY > 1, `bank ${authored.bankOuterY}`);
  assert.ok(lip > 2.2, `outer lip authored ${lip}`);
  assert.ok(Math.abs(apex.pose.y - authored.centerY) < 0.04, `centerline ${apex.pose.y}`);
  const outer = tallestOuter(apex);
  assert.ok(Math.abs(outer.sample.y - lip) < 0.04, `outer lip ${outer.sample.y}`);
  const rx = Math.cos(outer.pose.heading);
  const rz = -Math.sin(outer.pose.heading);
  const tilt = outer.sample.normal.x * rx + outer.sample.normal.z * rz;
  assert.ok(tilt < -0.01, `normal tilt ${tilt}`);

  const deep = sampleTrack(...offsetBy(apex.pose, -(apex.pose.halfWidth + 12)), apex.t).y;
  const deeper = sampleTrack(...offsetBy(apex.pose, -(apex.pose.halfWidth + 22)), apex.t).y;
  const inner = 2 * apex.pose.y - outer.sample.y;
  assert.ok(Math.abs(deep - inner) < 0.03, `12 m infield ${deep} vs inner lip ${inner}`);
  assert.ok(Math.abs(deeper - deep) < 1e-3, `further infield ${deeper}`);
  assert.ok(outer.sample.y > deep + 0.4, 'infield shelf is not the outer lip');

  const midShoulder = sampleTrack(...offsetBy(apex.pose, apex.pose.halfWidth + 4), apex.t);
  const shoulderFoot = sampleTrack(...offsetBy(apex.pose, apex.pose.halfWidth + 8), apex.t);
  assert.ok(Math.abs(midShoulder.y - apex.pose.y) < 0.05, `mid shoulder ${midShoulder.y}`);
  assert.ok(Math.abs(shoulderFoot.y - deep) < 0.05, `shoulder foot ${shoulderFoot.y}`);
});

test('a seeded point on the asphalt stays on the asphalt', () => {
  let ruled = 0;
  for (let i = 0; i < 120; i++) {
    const t = i / 120;
    const pose = poseAt(t);
    const left = sampleTrack(...offsetBy(pose, pose.halfWidth * -0.8), t);
    const right = sampleTrack(...offsetBy(pose, pose.halfWidth * 0.8), t);
    assert.equal(left.surface, 'asphalt', `left shoulder at ${t}`);
    assert.equal(right.surface, 'asphalt', `right shoulder at ${t}`);
    for (const frac of [-0.92, -0.4, 0, 0.4, 0.92]) {
      const [x, z] = offsetBy(pose, pose.halfWidth * frac);
      const hit = sampleTrack(x, z, t);
      if (Math.abs(hit.lateral) > hit.halfWidth + 1e-3) continue;
      assert.equal(hit.surface, 'asphalt', `t ${t} frac ${frac} lateral ${hit.lateral}`);
      // A point exactly at the lip can land on the next chord. The ruled check
      // stays on samples that share this edge.
      if (!sameProgress(left.progress, hit.progress) || !sameProgress(right.progress, hit.progress)) {
        continue;
      }
      const span = right.lateral - left.lateral;
      const expected = left.y + (right.y - left.y) * ((hit.lateral - left.lateral) / span);
      assert.ok(Math.abs(hit.y - expected) < 1e-4, `y ${hit.y} vs ruled ${expected} at ${t}`);
      ruled += 1;
    }
  }
  assert.ok(ruled > 400, `ruled samples ${ruled}`);
});

test('the west kink crests, and the centerline grade stays a ramp', () => {
  let crest = 0;
  for (let i = 0; i < 360; i++) {
    const pose = poseAt(i / 360);
    if (pose.halfWidth < poseAt(0).halfWidth + 0.5 && pose.y > crest) crest = pose.y;
  }
  assert.ok(crest > 0.5, `crest ${crest}`);
  let worst = 0;
  const steps = 240;
  for (let i = 0; i < steps; i++) {
    const a = poseAt(i / steps);
    const b = poseAt((i + 1) / steps);
    const ds = Math.hypot(b.x - a.x, b.z - a.z);
    worst = Math.max(worst, Math.abs(b.y - a.y) / ds);
  }
  assert.ok(worst < 0.06, `grade ${worst}`);
});

test('a flat straight reports y 0 and an upward normal', () => {
  const pose = poseAt(0);
  const sample = sampleTrack(pose.x, pose.z, 0);
  assert.equal(sample.y, 0);
  assert.ok(isUp(sample.normal));
  const moved = followTrack({
    x0: pose.x,
    z0: pose.z,
    x1: pose.x + 0.2,
    z1: pose.z,
    seedProgress: 0,
  });
  assert.equal(moved.y, 0);
  assert.ok(isUp(moved.normal));
});

function isUp(normal) {
  return normal.y === 1 && normal.x === 0 && normal.z === 0;
}

function tallestOuter(apex) {
  let best = null;
  for (let i = -8; i <= 8; i++) {
    const t = (apex.t + i / 400 + 1) % 1;
    const pose = poseAt(t);
    const [x, z] = offsetBy(pose, pose.halfWidth);
    const sample = sampleTrack(x, z, t);
    if (!best || sample.y > best.sample.y) best = { pose, sample, t };
  }
  return best;
}

function sameProgress(a, b) {
  const dp = Math.abs(a - b);
  return Math.min(dp, 1 - dp) < 0.0005;
}

function offsetBy(pose, lateral) {
  const nx = Math.cos(pose.heading);
  const nz = -Math.sin(pose.heading);
  return [pose.x + nx * lateral, pose.z + nz * lateral];
}

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
