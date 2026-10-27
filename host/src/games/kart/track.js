import { LUIGI_PLAN } from './tracks/luigi-circuit-plan.js';
import { STATION_STEP_M, loftCourse } from './track-loft.js';

export const PROGRESS_CONTINUITY = 0.10;

const MAX_STEP_M = 6;
const SHOULDER_MIN_M = 8;
const SHOULDER_SLOPE = Math.tan((18 * Math.PI) / 180);

function readHeight(wp, key) {
  if (!Object.hasOwn(wp, key)) return 0;
  if (!Number.isFinite(wp[key])) throw new Error(`${wp.id}: ${key} must be finite`);
  return wp[key];
}

function shoulderWidth(bankOuterY) {
  return Math.max(SHOULDER_MIN_M, Math.abs(2 * bankOuterY) / SHOULDER_SLOPE);
}

function shoulderWidthSlope(bankOuterY) {
  if (Math.abs(2 * bankOuterY) / SHOULDER_SLOPE <= SHOULDER_MIN_M || bankOuterY === 0) return 0;
  return (2 * Math.sign(bankOuterY)) / SHOULDER_SLOPE;
}

function crossfall(lateral, half, bankOuterY) {
  if (lateral <= -half) return -bankOuterY;
  if (lateral <= half) return (bankOuterY * lateral) / half;
  const width = shoulderWidth(bankOuterY);
  if (lateral >= half + width) return -bankOuterY;
  const t = (lateral - half) / width;
  return bankOuterY * (1 - 2 * t);
}

function surfaceY(frame, lateral) {
  return frame.centerY + crossfall(lateral, frame.half, frame.bankOuterY);
}

function surfaceNormal(frame, region, lateral) {
  let dyLat = 0;
  let dyS = frame.dCenter - frame.dBank;
  if (region === 'asphalt') {
    const { half, bankOuterY, dBank, dHalf } = frame;
    dyLat = bankOuterY / half;
    dyS = frame.dCenter + (lateral * (dBank * half - bankOuterY * dHalf)) / (half * half);
  } else if (region === 'shoulder') {
    const grade = shoulderGrade(frame, lateral);
    dyLat = grade.dyLat;
    dyS = frame.dCenter + grade.dyS;
  }
  return unitNormal(frame, dyS, dyLat);
}

function shoulderGrade(frame, lateral) {
  const bank = frame.bankOuterY;
  const width = shoulderWidth(bank);
  const fromLip = lateral - frame.half;
  const dWidth = shoulderWidthSlope(bank) * frame.dBank;
  const num = bank * fromLip;
  const dNum = frame.dBank * fromLip - bank * frame.dHalf;
  const dQuot = (dNum * width - num * dWidth) / (width * width);
  return {
    dyLat: (-2 * bank) / width,
    dyS: frame.dBank - 2 * dQuot,
  };
}

function unitNormal(frame, dyS, dyLat) {
  const cx = dyS * frame.nz - frame.tz * dyLat;
  const cy = frame.tz * frame.nx - frame.tx * frame.nz;
  const cz = frame.tx * dyLat - dyS * frame.nx;
  const len = Math.hypot(cx, cy, cz);
  if (!(len > 1e-8)) return { x: 0, y: 1, z: 0 };
  return { x: cx / len, y: cy / len, z: cz / len };
}

function roadPoint(frame, lateral) {
  const width = shoulderWidth(frame.bankOuterY);
  let region = 'asphalt';
  if (lateral < -frame.half || lateral >= frame.half + width) region = 'shelf';
  else if (lateral > frame.half) region = 'shoulder';
  return {
    y: surfaceY(frame, lateral),
    normal: surfaceNormal(frame, region, lateral),
  };
}

function shelfPoint(frame) {
  return {
    y: surfaceY(frame, -frame.half),
    normal: surfaceNormal(frame, 'shelf', -frame.half),
  };
}

export function createTrack(plan, opts = {}) {
  const course = compile(plan, opts);
  const grid = plan.grid;
  const boxes = opts.itemBoxProgress ?? plan.itemBoxProgress;
  if (!Array.isArray(boxes)) {
    throw new Error('createTrack needs itemBoxProgress on opts or plan');
  }
  const itemBoxProgress = Object.freeze([...boxes]);

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
    if ('visualOuterY' in a) {
      throw new Error(`${a.id}: visualOuterY was replaced by centerY and bankOuterY`);
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
      center0: readHeight(a, 'centerY'),
      center1: readHeight(b, 'centerY'),
      bank0: readHeight(a, 'bankOuterY'),
      bank1: readHeight(b, 'bankOuterY'),
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
      centerY: edge.center0 + (edge.center1 - edge.center0) * uu,
      bankOuterY: edge.bank0 + (edge.bank1 - edge.bank0) * uu,
      dCenter: (edge.center1 - edge.center0) / edge.length,
      dBank: (edge.bank1 - edge.bank0) / edge.length,
      dHalf: (edge.half1 - edge.half0) / edge.length,
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
    feather: readFeather(band),
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
    const widthAt = (i, n) => {
      const t = n <= 1 ? 0 : i / (n - 1);
      return 2.4 + Math.sin(Math.PI * t) * spec.reach;
    };
    const sides = ribbonSides(center, widthAt);
    const poly = [...sides.left, ...sides.right.slice().reverse()];
    const span = forwardSpan(s0, s1);
    const jump = length < 1e-3 ? Infinity : (MAX_STEP_M / length) * span;
    if (!(jump <= PROGRESS_CONTINUITY)) {
      throw new Error(`${spec.id} progress jump ${jump.toFixed(3)} exceeds budget`);
    }
    const left = [];
    const right = [];
    for (let i = 0; i < center.length; i++) {
      const t = center.length <= 1 ? 0 : i / (center.length - 1);
      const progress = wrap01(s0 + t * span);
      const shelf = shelfPoint(poseAtSLocal(progress * perim));
      left.push(paintShelf(sides.left[i], shelf));
      right.push(paintShelf(sides.right[i], shelf));
    }
    return { id: spec.id, s0, s1, length, center, poly, left, right };
  });

  let worldRadius = 0;
  const consider = (x, z) => {
    worldRadius = Math.max(worldRadius, Math.hypot(x, z));
  };
  for (let s = 0; s <= perim; s += 2) {
    const pose = poseAtSLocal(Math.min(s, perim - 1e-4));
    const foot = pose.half + shoulderWidth(pose.bankOuterY);
    consider(pose.x + pose.nx * foot, pose.z + pose.nz * foot);
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

  const course = {
    perim,
    edges,
    sand,
    dashes,
    corridors,
    worldRadius,
    poseAtSLocal,
    frameOnEdge,
  };
  const stations = bakeStations(course);
  const meadow = bakeMeadow(course, stations);
  const visuals = loftCourse({
    perim,
    stations,
    dashQuads: structuredClone(dashes),
    corridors: corridors.map((corridor) => ({
      id: corridor.id,
      ribbon: { left: corridor.left, right: corridor.right },
      outline: corridor.poly,
    })),
    worldRadius,
    grid: plan.grid,
    meadow,
  });

  return {
    perim,
    edges,
    sand,
    dashes,
    corridors,
    worldRadius,
    poseAtSLocal,
    frameOnEdge,
    visuals,
  };
}

function locate(course, x, z, seed) {
  const windowed = seed == null ? null : nearestEdge(course, x, z, seed);
  if (windowed && Math.abs(windowed.lateral) <= windowed.half + 1e-4) {
    return describePoint(course, windowed, x, z, 'asphalt');
  }
  if (seed != null) {
    const cut = locateCorridor(course, x, z, seed);
    if (cut) return cut;
  }
  const proj = windowed ?? nearestEdge(course, x, z, null);
  return describePoint(course, proj, x, z, surfaceAt(course, proj));
}

function nearestEdge(course, x, z, seed) {
  let best = null;
  for (const edge of course.edges) {
    const proj = projectEdge(course, edge, x, z);
    if (seed != null && circDist(proj.progress, seed) > PROGRESS_CONTINUITY) continue;
    if (!best || proj.dist2 < best.dist2) best = proj;
  }
  return best;
}

function surfaceAt(course, proj) {
  const depth = sandDepthAt(course, proj.progress);
  if (Math.abs(proj.lateral) <= proj.half + 1e-4) return 'asphalt';
  if (proj.lateral < 0 && -proj.lateral <= proj.half + depth) return 'sand';
  return 'grass';
}

function describePoint(course, proj, x, z, surface) {
  const contact = roadPoint(proj.frame, proj.lateral);
  return {
    cx: proj.cx,
    cz: proj.cz,
    tx: proj.tx,
    tz: proj.tz,
    lateral: proj.lateral,
    progress: proj.progress,
    dirX: proj.dirX,
    dirZ: proj.dirZ,
    halfWidth: proj.half,
    surface,
    onDash: pointInDash(course, x, z),
    y: contact.y,
    normal: contact.normal,
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
  const frame = course.poseAtSLocal(progress * course.perim);
  const lx = x - frame.x;
  const lz = z - frame.z;
  const roadLat = lx * frame.nx + lz * frame.nz;
  if (roadLat >= -frame.half) return null;
  const ld = Math.hypot(lx, lz);
  const shelf = shelfPoint(frame);
  return {
    cx: frame.x,
    cz: frame.z,
    tx: frame.tx,
    tz: frame.tz,
    lateral: roadLat,
    progress,
    dirX: ld < 1e-6 ? 0 : lx / ld,
    dirZ: ld < 1e-6 ? 0 : lz / ld,
    halfWidth: frame.half,
    surface: 'sand',
    onDash: pointInDash(course, x, z),
    y: shelf.y,
    normal: shelf.normal,
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
  const frame = course.frameOnEdge(edge, u);
  const ld = Math.hypot(lx, lz);
  return {
    cx,
    cz,
    tx: edge.tx,
    tz: edge.tz,
    lateral,
    progress,
    half: frame.half,
    frame,
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
    if (rel > span + 1e-6) continue;
    let next = band.depth;
    if (band.feather > 0) {
      const near = Math.min(rel, span - rel) * course.perim;
      if (near < band.feather) next *= near / band.feather;
    }
    depth = Math.max(depth, next);
  }
  return depth;
}

function readFeather(band) {
  if (!Object.hasOwn(band, 'feather')) return 0;
  if (!(band.feather >= 0)) throw new Error(`${band.from}: feather must be >= 0`);
  return band.feather;
}

function paintShelf(point, shelf) {
  return {
    x: point.x,
    y: shelf.y,
    z: point.z,
    nx: shelf.normal.x,
    ny: shelf.normal.y,
    nz: shelf.normal.z,
  };
}

function railAt(frame, lateral, region) {
  const normal = surfaceNormal(frame, region, lateral);
  return {
    x: frame.x + frame.nx * lateral,
    y: surfaceY(frame, lateral),
    z: frame.z + frame.nz * lateral,
    nx: normal.x,
    ny: normal.y,
    nz: normal.z,
  };
}

function bakeStations(course) {
  const stations = [];
  for (const edge of course.edges) {
    const steps = Math.max(1, Math.ceil(edge.length / STATION_STEP_M));
    for (let i = 0; i < steps; i++) {
      const frame = course.frameOnEdge(edge, i / steps);
      const sandDepth = sandDepthAt(course, frame.progress);
      const inner = railAt(frame, -frame.half, 'asphalt');
      const outer = railAt(frame, frame.half, 'asphalt');
      const lipNormal = surfaceNormal(frame, 'shelf', -frame.half);
      const width = shoulderWidth(frame.bankOuterY);
      const bermFoot = railAt(frame, frame.half + width, 'shoulder');
      const groundNormal = surfaceNormal(frame, 'shelf', frame.half + width);
      stations.push({
        progress: frame.progress,
        heading: frame.heading,
        half: frame.half,
        sandDepth,
        x: frame.x,
        z: frame.z,
        nx: frame.nx,
        nz: frame.nz,
        inner,
        outer,
        sandLip: { x: inner.x, y: inner.y, z: inner.z, nx: lipNormal.x, ny: lipNormal.y, nz: lipNormal.z },
        sandDeep: railAt(frame, -(frame.half + sandDepth), 'shelf'),
        bermLip: railAt(frame, frame.half, 'shoulder'),
        bermFoot,
        bermGround: {
          x: bermFoot.x,
          y: bermFoot.y,
          z: bermFoot.z,
          nx: groundNormal.x,
          ny: groundNormal.y,
          nz: groundNormal.z,
        },
      });
    }
  }
  if (stations.length < 3) throw new Error('track needs at least 3 stations');
  return stations;
}

function bakeMeadow(course, stations) {
  const quads = [];
  const feet = stations.map((station) => station.bermGround);
  const rims = feet.map((foot, index) => {
    const station = stations[index];
    const rim = rayToRadius(foot.x, foot.z, station.nx, station.nz, course.worldRadius);
    return contactRail(course, rim.x, rim.z);
  });
  pushStrip(quads, feet, rims);

  const boundary = stations.map((station) => station.sandDeep);
  let cx = 0;
  let cz = 0;
  for (const point of boundary) {
    cx += point.x;
    cz += point.z;
  }
  cx /= boundary.length;
  cz /= boundary.length;
  let reach = 0;
  for (const point of boundary) reach = Math.max(reach, Math.hypot(point.x - cx, point.z - cz));
  const rings = Math.max(2, Math.ceil(reach / 4));
  let prev = boundary;
  for (let ring = 1; ring <= rings; ring++) {
    const scale = ring / (rings + 1);
    const next = boundary.map((point) => contactRail(
      course,
      point.x + (cx - point.x) * scale,
      point.z + (cz - point.z) * scale,
    ));
    pushStrip(quads, prev, next);
    prev = next;
  }
  const hub = contactRail(course, cx, cz);
  for (let i = 0; i < prev.length; i++) {
    quads.push([prev[i], prev[(i + 1) % prev.length], hub, hub]);
  }
  return quads;
}

function contactRail(course, x, z) {
  const hit = locate(course, x, z, null);
  return {
    x,
    y: hit.y,
    z,
    nx: hit.normal.x,
    ny: hit.normal.y,
    nz: hit.normal.z,
  };
}

function pushStrip(quads, inner, outer) {
  const count = inner.length;
  for (let i = 0; i < count; i++) {
    const j = (i + 1) % count;
    quads.push([inner[i], inner[j], outer[j], outer[i]]);
  }
}

function rayToRadius(x, z, nx, nz, radius) {
  const radial = Math.hypot(x, z) || 1;
  const outward = x * nx + z * nz;
  if (outward <= 0.05) return { x: (x / radial) * radius, z: (z / radial) * radius };
  const c = radial * radial - radius * radius;
  const disc = outward * outward - c;
  if (c >= 0 || disc < 0) return { x: (x / radial) * radius, z: (z / radial) * radius };
  const t = -outward + Math.sqrt(disc);
  if (!(t > 0)) return { x: (x / radial) * radius, z: (z / radial) * radius };
  return { x: x + nx * t, z: z + nz * t };
}

function poseOn(course, t) {
  const hit = course.poseAtSLocal(wrap01(t) * course.perim);
  return {
    x: hit.x,
    z: hit.z,
    y: hit.centerY,
    heading: hit.heading,
    halfWidth: hit.half,
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

function ribbonSides(center, widthAt) {
  const left = [];
  const right = [];
  const count = center.length;
  for (let i = 0; i < count; i++) {
    const prev = center[Math.max(0, i - 1)];
    const next = center[Math.min(count - 1, i + 1)];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const mag = Math.hypot(tx, tz) || 1;
    tx /= mag;
    tz /= mag;
    const nx = tz;
    const nz = -tx;
    const width = widthAt(i, count);
    left.push({ x: center[i].x + nx * width, z: center[i].z + nz * width });
    right.push({ x: center[i].x - nx * width, z: center[i].z - nz * width });
  }
  return { left, right };
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
  perimRange: LUIGI_PLAN.perimRange,
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
