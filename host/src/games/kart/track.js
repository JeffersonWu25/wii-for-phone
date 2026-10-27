import { LUIGI_PLAN } from './tracks/luigi-circuit-plan.js';
import { loftCourse } from './track-loft.js';

export const PROGRESS_CONTINUITY = 0.10;

const MAX_STEP_M = 6;

export function createTrack(plan, opts = {}) {
  const course = compile(plan, opts);
  const grid = plan.grid;
  const itemBoxSites = Object.freeze(
    resolveSites(plan, opts).map((site) => Object.freeze({
      progress: site.progress,
      stack: site.stack,
    })),
  );
  const itemBoxProgress = Object.freeze(itemBoxSites.map((site) => site.progress));

  function poseAt(t) {
    return poseOn(course, t);
  }

  function sampleTrack(x, z, seedProgress) {
    if (!Number.isFinite(x) || !Number.isFinite(z)) {
      throw new TypeError('sampleTrack needs finite x and z');
    }
    const seed = Number.isFinite(seedProgress) ? wrap01(seedProgress) : null;
    return locate(course, x, z, seed);
  }

  function followTrack(motion) {
    const x0 = motion?.x0;
    const z0 = motion?.z0;
    const x1 = motion?.x1;
    const z1 = motion?.z1;
    const seedProgress = motion?.seedProgress;
    if (![x0, z0, x1, z1, seedProgress].every(Number.isFinite)) {
      throw new TypeError('followTrack motion needs finite numbers');
    }
    const end = clampDisc(course, x1, z1);
    const sample = locate(course, end.x, end.z, wrap01(seedProgress));
    const dashEntered = segmentHitsDash(course, x0, z0, end.x, end.z) && !pointInDash(course, x0, z0);
    return {
      ...sample,
      x: end.x,
      z: end.z,
      dashEntered,
    };
  }

  function gridPose(index) {
    const row = Math.floor(index / 2);
    const col = index % 2;
    const back = (grid.frontMeters + row * grid.rowMeters) / course.perim;
    const pose = poseAt(-back);
    const side = (col === 0 ? -1 : 1) * grid.colOffset;
    const rx = Math.cos(pose.heading);
    const rz = -Math.sin(pose.heading);
    return {
      x: pose.x + rx * side,
      z: pose.z + rz * side,
      facing: pose.heading,
    };
  }

  return Object.freeze({
    id: opts.id || null,
    PERIM: course.perim,
    HALF: course.poseAtSLocal(0).half,
    itemBoxSites,
    itemBoxProgress,
    poseAt,
    sampleTrack,
    followTrack,
    gridPose,
    trackVisuals() {
      return course.visuals;
    },
  });
}

function resolveSites(plan, opts) {
  if (opts.itemBoxSites != null && opts.itemBoxProgress != null) {
    throw new Error('createTrack opts include both itemBoxSites and itemBoxProgress');
  }
  if (plan.itemBoxSites != null && plan.itemBoxProgress != null) {
    throw new Error('createTrack plan includes both itemBoxSites and itemBoxProgress');
  }

  let specs;
  if (opts.itemBoxSites != null) specs = opts.itemBoxSites;
  else if (opts.itemBoxProgress != null) specs = sitesFromProgress(opts.itemBoxProgress);
  else if (plan.itemBoxSites != null) specs = plan.itemBoxSites;
  else if (plan.itemBoxProgress != null) specs = sitesFromProgress(plan.itemBoxProgress);
  else throw new Error('createTrack needs itemBoxSites or itemBoxProgress');

  if (!Array.isArray(specs) || specs.length === 0) {
    throw new Error('item box sites must be a non-empty array');
  }

  return specs.map((spec) => {
    const progress = spec?.progress;
    const stack = spec?.stack;
    if (!Number.isFinite(progress)) throw new Error('item box progress must be finite');
    if (stack !== 1 && stack !== 2) throw new Error('item box stack must be 1 or 2');
    // Already inside [0, 1) stays bit-exact. wrap01's modulo nudges marks like 0.08.
    const unit = progress >= 0 && progress < 1 ? progress : wrap01(progress);
    return { progress: unit, stack };
  });
}

function sitesFromProgress(list) {
  if (!Array.isArray(list)) return list;
  return list.map((progress) => ({ progress, stack: 1 }));
}

function compile(plan, opts = {}) {
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
    if (arc >= perim - 1e-9) arc = 0;
    for (const edge of edges) {
      if (arc >= edge.s0 && arc < edge.s0 + edge.length) {
        return frameOnEdge(edge, (arc - edge.s0) / edge.length);
      }
    }
    return frameOnEdge(edges[0], 0);
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
  if (opts.requireStartGrid && gridFrame.seg !== 'start') {
    throw new Error('grid row 5 leaves the start straight');
  }
  if (opts.perimRange) {
    const [lo, hi] = opts.perimRange;
    if (!(perim > lo && perim < hi)) throw new Error(`PERIM ${perim}`);
  }

  const visuals = loftCourse({
    perim,
    edges,
    sandBands: sand,
    dashQuads: structuredClone(dashes),
    corridors: structuredClone(corridors),
    worldRadius,
    grid: plan.grid,
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

function locate(course, x, z, seed) {
  if (seed != null) {
    const cut = locateCorridor(course, x, z, seed);
    if (cut) return cut;
  }
  let best = null;
  for (const edge of course.edges) {
    const proj = projectEdge(course, edge, x, z);
    if (seed != null && circDist(proj.progress, seed) > PROGRESS_CONTINUITY) continue;
    if (!best || proj.dist2 < best.dist2) best = proj;
  }
  if (!best) {
    for (const edge of course.edges) {
      const proj = projectEdge(course, edge, x, z);
      if (!best || proj.dist2 < best.dist2) best = proj;
    }
  }
  const depth = sandDepthAt(course, best.progress);
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
    onDash: pointInDash(course, x, z),
  };
}

function locateCorridor(course, x, z, seed) {
  let best = null;
  for (const corridor of course.corridors) {
    if (!seedHitsSpan(seed, corridor.s0, corridor.s1)) continue;
    if (!pointInPoly(corridor.poly, x, z)) continue;
    const proj = projectSpine(corridor.center, x, z);
    if (!best || proj.dist2 < best.dist2) best = { corridor, proj };
  }
  if (!best) return null;
  const span = forwardSpan(best.corridor.s0, best.corridor.s1);
  const u = best.corridor.length <= 1e-6 ? 0 : best.proj.s / best.corridor.length;
  const progress = wrap01(best.corridor.s0 + clamp(u, 0, 1) * span);
  const pose = poseOn(course, progress);
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
    onDash: pointInDash(course, x, z),
  };
}

function projectEdge(course, edge, x, z) {
  const dx = x - edge.x0;
  const dz = z - edge.z0;
  let u = (dx * edge.tx + dz * edge.tz) / edge.length;
  u = clamp(u, 0, 1);
  const cx = edge.x0 + edge.tx * edge.length * u;
  const cz = edge.z0 + edge.tz * edge.length * u;
  const lx = x - cx;
  const lz = z - cz;
  const lateral = lx * edge.nx + lz * edge.nz;
  const progress = wrap01((edge.s0 + edge.length * u) / course.perim);
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

function sandDepthAt(course, progress) {
  let depth = 0;
  for (const band of course.sand) {
    const span = forwardSpan(band.p0, band.p1);
    const rel = forwardSpan(band.p0, progress);
    if (rel <= span + 1e-6) depth = Math.max(depth, band.depth);
  }
  return depth;
}

function poseOn(course, t) {
  const hit = course.poseAtSLocal(wrap01(t) * course.perim);
  return {
    x: hit.x,
    z: hit.z,
    heading: hit.heading,
    halfWidth: hit.half,
    visualOuterY: hit.visualOuterY,
  };
}

function clampDisc(course, x, z) {
  const r = Math.hypot(x, z);
  if (r <= course.worldRadius || r < 1e-8) return { x, z };
  const k = course.worldRadius / r;
  return { x: x * k, z: z * k };
}

function pointInDash(course, x, z) {
  for (const quad of course.dashes) {
    if (pointInPoly(quad, x, z)) return true;
  }
  return false;
}

function segmentHitsDash(course, x0, z0, x1, z1) {
  if (pointInDash(course, x1, z1)) return true;
  const a = { x: x0, z: z0 };
  const b = { x: x1, z: z1 };
  for (const quad of course.dashes) {
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

export const luigiCircuit = createTrack(LUIGI_PLAN, {
  id: 'luigi-circuit',
  perimRange: [190, 245],
  requireStartGrid: true,
});

export const PERIM = luigiCircuit.PERIM;
/** Start-straight asphalt half-width. Items and older contain paths still read this. */
export const HALF = luigiCircuit.HALF;
export const itemBoxProgress = luigiCircuit.itemBoxProgress;
export const poseAt = luigiCircuit.poseAt;
export const sampleTrack = luigiCircuit.sampleTrack;
export const followTrack = luigiCircuit.followTrack;
export const gridPose = luigiCircuit.gridPose;
export const trackVisuals = luigiCircuit.trackVisuals;
