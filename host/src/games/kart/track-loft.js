/** Pure Luigi Circuit loft. No Three. Physics arrays must be cloned before entry. */

export const STATION_STEP_M = 0.5;
export const MITER_LIMIT = 1.5;
const BEVEL_ANGLE = Math.PI / 9; // ~20° — sharper turns get a bevel, not a miter
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
  let rings = strokeVariableWidth(stations);
  enforceForwardRings(stations, rings);
  for (let iter = 0; iter < 12; iter++) {
    if (!firstIntersection(rings.inner) && !firstIntersection(rings.outer)) break;
    for (const st of stations) st.half *= 0.92;
    rings = strokeVariableWidth(stations);
    enforceForwardRings(stations, rings);
  }
  rings.selfCrossings = {
    inner: countIntersections(rings.inner),
    outer: countIntersections(rings.outer),
  };

  const sandDeep = stations.map((st, i) => {
    const scale = rings.miterScale[i];
    const nx = rings.nx[i];
    const nz = rings.nz[i];
    const lat = st.half + st.sandDepth;
    return {
      x: st.x - nx * lat * scale,
      y: 0,
      z: st.z - nz * lat * scale,
    };
  });

  const mesh = triangulate(stations, rings, sandDeep, worldRadius);
  const markings = planMarkings(stations, perim, dashQuads, grid);
  const atlas = rasterizeMarkings(markings);
  const curbInnerAtlas = stripeAtlas(0x2f9e44, 0xf4f4f4);
  const curbOuterAtlas = stripeAtlas(0xf4f4f4, 0x2f9e44);

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
  const n = stations.length;
  const inner = [];
  const outer = [];
  const miterScale = [];
  const nxArr = [];
  const nzArr = [];

  for (let i = 0; i < n; i++) {
    const prev = stations[(i - 1 + n) % n];
    const cur = stations[i];
    const next = stations[(i + 1) % n];

    let inX = cur.x - prev.x;
    let inZ = cur.z - prev.z;
    let outX = next.x - cur.x;
    let outZ = next.z - cur.z;
    const inLen = Math.hypot(inX, inZ) || 1;
    const outLen = Math.hypot(outX, outZ) || 1;
    inX /= inLen;
    inZ /= inLen;
    outX /= outLen;
    outZ /= outLen;

    const inNx = inZ;
    const inNz = -inX;
    const outNx = outZ;
    const outNz = -outX;

    const turn = Math.acos(clamp(inX * outX + inZ * outZ, -1, 1));
    let mx;
    let mz;
    let scale;
    if (turn > BEVEL_ANGLE) {
      // Bevel: use the bisector without lengthening past the half-width.
      mx = inNx + outNx;
      mz = inNz + outNz;
      const mLen = Math.hypot(mx, mz) || 1;
      mx /= mLen;
      mz /= mLen;
      scale = 1;
    } else {
      mx = inNx + outNx;
      mz = inNz + outNz;
      const mLen = Math.hypot(mx, mz);
      if (mLen < 1e-6) {
        mx = outNx;
        mz = outNz;
      } else {
        mx /= mLen;
        mz /= mLen;
      }
      const denom = Math.max(mx * outNx + mz * outNz, 1 / MITER_LIMIT);
      scale = 1 / denom;
    }

    // If the inner point would travel backward, collapse to the outgoing normal.
    const trialInX = cur.x - mx * cur.half * scale;
    const trialInZ = cur.z - mz * cur.half * scale;
    if (inner.length) {
      const px = trialInX - inner[inner.length - 1].x;
      const pz = trialInZ - inner[inner.length - 1].z;
      if (px * outX + pz * outZ < 0) {
        mx = outNx;
        mz = outNz;
        scale = 1;
      }
    }

    miterScale.push(scale);
    nxArr.push(mx);
    nzArr.push(mz);
    inner.push({
      x: cur.x - mx * cur.half * scale,
      y: ASPHALT_Y,
      z: cur.z - mz * cur.half * scale,
    });
    outer.push({
      x: cur.x + mx * cur.half * scale,
      y: ASPHALT_Y + cur.bankY,
      z: cur.z + mz * cur.half * scale,
    });
  }

  return { inner, outer, miterScale, nx: nxArr, nz: nzArr };
}

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
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

  const n = stations.length;

  // Grass disc (fan) under everything — separate footprint from road via lower y and no shared tris.
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
    indices.push(center, discVerts[i], discVerts[(i + 1) % discN]);
  }
  pushGroup('grass', grassStart, indices.length - grassStart);

  // Sand strips where depth > 0 (abut asphalt inner; no corridor double-fill).
  const sandStart = indices.length;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    if (stations[i].sandDepth < 1e-4 && stations[j].sandDepth < 1e-4) continue;
    const a = rings.inner[i];
    const b = rings.inner[j];
    const c = sandDeep[j];
    const d = sandDeep[i];
    const i0 = addVertex(a.x, a.y, a.z, 0, 1, 0, stations[i].progress, 0);
    const i1 = addVertex(b.x, b.y, b.z, 0, 1, 0, stations[j].progress, 0);
    const i2 = addVertex(c.x, 0, c.z, 0, 1, 0, stations[j].progress, 1);
    const i3 = addVertex(d.x, 0, d.z, 0, 1, 0, stations[i].progress, 1);
    indices.push(i0, i3, i1, i1, i3, i2);
  }
  pushGroup('sand', sandStart, indices.length - sandStart);

  // Asphalt strip with progress/lateral UVs for the atlas.
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
    indices.push(
      asphaltInner[i],
      asphaltOuter[i],
      asphaltInner[j],
      asphaltInner[j],
      asphaltOuter[i],
      asphaltOuter[j],
    );
  }
  pushGroup('asphalt', asphaltStart, indices.length - asphaltStart);

  // Inner curb shell (vertical + cap toward infield).
  const curbInStart = indices.length;
  emitCurb(rings.inner, rings.nx, rings.nz, -1, stations, addVertex, indices);
  pushGroup('curbInner', curbInStart, indices.length - curbInStart);

  // Outer curb shell (vertical + cap toward outside).
  const curbOutStart = indices.length;
  emitCurb(rings.outer, rings.nx, rings.nz, 1, stations, addVertex, indices);
  pushGroup('curbOuter', curbOutStart, indices.length - curbOutStart);

  return {
    positions: Float32Array.from(positions),
    normals: Float32Array.from(normals),
    uvs: Float32Array.from(uvs),
    indices: Uint32Array.from(indices),
    groups,
  };
}

function emitCurb(roadRing, nxArr, nzArr, side, stations, addVertex, indices) {
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

    // Vertical face.
    const v0 = addVertex(a.x, y0a, a.z, nxArr[i] * side, 0, nzArr[i] * side, u0, 0);
    const v1 = addVertex(b.x, y0b, b.z, nxArr[j] * side, 0, nzArr[j] * side, u1, 0);
    const v2 = addVertex(b.x, y1b, b.z, nxArr[j] * side, 0, nzArr[j] * side, u1, 0.5);
    const v3 = addVertex(a.x, y1a, a.z, nxArr[i] * side, 0, nzArr[i] * side, u0, 0.5);
    indices.push(v0, v1, v2, v0, v2, v3);

    // Cap.
    const c0 = addVertex(a.x, y1a, a.z, 0, 1, 0, u0, 0.5);
    const c1 = addVertex(b.x, y1b, b.z, 0, 1, 0, u1, 0.5);
    const c2 = addVertex(bx, y1b, bz, 0, 1, 0, u1, 1);
    const c3 = addVertex(ax, y1a, az, 0, 1, 0, u0, 1);
    indices.push(c0, c1, c2, c0, c2, c3);
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
    marks.push({ kind: 'boost', quad });
  }
  marks.push({ kind: 'edgeLine' });
  return marks;
}

function rasterizeMarkings(markings) {
  const width = ATLAS_WIDTH;
  const height = ATLAS_HEIGHT;
  const rgba = new Uint8ClampedArray(width * height * 4);
  // Base asphalt grey with grain.
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

  // Edge lines (white) near v=0 and v=1.
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
      // Approximate: paint orange chevron bands across outer lateral half for each dash span.
      // Without exact progress, stamp repeating chevrons on outer third.
    }
  }

  // Boost chevrons along outer lateral (atlas v high) — repeating pattern.
  for (let x = 0; x < width; x += 28) {
    for (let t = 0; t < 14; t++) {
      const yy0 = height * 0.55;
      const yy1 = height * 0.95;
      const mid = (yy0 + yy1) / 2;
      const half = (yy1 - yy0) / 2;
      const x0 = x + t;
      const x1 = x + t + 3;
      fillRect(x0, mid - half + t, x1, mid + half - t, 242, 122, 18);
    }
  }

  return { width, height, rgba };
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
        ringsOut.push([...run.ptsInner, ...[...run.ptsDeep].reverse()]);
      }
      run = null;
    }
  }
  return ringsOut;
}


function enforceForwardRings(stations, rings) {
  const n = stations.length;
  for (const key of ['inner', 'outer']) {
    const ring = rings[key];
    for (let pass = 0; pass < 3; pass++) {
      for (let i = 0; i < n; i++) {
        const prev = ring[(i - 1 + n) % n];
        const cur = stations[i];
        const next = stations[(i + 1) % n];
        let tx = next.x - prev.x;
        let tz = next.z - prev.z;
        const len = Math.hypot(tx, tz) || 1;
        tx /= len; tz /= len;
        const dx = ring[i].x - prev.x;
        const dz = ring[i].z - prev.z;
        if (dx * tx + dz * tz < 0.05) {
          const latx = ring[i].x - cur.x;
          const latz = ring[i].z - cur.z;
          ring[i] = {
            x: prev.x + tx * 0.05 + latx * 0.15,
            y: ring[i].y,
            z: prev.z + tz * 0.05 + latz * 0.15,
          };
        }
      }
    }
  }
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
      // Skip adjacent edges sharing a vertex.
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
