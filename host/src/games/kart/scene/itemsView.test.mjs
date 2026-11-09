import test from 'node:test';
import assert from 'node:assert/strict';
import { easeOutBack, easeOutCubic, squashScale, shardSpawn } from './itemsView.js';

test('easeOutBack lands on 1 with about 12% overshoot', () => {
  assert.equal(easeOutBack(0), 0);
  assert.ok(Math.abs(easeOutBack(1) - 1) < 1e-9);
  let peak = 0;
  for (let t = 0; t <= 1; t += 0.01) peak = Math.max(peak, easeOutBack(t));
  assert.ok(peak > 1.1 && peak < 1.14, `peak ${peak}`);
});

test('easeOutCubic clamps and is monotonic', () => {
  assert.equal(easeOutCubic(-1), 0);
  assert.equal(easeOutCubic(2), 1);
  assert.ok(easeOutCubic(0.3) < easeOutCubic(0.6));
});

test('squash goes 0.6 -> 1 over 0.2 s', () => {
  assert.ok(Math.abs(squashScale(0).y - 0.6) < 1e-9);
  assert.equal(squashScale(0.2).y, 1);
  assert.equal(squashScale(5).y, 1);
  assert.ok(squashScale(0).xz > 1);
});

test('shards fly up and out, inheriting 30% of kart velocity', () => {
  for (let i = 0; i < 10; i++) {
    const a = shardSpawn(i, 10, 0, 0);
    const b = shardSpawn(i, 10, 20, -10);
    assert.ok(a.vy > 3);
    assert.ok(Math.hypot(a.vx, a.vz) >= 3);
    assert.ok(Math.abs(b.vx - a.vx - 6) < 1e-9);
    assert.ok(Math.abs(b.vz - a.vz + 3) < 1e-9);
  }
});

test('hitPose: spin ends at 2 turns, tumble at 1.5 turns and 1 m up at peak, both settle at p=1', async () => {
  const { hitPose } = await import('./kartMesh.js');
  const peak = (kind) => Math.max(...Array.from({ length: 101 }, (_, i) => hitPose(kind, i / 100).lift));
  assert.ok(Math.abs(hitPose('spin', 1).yaw - Math.PI * 4) < 0.05);
  assert.ok(Math.abs(hitPose('tumble', 1).yaw - Math.PI * 3) < 0.05);
  assert.ok(Math.abs(peak('tumble') - 1) < 0.05, `peak ${peak('tumble')}`);
  assert.ok(Math.abs(hitPose('tumble', 1).lift) < 0.01);
});
