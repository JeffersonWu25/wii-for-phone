import test from 'node:test';
import assert from 'node:assert/strict';
import { createRace, stepRace, applyDrive } from './race.js';

/** Minimal second track that only satisfies the race/items/scene contract. */
function ovalTrack() {
  const half = 5;
  const radius = 20;
  return {
    HALF: half,
    itemBoxProgress: Object.freeze([0.25, 0.75]),
    poseAt(t) {
      const a = t * Math.PI * 2;
      return {
        x: Math.sin(a) * radius,
        z: Math.cos(a) * radius,
        heading: a + Math.PI / 2,
        halfWidth: half,
        visualOuterY: 0,
      };
    },
    sampleTrack(x, z) {
      const progress = (Math.atan2(x, z) / (Math.PI * 2) + 1) % 1;
      const r = Math.hypot(x, z);
      return {
        progress,
        lateral: r - radius,
        surface: Math.abs(r - radius) <= half ? 'asphalt' : 'grass',
        dirX: x / (r || 1),
        dirZ: z / (r || 1),
        tx: Math.cos(Math.atan2(x, z)),
        tz: -Math.sin(Math.atan2(x, z)),
        cx: Math.sin(Math.atan2(x, z)) * radius,
        cz: Math.cos(Math.atan2(x, z)) * radius,
        halfWidth: half,
        onDash: false,
      };
    },
    trackVisuals() {
      const road = [];
      for (let i = 0; i < 32; i++) {
        const pose = this.poseAt(i / 32);
        road.push({
          x: pose.x,
          z: pose.z,
          heading: pose.heading,
          halfWidth: half,
          visualOuterY: 0,
        });
      }
      return {
        grassRadius: radius + half + 8,
        road,
        edges: { inner: road.map((p) => ({ x: p.x, z: p.z })), outer: road.map((p) => ({ x: p.x, z: p.z })) },
        sand: [],
        dashes: [],
        startFinish: { x: 0, z: radius, heading: Math.PI / 2, width: half * 2, depth: 1 },
        gridMarks: [],
      };
    },
  };
}

test('createRace accepts a non-Luigi track and steps without throwing', () => {
  const track = ovalTrack();
  const race = createRace(
    [{ playerId: 'a', name: 'Ada', characterId: 'mario' }],
    0,
    track,
  );
  assert.equal(race.track, track);
  assert.equal(race.entities.filter((e) => e.kind === 'box').length, 2);
  race.phase = 'racing';
  race.startedAt = 0;
  applyDrive(race, { playerId: 'a', steer: 0.2, gas: true, drift: false, seq: 1 }, 10);
  for (let i = 0; i < 30; i++) stepRace(race, 0.05, 10 + i * 50);
  assert.ok(Number.isFinite(race.karts[0].x));
  assert.ok(Number.isFinite(race.karts[0].speed));
  assert.equal(typeof track.trackVisuals().grassRadius, 'number');
});
