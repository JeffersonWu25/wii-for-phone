// Track engine: pure geometry + queries from a track definition (no three.js). Track data lives in tracks/.
// Heading h: forward = (cos h, 0, sin h), right = (-sin h, 0, cos h); right turns increase h.
// Lateral > 0 is to the right of the centerline.
//
// A definition is { id, name, pieces, elevation, boostPads, itemRows, ramps, grid, terrain, sectionNames }.
//   pieces[]: { tag, kind: 'straight'|'arc', length | turn/angle/radius, width, bank?, left, right, section?, surface?, tunnel? }
//   elevation: { points: [{ piece, at: 'start'|'end'|meters, h }], smoothing? }. Without `smoothing` the points are joined
//     by cosine steps (flat at every point); with it they are joined by straight ramps then box-blurred over that many meters.
//   terrain(x, z, dist): height of the world beyond the corridor, dist = distance from the road limit.
//   distantTerrain?(x, z): height of the far field outside the dense terrain patch; omit to keep the default hills and ridges.

// ── Data ─────────────────────────────────────────────────────────────────────

export const SAMPLE_STEP = 0.5;
export const CURB_WIDTH = 1.2;
export const CHECKPOINT_COUNT = 8;
export const TRANSITION = 20; // m over which width / bank blend between pieces
const PAD_LENGTH = 6;
const PAD_WIDTH = 4;
const DEFAULT_GRID = { cols: 2, colGap: 8, rowGap: 8 };

export const edge = (curb, runoff, runoffWidth, wall = false) => ({ curb, runoff, runoffWidth, wall });
export const grass = (w = 12) => edge(false, 'grass', w);
// A solid edge right at the road (or its curb): no runoff at all.
export const hard = (curb = false) => edge(curb, 'none', 0, true);

// ── Helpers ──────────────────────────────────────────────────────────────────

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smoothstep = (t) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};

export function pieceLength(p) {
  return p.kind === 'straight' ? p.length : (p.radius * p.angle * Math.PI) / 180;
}

function smoothCircular(arr, n, radius) {
  const out = new Float64Array(n);
  const span = 2 * radius + 1;
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += arr[(i + k + n * 4) % n];
    out[i] = sum / span;
  }
  return out;
}

// Per-sample { y, grade } for the control points `elev` ({ s, h }, ascending, closed at both ends).
function elevationProfile(elev, smoothing, N, ds) {
  if (!smoothing) {
    return (n) => {
      const s = n * ds;
      for (let i = 0; i < elev.length - 1; i++) {
        const a = elev[i];
        const b = elev[i + 1];
        if (s >= a.s && s <= b.s && b.s > a.s) {
          const t = (s - a.s) / (b.s - a.s);
          return {
            y: a.h + ((b.h - a.h) * (1 - Math.cos(Math.PI * t))) / 2,
            grade: ((b.h - a.h) * Math.PI * Math.sin(Math.PI * t)) / (2 * (b.s - a.s)),
          };
        }
      }
      return { y: 0, grade: 0 };
    };
  }
  const raw = new Float64Array(N);
  let seg = 0;
  for (let n = 0; n < N; n++) {
    const s = n * ds;
    while (seg < elev.length - 2 && s > elev[seg + 1].s) seg++;
    const a = elev[seg];
    const b = elev[seg + 1];
    raw[n] = b.s > a.s ? lerp(a.h, b.h, clamp((s - a.s) / (b.s - a.s), 0, 1)) : a.h;
  }
  const y = smoothCircular(raw, N, Math.round(smoothing / 2 / ds));
  return (n) => ({ y: y[n % N], grade: (y[(n + 1) % N] - y[(n - 1 + N) % N]) / (2 * ds) });
}

// ── Build ────────────────────────────────────────────────────────────────────

export function buildTrack(def) {
  const { id, name, pieces, grid = DEFAULT_GRID, terrain = () => 0, sectionNames = {} } = def;
  // Piece start poses, integrated analytically so the loop closes exactly.
  const lens = pieces.map(pieceLength);
  const starts = [];
  const poses = [];
  let acc = 0;
  let cur = { x: 0, z: 0, h: 0 };
  const advance = (p, pose, u) => {
    if (p.kind === 'straight') {
      return { x: pose.x + Math.cos(pose.h) * u, z: pose.z + Math.sin(pose.h) * u, h: pose.h };
    }
    const dir = p.turn === 'right' ? 1 : -1;
    const cx = pose.x + dir * p.radius * -Math.sin(pose.h);
    const cz = pose.z + dir * p.radius * Math.cos(pose.h);
    const h = pose.h + (dir * u) / p.radius;
    return { x: cx + dir * p.radius * Math.sin(h), z: cz - dir * p.radius * Math.cos(h), h };
  };
  pieces.forEach((p, i) => {
    starts.push(acc);
    poses.push(cur);
    cur = advance(p, cur, lens[i]);
    acc += lens[i];
  });
  const length = acc;
  const closure = { dx: cur.x, dz: cur.z, dh: cur.h - Math.PI * 2 * Math.round(cur.h / (Math.PI * 2)) };

  const pieceIndexAt = (s) => {
    for (let i = pieces.length - 1; i > 0; i--) if (s >= starts[i]) return i;
    return 0;
  };
  const poseAt = (s) => {
    const i = pieceIndexAt(s);
    return advance(pieces[i], poses[i], Math.min(s - starts[i], lens[i]));
  };
  const range = (tag) => {
    const i = pieces.findIndex((p) => p.tag === tag);
    return { i, s0: starts[i], s1: starts[i] + lens[i] };
  };
  const resolve = (piece, at) => {
    const r = range(piece);
    return at === 'start' ? r.s0 : at === 'end' ? r.s1 : r.s0 + at;
  };

  // Elevation control points (closed at 0 m both ends).
  const elevCfg = def.elevation ?? { points: [] };
  const elev = [{ s: 0, h: 0 }, ...elevCfg.points.map((e) => ({ s: resolve(e.piece, e.at), h: e.h })), { s: length, h: 0 }];
  const N = Math.round(length / SAMPLE_STEP);
  const ds = length / N;
  const profile = elevationProfile(elev, elevCfg.smoothing, N, ds);

  // Per-sample profile.
  const samples = [];
  const rawCurbL = new Float64Array(N);
  const rawCurbR = new Float64Array(N);
  const rawRunL = new Float64Array(N);
  const rawRunR = new Float64Array(N);
  const curv = new Float64Array(N);

  for (let n = 0; n <= N; n++) {
    const s = n * ds;
    const idx = pieceIndexAt(Math.min(s, length - 1e-9));
    const p = pieces[idx];
    const pose = poseAt(s);
    const u = s - starts[idx];
    const toEnd = lens[idx] - u;
    const prev = pieces[(idx + pieces.length - 1) % pieces.length];
    const next = pieces[(idx + 1) % pieces.length];

    // Width narrows over the first TRANSITION m of the narrower piece, widens over the last of the wider-bound one.
    let width = p.width;
    if (prev.width > p.width && u < TRANSITION) width = lerp(prev.width, p.width, smoothstep(u / TRANSITION));
    if (next.width > p.width && toEnd < TRANSITION) width = lerp(p.width, next.width, smoothstep(1 - toEnd / TRANSITION));

    // Bank blends toward the next piece's bank over the last stretch of every piece.
    const b = p.bank ?? 0;
    const bn = next.bank ?? 0;
    const bank = toEnd < TRANSITION ? lerp(b, bn, smoothstep(1 - toEnd / TRANSITION)) : b;

    const e = profile(n);
    const k = p.kind === 'straight' ? 0 : (p.turn === 'right' ? 1 : -1) / p.radius;
    samples.push({
      s,
      x: pose.x,
      z: pose.z,
      h: pose.h,
      y: e.y,
      grade: e.grade,
      bank: (bank * Math.PI) / 180,
      halfWidth: width / 2,
      curvature: k,
      pieceIndex: idx,
      wood: p.surface === 'wood',
    });
    if (n < N) {
      rawCurbL[n] = p.left.curb ? CURB_WIDTH : 0;
      rawCurbR[n] = p.right.curb ? CURB_WIDTH : 0;
      rawRunL[n] = p.left.runoffWidth;
      rawRunR[n] = p.right.runoffWidth;
      curv[n] = k;
    }
  }

  // Edge widths blend across piece boundaries so limits and meshes have no steps.
  const sm = (arr) => smoothCircular(arr, N, 16);
  const curbL = sm(rawCurbL);
  const curbR = sm(rawCurbR);
  const runL = sm(rawRunL);
  const runR = sm(rawRunR);
  const kSmooth = smoothCircular(curv, N, 48);
  for (let n = 0; n <= N; n++) {
    const m = n % N;
    const sp = samples[n];
    sp.curbL = curbL[m];
    sp.curbR = curbR[m];
    sp.runL = runL[m];
    sp.runR = runR[m];
    sp.sandL = pieces[sp.pieceIndex].left.runoff === 'sand';
    sp.sandR = pieces[sp.pieceIndex].right.runoff === 'sand';
    // Terrain falloff shortens on the inside of tight bends so it finishes before the arc's center.
    const k = kSmooth[m];
    const limR = sp.halfWidth + sp.curbR + sp.runR;
    const limL = sp.halfWidth + sp.curbL + sp.runL;
    sp.fallR = k > 1e-4 ? clamp(0.7 * (1 / k - limR), 3, 30) : 30;
    sp.fallL = k < -1e-4 ? clamp(0.7 * (-1 / k - limL), 3, 30) : 30;
  }

  // ── Queries ────────────────────────────────────────────────────────────────

  const wrapS = (s) => ((s % length) + length) % length;
  const locate = (s) => {
    const u = wrapS(s) / ds;
    const i = Math.min(Math.floor(u), N - 1);
    return [i, u - i];
  };

  function frameAt(sIn) {
    const [i, f] = locate(sIn);
    const a = samples[i];
    const b = samples[i + 1];
    const h = lerp(a.h, b.h, f);
    const fx = Math.cos(h);
    const fz = Math.sin(h);
    return {
      s: wrapS(sIn),
      x: lerp(a.x, b.x, f),
      y: lerp(a.y, b.y, f),
      z: lerp(a.z, b.z, f),
      h,
      fx,
      fz,
      rx: -fz,
      rz: fx,
      bank: lerp(a.bank, b.bank, f),
      halfWidth: lerp(a.halfWidth, b.halfWidth, f),
      pieceIndex: a.pieceIndex,
      tag: pieces[a.pieceIndex].tag,
      section: pieces[a.pieceIndex].section,
    };
  }

  function edgesAt(sIn) {
    const [i, f] = locate(sIn);
    const a = samples[i];
    const b = samples[i + 1];
    const bank = lerp(a.bank, b.bank, f);
    return {
      y: lerp(a.y, b.y, f),
      grade: a.grade,
      bank,
      tb: Math.tan(bank),
      hw: lerp(a.halfWidth, b.halfWidth, f),
      curbL: lerp(a.curbL, b.curbL, f),
      curbR: lerp(a.curbR, b.curbR, f),
      runL: lerp(a.runL, b.runL, f),
      runR: lerp(a.runR, b.runR, f),
      sandL: a.sandL,
      sandR: a.sandR,
      wood: a.wood,
      fallL: lerp(a.fallL, b.fallL, f),
      fallR: lerp(a.fallR, b.fallR, f),
      k: lerp(a.curvature, b.curvature, f),
      h: lerp(a.h, b.h, f),
    };
  }

  const heightOf = (e, lat) => e.y - e.tb * clamp(lat, -(e.hw + e.curbL), e.hw + e.curbR);

  function heightAt(s, lateral) {
    return heightOf(edgesAt(s), lateral);
  }

  function surfaceAt(s, lateral) {
    const e = edgesAt(s);
    const limitL = e.hw + e.curbL + e.runL;
    const limitR = e.hw + e.curbR + e.runR;
    const a = Math.abs(lateral);
    const right = lateral >= 0;
    const curb = right ? e.curbR : e.curbL;
    const limit = right ? limitR : limitL;
    let kind = e.wood ? 'wood' : 'road';
    if (a > limit) kind = 'wall';
    else if (a > e.hw + curb) kind = (right ? e.sandR : e.sandL) ? 'sand' : 'grass';
    else if (a > e.hw) kind = curb > 0.05 ? 'curb' : right ? (e.sandR ? 'sand' : 'grass') : e.sandL ? 'sand' : 'grass';

    // Surface gradient in xz: grade along forward, -tan(bank) along right (banked only on road + curb).
    const onBank = a <= e.hw + curb ? e.tb : 0;
    const fx = Math.cos(e.h);
    const fz = Math.sin(e.h);
    const gx = e.grade * fx - onBank * -fz;
    const gz = e.grade * fz - onBank * fx;
    const inv = 1 / Math.hypot(gx, 1, gz);
    return { y: heightOf(e, lateral), nx: -gx * inv, ny: inv, nz: -gz * inv, kind, limitL, limitR };
  }

  // Newton-refine s so the offset from the centerline is purely lateral.
  function refine(x, z, s0) {
    let s = s0;
    let lat = 0;
    for (let it = 0; it < 4; it++) {
      const fr = frameAt(s);
      const dx = x - fr.x;
      const dz = z - fr.z;
      const along = dx * fr.fx + dz * fr.fz;
      lat = dx * fr.rx + dz * fr.rz;
      const k = edgesAt(s).k;
      s += along / Math.max(0.2, 1 - lat * k);
      if (Math.abs(along) < 1e-7) break;
    }
    const fr = frameAt(s);
    lat = (x - fr.x) * fr.rx + (z - fr.z) * fr.rz;
    return { s: wrapS(s), lateral: lat };
  }

  // Coarse spatial hash over every 4th sample (2 m) for global nearest-point lookups.
  const CELL = 24;
  const COARSE = 4;
  let minX = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxZ = -Infinity;
  for (let n = 0; n < N; n++) {
    minX = Math.min(minX, samples[n].x);
    maxX = Math.max(maxX, samples[n].x);
    minZ = Math.min(minZ, samples[n].z);
    maxZ = Math.max(maxZ, samples[n].z);
  }
  const gx0 = minX - 1;
  const gz0 = minZ - 1;
  const gnx = Math.ceil((maxX - gx0) / CELL) + 1;
  const gnz = Math.ceil((maxZ - gz0) / CELL) + 1;
  const cells = Array.from({ length: gnx * gnz }, () => []);
  for (let n = 0; n < N; n += COARSE) {
    const cx = Math.floor((samples[n].x - gx0) / CELL);
    const cz = Math.floor((samples[n].z - gz0) / CELL);
    cells[cz * gnx + cx].push(n);
  }

  const d2To = (n, x, z) => {
    const sp = samples[n];
    return (sp.x - x) ** 2 + (sp.z - z) ** 2;
  };

  function nearestIndexGlobal(x, z) {
    const cx = Math.floor((x - gx0) / CELL);
    const cz = Math.floor((z - gz0) / CELL);
    let best = -1;
    let bestD2 = Infinity;
    const scan = (ix, iz) => {
      if (ix < 0 || iz < 0 || ix >= gnx || iz >= gnz) return;
      for (const n of cells[iz * gnx + ix]) {
        const d2 = d2To(n, x, z);
        if (d2 < bestD2) {
          bestD2 = d2;
          best = n;
        }
      }
    };
    const rMax = Math.max(Math.abs(cx), Math.abs(gnx - cx), Math.abs(cz), Math.abs(gnz - cz)) + 1;
    for (let r = 0; r <= rMax; r++) {
      // Ring r cells are at least (r - 1) cells from the query.
      if (best >= 0 && Math.sqrt(bestD2) <= (r - 1) * CELL) break;
      if (r === 0) scan(cx, cz);
      else {
        for (let dx = -r; dx <= r; dx++) {
          scan(cx + dx, cz - r);
          scan(cx + dx, cz + r);
        }
        for (let dz = -r + 1; dz <= r - 1; dz++) {
          scan(cx - r, cz + dz);
          scan(cx + r, cz + dz);
        }
      }
    }
    // Pick the best fine sample around the coarse winner.
    let fine = best;
    let fineD2 = bestD2;
    for (let k = -COARSE; k <= COARSE; k++) {
      const n = (best + k + N) % N;
      const d2 = d2To(n, x, z);
      if (d2 < fineD2) {
        fineD2 = d2;
        fine = n;
      }
    }
    return fine;
  }

  const HINT_WINDOW = 60; // samples each way (30 m)
  function project(x, z, hintS) {
    let idx = -1;
    if (hintS != null && Number.isFinite(hintS)) {
      const c = Math.round(wrapS(hintS) / ds);
      let bestD2 = Infinity;
      let bestK = 0;
      for (let k = -HINT_WINDOW; k <= HINT_WINDOW; k++) {
        const n = (c + k + N * 4) % N;
        const d2 = d2To(n, x, z);
        if (d2 < bestD2) {
          bestD2 = d2;
          idx = n;
          bestK = k;
        }
      }
      if (Math.abs(bestK) === HINT_WINDOW || bestD2 > 900) idx = -1;
    }
    if (idx < 0) idx = nearestIndexGlobal(x, z);
    return refine(x, z, idx * ds);
  }

  const baseTerrain = terrain;

  function terrainHeight(x, z) {
    const { s, lateral } = refine(x, z, nearestIndexGlobal(x, z) * ds);
    const e = edgesAt(s);
    const right = lateral >= 0;
    const limit = right ? e.hw + e.curbR + e.runR : e.hw + e.curbL + e.runL;
    const a = Math.abs(lateral);
    if (a <= limit) return heightOf(e, lateral);
    const edgeH = heightOf(e, right ? limit : -limit);
    const w = smoothstep((a - limit) / (right ? e.fallR : e.fallL));
    return lerp(edgeH, baseTerrain(x, z, a), w);
  }

  const checkpoints = Array.from({ length: CHECKPOINT_COUNT }, (_, index) => ({ index, s: (index * length) / CHECKPOINT_COUNT }));
  const boostPads = (def.boostPads ?? []).map((p) => ({ s: resolve(p.piece, p.at), lateral: p.lateral, length: PAD_LENGTH, width: PAD_WIDTH }));
  const itemRows = (def.itemRows ?? []).map((r) => ({ s: resolve(r.piece, r.at), laterals: r.laterals }));
  const ramps = (def.ramps ?? []).map((r) => ({ s: resolve(r.piece, r.at), lateral: r.lateral, length: r.length, width: r.width }));

  // Slot i: row-major over `grid.cols` columns; odd columns sit half a row further back.
  function gridSlots(n) {
    return Array.from({ length: n }, (_, i) => {
      const row = Math.floor(i / grid.cols);
      const col = i % grid.cols;
      const s = wrapS(-(6 + row * grid.rowGap + (col & 1 ? grid.rowGap / 2 : 0)));
      const lateral = (col - (grid.cols - 1) / 2) * grid.colGap;
      const fr = frameAt(s);
      return { s, lateral, x: fr.x + fr.rx * lateral, y: heightAt(s, lateral), z: fr.z + fr.rz * lateral, h: fr.h };
    });
  }

  // Sections in driving order: consecutive pieces that share a `section` id.
  const sections = [];
  pieces.forEach((p, i) => {
    if (!p.section) return;
    const last = sections[sections.length - 1];
    if (last && last.id === p.section) last.s1 = starts[i] + lens[i];
    else sections.push({ id: p.section, name: sectionNames[p.section] ?? p.section, s0: starts[i], s1: starts[i] + lens[i] });
  });

  function pieceRange(tag) {
    const { s0, s1 } = range(tag);
    return { s0, s1 };
  }

  return {
    id,
    name,
    length,
    closure,
    sections,
    shortcuts: [],
    distantTerrain: def.distantTerrain,
    pieces,
    samples,
    sampleStep: ds,
    frameAt,
    project,
    surfaceAt,
    heightAt,
    terrainHeight,
    checkpoints,
    boostPads,
    itemRows,
    ramps,
    gridSlots,
    pieceRange,
    wrapS,
  };
}
