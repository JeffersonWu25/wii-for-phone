import { PhysicsWorld } from '../src/games/bowling/physics.js';
import { launchFromMessage } from '../src/games/bowling/launch.js';

const DT = 1 / 60;

function upY(r) {
  return 1 - 2 * (r.x * r.x + r.z * r.z);
}

function isStandingByUpAxis(body) {
  const t = body.translation();
  const r = body.rotation();
  return t.y >= 0.15 && upY(r) > 0.707;
}

function tipPin(body, deg) {
  const half = (deg * Math.PI / 180) / 2;
  body.setRotation({ x: Math.sin(half), y: 0, z: 0, w: Math.cos(half) }, true);
  body.setLinvel({ x: 0, y: 0, z: 0 }, true);
  body.setAngvel({ x: 0, y: 0, z: 0 }, true);
}

async function rollUntilSettle(physics, msg) {
  physics.launch(launchFromMessage(msg));
  for (let step = 0; step < 60 * 12; step++) {
    physics.step(DT);
    if (physics.settled && step > 30) break;
  }
}

function check(failures, cond, message) {
  if (!cond) failures.push(message);
}

const physics = new PhysicsWorld();
await physics.init();
function mockMeshes() {
  return Array.from({ length: 10 }, () => ({
    visible: true,
    position: { set() {} },
    quaternion: { set() {} },
  }));
}

physics.pinMeshes = mockMeshes();

const failures = [];

tipPin(physics.pinBodies[0], 50);
check(
  failures,
  physics.getStandingPinCount() === 9,
  `50deg tip should count as down; standing=${physics.getStandingPinCount()}`,
);

tipPin(physics.pinBodies[1], 90);
tipPin(physics.pinBodies[2], 120);
check(
  failures,
  typeof physics.clearFallenPins === 'function',
  'PhysicsWorld.clearFallenPins must exist for second-bowl cleanup',
);

if (typeof physics.clearFallenPins === 'function') {
  physics.clearFallenPins();
  physics.resetBall();
  const active = physics.pinBodies.filter(Boolean);
  check(failures, active.length === 7, `clearFallenPins should leave 7 bodies, got ${active.length}`);
  check(failures, physics.getStandingPinCount() === 7, `standing after clear should be 7, got ${physics.getStandingPinCount()}`);
  check(
    failures,
    physics.pinMeshes.filter((m) => m.visible).length === 7,
    `visible meshes after clear should be 7, got ${physics.pinMeshes.filter((m) => m.visible).length}`,
  );
  check(failures, active.every(isStandingByUpAxis), 'remaining bodies must be standing by up-axis');
}

physics.resetPins();
physics.pinMeshes = Array.from({ length: 10 }, () => ({
  visible: true,
  position: { set() {} },
  quaternion: { set() {} },
}));
check(failures, physics.pinBodies.filter(Boolean).length === 10, 'resetPins should restore 10 bodies');
check(failures, physics.getStandingPinCount() === 10, 'resetPins should restore 10 standing');

const msg = {
  type: 'throw',
  power: 0.55,
  aim: { offset: 0, angle: 0 },
  tilt: { angle: 0, hookM: 0 },
  tuning: { speed: 1 },
};
await rollUntilSettle(physics, msg);
const standingAfterFirst = physics.getStandingPinCount();
const knocked = 10 - standingAfterFirst;
check(failures, knocked > 0 && knocked < 10, `need a partial knockdown from live shot, knocked=${knocked}`);

if (typeof physics.clearFallenPins === 'function' && knocked > 0 && knocked < 10) {
  const before = standingAfterFirst;
  physics.clearFallenPins();
  physics.resetBall();
  check(
    failures,
    physics.pinBodies.filter(Boolean).length === before,
    `live shot clear should leave ${before} bodies, got ${physics.pinBodies.filter(Boolean).length}`,
  );
  check(
    failures,
    physics.getStandingPinCount() === before,
    `live shot clear standing should be ${before}, got ${physics.getStandingPinCount()}`,
  );
}

physics.destroy();

if (failures.length) {
  console.log('FAIL');
  for (const failure of failures) console.log(`- ${failure}`);
  process.exit(1);
}
console.log('PASS');
