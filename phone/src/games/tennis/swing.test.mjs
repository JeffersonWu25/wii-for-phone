import test from 'node:test';
import assert from 'node:assert/strict';
import { readMotion } from './swing.js';

function sample(t, fields = {}) {
  return {
    t,
    ax: fields.ax ?? 0,
    ay: fields.ay ?? 9.81,
    az: fields.az ?? 0,
    alpha: fields.alpha ?? 0,
    beta: fields.beta ?? 0,
    gamma: fields.gamma ?? 0,
  };
}

test('a forehand flat is a positive gamma burst with power from its peak rate', () => {
  const shot = readMotion([
    sample(0, { gamma: 400 }),
    sample(16, { gamma: 720 }),
    sample(32, { gamma: 400 }),
  ], { expect: 'swing' });
  assert.deepEqual(shot, { hand: 'forehand', shape: 'flat', power: 720 / 1600 });
  assert.ok(Math.abs(shot.power - 0.45) < 1e-9);
});

test('a backhand is a negative gamma burst', () => {
  assert.deepEqual(readMotion([
    sample(0, { gamma: -400 }),
    sample(16, { gamma: -720 }),
    sample(32, { gamma: -400 }),
  ], { expect: 'swing' }), { hand: 'backhand', shape: 'flat', power: 720 / 1600 });
});

test('mean beta above 80 is a lob and 80 itself stays flat', () => {
  const lob = readMotion([
    sample(0, { gamma: 400, beta: 0 }),
    sample(16, { gamma: 720, beta: 243 }),
    sample(32, { gamma: 400, beta: 0 }),
  ], { expect: 'swing' });
  assert.equal(lob.hand, 'forehand');
  assert.equal(lob.shape, 'lob');
  assert.equal(lob.power, Math.hypot(720, 243) / 1600);

  const flat = readMotion([
    sample(0, { gamma: 400, beta: 0 }),
    sample(16, { gamma: 720, beta: 240 }),
    sample(32, { gamma: 400, beta: 0 }),
  ], { expect: 'swing' });
  assert.equal(flat.shape, 'flat');
});

test('mean beta below -80 is a slice and -80 itself stays flat', () => {
  const slice = readMotion([
    sample(0, { gamma: 400, beta: 0 }),
    sample(16, { gamma: 720, beta: -243 }),
    sample(32, { gamma: 400, beta: 0 }),
  ], { expect: 'swing' });
  assert.equal(slice.hand, 'forehand');
  assert.equal(slice.shape, 'slice');
  assert.equal(slice.power, Math.hypot(720, 243) / 1600);

  const flat = readMotion([
    sample(0, { gamma: 400, beta: 0 }),
    sample(16, { gamma: 720, beta: -240 }),
    sample(32, { gamma: 400, beta: 0 }),
  ], { expect: 'swing' });
  assert.equal(flat.shape, 'flat');
});

test('a moderate rally swing is near 0.45 and a hard swing is near 0.9', () => {
  const moderate = readMotion([
    sample(0, { gamma: 400 }),
    sample(16, { gamma: 720 }),
    sample(32, { gamma: 400 }),
  ], { expect: 'swing' });
  const hard = readMotion([
    sample(0, { gamma: 400 }),
    sample(16, { gamma: 1440 }),
    sample(32, { gamma: 400 }),
  ], { expect: 'swing' });
  const full = readMotion([
    sample(0, { gamma: 400 }),
    sample(16, { gamma: 1600 }),
    sample(32, { gamma: 400 }),
  ], { expect: 'swing' });
  const over = readMotion([
    sample(0, { gamma: 400 }),
    sample(16, { gamma: 2400 }),
    sample(32, { gamma: 400 }),
  ], { expect: 'swing' });
  const withYaw = readMotion([
    sample(0, { gamma: 400 }),
    sample(16, { gamma: 720, alpha: 720 }),
    sample(32, { gamma: 400 }),
  ], { expect: 'swing' });

  assert.equal(moderate.power, 720 / 1600);
  assert.ok(Math.abs(moderate.power - 0.45) < 1e-9);
  assert.equal(hard.power, 1440 / 1600);
  assert.ok(Math.abs(hard.power - 0.9) < 1e-9);
  assert.ok(hard.power > moderate.power);
  assert.equal(full.power, 1);
  assert.equal(over.power, 1);
  assert.equal(withYaw.power, Math.hypot(720, 720) / 1600);
  assert.ok(withYaw.power > moderate.power);
});

test('a quiet buffer and a walking arm swing are not swings or tosses', () => {
  const quiet = [
    sample(0, { gamma: 30, beta: 20, ay: 9.7 }),
    sample(16, { gamma: -40, beta: -15, ay: 10.2 }),
    sample(32, { gamma: 25, beta: 10, ay: 9.5 }),
    sample(48, { gamma: 15, beta: 5, ay: 9.9 }),
  ];
  const walking = [
    sample(0, { gamma: 180, beta: 40 }),
    sample(80, { gamma: 250, beta: 70 }),
    sample(160, { gamma: 220, beta: 50 }),
    sample(240, { gamma: 190, beta: 30 }),
  ];
  for (const samples of [quiet, walking, [], null]) {
    assert.equal(readMotion(samples, { expect: 'swing' }), null);
    assert.equal(readMotion(samples, { expect: 'toss' }), null);
  }
});

test('the gamma run must peak at 320 deg/s and contain three samples at or above 160', () => {
  const atPeak = [
    sample(0, { gamma: 160 }),
    sample(16, { gamma: 320 }),
    sample(32, { gamma: 160 }),
  ];
  const underPeak = [
    sample(0, { gamma: 160 }),
    sample(16, { gamma: 319 }),
    sample(32, { gamma: 160 }),
  ];
  const underFloor = [
    sample(0, { gamma: 159 }),
    sample(16, { gamma: 320 }),
    sample(32, { gamma: 159 }),
  ];
  const twoSamples = [
    sample(0, { gamma: 900 }),
    sample(16, { gamma: 900 }),
  ];
  assert.equal(readMotion(atPeak, { expect: 'swing' }).hand, 'forehand');
  assert.equal(readMotion(atPeak, { expect: 'swing' }).power, 320 / 1600);
  assert.equal(readMotion(underPeak, { expect: 'swing' }), null);
  assert.equal(readMotion(underFloor, { expect: 'swing' }), null);
  assert.equal(readMotion(twoSamples, { expect: 'swing' }), null);
  assert.equal(readMotion(twoSamples, { expect: 'toss' }), null);
});

test('a gamma run longer than 500 ms is not a short swing or a toss', () => {
  const long = Array.from({ length: 20 }, (_, i) => sample(i * 40, {
    gamma: 400,
    ay: i === 0 ? 5 : 16,
  }));
  assert.equal(readMotion(long, { expect: 'swing' }), null);
  assert.equal(readMotion(long, { expect: 'toss' }), null);

  const stillShort = [
    sample(0, { gamma: 400 }),
    sample(250, { gamma: 400 }),
    sample(500, { gamma: 400 }),
  ];
  assert.equal(readMotion(stillShort, { expect: 'swing' }).hand, 'forehand');
});

test('a positive beta flick is a toss and is not a swing', () => {
  const toss = [
    sample(0, { beta: 60, gamma: 40 }),
    sample(16, { beta: 150, gamma: 40 }),
    sample(32, { beta: 60, gamma: 40 }),
  ];
  assert.deepEqual(readMotion(toss, { expect: 'toss' }), { kind: 'toss' });
  assert.equal(readMotion(toss, { expect: 'swing' }), null);

  const shortPeak = [
    sample(0, { beta: 60 }),
    sample(16, { beta: 149 }),
    sample(32, { beta: 60 }),
  ];
  const thinShoulders = [
    sample(0, { beta: 59 }),
    sample(16, { beta: 150 }),
    sample(32, { beta: 59 }),
  ];
  assert.equal(readMotion(shortPeak, { expect: 'toss' }), null);
  assert.equal(readMotion(thinShoulders, { expect: 'toss' }), null);
});

test('an upward acceleration change is a toss and a downward flick is not', () => {
  const up = [
    sample(0, { ay: 0 }),
    sample(16, { ay: 3 }),
    sample(32, { ay: 7 }),
  ];
  const shy = [
    sample(0, { ay: 0 }),
    sample(16, { ay: 3 }),
    sample(32, { ay: 6 }),
  ];
  const spike = [
    sample(0, { ay: 0 }),
    sample(16, { ay: 12 }),
  ];
  const slow = [
    sample(0, { ay: 0 }),
    sample(250, { ay: 3 }),
    sample(501, { ay: 7 }),
  ];
  const downBeta = [
    sample(0, { beta: -60 }),
    sample(16, { beta: -220 }),
    sample(32, { beta: -60 }),
  ];
  const downAccel = [
    sample(0, { ay: 20 }),
    sample(16, { ay: 12 }),
    sample(32, { ay: 8 }),
  ];
  assert.deepEqual(readMotion(up, { expect: 'toss' }), { kind: 'toss' });
  assert.equal(readMotion(up, { expect: 'swing' }), null);
  assert.equal(readMotion(shy, { expect: 'toss' }), null);
  assert.equal(readMotion(spike, { expect: 'toss' }), null);
  assert.equal(readMotion(slow, { expect: 'toss' }), null);
  assert.equal(readMotion(downBeta, { expect: 'toss' }), null);
  assert.equal(readMotion(downAccel, { expect: 'toss' }), null);
});

test('a lateral swing does not count as a toss', () => {
  const lob = [
    sample(0, { gamma: 400, beta: 60 }),
    sample(16, { gamma: 720, beta: 200 }),
    sample(32, { gamma: 400, beta: 60 }),
  ];
  const shot = readMotion(lob, { expect: 'swing' });
  assert.equal(shot.hand, 'forehand');
  assert.equal(shot.shape, 'lob');
  assert.equal(readMotion(lob, { expect: 'toss' }), null);
});
