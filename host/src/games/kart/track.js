// Stadium oval. Straights run along z. Progress 0 is the start line
// at the bottom of the right straight, and racers travel +z from there.

export const S = 22;
export const RC = 16;
export const HALF = 5.6;

const STRAIGHT = 2 * S;
const CAP = Math.PI * RC;
export const PERIM = 2 * STRAIGHT + 2 * CAP;

export function poseAt(t) {
  let d = (((t % 1) + 1) % 1) * PERIM;
  if (d <= STRAIGHT) {
    return { x: RC, z: -S + d, heading: 0 };
  }
  d -= STRAIGHT;
  if (d <= CAP) {
    const ang = d / RC;
    return {
      x: Math.cos(ang) * RC,
      z: S + Math.sin(ang) * RC,
      heading: -ang,
    };
  }
  d -= CAP;
  if (d <= STRAIGHT) {
    return { x: -RC, z: S - d, heading: Math.PI };
  }
  d -= STRAIGHT;
  const ang = Math.PI + d / RC;
  return {
    x: Math.cos(ang) * RC,
    z: -S + Math.sin(ang) * RC,
    heading: -ang,
  };
}

export function sampleTrack(x, z) {
  let cx;
  let cz;
  let tx;
  let tz;
  let arc;
  let lateral;

  if (z >= -S && z <= S) {
    const right = x >= 0;
    cx = right ? RC : -RC;
    cz = z;
    if (right) {
      tx = 0;
      tz = 1;
      lateral = x - RC;
      arc = z + S;
    } else {
      tx = 0;
      tz = -1;
      lateral = -RC - x;
      arc = STRAIGHT + CAP + (S - z);
    }
  } else if (z > S) {
    const dx = x;
    const dz = z - S;
    const dist = Math.hypot(dx, dz) || 1e-6;
    cx = (dx / dist) * RC;
    cz = S + (dz / dist) * RC;
    lateral = dist - RC;
    tx = -dz / dist;
    tz = dx / dist;
    let ang = Math.atan2(dz, dx);
    if (ang < 0) ang += Math.PI * 2;
    arc = STRAIGHT + ang * RC;
  } else {
    const dx = x;
    const dz = z + S;
    const dist = Math.hypot(dx, dz) || 1e-6;
    cx = (dx / dist) * RC;
    cz = -S + (dz / dist) * RC;
    lateral = dist - RC;
    tx = -dz / dist;
    tz = dx / dist;
    let ang = Math.atan2(dz, dx);
    if (ang <= 0) ang += Math.PI * 2;
    arc = STRAIGHT + CAP + STRAIGHT + (ang - Math.PI) * RC;
  }

  const lx = x - cx;
  const lz = z - cz;
  const ld = Math.hypot(lx, lz) || 1;
  let progress = arc / PERIM;
  progress -= Math.floor(progress);

  return {
    cx,
    cz,
    tx,
    tz,
    lateral,
    progress,
    dirX: lx / ld,
    dirZ: lz / ld,
  };
}
