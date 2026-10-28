// Luigi Circuit centerline. The lap is walked as straights and arcs in driving
// order, starting on the finish straight, and racers travel +z from progress 0.
// Heading h is the travel direction (sin h, cos h). N = (cos h, -sin h) is the
// normal, and its +N side is the outside of a right-hand turn. Elevation rises
// and falls with a cosine ease over each piece, so grades change smoothly.

export const HALF = 7;
const CURB = 1.15;
export const EDGE = HALF + CURB;
export const GRASS_OUT = 18;
// Height of the flat grass around the circuit. It sits below the lowest road
// edge, so the grass shoulder can fall to it without hiding any road.
export const GROUND = -3.2;
const STEP = 1;

// Course order from the start line: finish straight, right turn, short straight,
// gentle left, right U-turn, long straight, gentle left, straight, banked turn.
const PIECES = [
  { len: 41.58, dy: 0 },
  { turn: 1, angle: 70, radius: 41.3, dy: 0 },
  { len: 30, dy: -1 },
  { turn: -1, angle: 30, radius: 55, dy: 0.6 },
  { turn: 1, angle: 180, radius: 22, dy: -0.8 },
  { len: 35, dy: 1.5 },
  { turn: -1, angle: 25, radius: 70, dy: 0 },
  { len: 35, dy: -1.5 },
  { turn: 1, angle: 165, radius: 34, dy: 1.2, bank: 0.22 },
];

function smoothstep(a, b, v) {
  const t = Math.max(0, Math.min(1, (v - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

function bankAt(piece, u) {
  if (!piece.bank) return 0;
  return piece.bank * smoothstep(0, 0.25, u) * (1 - smoothstep(0.75, 1, u));
}

function buildLoop() {
  const X = [];
  const Z = [];
  const Y = [];
  const B = [];
  let x = 0;
  let z = 0;
  let h = 0;
  let y = 0;
  for (const piece of PIECES) {
    const turn = piece.turn || 0;
    const angle = (piece.angle || 0) * (Math.PI / 180);
    const radius = piece.radius || 0;
    const len = turn ? radius * angle : piece.len;
    const n = Math.max(1, Math.ceil(len / STEP));
    const cx = x - turn * radius * Math.cos(h);
    const cz = z + turn * radius * Math.sin(h);
    for (let k = 0; k < n; k++) {
      const u = k / n;
      if (turn) {
        const ph = h - turn * angle * u;
        X.push(cx + turn * radius * Math.cos(ph));
        Z.push(cz - turn * radius * Math.sin(ph));
      } else {
        X.push(x + Math.sin(h) * len * u);
        Z.push(z + Math.cos(h) * len * u);
      }
      Y.push(y + piece.dy * (1 - Math.cos(Math.PI * u)) / 2);
      B.push(bankAt(piece, u));
    }
    if (turn) {
      h -= turn * angle;
      x = cx + turn * radius * Math.cos(h);
      z = cz - turn * radius * Math.sin(h);
    } else {
      x += Math.sin(h) * len;
      z += Math.cos(h) * len;
    }
    y += piece.dy;
  }
  const M = X.length;
  const S = new Float64Array(M);
  const SEG = new Float64Array(M);
  let total = 0;
  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    SEG[i] = Math.hypot(X[j] - X[i], Z[j] - Z[i]);
    S[i] = total;
    total += SEG[i];
  }
  return {
    M,
    X: Float64Array.from(X),
    Z: Float64Array.from(Z),
    Y: Float64Array.from(Y),
    B: Float64Array.from(B),
    S,
    SEG,
    total,
  };
}

const LOOP = buildLoop();
const { M, X, Z, Y, B, S, SEG } = LOOP;
export const PERIM = LOOP.total;

// Height of the ground at a signed lateral offset from a centerline point. The
// road follows the bank, then the grass shoulder fades down to GROUND.
export function surfaceY(centerY, bank, lateral) {
  const a = Math.abs(lateral);
  if (a <= EDGE) return centerY + bank * lateral;
  const edgeY = centerY + bank * Math.sign(lateral) * EDGE;
  return GROUND + (edgeY - GROUND) * (1 - smoothstep(EDGE, GRASS_OUT, a));
}

function findSegment(d) {
  let lo = 0;
  let hi = M - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (S[mid] <= d) lo = mid;
    else hi = mid - 1;
  }
  return lo;
}

export function poseAt(t) {
  const d = (((t % 1) + 1) % 1) * PERIM;
  const i = findSegment(d);
  const j = (i + 1) % M;
  const u = (d - S[i]) / SEG[i];
  const ex = X[j] - X[i];
  const ez = Z[j] - Z[i];
  const centerY = Y[i] + (Y[j] - Y[i]) * u;
  const bank = B[i] + (B[j] - B[i]) * u;
  return {
    x: X[i] + ex * u,
    z: Z[i] + ez * u,
    heading: Math.atan2(ex, ez),
    y: centerY,
    bank,
  };
}

export function sampleTrack(x, z) {
  let best = Infinity;
  let bi = 0;
  let bt = 0;
  for (let i = 0; i < M; i++) {
    const j = (i + 1) % M;
    const ex = X[j] - X[i];
    const ez = Z[j] - Z[i];
    const len2 = SEG[i] * SEG[i];
    const t = Math.max(0, Math.min(1, ((x - X[i]) * ex + (z - Z[i]) * ez) / len2));
    const px = X[i] + ex * t - x;
    const pz = Z[i] + ez * t - z;
    const d2 = px * px + pz * pz;
    if (d2 < best) {
      best = d2;
      bi = i;
      bt = t;
    }
  }
  const j = (bi + 1) % M;
  const len = SEG[bi];
  const ex = X[j] - X[bi];
  const ez = Z[j] - Z[bi];
  const cx = X[bi] + ex * bt;
  const cz = Z[bi] + ez * bt;
  const nx = ez / len;
  const nz = -ex / len;
  const lateral = (x - cx) * nx + (z - cz) * nz;
  const centerY = Y[bi] + (Y[j] - Y[bi]) * bt;
  const bank = B[bi] + (B[j] - B[bi]) * bt;
  const ld = Math.sqrt(best) || 1;
  let progress = (S[bi] + bt * len) / PERIM;
  progress -= Math.floor(progress);
  return {
    cx,
    cz,
    tx: ex / len,
    tz: ez / len,
    lateral,
    progress,
    dirX: (x - cx) / ld,
    dirZ: (z - cz) / ld,
    y: surfaceY(centerY, bank, lateral),
    grade: (Y[j] - Y[bi]) / len,
    bank,
    normalX: nx,
    normalZ: nz,
  };
}
