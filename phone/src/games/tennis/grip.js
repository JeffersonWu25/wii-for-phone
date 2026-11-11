// Hold from DeviceOrientationEvent degrees, not from the swing's gamma rate.
//
// beta tilts the phone front to back. gamma rolls the screen around the long
// axis. The screen facing the player is a forehand. The screen rolled away is
// a backhand.
//
// If beta or gamma is not finite, return null.
// If abs(beta) < 20 or abs(beta) > 160, the phone is flat. Return null so the
// previous grip is kept. A missing orientation stays on that grip and defaults
// to forehand.
// If abs(gamma) <= 55, return 'forehand' (screen toward the holder).
// Otherwise return 'backhand' (screen rolled away).

const FLAT_BELOW = 20;
const FLAT_ABOVE = 160;
const FOREHAND_ROLL = 55;

export function gripFromOrientation(reading) {
  const beta = reading?.beta;
  const gamma = reading?.gamma;
  if (!Number.isFinite(beta) || !Number.isFinite(gamma)) return null;
  if (Math.abs(beta) < FLAT_BELOW || Math.abs(beta) > FLAT_ABOVE) return null;
  if (Math.abs(gamma) <= FOREHAND_ROLL) return 'forehand';
  return 'backhand';
}
