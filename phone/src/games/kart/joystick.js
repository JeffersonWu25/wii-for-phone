// Pure joystick math: horizontal thumb offset (px) -> analog steer in [-1, 1].
// The dead zone is rescaled so output starts at 0 at the edge of the zone and
// reaches +/-1 at the base radius, keeping steering continuous.

export function steerFromOffset(dx, radius, deadZone = 0.12) {
  if (!(radius > 0)) return 0;
  const n = Math.max(-1, Math.min(1, dx / radius));
  const mag = Math.abs(n);
  if (mag <= deadZone) return 0;
  return Math.sign(n) * ((mag - deadZone) / (1 - deadZone));
}
