import { throwFromMotion } from '../../phone/src/games/bowling/throw.js';
import { PhysicsWorld } from '../src/games/bowling/physics.js';

const PIN_Z = -14.5;
const LANE_EDGE = 0.52;
const DT = 1 / 60;

function swing({ extraPeak, gammaEnd, frames = 24 }) {
  const samples = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    samples.push({
      ax: 0,
      ay: -9.81,
      az: extraPeak * Math.sin(t * Math.PI),
      alpha: 0,
      beta: 0,
      gamma: gammaEnd * t,
    });
  }
  return samples;
}

const SHOTS = {
  rest: swing({ extraPeak: 0, gammaEnd: 0 }),
  firmStraight: swing({ extraPeak: 25, gammaEnd: 0 }),
  hardStraight: swing({ extraPeak: 40, gammaEnd: 0 }),
  gentleWrist: swing({ extraPeak: 25, gammaEnd: 80 }),
  firmHook: swing({ extraPeak: 25, gammaEnd: 400 }),
  violent: swing({ extraPeak: 50, gammaEnd: 900 }),
};

async function roll(physics, power, spin, aimOffset = 0) {
  physics.resetPins();
  physics.applyThrow(power, 0, spin, aimOffset);
  const release = physics.ballBody.linvel();
  const releaseSpeed = Math.hypot(release.x, release.y, release.z);
  let atPins = null;
  let leftLane = false;
  for (let step = 1; step <= 60 * 12; step++) {
    physics.step(DT);
    const p = physics.ballBody.translation();
    if (!atPins && p.z <= PIN_Z) {
      const v = physics.ballBody.linvel();
      atPins = {
        t: step * DT,
        x: p.x,
        speed: Math.hypot(v.x, v.y, v.z),
      };
    }
    if (p.z > PIN_Z && Math.abs(p.x) > LANE_EDGE) leftLane = true;
    if (physics.settled && step > 30) break;
  }
  return {
    releaseSpeed,
    atPins,
    leftLane,
    knocked: 10 - physics.getStandingPinCount(),
    settled: physics.settled,
  };
}

function check(failures, cond, message) {
  if (!cond) failures.push(message);
}

const physics = new PhysicsWorld();
await physics.init();
console.log(`ballKg ${physics.ballBody.mass().toFixed(2)} pinKg ${physics.pinBodies[0].mass().toFixed(3)}`);

const played = {};
for (const [name, samples] of Object.entries(SHOTS)) {
  const thrown = throwFromMotion(samples);
  const result = await roll(physics, thrown.power, thrown.spin, 0);
  played[name] = { ...thrown, ...result };
  const where = result.atPins
    ? `t=${result.atPins.t.toFixed(2)} x=${result.atPins.x.toFixed(2)} hit=${result.atPins.speed.toFixed(2)}`
    : 'no-pins';
  console.log(
    `${name.padEnd(14)} power=${thrown.power.toFixed(2)} spin=${thrown.spin.toFixed(2)} ` +
    `release=${result.releaseSpeed.toFixed(2)} ${where} knocked=${result.knocked} ` +
    `${result.leftLane ? 'GUTTER' : 'on-lane'} ${result.settled ? 'settled' : 'open'}`,
  );
}

const linedUp = await roll(physics, played.firmHook.power, played.firmHook.spin, -0.55);
console.log(
  `linedUpHook    power=${played.firmHook.power.toFixed(2)} spin=${played.firmHook.spin.toFixed(2)} ` +
  `release=${linedUp.releaseSpeed.toFixed(2)} x=${linedUp.atPins?.x?.toFixed(2) ?? 'none'} ` +
  `${linedUp.leftLane ? 'GUTTER' : 'on-lane'} knocked=${linedUp.knocked}`,
);

const edge = throwFromMotion(SHOTS.violent);
const edgeRoll = await roll(physics, 1, 1, 1);
console.log(
  `edgeHook       power=${edge.power.toFixed(2)} spin=1.00 release=${edgeRoll.releaseSpeed.toFixed(2)} ` +
  `${edgeRoll.leftLane ? 'GUTTER' : 'on-lane'} knocked=${edgeRoll.knocked}`,
);

const failures = [];
const firm = played.firmStraight;
const hard = played.hardStraight;
const hook = played.firmHook;
const gentle = played.gentleWrist;
const wild = played.violent;
const rest = played.rest;

check(failures, rest.power < 0.05, `rest power ${rest.power.toFixed(2)} should be under 0.05`);
check(failures, Math.abs(rest.spin) < 0.01, `rest spin ${rest.spin.toFixed(2)} should be 0`);
check(failures, firm.power > 0.4 && firm.power < 0.7, `firm power ${firm.power.toFixed(2)} should sit near half`);
check(failures, hard.power > firm.power, `hard power ${hard.power.toFixed(2)} should beat firm ${firm.power.toFixed(2)}`);
check(failures, hard.power <= 1, `hard power ${hard.power.toFixed(2)} should cap at 1`);
check(failures, Math.abs(firm.spin) < 0.01, `straight spin ${firm.spin.toFixed(2)} should be 0`);
check(failures, gentle.spin > 0.05 && gentle.spin < 0.25, `gentle spin ${gentle.spin.toFixed(2)} should be a small hook`);
check(failures, hook.spin > gentle.spin && hook.spin < 0.95, `firm hook spin ${hook.spin.toFixed(2)} should beat a gentle wrist and stay under full`);
check(failures, wild.spin > hook.spin && wild.spin <= 1, `violent spin ${wild.spin.toFixed(2)} should be the strongest hook`);

check(failures, firm.releaseSpeed > 6 && firm.releaseSpeed < 8.2, `firm release ${firm.releaseSpeed.toFixed(2)} m/s should be a normal bowling speed`);
check(failures, hard.releaseSpeed > firm.releaseSpeed && hard.releaseSpeed < 9.6, `hard release ${hard.releaseSpeed.toFixed(2)} m/s should be faster than firm and under 21 mph`);
check(failures, rest.releaseSpeed < firm.releaseSpeed, `rest release ${rest.releaseSpeed.toFixed(2)} should be slower than a real swing`);

check(failures, firm.atPins && Math.abs(firm.atPins.x) < 0.08, `straight entry x=${firm.atPins?.x} should stay on the line`);
check(failures, firm.atPins && firm.atPins.t > 2.4 && firm.atPins.t < 3.6, `firm transit ${firm.atPins?.t} s should be a medium shot, not a rocket`);
check(failures, hard.atPins && hard.atPins.t < firm.atPins.t, `hard transit ${hard.atPins?.t} s should be brisker than firm ${firm.atPins?.t}`);
check(failures, !firm.leftLane, 'firm straight should stay on the lane');

check(failures, gentle.atPins && !gentle.leftLane && Math.abs(gentle.atPins.x) > 0.02 && Math.abs(gentle.atPins.x) < 0.14, `gentle hook x=${gentle.atPins?.x} should be a small visible move`);
check(failures, hook.atPins && !hook.leftLane && hook.atPins.x > 0.15 && hook.atPins.x < 0.42, `firm hook x=${hook.atPins?.x} should move toward the pocket and stay on the lane`);
check(failures, wild.atPins && !wild.leftLane && Math.abs(wild.atPins.x) < 0.48, `full hook from the center x=${wild.atPins?.x} should stay on the lane`);
check(failures, edgeRoll.leftLane && edgeRoll.knocked === 0, 'full hook off the edge should be a gutter');

check(failures, hook.knocked < firm.knocked, `center hook knocked ${hook.knocked}, straight knocked ${firm.knocked}; a hook from the middle should miss the pocket`);
check(failures, linedUp.knocked > hook.knocked && !linedUp.leftLane, `lining up the same hook knocked ${linedUp.knocked} from x=${linedUp.atPins?.x}; it should beat the center hook and stay on the lane`);
check(failures, firm.knocked > rest.knocked, `firm shot knocked ${firm.knocked}, rest knocked ${rest.knocked}; a real swing should carry more pins`);
check(failures, firm.knocked >= 4, `firm straight knocked ${firm.knocked}, a centered shot should reach the pins`);
check(failures, firm.settled && hook.settled, 'shots should settle so the pin count is final');

physics.destroy();

if (failures.length) {
  console.log('FAIL');
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}
console.log('PASS');
