import test from 'node:test';
import assert from 'node:assert/strict';
import { EDGE, GRASS_OUT, GROUND, HALF, PERIM, poseAt, sampleTrack, surfaceY } from './track.js';

const SAMPLES = 2000;

function normalAt(pose) {
  return [Math.cos(pose.heading), -Math.sin(pose.heading)];
}

test('the lap closes on its start point', () => {
  const start = poseAt(0);
  const end = poseAt(0.9999999);
  assert.ok(Math.hypot(end.x - start.x, end.z - start.z) < 0.05);
});

test('the lap is about twice the old oval in length', () => {
  assert.ok(PERIM > 380 && PERIM < 460, `perimeter ${PERIM}`);
});

test('no two parts of the lap are close enough for their grass strips to overlap', () => {
  const step = 4;
  for (let i = 0; i < SAMPLES; i += step) {
    const a = poseAt(i / SAMPLES);
    for (let j = i + step; j < SAMPLES; j += step) {
      const b = poseAt(j / SAMPLES);
      let along = Math.abs(i - j) / SAMPLES * PERIM;
      along = Math.min(along, PERIM - along);
      if (along < 60) continue;
      const dist = Math.hypot(a.x - b.x, a.z - b.z);
      assert.ok(dist > 2 * GRASS_OUT, `parts ${i} and ${j} are ${dist} apart`);
    }
  }
});

test('grades stay subtle, under 8 percent', () => {
  let worst = 0;
  for (let i = 0; i < SAMPLES; i++) {
    const pose = poseAt(i / SAMPLES);
    worst = Math.max(worst, Math.abs(sampleTrack(pose.x, pose.z).grade));
  }
  assert.ok(worst < 0.08, `grade ${worst}`);
  assert.ok(worst > 0.02, `track is flat, grade ${worst}`);
});

test('the big turn is banked with its outside edge higher than the inside', () => {
  let bankiest = poseAt(0);
  for (let i = 0; i < SAMPLES; i++) {
    const pose = poseAt(i / SAMPLES);
    if (Math.abs(pose.bank) > Math.abs(bankiest.bank)) bankiest = pose;
  }
  assert.ok(Math.abs(bankiest.bank) > 0.2, `bank ${bankiest.bank}`);
  const [nx, nz] = normalAt(bankiest);
  const outside = surfaceY(bankiest.y, bankiest.bank, HALF);
  const inside = surfaceY(bankiest.y, bankiest.bank, -HALF);
  const sign = Math.sign(bankiest.bank);
  assert.ok(sign * (outside - inside) > 0, `outside ${outside} inside ${inside}`);
  const sample = sampleTrack(bankiest.x + nx * HALF, bankiest.z + nz * HALF);
  assert.ok(Math.abs(sample.lateral - HALF) < 0.05);
});

test('the road follows the banked surface across its width', () => {
  for (let i = 0; i < SAMPLES; i += 20) {
    const pose = poseAt(i / SAMPLES);
    const [nx, nz] = normalAt(pose);
    for (const offset of [-HALF, -HALF / 2, 0, HALF / 2, HALF]) {
      const x = pose.x + nx * offset;
      const z = pose.z + nz * offset;
      const sample = sampleTrack(x, z);
      assert.ok(Math.abs(sample.y - surfaceY(pose.y, pose.bank, offset)) < 0.05, `height at ${i} offset ${offset}`);
    }
  }
});

test('the grass shoulder falls to the flat ground past the curb', () => {
  const pose = poseAt(0);
  assert.equal(surfaceY(pose.y, pose.bank, EDGE + 2 * (GRASS_OUT - EDGE)), GROUND);
});

test('the road never sinks below the flat ground', () => {
  for (let i = 0; i < SAMPLES; i++) {
    const pose = poseAt(i / SAMPLES);
    assert.ok(surfaceY(pose.y, pose.bank, HALF) > GROUND);
    assert.ok(surfaceY(pose.y, pose.bank, -HALF) > GROUND);
  }
});
