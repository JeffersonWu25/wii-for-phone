// Pure joystick math: thumb offset (px) from the base centre -> { steer, aimY }.
// The offset is clamped to a circle of the base radius. A radial dead zone zeroes
// both axes for a small wobble; past it each axis is rescaled so output starts at
// 0 at the edge of the zone and reaches 1 at the base radius, keeping it continuous.
// steer is the X axis (-1..1); aimY is the Y axis (-1 up .. +1 down) and only aims thrown items.

// Radial clamp: keeps the knob on a circle instead of a square.
export function clampToRadius(dx, dy, radius) {
  const dist = Math.hypot(dx, dy);
  if (!(dist > radius) || !(radius > 0)) return { x: dx, y: dy };
  const k = radius / dist;
  return { x: dx * k, y: dy * k };
}

const rescale = (n, deadZone) => {
  const mag = Math.abs(n);
  if (mag <= deadZone) return 0;
  return Math.sign(n) * ((mag - deadZone) / (1 - deadZone));
};

export function stickFromOffset(dx, dy, radius, deadZone = 0.12) {
  if (!(radius > 0)) return { steer: 0, aimY: 0 };
  const c = clampToRadius(dx, dy, radius);
  const nx = c.x / radius;
  const ny = c.y / radius;
  if (Math.hypot(nx, ny) <= deadZone) return { steer: 0, aimY: 0 };
  return { steer: rescale(nx, deadZone), aimY: rescale(ny, deadZone) };
}
