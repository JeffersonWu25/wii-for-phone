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

export function leanFromGravity(down) {
  const mag = Math.hypot(down.x, down.y, down.z);
  if (mag < 1) return LEVEL;
  const degrees = Math.asin(clamp(down.x / mag, -1, 1)) * 180 / Math.PI;
  const lean = Math.sign(degrees) * Math.min(1, Math.max(0, Math.abs(degrees) - DEADZONE_DEG) / (FULL_LEAN_DEG - DEADZONE_DEG));
  return { lean, degrees };
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
    read() {
      return gravity ? leanFromGravity(gravity) : LEVEL;
    },
  };
}
