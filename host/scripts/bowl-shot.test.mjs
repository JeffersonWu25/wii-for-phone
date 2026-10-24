import { composeThrow } from '../../phone/src/games/bowling/throw.js';
import { downFromSample, leanFromDegrees, leanFromGravity } from '../../phone/src/games/bowling/tilt.js';
import { launchFromMessage } from '../src/games/bowling/launch.js';
import { PhysicsWorld } from '../src/games/bowling/physics.js';

const PIN_Z = -14.5;
const LANE_EDGE = 0.52;
const DT = 1 / 60;
const STRAIGHT_TUNING = { speed: 1, tilt: 1, curveDeg: 35 };

function swing({ extraPeak, frames = 24 }) {
  const samples = [];
  for (let i = 0; i < frames; i++) {
    const t = i / (frames - 1);
    samples.push({
      ax: 0,
      ay: -9.81,
      az: extraPeak * Math.sin(t * Math.PI),
      alpha: 0,
      beta: 0,
      gamma: 900 * t,
    });
  }
  return samples;
}

function bank(degrees) {
  const rad = degrees * Math.PI / 180;
  return leanFromGravity(downFromSample({ ax: -9.81 * Math.sin(rad), ay: 9.81 * Math.cos(rad), az: 0 }));
}

function shot({ extraPeak, angleDeg = 0, spinDeg = 0, offset = 0, tuning = STRAIGHT_TUNING }) {
  const pressed = bank(angleDeg);
  const released = bank(angleDeg + spinDeg);
  return composeThrow({
    samples: swing({ extraPeak }),
    aim: { offset, angle: 0 },
    tilt: {
      angle: leanFromDegrees(pressed.degrees, 35 / tuning.tilt),
      spin: leanFromDegrees(released.degrees - pressed.degrees, tuning.curveDeg),
    },
    tuning,
  });
}

const SHOTS = {
  rest: shot({ extraPeak: 0 }),
  firmStraight: shot({ extraPeak: 25 }),
  hardStraight: shot({ extraPeak: 40 }),
  gentleBank: shot({ extraPeak: 25, spinDeg: -9 }),
  firmHook: shot({ extraPeak: 25, spinDeg: -23 }),
  fullBank: shot({ extraPeak: 50, spinDeg: -40 }),
  flatCurve: shot({ extraPeak: 25, spinDeg: -4, tuning: { speed: 1, tilt: 1, curveDeg: 35 } }),
  heldLeft: shot({ extraPeak: 25, angleDeg: 23 }),
};

async function roll(physics, msg) {
  physics.resetPins();
  physics.launch(launchFromMessage(msg));
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

function describe(name, msg, result) {
  const where = result.atPins
    ? `t=${result.atPins.t.toFixed(2)} x=${result.atPins.x.toFixed(2)} hit=${result.atPins.speed.toFixed(2)}`
    : 'no-pins';
  console.log(
    `${name.padEnd(14)} power=${msg.power.toFixed(2)} angle=${msg.tilt.angle.toFixed(2)} spin=${msg.tilt.spin.toFixed(2)} ` +
    `release=${result.releaseSpeed.toFixed(2)} ${where} knocked=${result.knocked} ` +
    `${result.leftLane ? 'GUTTER' : 'on-lane'} ${result.settled ? 'settled' : 'open'}`,
  );
}

const physics = new PhysicsWorld();
await physics.init();
console.log(`ballKg ${physics.ballBody.mass().toFixed(2)} pinKg ${physics.pinBodies[0].mass().toFixed(3)}`);

const played = {};
for (const [name, msg] of Object.entries(SHOTS)) {
  const result = await roll(physics, msg);
  played[name] = { ...msg, ...result };
  describe(name, msg, result);
}

const linedUpMsg = { ...SHOTS.firmHook, aim: { offset: -0.55, angle: 0 } };
const linedUp = await roll(physics, linedUpMsg);
describe('linedUpHook', linedUpMsg, linedUp);

const edgeMsg = { ...SHOTS.fullBank, power: 1, aim: { offset: 1, angle: 0 } };
const edgeRoll = await roll(physics, edgeMsg);
describe('edgeHook', edgeMsg, edgeRoll);

const slowHookMsg = { ...SHOTS.firmHook, tuning: { speed: 0.6 } };
const fastHookMsg = { ...SHOTS.firmHook, tuning: { speed: 1.5 } };
const slowHook = await roll(physics, slowHookMsg);
const fastHook = await roll(physics, fastHookMsg);
describe('slowHook', slowHookMsg, slowHook);
describe('fastHook', fastHookMsg, fastHook);

const failures = [];
const firm = played.firmStraight;
const hard = played.hardStraight;
const hook = played.firmHook;
const gentle = played.gentleBank;
const wild = played.fullBank;
const flat = played.flatCurve;
const rest = played.rest;

check(failures, rest.power < 0.05, `rest power ${rest.power.toFixed(2)} should be under 0.05`);
check(failures, firm.power > 0.4 && firm.power < 0.7, `firm power ${firm.power.toFixed(2)} should sit near half`);
check(failures, hard.power > firm.power, `hard power ${hard.power.toFixed(2)} should beat firm ${firm.power.toFixed(2)}`);
check(failures, hard.power <= 1, `hard power ${hard.power.toFixed(2)} should cap at 1`);
check(failures, firm.tilt.spin === 0 && firm.tilt.angle === 0, 'a level phone held level should have no slant and no spin');
check(failures, gentle.tilt.spin > 0.05 && gentle.tilt.spin < 0.25, `gentle twist spin ${gentle.tilt.spin.toFixed(2)} should be a small hook`);
check(failures, hook.tilt.spin > gentle.tilt.spin && hook.tilt.spin < 0.95, `firm twist spin ${hook.tilt.spin.toFixed(2)} should beat a gentle twist and stay under full`);
check(failures, wild.tilt.spin === 1, `full twist spin ${wild.tilt.spin.toFixed(2)} should be 1`);
check(failures, played.heldLeft.tilt.angle < -0.4 && played.heldLeft.tilt.spin === 0, 'holding a left lean should slant without adding spin');

check(failures, firm.releaseSpeed > 6 && firm.releaseSpeed < 8.2, `firm release ${firm.releaseSpeed.toFixed(2)} m/s should be a normal bowling speed`);
check(failures, hard.releaseSpeed > firm.releaseSpeed && hard.releaseSpeed < 9.6, `hard release ${hard.releaseSpeed.toFixed(2)} m/s should be faster than firm and under 21 mph`);
check(failures, rest.releaseSpeed < firm.releaseSpeed, `rest release ${rest.releaseSpeed.toFixed(2)} should be slower than a real swing`);

check(failures, firm.atPins && Math.abs(firm.atPins.x) < 0.08, `straight entry x=${firm.atPins?.x} should stay on the line`);
check(failures, firm.atPins && firm.atPins.t > 2.4 && firm.atPins.t < 3.6, `firm transit ${firm.atPins?.t} s should be a medium shot, not a rocket`);
check(failures, hard.atPins && hard.atPins.t < firm.atPins.t, `hard transit ${hard.atPins?.t} s should be brisker than firm ${firm.atPins?.t}`);
check(failures, !firm.leftLane, 'firm straight should stay on the lane');
check(failures, flat.atPins && Math.abs(flat.atPins.x) < 0.08, `a twist inside the curve window should stay straight, x=${flat.atPins?.x}`);
check(failures, played.heldLeft.atPins && played.heldLeft.atPins.x < -0.15 && !played.heldLeft.leftLane, `held left entry x=${played.heldLeft.atPins?.x} should slant left and stay on the lane`);

check(failures, gentle.atPins && !gentle.leftLane && gentle.atPins.x > 0.02 && gentle.atPins.x < 0.14, `gentle hook x=${gentle.atPins?.x} should be a small visible move`);
check(failures, hook.atPins && !hook.leftLane && hook.atPins.x > 0.15 && hook.atPins.x < 0.42, `firm hook x=${hook.atPins?.x} should move toward the pocket and stay on the lane`);
check(failures, wild.atPins && !wild.leftLane && Math.abs(wild.atPins.x) < 0.48, `full hook from the center x=${wild.atPins?.x} should stay on the lane`);
check(failures, edgeRoll.leftLane && edgeRoll.knocked === 0, 'full hook off the edge should be a gutter');
check(failures, slowHook.atPins && fastHook.atPins && Math.abs(slowHook.atPins.x - fastHook.atPins.x) < 0.06, `speed tuning moved the hook: slow x=${slowHook.atPins?.x} fast x=${fastHook.atPins?.x}`);

check(failures, hook.atPins && firm.atPins && Math.abs(hook.atPins.x) > Math.abs(firm.atPins.x) + 0.1, `center hook x=${hook.atPins?.x} should leave the head pin line x=${firm.atPins?.x}`);
check(failures, linedUp.atPins && hook.atPins && !linedUp.leftLane && Math.abs(linedUp.atPins.x) < Math.abs(hook.atPins.x) - 0.1, `starting left of a right hook should come back toward center: lined up x=${linedUp.atPins?.x}, hook x=${hook.atPins?.x}`);
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
