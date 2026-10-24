const AIM_MAX_X = 0.4;
const MAX_START_X = 0.45;
const BALL_START_Z = 0;
const PIN_START_Z = -15;
const LANE_DISTANCE = BALL_START_Z - PIN_START_Z;

const BASE_SPEED = 4;
const POWER_SPEED = 5;
const MAX_SPEED = 14;
const MAX_ANGLE_DEG = 3;
const FULL_BREAK_M = 0.45;

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

export function parseThrow(msg) {
  const fields = [msg?.power, msg?.aim?.offset, msg?.aim?.angle, msg?.tilt?.angle, msg?.tilt?.spin, msg?.tuning?.speed, msg?.tuning?.curve];
  if (!fields.every(isNumber)) return null;
  return {
    power: clamp(msg.power, 0, 1),
    aim: { offset: clamp(msg.aim.offset, -1, 1), angle: clamp(msg.aim.angle, -1, 1) },
    tilt: { angle: clamp(msg.tilt.angle, -1, 1), spin: clamp(msg.tilt.spin, -1, 1) },
    tuning: { speed: clamp(msg.tuning.speed, 0.25, 3), curve: clamp(msg.tuning.curve, 0, 4) },
  };
}

export function launchFromThrow({ power, aim, tilt, tuning }) {
  const speed = Math.min(MAX_SPEED, (BASE_SPEED + power * POWER_SPEED) * tuning.speed);
  const heading = clamp(aim.angle + tilt.angle, -1, 1) * MAX_ANGLE_DEG * Math.PI / 180;
  const breakM = tilt.spin * tuning.curve * FULL_BREAK_M;
  return {
    startX: clamp(aim.offset * AIM_MAX_X, -MAX_START_X, MAX_START_X),
    velocity: { x: Math.sin(heading) * speed, z: -Math.cos(heading) * speed },
    hookAccel: 2 * breakM * speed ** 2 / LANE_DISTANCE ** 2,
  };
}

export function launchFromMessage(msg) {
  const parsed = parseThrow(msg);
  return parsed && launchFromThrow(parsed);
}

export { LANE_DISTANCE };
