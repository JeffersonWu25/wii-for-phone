export const PROGRESS_CONTINUITY = 0.10;

const MAX_STEP_M = 6;
const GRID = Object.freeze({
  frontMeters: 2.3,
  rowMeters: 3.0,
  colOffset: 1.6,
  columns: 2,
});

const LUIGI_PLAN = {
  waypoints: [
    { id: 'sf', seg: 'start', x: 34, z: -6, halfWidth: 6 },
    { id: 's1', seg: 'start', x: 34, z: 10, halfWidth: 6 },
    { id: 's2', seg: 'start', x: 34, z: 24, halfWidth: 6.1 },
    { id: 't18', seg: 'turn1', x: 33.12, z: 29.56, halfWidth: 6.32 },
    { id: 't36', seg: 'turn1', x: 30.56, z: 34.58, halfWidth: 6.44 },
    { id: 't54', seg: 'turn1', x: 26.58, z: 38.56, halfWidth: 6.52 },
    { id: 't72', seg: 'turn1', x: 21.56, z: 41.12, halfWidth: 6.58 },
    { id: 't90', seg: 'turn1', x: 16, z: 42, halfWidth: 6.6 },
    { id: 't110', seg: 'turn1', x: 9.84, z: 40.91, halfWidth: 6.55 },
    { id: 't130', seg: 'turn1', x: 4.43, z: 37.79, halfWidth: 6.5 },
    { id: 'tA', seg: 'turn1', x: 3.2, z: 32.5, halfWidth: 6.45 },
    { id: 'tB', seg: 'turn1', x: -8, z: 29.5, halfWidth: 6.35 },
    { id: 'tC', seg: 'turn1', x: -18, z: 23, halfWidth: 6.2 },
    { id: 'k1', seg: 'kink', x: -22.19, z: 16.15, halfWidth: 6.05 },
    { id: 'k2', seg: 'kink', x: -23.83, z: 9.43, halfWidth: 6 },
    { id: 'k3', seg: 'kink', x: -22.51, z: 2.5, halfWidth: 5.95 },
    { id: 'b0', seg: 'back', x: -16, z: -6, halfWidth: 5.9 },
    { id: 'b1', seg: 'back', x: -9, z: -14, halfWidth: 6 },
    { id: 'b2', seg: 'back', x: -4, z: -21, halfWidth: 6.2 },
    { id: 'b3', seg: 'back', x: -2.64, z: -24.86, halfWidth: 6.4 },
    { id: 'u0', seg: 'bank', x: -2, z: -28, halfWidth: 6.6, visualOuterY: 0.15 },
    { id: 'u210', seg: 'bank', x: 0.41, z: -37, halfWidth: 7.9, visualOuterY: 0.45 },
    { id: 'u240', seg: 'bank', x: 7, z: -43.59, halfWidth: 8.78, visualOuterY: 0.75 },
    { id: 'u270', seg: 'bank', x: 16, z: -46, halfWidth: 9.1, visualOuterY: 0.9 },
    { id: 'u300', seg: 'bank', x: 25, z: -43.59, halfWidth: 8.78, visualOuterY: 0.75 },
    { id: 'u330', seg: 'bank', x: 31.59, z: -37, halfWidth: 7.9, visualOuterY: 0.4 },
    { id: 'link', seg: 'start', x: 34, z: -28, halfWidth: 6.2 },
  ],
  sandBands: [
    { from: 't36', u0: 0, to: 'k2', u1: 0.5, depth: 10 },
    { from: 'b2', u0: 0, to: 'u330', u1: 1, depth: 18 },
  ],
  dashes: [
    { from: 'u210', u0: 0.05, to: 'u330', u1: 0.85, latFrac0: 0.18, latFrac1: 0.94 },
  ],
  corridors: [
    {
      id: 'rampCut',
      from: 'b1',
      u0: 0.15,
      to: 'u210',
      u1: 0.35,
      reach: 7,
      spine: [
        { at: 'b1', u: 0.15, lateral: 'inner' },
        { at: 'b2', u: 0.45, lateral: -12 },
        { at: 'b3', u: 0.6, lateral: -13 },
        { at: 'u0', u: 0.45, lateral: -12 },
        { at: 'u210', u: 0.35, lateral: 'inner' },
      ],
    },
    {
      id: 'uCut',
      from: 'u0',
      u0: 0.15,
      to: 'u330',
      u1: 0.8,
      reach: 8,
      spine: [
        { at: 'u0', u: 0.15, lateral: 'inner' },
        { at: 'u210', u: 0.45, lateral: -15 },
        { at: 'u240', u: 0.5, lateral: -17 },
        { at: 'u270', u: 0.5, lateral: -18 },
        { at: 'u300', u: 0.5, lateral: -17 },
        { at: 'u330', u: 0.8, lateral: 'inner' },
      ],
    },
  ],
  grid: GRID,
  grassMargin: 12,
};

const COURSE = compile(LUIGI_PLAN);

export const PERIM = COURSE.perim;
/** Start-straight asphalt half-width. Items and older contain paths still read this. */
export const HALF = poseAtS(0).half;

export function poseAt(t) {
  const hit = poseAtS(wrap01(t) * PERIM);
  return {
    x: hit.x,
    z: hit.z,
    heading: hit.heading,
    halfWidth: hit.half,
    visualOuterY: hit.visualOuterY,
  };
}

export function sampleTrack(x, z, seedProgress) {
  if (!Number.isFinite(x) || !Number.isFinite(z)) {
    throw new TypeError('sampleTrack needs finite x and z');
  }
  const seed = Number.isFinite(seedProgress) ? wrap01(seedProgress) : null;
  return locate(x, z, seed);
}

export function followTrack(motion) {
  const x0 = motion?.x0;
  const z0 = motion?.z0;
  const x1 = motion?.x1;
  const z1 = motion?.z1;
  const seedProgress = motion?.seedProgress;
  if (![x0, z0, x1, z1, seedProgress].every(Number.isFinite)) {
    throw new TypeError('followTrack motion needs finite numbers');
  }
  const end = clampDisc(x1, z1);
  const sample = locate(end.x, end.z, wrap01(seedProgress));
  const dashEntered = segmentHitsDash(x0, z0, end.x, end.z) && !pointInDash(x0, z0);
  return {
    ...sample,
    x: end.x,
    z: end.z,
    dashEntered,
  };
}

export function gridPose(index) {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const back = (GRID.frontMeters + row * GRID.rowMeters) / PERIM;
  const pose = poseAt(-back);
  const side = (col === 0 ? -1 : 1) * GRID.colOffset;
  const rx = Math.cos(pose.heading);
  const rz = -Math.sin(pose.heading);
  return {
    x: pose.x + rx * side,
    z: pose.z + rz * side,
    facing: pose.heading,
  };
}

export function trackVisuals() {
  return COURSE.visuals;
}

function compile(plan) {
  const waypoints = plan.waypoints;
  const idIndex = new Map(waypoints.map((wp, i) => [wp.id, i]));
  const edges = [];
  let cursor = 0;
  for (let i = 0; i < waypoints.length; i++) {
    const a = waypoints[i];
    const b = waypoints[(i + 1) % waypoints.length];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const length = Math.hypot(dx, dz);
    if (!(length > 0.5) || !(a.halfWidth > 0)) {
      throw new Error(`bad edge ${a.id}`);
    }
    const tx = dx / length;
    const tz = dz / length;
    edges.push({
      i,
      seg: a.seg,
      x0: a.x,
      z0: a.z,
      x1: b.x,
      z1: b.z,
      length,
      s0: cursor,
      tx,
      tz,
      nx: tz,
      nz: -tx,
      half0: a.halfWidth,
      half1: b.halfWidth,
      y0: a.visualOuterY || 0,
      y1: b.visualOuterY || 0,
    });
    cursor += length;
  }
  const perim = cursor;

  function frameOnEdge(edge, u) {
    const uu = clamp(u, 0, 1);
    const half = edge.half0 + (edge.half1 - edge.half0) * uu;
    return {
      x: edge.x0 + (edge.x1 - edge.x0) * uu,
      z: edge.z0 + (edge.z1 - edge.z0) * uu,
      nx: edge.nx,
      nz: edge.nz,
      tx: edge.tx,
      tz: edge.tz,
      half,
      visualOuterY: edge.y0 + (edge.y1 - edge.y0) * uu,
      s: edge.s0 + edge.length * uu,
      progress: wrap01((edge.s0 + edge.length * uu) / perim),
      heading: Math.atan2(edge.tx, edge.tz),
      seg: edge.seg,
    };
  }

  function frameAt(id, u) {
    const edge = edges[idIndex.get(id)];
    if (!edge) throw new Error(`unknown waypoint ${id}`);
    return frameOnEdge(edge, u);
  }

  function poseAtSLocal(s) {
    let arc = s % perim;
    if (arc < 0) arc += perim;
    for (const edge of edges) {
      if (arc >= edge.s0 && arc < edge.s0 + edge.length - 1e-8) {
        return frameOnEdge(edge, (arc - edge.s0) / edge.length);
      }
    }
    const edge = edges[edges.length - 1];
    return frameOnEdge(edge, 1);
  }

  function progressOf(id, u) {
    return frameAt(id, u).progress;
  }

  const sand = plan.sandBands.map((band) => ({
    p0: progressOf(band.from, band.u0),
    p1: progressOf(band.to, band.u1),
    depth: band.depth,
  }));

  const dashes = [];
  for (const spec of plan.dashes) {
    const p0 = progressOf(spec.from, spec.u0);
    const p1 = progressOf(spec.to, spec.u1);
    const span = forwardSpan(p0, p1);
    const steps = Math.max(2, Math.ceil((span * perim) / 4));
    for (let k = 0; k < steps; k++) {
      const a = poseAtSLocal(wrap01(p0 + span * (k / steps)) * perim);
      const b = poseAtSLocal(wrap01(p0 + span * ((k + 1) / steps)) * perim);
      dashes.push([
        offset(a, a.half * spec.latFrac0),
        offset(b, b.half * spec.latFrac0),
        offset(b, b.half * spec.latFrac1),
        offset(a, a.half * spec.latFrac1),
      ]);
    }
  }

  const corridors = plan.corridors.map((spec) => {
    const s0 = progressOf(spec.from, spec.u0);
    const s1 = progressOf(spec.to, spec.u1);
    const raw = spec.spine.map((pt) => {
      const frame = frameAt(pt.at, pt.u);
      const lateral = pt.lateral === 'inner' ? -frame.half - 0.4 : pt.lateral;
      return offset(frame, lateral);
    });
    let length = 0;
    const center = [{ x: raw[0].x, z: raw[0].z, s: 0 }];
    for (let i = 1; i < raw.length; i++) {
      length += Math.hypot(raw[i].x - raw[i - 1].x, raw[i].z - raw[i - 1].z);
      center.push({ x: raw[i].x, z: raw[i].z, s: length });
    }
    const poly = ribbon(center, (i, n) => {
      const t = n <= 1 ? 0 : i / (n - 1);
      return 2.4 + Math.sin(Math.PI * t) * spec.reach;
    });
    const span = forwardSpan(s0, s1);
    const jump = length < 1e-3 ? Infinity : (MAX_STEP_M / length) * span;
    if (!(jump <= PROGRESS_CONTINUITY)) {
      throw new Error(`${spec.id} progress jump ${jump.toFixed(3)} exceeds budget`);
    }
    return { id: spec.id, s0, s1, length, center, poly };
  });

  let worldRadius = 0;
  const consider = (x, z) => {
    worldRadius = Math.max(worldRadius, Math.hypot(x, z));
  };
  for (let s = 0; s <= perim; s += 2) {
    const pose = poseAtSLocal(Math.min(s, perim - 1e-4));
    consider(pose.x + pose.nx * pose.half, pose.z + pose.nz * pose.half);
    consider(pose.x - pose.nx * (pose.half + 18), pose.z - pose.nz * (pose.half + 18));
  }
  for (const corridor of corridors) {
    for (const p of corridor.poly) consider(p.x, p.z);
  }
  worldRadius += plan.grassMargin;

  for (let i = 0; i < 80; i++) {
    const pose = poseAtSLocal((i / 80) * perim);
    for (const corridor of corridors) {
      if (pointInPoly(corridor.poly, pose.x, pose.z)) {
        throw new Error(`centerline crosses ${corridor.id}`);
      }
    }
  }

  const back = plan.grid.frontMeters + 5 * plan.grid.rowMeters;
  const gridFrame = poseAtSLocal(wrap01(-back / perim) * perim);
  if (gridFrame.seg !== 'start') throw new Error('grid row 5 leaves the start straight');
  if (!(perim > 190 && perim < 245)) throw new Error(`PERIM ${perim}`);

  const visuals = buildVisuals({
    perim,
    poseAtSLocal,
    sand,
    dashes,
    corridors,
    worldRadius,
    edges,
  });

  return {
    perim,
    edges,
    sand,
    dashes,
    corridors,
    worldRadius,
    poseAtSLocal,
    visuals,
  };
}

function buildVisuals(course) {
  const road = [];
  const inner = [];
  const outer = [];
  const step = 2;
  for (let s = 0; s < course.perim; s += step) {
    const pose = course.poseAtSLocal(s);
    road.push({
      x: pose.x,
      z: pose.z,
      heading: pose.heading,
      halfWidth: pose.half,
      visualOuterY: pose.visualOuterY,
    });
    inner.push(offset(pose, -pose.half));
    outer.push({
      x: pose.x + pose.nx * pose.half,
      z: pose.z + pose.nz * pose.half,
      y: pose.visualOuterY,
    });
  }
  const sand = [];
  for (const band of course.sand) {
    sand.push(bandPoly(course, band.p0, band.p1, band.depth));
  }
  for (const corridor of course.corridors) sand.push(corridor.poly);
  const stripe = course.poseAtSLocal(0);
  const gridMarks = [];
  for (let i = 0; i < 12; i++) gridMarks.push(gridMark(i, course.perim, course.poseAtSLocal));
  return {
    grassRadius: course.worldRadius,
    road,
    edges: { inner, outer },
    sand,
    dashes: course.dashes,
    startFinish: {
      x: stripe.x,
      z: stripe.z,
      heading: stripe.heading,
      width: stripe.half * 2,
      depth: 1.2,
    },
    gridMarks,
  };
}

function bandPoly(course, p0, p1, depth) {
  const span = forwardSpan(p0, p1);
  const steps = Math.max(2, Math.ceil((span * course.perim) / 2));
  const roadSide = [];
  const deepSide = [];
  let prev = null;
  for (let k = 0; k <= steps; k++) {
    const pose = course.poseAtSLocal(wrap01(p0 + span * (k / steps)) * course.perim);
    const edge = offset(pose, -pose.half);
    roadSide.push(edge);
    let deep = offset(pose, -pose.half - depth);
    if (prev) {
      const advance = (deep.x - prev.x) * pose.tx + (deep.z - prev.z) * pose.tz;
      if (advance < 0.2) {
        deep = { x: prev.x + pose.tx * 0.2, z: prev.z + pose.tz * 0.2 };
      }
    }
    deepSide.push(deep);
    prev = deep;
  }
  return [...roadSide, ...deepSide.reverse()];
}

function gridMark(index, perim, poseAtSLocal) {
  const row = Math.floor(index / 2);
  const col = index % 2;
  const back = (GRID.frontMeters + row * GRID.rowMeters) / perim;
  const pose = poseAtSLocal(wrap01(-back) * perim);
  const side = (col === 0 ? -1 : 1) * GRID.colOffset;
  const rx = Math.cos(pose.heading);
  const rz = -Math.sin(pose.heading);
  return {
    x: pose.x + rx * side,
    z: pose.z + rz * side,
    heading: pose.heading,
  };
}

function locate(x, z, seed) {
  if (seed != null) {
    const cut = locateCorridor(x, z, seed);
    if (cut) return cut;
  }
  let best = null;
  for (const edge of COURSE.edges) {
    const proj = projectEdge(edge, x, z);
    if (seed != null && circDist(proj.progress, seed) > PROGRESS_CONTINUITY) continue;
    if (!best || proj.dist2 < best.dist2) best = proj;
  }
  if (!best) {
    for (const edge of COURSE.edges) {
      const proj = projectEdge(edge, x, z);
      if (!best || proj.dist2 < best.dist2) best = proj;
    }
  }
  const depth = sandDepthAt(best.progress);
  let surface = 'grass';
  if (Math.abs(best.lateral) <= best.half + 1e-4) surface = 'asphalt';
  else if (best.lateral < 0 && -best.lateral <= best.half + depth) surface = 'sand';
  return {
    cx: best.cx,
    cz: best.cz,
    tx: best.tx,
    tz: best.tz,
    lateral: best.lateral,
    progress: best.progress,
    dirX: best.dirX,
    dirZ: best.dirZ,
    halfWidth: best.half,
    surface,
    onDash: pointInDash(x, z),
  };
}

function locateCorridor(x, z, seed) {
  let best = null;
  for (const corridor of COURSE.corridors) {
    if (!seedHitsSpan(seed, corridor.s0, corridor.s1)) continue;
    if (!pointInPoly(corridor.poly, x, z)) continue;
    const proj = projectSpine(corridor.center, x, z);
    if (!best || proj.dist2 < best.dist2) best = { corridor, proj };
  }
  if (!best) return null;
  const span = forwardSpan(best.corridor.s0, best.corridor.s1);
  const u = best.corridor.length <= 1e-6 ? 0 : best.proj.s / best.corridor.length;
  const progress = wrap01(best.corridor.s0 + clamp(u, 0, 1) * span);
  const pose = poseAt(progress);
  const lx = x - pose.x;
  const lz = z - pose.z;
  const ld = Math.hypot(lx, lz);
  const nx = Math.cos(pose.heading);
  const nz = -Math.sin(pose.heading);
  return {
    cx: pose.x,
    cz: pose.z,
    tx: Math.sin(pose.heading),
    tz: Math.cos(pose.heading),
    lateral: lx * nx + lz * nz,
    progress,
    dirX: ld < 1e-6 ? 0 : lx / ld,
    dirZ: ld < 1e-6 ? 0 : lz / ld,
    halfWidth: pose.halfWidth,
    surface: 'sand',
    onDash: pointInDash(x, z),
  };
}

function projectEdge(edge, x, z) {
  const dx = x - edge.x0;
  const dz = z - edge.z0;
  let u = (dx * edge.tx + dz * edge.tz) / edge.length;
  u = clamp(u, 0, 1);
  const cx = edge.x0 + edge.tx * edge.length * u;
  const cz = edge.z0 + edge.tz * edge.length * u;
  const lx = x - cx;
  const lz = z - cz;
  const lateral = lx * edge.nx + lz * edge.nz;
  const progress = wrap01((edge.s0 + edge.length * u) / PERIM);
  const half = edge.half0 + (edge.half1 - edge.half0) * u;
  const ld = Math.hypot(lx, lz);
  return {
    cx,
    cz,
    tx: edge.tx,
    tz: edge.tz,
    lateral,
    progress,
    half,
    dist2: lx * lx + lz * lz,
    dirX: ld < 1e-6 ? 0 : lx / ld,
    dirZ: ld < 1e-6 ? 0 : lz / ld,
  };
}

function projectSpine(center, x, z) {
  let best = { dist2: Infinity, s: 0 };
  for (let i = 0; i < center.length - 1; i++) {
    const a = center[i];
    const b = center[i + 1];
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const len2 = dx * dx + dz * dz || 1e-9;
    const u = clamp(((x - a.x) * dx + (z - a.z) * dz) / len2, 0, 1);
    const px = a.x + dx * u;
    const pz = a.z + dz * u;
    const dist2 = (x - px) ** 2 + (z - pz) ** 2;
    if (dist2 < best.dist2) best = { dist2, s: a.s + (b.s - a.s) * u };
  }
  return best;
}

function sandDepthAt(progress) {
  let depth = 0;
  for (const band of COURSE.sand) {
    const span = forwardSpan(band.p0, band.p1);
    const rel = forwardSpan(band.p0, progress);
    if (rel <= span + 1e-6) depth = Math.max(depth, band.depth);
  }
  return depth;
}

function poseAtS(s) {
  return COURSE.poseAtSLocal(s);
}

function clampDisc(x, z) {
  const r = Math.hypot(x, z);
  if (r <= COURSE.worldRadius || r < 1e-8) return { x, z };
  const k = COURSE.worldRadius / r;
  return { x: x * k, z: z * k };
}

function pointInDash(x, z) {
  for (const quad of COURSE.dashes) {
    if (pointInPoly(quad, x, z)) return true;
  }
  return false;
}

function segmentHitsDash(x0, z0, x1, z1) {
  if (pointInDash(x1, z1)) return true;
  const a = { x: x0, z: z0 };
  const b = { x: x1, z: z1 };
  for (const quad of COURSE.dashes) {
    for (let i = 0; i < quad.length; i++) {
      const c = quad[i];
      const d = quad[(i + 1) % quad.length];
      if (segmentsCross(a, b, c, d)) return true;
    }
  }
  return false;
}

function pointInPoly(poly, x, z) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x;
    const zi = poly[i].z;
    const xj = poly[j].x;
    const zj = poly[j].z;
    const cross = (zi > z) !== (zj > z)
      && x < ((xj - xi) * (z - zi)) / ((zj - zi) || 1e-12) + xi;
    if (cross) inside = !inside;
  }
  return inside;
}

function segmentsCross(a, b, c, d) {
  const ab = side(a, b, c) * side(a, b, d);
  const cd = side(c, d, a) * side(c, d, b);
  return ab < 0 && cd < 0;
}

function side(p, q, r) {
  return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
}

function ribbon(center, widthAt) {
  const left = [];
  const right = [];
  const n = center.length;
  for (let i = 0; i < n; i++) {
    const prev = center[Math.max(0, i - 1)];
    const next = center[Math.min(n - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const mag = Math.hypot(tx, tz) || 1;
    tx /= mag;
    tz /= mag;
    const nx = tz;
    const nz = -tx;
    const w = widthAt(i, n);
    left.push({ x: center[i].x + nx * w, z: center[i].z + nz * w });
    right.push({ x: center[i].x - nx * w, z: center[i].z - nz * w });
  }
  return [...left, ...right.reverse()];
}

function offset(frame, lateral) {
  return {
    x: frame.x + frame.nx * lateral,
    z: frame.z + frame.nz * lateral,
  };
}

function seedHitsSpan(seed, s0, s1) {
  const span = forwardSpan(s0, s1);
  const rel = forwardSpan(s0, seed);
  return rel <= span + PROGRESS_CONTINUITY || rel >= 1 - PROGRESS_CONTINUITY;
}

function forwardSpan(from, to) {
  let d = to - from;
  if (d < 0) d += 1;
  return d;
}

function circDist(a, b) {
  const d = Math.abs(wrap01(a) - wrap01(b));
  return Math.min(d, 1 - d);
}

function wrap01(t) {
  return ((t % 1) + 1) % 1;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}
