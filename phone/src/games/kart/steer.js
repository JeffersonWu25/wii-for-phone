function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

export function tiltAngle(ax, ay, az, orientationAngle) {
  const angle = ((orientationAngle % 360) + 360) % 360;
  let side = ax;
  if (angle === 90) side = ay;
  else if (angle === 270) side = -ay;
  return Math.atan2(side, az || 0.0001);
}

export function steerFromTilt(angle, neutral) {
  const FULL = 0.6;
  return clamp((angle - neutral) / FULL, -1, 1);
}

export function stickSteer(dx, radius) {
  if (!radius) return 0;
  const raw = clamp(dx / radius, -1, 1);
  const dead = 0.12;
  const mag = Math.abs(raw);
  if (mag <= dead) return 0;
  const t = (mag - dead) / (1 - dead);
  return Math.sign(raw) * t ** 1.35;
}
