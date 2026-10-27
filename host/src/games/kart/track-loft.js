/** Pure Luigi Circuit loft. No Three. Physics arrays must be cloned before entry. */

export const STATION_STEP_M = 0.5;
export const CURB_WIDTH_M = 0.4;
export const CURB_HEIGHT_M = 0.09;
export const ATLAS_WIDTH = 2048;
export const ATLAS_HEIGHT = 256;

export const MATERIALS = Object.freeze([
  'grass',
  'sand',
  'asphalt',
  'curbInner',
  'curbOuter',
]);

const ASPHALT_Y = 0.02;

export function loftCourse(input) {
  const { perim, edges, sandBands, dashQuads, worldRadius, grid } = input;
  if (!(perim > 0) || !edges?.length) throw new Error('loftCourse needs edges and perim');

  const stations = sampleStations(edges, perim, sandBands);
  const rings = strokeVariableWidth(stations);

  const sandDeep = stations.map((st, i) => {
    const nx = rings.nx[i];
    const nz = rings.nz[i];
    const lat = st.half + st.sandDepth;
    return {
      x: st.x - nx * lat,
      y: 0,
      z: st.z - nz * lat,
    };
  });

  const mesh = triangulate(stations, rings, sandDeep, worldRadius);
  const markings = planMarkings(stations, perim, dashQuads, grid);
  const atlas = rasterizeMarkings(markings);
  const curbInnerAtlas = stripeAtlas(0x1f8a2e, 0xffffff);
  const curbOuterAtlas = stripeAtlas(0xffffff, 0x1f8a2e);

  const sandOutline = sandRingsFrom(stations, rings, sandDeep);
  const outline = {
    inner: rings.inner.map((p) => ({ x: p.x, z: p.z })),
    outer: rings.outer.map((p) => ({ x: p.x, z: p.z })),
    sand: sandOutline,
    dashes: (dashQuads || []).map((quad) => quad.map((p) => ({ x: p.x, z: p.z }))),
    stripe: {
      x: stations[0].x,
      z: stations[0].z,
      heading: stations[0].heading,
      width: stations[0].half * 2,
      depth: 1.2,
    },
  };

  return deepFreeze({
    grassRadius: worldRadius,
    mesh,
    atlas,
    curbInnerAtlas,
    curbOuterAtlas,
    outline,
  });
}

function sampleStations(edges, perim, sandBands) {
  const stations = [];
  for (const edge of edges) {
    const steps = Math.max(1, Math.ceil(edge.length / STATION_STEP_M));
    for (let i = 0; i < steps; i++) {
      const u = i / steps;
      const s = edge.s0 + edge.length * u;
      const progress = wrap01(s / perim);
      const half = edge.half0 + (edge.half1 - edge.half0) * u;
      const bankY = edge.y0 + (edge.y1 - edge.y0) * u;
      stations.push({
        s,
        progress,
        x: edge.x0 + (edge.x1 - edge.x0) * u,
        z: edge.z0 + (edge.z1 - edge.z0) * u,
        tx: edge.tx,
        tz: edge.tz,
        nx: edge.nx,
        nz: edge.nz,
        half,
        bankY,
        sandDepth: sandDepthAt(sandBands, progress),
        heading: Math.atan2(edge.tx, edge.tz),
      });
    }
  }
  if (stations.length < 3) throw new Error('loft needs at least 3 stations');
  return stations;
}

function strokeVariableWidth(stations) {
  const inner = [];
  const outer = [];
  const nxArr = [];
  const nzArr = [];

  for (const cur of stations) {
    nxArr.push(cur.nx);
    nzArr.push(cur.nz);
    inner.push({
      x: cur.x - cur.nx * cur.half,
      y: ASPHALT_Y,
      z: cur.z - cur.nz * cur.half,
    });
    outer.push({
      x: cur.x + cur.nx * cur.half,
      y: ASPHALT_Y + cur.bankY,
      z: cur.z + cur.nz * cur.half,
    });
  }
  // A sharp corner's inside offset loops back on itself. Clip that short chain
  // onto the crossing instead of shrinking the whole road.
  clipOffsetLoops(inner);
  clipOffsetLoops(outer);

  return { inner, outer, nx: nxArr, nz: nzArr };
}

function triangulate(stations, rings, sandDeep, worldRadius) {
  const positions = [];
  const normals = [];
  const uvs = [];
  const indices = [];
  const groups = [];

  function addVertex(x, y, z, nx, ny, nz, u, v) {
    positions.push(x, y, z);
    normals.push(nx, ny, nz);
    uvs.push(u, v);
    return positions.length / 3 - 1;
  }

  function pushGroup(material, start, count) {
    if (count > 0) groups.push({ material, start, count });
  }

  function triCross(ia, ib, ic) {
    const ax = positions[ia * 3];
    const ay = positions[ia * 3 + 1];
    const az = positions[ia * 3 + 2];
    const bx = positions[ib * 3];
    const by = positions[ib * 3 + 1];
    const bz = positions[ib * 3 + 2];
    const cx = positions[ic * 3];
    const cy = positions[ic * 3 + 1];
    const cz = positions[ic * 3 + 2];
    const ux = bx - ax;
    const uy = by - ay;
    const uz = bz - az;
    const vx = cx - ax;
    const vy = cy - ay;
    const vz = cz - az;
    return {
      x: uy * vz - uz * vy,
      y: uz * vx - ux * vz,
      z: ux * vy - uy * vx,
    };
  }

  function pushTriFacing(ia, ib, ic, nx, ny, nz) {
    const cross = triCross(ia, ib, ic);
    if (cross.x * nx + cross.y * ny + cross.z * nz >= 0) indices.push(ia, ib, ic);
    else indices.push(ia, ic, ib);
  }

  function pushQuadFacing(i0, i1, i2, i3, nx, ny, nz) {
    pushTriFacing(i0, i1, i2, nx, ny, nz);
    pushTriFacing(i0, i2, i3, nx, ny, nz);
  }

  const n = stations.length;

  const grassStart = indices.length;
  const grassY = 0;
  const center = addVertex(0, grassY, 0, 0, 1, 0, 0.5, 0.5);
  const discN = 72;
  const discVerts = [];
  for (let i = 0; i < discN; i++) {
    const a = (i / discN) * Math.PI * 2;
    discVerts.push(
      addVertex(
        Math.cos(a) * worldRadius,
        grassY,
        Math.sin(a) * worldRadius,
        0,
        1,
        0,
        (Math.cos(a) + 1) / 2,
        (Math.sin(a) + 1) / 2,
      ),
    );
  }
  for (let i = 0; i < discN; i++) {
    pushTriFacing(center, discVerts[i], discVerts[(i + 1) % discN], 0, 1, 0);
  }
  pushGroup('grass', grassStart, indices.length - grassStart);

  const sandStart = indices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (stations[i].sandDepth < 1e-4 && stations[j].sandDepth < 1e-4) continue;
    const a = rings.inner[i];
    const b = rings.inner[j];
    const c = sandDeep[j];
    const d = sandDeep[i];
    // A band edge has depth 0, so its deep sample sits on the inner lip.
    // Dropping that lip to y=0 stands the last quad on a vertical edge.
    const spanI = Math.hypot(a.x - d.x, a.z - d.z);
    const spanJ = Math.hypot(b.x - c.x, b.z - c.z);
    if (spanI < 0.05 && spanJ < 0.05) continue;
    const i0 = addVertex(a.x, a.y, a.z, 0, 1, 0, stations[i].progress, 0);
    const i1 = addVertex(b.x, b.y, b.z, 0, 1, 0, stations[j].progress, 0);
    const i2 = addVertex(c.x, b.y, c.z, 0, 1, 0, stations[j].progress, 1);
    const i3 = addVertex(d.x, a.y, d.z, 0, 1, 0, stations[i].progress, 1);
    pushQuadFacing(i0, i1, i2, i3, 0, 1, 0);
  }
  pushGroup('sand', sandStart, indices.length - sandStart);

  const asphaltStart = indices.length;
  const asphaltInner = [];
  const asphaltOuter = [];
  for (let i = 0; i < n; i++) {
    const inn = rings.inner[i];
    const out = rings.outer[i];
    asphaltInner.push(addVertex(inn.x, inn.y, inn.z, 0, 1, 0, stations[i].progress, 0));
    asphaltOuter.push(addVertex(out.x, out.y, out.z, 0, 1, 0, stations[i].progress, 1));
  }
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    pushQuadFacing(asphaltInner[i], asphaltOuter[i], asphaltOuter[j], asphaltInner[j], 0, 1, 0);
  }
  pushGroup('asphalt', asphaltStart, indices.length - asphaltStart);

  const curbInStart = indices.length;
  emitCurb(rings.inner, rings.nx, rings.nz, -1, stations, addVertex, pushQuadFacing);
  pushGroup('curbInner', curbInStart, indices.length - curbInStart);

  const curbOutStart = indices.length;
  emitCurb(rings.outer, rings.nx, rings.nz, 1, stations, addVertex, pushQuadFacing);
  pushGroup('curbOuter', curbOutStart, indices.length - curbOutStart);

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(indices),
    groups,
  };
}

function emitCurb(roadRing, nxArr, nzArr, side, stations, addVertex, pushQuadFacing) {
  const n = roadRing.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const a = roadRing[i];
    const b = roadRing[j];
    const ax = a.x + nxArr[i] * side * CURB_WIDTH_M;
    const az = a.z + nzArr[i] * side * CURB_WIDTH_M;
    const bx = b.x + nxArr[j] * side * CURB_WIDTH_M;
    const bz = b.z + nzArr[j] * side * CURB_WIDTH_M;
    const y0a = a.y;
    const y0b = b.y;
    const y1a = a.y + CURB_HEIGHT_M;
    const y1b = b.y + CURB_HEIGHT_M;
    const u0 = stations[i].progress;
    const u1 = stations[j].progress;

    const nx = (nxArr[i] + nxArr[j]) * 0.5 * side;
    const nz = (nzArr[i] + nzArr[j]) * 0.5 * side;
    const v0 = addVertex(a.x, y0a, a.z, nxArr[i] * side, 0, nzArr[i] * side, u0, 0);
    const v1 = addVertex(b.x, y0b, b.z, nxArr[j] * side, 0, nzArr[j] * side, u1, 0);
    const v2 = addVertex(b.x, y1b, b.z, nxArr[j] * side, 0, nzArr[j] * side, u1, 0.5);
    const v3 = addVertex(a.x, y1a, a.z, nxArr[i] * side, 0, nzArr[i] * side, u0, 0.5);
    pushQuadFacing(v0, v1, v2, v3, nx, 0, nz);

    const c0 = addVertex(a.x, y1a, a.z, 0, 1, 0, u0, 0.5);
    const c1 = addVertex(b.x, y1b, b.z, 0, 1, 0, u1, 0.5);
    const c2 = addVertex(bx, y1b, bz, 0, 1, 0, u1, 1);
    const c3 = addVertex(ax, y1a, az, 0, 1, 0, u0, 1);
    pushQuadFacing(c0, c1, c2, c3, 0, 1, 0);
  }
}

function planMarkings(stations, perim, dashQuads, grid) {
  const marks = [];
  marks.push({ kind: 'checker', progress: 0, depth: 1.2 / perim });
  if (grid) {
    for (let i = 0; i < 12; i++) {
      const row = Math.floor(i / 2);
      const col = i % 2;
      const back = (grid.frontMeters + row * grid.rowMeters) / perim;
      marks.push({
        kind: 'grid',
        progress: wrap01(-back),
        lat: col === 0 ? -0.35 : 0.35,
      });
    }
  }
  for (const quad of dashQuads || []) {
    const span = dashSpan(stations, quad);
    if (span) marks.push({ kind: 'boost', ...span });
  }
  marks.push({ kind: 'edgeLine' });
  return marks;
}

function rasterizeMarkings(markings) {
  const width = ATLAS_WIDTH;
  const height = ATLAS_HEIGHT;
  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      const grain = ((x * 17 + y * 31) % 13) - 6;
      rgba[i] = 109 + grain;
      rgba[i + 1] = 114 + grain;
      rgba[i + 2] = 122 + grain;
      rgba[i + 3] = 255;
    }
  }

  function setPx(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= width || y >= height) return;
    const i = (y * width + x) * 4;
    rgba[i] = r;
    rgba[i + 1] = g;
    rgba[i + 2] = b;
    rgba[i + 3] = a;
  }

  function fillRect(x0, y0, x1, y1, r, g, b) {
    const xa = Math.max(0, Math.floor(Math.min(x0, x1)));
    const xb = Math.min(width - 1, Math.ceil(Math.max(x0, x1)));
    const ya = Math.max(0, Math.floor(Math.min(y0, y1)));
    const yb = Math.min(height - 1, Math.ceil(Math.max(y0, y1)));
    for (let y = ya; y <= yb; y++) {
      for (let x = xa; x <= xb; x++) setPx(x, y, r, g, b);
    }
  }

  fillRect(0, 0, width, 4, 244, 244, 244);
  fillRect(0, height - 4, width, height, 244, 244, 244);

  for (const mark of markings) {
    if (mark.kind === 'checker') {
      const x0 = 0;
      const x1 = Math.max(4, Math.floor(mark.depth * width));
      const cols = 12;
      const rows = 2;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const dark = (row + col) % 2 === 0;
          const tone = dark ? 20 : 240;
          const xa = x0 + (col / cols) * (x1 - x0);
          const xb = x0 + ((col + 1) / cols) * (x1 - x0);
          const ya = (row / rows) * height;
          const yb = ((row + 1) / rows) * height;
          fillRect(xa, ya, xb, yb, tone, tone, tone);
        }
      }
    }
    if (mark.kind === 'grid') {
      const cx = Math.floor(wrap01(mark.progress) * width);
      const cy = Math.floor(((mark.lat + 1) / 2) * height);
      fillRect(cx - 6, cy - 10, cx + 6, cy + 10, 247, 247, 247);
    }
    if (mark.kind === 'boost') {
      paintBoost(mark);
    }
  }

  function paintBoost(mark) {
    const windows = [];
    const xStart = wrap01(mark.progress) * width;
    const xLen = mark.span * width;
    if (xStart + xLen <= width) windows.push([xStart, xStart + xLen]);
    else {
      windows.push([xStart, width]);
      windows.push([0, xStart + xLen - width]);
    }
    const y0 = ((mark.lat0 + 1) / 2) * height;
    const y1 = ((mark.lat1 + 1) / 2) * height;
    for (const [xa, xb] of windows) {
      const start = Math.floor(xa / 28) * 28;
      for (let x = start; x < xb; x += 28) {
        for (let t = 0; t < 14; t++) {
          const mid = (y0 + y1) / 2;
          const half = Math.abs(y1 - y0) / 2;
          const x0 = Math.max(xa, x + t);
          const x1 = Math.min(xb, x + t + 3);
          if (x1 <= x0) continue;
          fillRect(x0, mid - half + t, x1, mid + half - t, 255, 110, 8);
        }
      }
    }
  }

  return { width, height, rgba };
}

function dashSpan(stations, quad) {
  const samples = [];
  for (const p of quad) samples.push(projectStation(stations, p.x, p.z));
  if (!samples.length) return null;
  const origin = samples[0].progress;
  let minP = 0;
  let maxP = 0;
  let lat0 = Infinity;
  let lat1 = -Infinity;
  for (const sample of samples) {
    let delta = sample.progress - origin;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    if (delta < minP) minP = delta;
    if (delta > maxP) maxP = delta;
    if (sample.lat < lat0) lat0 = sample.lat;
    if (sample.lat > lat1) lat1 = sample.lat;
  }
  if (!(maxP > minP)) return null;
  return {
    progress: wrap01(origin + minP),
    span: maxP - minP,
    lat0,
    lat1,
  };
}

function projectStation(stations, x, z) {
  let best = Infinity;
  let hit = null;
  for (const station of stations) {
    const dx = x - station.x;
    const dz = z - station.z;
    const dist2 = dx * dx + dz * dz;
    if (dist2 < best) {
      best = dist2;
      hit = {
        progress: station.progress,
        lat: (dx * station.nx + dz * station.nz) / (station.half || 1),
      };
    }
  }
  return hit;
}

function stripeAtlas(a, b) {
  const width = 64;
  const height = 16;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const ca = [(a >> 16) & 255, (a >> 8) & 255, a & 255];
  const cb = [(b >> 16) & 255, (b >> 8) & 255, b & 255];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const on = Math.floor(x / 8) % 2 === 0;
      const c = on ? ca : cb;
      const i = (y * width + x) * 4;
      rgba[i] = c[0];
      rgba[i + 1] = c[1];
      rgba[i + 2] = c[2];
      rgba[i + 3] = 255;
    }
  }
  return { width, height, rgba };
}

function sandRingsFrom(stations, rings, sandDeep) {
  const ringsOut = [];
  let run = null;
  const n = stations.length;
  for (let i = 0; i < n; i++) {
    const active = stations[i].sandDepth > 1e-4;
    if (active && !run) run = { start: i, ptsInner: [], ptsDeep: [] };
    if (active && run) {
      run.ptsInner.push({ x: rings.inner[i].x, z: rings.inner[i].z });
      run.ptsDeep.push({ x: sandDeep[i].x, z: sandDeep[i].z });
    }
    if ((!active || i === n - 1) && run) {
      if (run.ptsInner.length >= 2) {
        const poly = [...run.ptsInner, ...[...run.ptsDeep].reverse()];
        clipOffsetLoops(poly);
        ringsOut.push(poly);
      }
      run = null;
    }
  }
  return ringsOut;
}


function clipOffsetLoops(ring) {
  const n = ring.length;
  let previous = Infinity;
  for (let pass = 0; pass < n; pass++) {
    const hit = firstIntersection(ring);
    if (!hit) return;
    const left = countIntersections(ring);
    if (left >= previous) return;
    previous = left;
    const a = ring[hit.i];
    const b = ring[(hit.i + 1) % n];
    const c = ring[hit.j];
    const d = ring[(hit.j + 1) % n];
    const pt = segmentIntersection(a, b, c, d);
    if (!pt) return;
    const forward = hit.j - hit.i;
    const backward = hit.i + n - hit.j;
    const fromEdge = forward <= backward ? hit.i : hit.j;
    const toEdge = forward <= backward ? hit.j : hit.i;
    const verts = [];
    let k = (fromEdge + 1) % n;
    const stop = (toEdge + 1) % n;
    while (k !== stop && verts.length < n) {
      verts.push(k);
      k = (k + 1) % n;
    }
    const tail = ring[stop];
    let dx = tail.x - pt.x;
    let dz = tail.z - pt.z;
    const len = Math.hypot(dx, dz);
    if (len < 1e-8) {
      dx = 1;
      dz = 0;
    } else {
      dx /= len;
      dz /= len;
    }
    for (let t = 0; t < verts.length; t++) {
      const along = ((t + 1) / (verts.length + 1)) * 0.02;
      const idx = verts[t];
      ring[idx] = {
        x: pt.x + dx * along,
        y: pt.y,
        z: pt.z + dz * along,
      };
    }
  }
}

function segmentIntersection(a, b, c, d) {
  const rx = b.x - a.x;
  const rz = b.z - a.z;
  const sx = d.x - c.x;
  const sz = d.z - c.z;
  const den = rx * sz - rz * sx;
  if (Math.abs(den) < 1e-14) return null;
  const t = ((c.x - a.x) * sz - (c.z - a.z) * sx) / den;
  const y0 = a.y ?? 0;
  const y1 = b.y ?? y0;
  return { x: a.x + t * rx, y: y0 + t * (y1 - y0), z: a.z + t * rz };
}

function firstIntersection(ring) {
  const n = ring.length;
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      if (i === 0 && j === n - 1) continue;
      if (segmentsCross(a, b, ring[j], ring[(j + 1) % n])) return { i, j };
    }
  }
  return null;
}

function countIntersections(ring) {
  let n = 0;
  const len = ring.length;
  for (let i = 0; i < len; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % len];
    for (let j = i + 1; j < len; j++) {
      if ((j + 1) % len === i || (i + 1) % len === j) continue;
      if (i === 0 && j === len - 1) continue;
      if (segmentsCross(a, b, ring[j], ring[(j + 1) % len])) n += 1;
    }
  }
  return n;
}

export function assertSimple(ring, label = 'ring') {
  const n = ring.length;
  if (n < 3) throw new Error(`${label} needs 3+ points`);
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    if (Math.hypot(b.x - a.x, b.z - a.z) < 1e-6) {
      throw new Error(`${label} duplicate consecutive point at ${i}`);
    }
  }
  for (let i = 0; i < n; i++) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      if (j === (i + 1) % n) continue;
      const c = ring[j];
      const d = ring[(j + 1) % n];
      if ((j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsCross(a, b, c, d)) {
        throw new Error(`${label} self-intersects at edges ${i} and ${j}`);
      }
    }
  }
}

function segmentsCross(a, b, c, d) {
  const ab = side(a, b, c) * side(a, b, d);
  const cd = side(c, d, a) * side(c, d, b);
  return ab < 0 && cd < 0;
}

function side(p, q, r) {
  return (q.x - p.x) * (r.z - p.z) - (q.z - p.z) * (r.x - p.x);
}

function sandDepthAt(sandBands, progress) {
  let depth = 0;
  for (const band of sandBands || []) {
    const span = forwardSpan(band.p0, band.p1);
    const rel = forwardSpan(band.p0, progress);
    if (rel <= span + 1e-6) depth = Math.max(depth, band.depth);
  }
  return depth;
}

function forwardSpan(from, to) {
  let d = to - from;
  if (d < 0) d += 1;
  return d;
}

function wrap01(t) {
  return ((t % 1) + 1) % 1;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return value;
  for (const key of Object.keys(value)) deepFreeze(value[key]);
  return Object.freeze(value);
}
