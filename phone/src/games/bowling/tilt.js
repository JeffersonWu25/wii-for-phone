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

export function leanFromGravity(down, sensitivity = 1) {
  const mag = Math.hypot(down.x, down.y, down.z);
  if (mag < 1) return LEVEL;
  const scale = sensitivity > 0 ? sensitivity : 1;
  const deadzone = DEADZONE_DEG / scale;
  const full = FULL_LEAN_DEG / scale;
  // Negate so the player's left is negative. The raw axis had that backwards.
  const degrees = -Math.asin(clamp(down.x / mag, -1, 1)) * 180 / Math.PI;
  if (Math.abs(degrees) <= deadzone) return LEVEL;
  const lean = Math.sign(degrees) * Math.min(1, (Math.abs(degrees) - deadzone) / (full - deadzone));
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
    read(sensitivity = 1) {
      return gravity ? leanFromGravity(gravity, sensitivity) : LEVEL;
    },
  };
}
