const DEADZONE_DEG = 5;
const FULL_LEAN_DEG = 35;
const SMOOTHING = 0.15;
const LEVEL = { lean: 0, degrees: 0 };

function clamp(val, min, max) {
  return Math.max(min, Math.min(max, val));
}

// W3C accelerationIncludingGravity is the reaction force, so gravity points the other way.
export function downFromSample({ ax, ay, az }) {
  return { x: -ax, y: -ay, z: -az };
}

export function leanFromDegrees(degrees, fullDeg = FULL_LEAN_DEG, deadzone = DEADZONE_DEG) {
  if (!Number.isFinite(degrees) || !(fullDeg > deadzone)) return 0;
  if (Math.abs(degrees) <= deadzone) return 0;
  return Math.sign(degrees) * Math.min(1, (Math.abs(degrees) - deadzone) / (fullDeg - deadzone));
}

function bankDegrees(down) {
  const mag = Math.hypot(down.x, down.y, down.z);
  if (mag < 1) return null;
  const signed = -Math.asin(clamp(down.x / mag, -1, 1)) * 180 / Math.PI;
  return signed || 0;
}

function gain(sensitivity) {
  return sensitivity > 0 ? sensitivity : 1;
}

export function leanFromGravity(down, sensitivity = 1) {
  const degrees = bankDegrees(down);
  if (degrees === null) return LEVEL;
  const scale = gain(sensitivity);
  return {
    lean: leanFromDegrees(degrees, FULL_LEAN_DEG / scale, DEADZONE_DEG / scale),
    degrees,
  };
}

// Curve gain divides only the span above a fixed deadzone, so the same
// multiplier moves every in-range twist by the same factor until it saturates.
export function curveFromGravity(down, sensitivity = 1) {
  const degrees = bankDegrees(down);
  if (degrees === null) return LEVEL;
  const span = (FULL_LEAN_DEG - DEADZONE_DEG) / gain(sensitivity);
  return {
    lean: leanFromDegrees(degrees, DEADZONE_DEG + span, DEADZONE_DEG),
    degrees,
  };
}

export function createTiltSensor() {
  let gravity = null;
  return {
    update(sample) {
      const down = downFromSample(sample);
      if (!gravity) {
        gravity = down;
        return;
      }
      gravity = {
        x: gravity.x + (down.x - gravity.x) * SMOOTHING,
        y: gravity.y + (down.y - gravity.y) * SMOOTHING,
        z: gravity.z + (down.z - gravity.z) * SMOOTHING,
      };
    },
    read(sensitivity = 1) {
      return gravity ? leanFromGravity(gravity, sensitivity) : LEVEL;
    },
    readCurve(sensitivity = 1) {
      return gravity ? curveFromGravity(gravity, sensitivity) : LEVEL;
    },
  };
}
