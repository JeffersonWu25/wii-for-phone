// Steer-toward-centerline driver for tests, previews and bots.
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

export function autopilotInput(track, kart, { lookAhead = 10, lookSpeed = 0.5, lateral = 0 } = {}) {
  const fr = track.frameAt(kart.s + lookAhead + kart.speed * lookSpeed);
  const tx = fr.x + fr.rx * lateral;
  const tz = fr.z + fr.rz * lateral;
  const diff = wrapAngle(Math.atan2(tz - kart.z, tx - kart.x) - kart.h);
  return { steer: Math.max(-1, Math.min(1, diff * 2.2)), gas: true };
}
