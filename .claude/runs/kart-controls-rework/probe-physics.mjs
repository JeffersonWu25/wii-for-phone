// Shared physics probe for the P2 competing runs. Runs fixed drift / boost / reverse
// scenarios on an endless flat road and prints the measured numbers as JSON.
//   node .claude/runs/kart-controls-rework/probe-physics.mjs <path/to/host/src/games/kart/physics.js>
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const target = path.resolve(process.argv[2] || 'host/src/games/kart/physics.js');
const P = await import(pathToFileURL(target).href);
const { createKart, stepKart } = P;
const DT = 1 / 60;

// Endless flat road along +x; right (+steer) is +z.
const flat = {
  length: 1e9,
  boostPads: [],
  project: (x, z) => ({ s: x, lateral: z }),
  frameAt: (s) => ({ s, x: s, z: 0, y: 0, h: 0, fx: 1, fz: 0, rx: 0, rz: 1 }),
  surfaceAt: () => ({ kind: 'road', limitR: 1e6, limitL: 1e6, y: 0, nx: 0, ny: 1, nz: 0 }),
  heightAt: () => 0,
  gridSlots: (n) => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, h: 0, s: 0, lateral: 0 })),
};

function kartAt(speed) {
  const k = createKart({ id: 'probe', slot: { x: 0, y: 0, z: 0, h: 0, s: 0, lateral: 0 } });
  Object.assign(k, { speed, vx: speed, vz: 0 });
  return k;
}
const run = (k, input, secs, each) => {
  for (let t = 0; t < secs; t += DT) {
    stepKart(k, input, DT, flat);
    each?.(k);
  }
};
const slipDeg = (k) => {
  const v = Math.hypot(k.vx, k.vz);
  if (v < 1) return 0;
  const vh = Math.atan2(k.vz, k.vx);
  let d = vh - k.h;
  d -= Math.PI * 2 * Math.round(d / (Math.PI * 2));
  return Math.abs((d * 180) / Math.PI);
};
const r2 = (v) => Math.round(v * 100) / 100;
const out = {};

// 1. State fields.
{
  const k = createKart({ id: 'x' });
  out.fields = { drift: k.drift ?? null, boostLevel: k.boostLevel ?? null };
}

// 2-3. No slide without steer, or at low speed.
{
  const a = kartAt(18);
  run(a, { steer: 0, brake: 0, drift: true }, 1);
  const b = kartAt(4);
  run(b, { steer: 1, brake: 0, drift: true, throttle: 0 }, 0.3);
  out.noSlideWithoutSteer = !!a.drift?.sliding;
  out.noSlideAtLowSpeed = !!b.drift?.sliding;
}

// 4. Held drift vs plain steering, 2 s at entry 20 m/s.
{
  const d = kartAt(20);
  let maxSlip = 0;
  let dist = 0;
  run(d, { steer: 1, brake: 0, drift: true }, 2, (k) => {
    maxSlip = Math.max(maxSlip, slipDeg(k));
    dist += Math.hypot(k.vx, k.vz) * DT;
  });
  const plain = kartAt(20);
  let pDist = 0;
  run(plain, { steer: 1, brake: 0, drift: false }, 2, (k) => { pDist += Math.hypot(k.vx, k.vz) * DT; });
  out.drift2s = {
    sliding: !!d.drift?.sliding,
    level: d.drift?.level,
    maxSlipDeg: r2(maxSlip),
    headingChangeDeg: r2((d.h * 180) / Math.PI),
    pathRadius: r2(dist / Math.abs(d.h || 1e-9)),
    speedRatio: r2(Math.hypot(d.vx, d.vz) / 20),
  };
  out.plain2s = {
    headingChangeDeg: r2((plain.h * 180) / Math.PI),
    pathRadius: r2(pDist / Math.abs(plain.h || 1e-9)),
    speedRatio: r2(Math.hypot(plain.vx, plain.vz) / 20),
  };
}

// 5. Charge levels and boost per level.
out.release = [0.5, 1.2, 2.2, 3.2].map((secs) => {
  const k = kartAt(20);
  run(k, { steer: 1, brake: 0, drift: true }, secs);
  const levelHeld = k.drift?.level;
  stepKart(k, { steer: 0, brake: 0, drift: false }, DT, flat);
  const boostAfter = k.boost;
  const boostLevel = k.boostLevel;
  let boostTime = 0;
  let peak = 0;
  for (let t = 0; t < 6 && k.boost > 0; t += DT) {
    stepKart(k, { steer: 0, brake: 0, drift: false }, DT, flat);
    boostTime += DT;
    peak = Math.max(peak, k.speed);
  }
  return { heldSecs: secs, levelHeld, boostAfter: r2(boostAfter), boostLevel, boostTime: r2(boostTime), peakSpeed: r2(peak), boostLevelAfterEnd: k.boostLevel };
});

// 6. Brake cancels with no boost.
{
  const k = kartAt(20);
  run(k, { steer: 1, brake: 0, drift: true }, 1.5);
  const before = k.drift?.level;
  stepKart(k, { steer: 1, brake: 1, drift: true }, DT, flat);
  out.brakeCancel = { levelBefore: before, slidingAfter: !!k.drift?.sliding, boostAfter: r2(k.boost), boostLevel: k.boostLevel };
}

// 7. Direction locks.
{
  const k = kartAt(20);
  run(k, { steer: 1, brake: 0, drift: true }, 0.3);
  run(k, { steer: -1, brake: 0, drift: true }, 0.5);
  out.dirLock = { sliding: !!k.drift?.sliding, dir: k.drift?.dir };
}

// 8. Reverse, then resume.
{
  const k = kartAt(10);
  let min = Infinity;
  run(k, { steer: 0, brake: 1, drift: false }, 4, (kk) => { min = Math.min(min, kk.speed); });
  const reversed = k.speed;
  run(k, { steer: 0, brake: 0, drift: false }, 2);
  out.reverse = { minSpeed: r2(min), speedAfterBrake: r2(reversed), speedAfterRelease: r2(k.speed), REVERSE_TOP: P.REVERSE_TOP };
}

// 9. Throttle 0 coasts; default throttle drives.
{
  const c = kartAt(15);
  run(c, { steer: 0, brake: 0, drift: false, throttle: 0 }, 2);
  const g = kartAt(0);
  run(g, { steer: 0 }, 2);
  out.throttle = { coastFrom15: r2(c.speed), defaultFrom0: r2(g.speed) };
}

console.log(JSON.stringify(out, null, 2));
