// One ground surface: a dense road/runoff ribbon plus the world terrain share ONE shader. The fragment shader
// reads the track coordinates (s, lateral) and edge widths from vertex attributes and paints everything
// (asphalt, markings, curbs, sand, grass) procedurally, so lines stay crisp at any distance and nothing z-fights.
import * as THREE from 'three';

const MARGIN = 6; // ribbon extends this far beyond the corridor limit and blends into the terrain
const SINK = 0.35; // terrain is sunk under the ribbon so the two never share depth
const LIFT = 0.02;
const smooth = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// Mirror of track.js' rolling hills so the far terrain (beyond ~190 m from the track) needs no projection.
function rollingHills(x, z) {
  const v = 0.6 * Math.sin(x / 70 + 1.3) * Math.cos(z / 85 + 0.4) + 0.4 * Math.sin((x + z) / 55 + 2);
  return 6 + 6 * v;
}

function circularBlur(arr, radius) {
  const n = arr.length;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let k = -radius; k <= radius; k++) sum += arr[(i + k + n * 4) % n];
    out[i] = sum / (2 * radius + 1);
  }
  return out;
}

const VERT_DECL = `
attribute vec4 aTr;
attribute vec4 aW;
attribute vec4 aR;
attribute float aH;
varying float vH;
varying vec4 vTr;
varying vec4 vW;
varying vec4 vR;
varying vec3 vWp;
`;

const FRAG_DECL = `
uniform float uTime;
uniform float uLen;
uniform int uMarkN;
uniform vec4 uMark[40];
uniform vec4 uPad[4];
varying vec4 vTr;
varying vec4 vW;
varying vec4 vR;
varying float vH;
varying vec3 vWp;
vec3 C(float r, float g, float b) { return pow(vec3(r, g, b), vec3(2.2)); }
float h21(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
float vn(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), f.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), f.x), f.y);
}
float fbm(vec2 p) {
  float a = 0.5, s = 0.0;
  for (int i = 0; i < 4; i++) { s += a * vn(p); p = p * 2.03 + 17.1; a *= 0.5; }
  return s;
}
float cv(float d, float w) { return clamp(d / max(w, 1e-4) + 0.5, 0.0, 1.0); }
float bd(float x, float a, float b, float w) { return cv(x - a, w) * cv(b - x, w); }
`;

const FRAG_BODY = `
vec3 gGlow = vec3(0.0);
{
  float s = vTr.x;
  float lat = vTr.y;
  float nf = 1.0 - smoothstep(0.2, 0.8, vTr.w);
  float sd = lat >= 0.0 ? 1.0 : -1.0;
  float a = abs(lat);
  float wl = max(fwidth(lat), 1e-3);
  float ws = max(fwidth(s), 1e-3);
  float hw = vW.x;
  float curb = sd > 0.0 ? vW.z : vW.y;
  float run = sd > 0.0 ? vR.x : vW.w;
  float sandW = sd > 0.0 ? vR.z : vR.y;
  vec2 wp = vWp.xz;
  float pw = max(fwidth(wp.x), fwidth(wp.y));

  // ---- grass: toned base, track-aligned mowing stripes near the track, big soft patches, blade grain
  float fwp = max(pw, 1e-3);
  float aU = abs(vTr.z);
  float stripeK = vR.w * (1.0 - smoothstep(0.5, 1.4, fwp * 4.0));
  float mCell = aU / 4.0;
  float mowA = abs(fract(mCell * 0.5) - 0.5) * 2.0; // triangle 0..1, period 8 m
  float mowW = max(fwidth(mCell), 1e-3) * 1.2;
  float mowT = smoothstep(0.5 - mowW, 0.5 + mowW, mowA);
  float mowFar = smoothstep(-0.2, 0.2, sin(dot(wp, vec2(0.93, 0.36)) * 0.55)) * (1.0 - smoothstep(0.4, 1.6, pw * 5.0));
  mowT = mix(mowFar, mowT, stripeK);
  vec3 grassA = C(0.24, 0.63, 0.10);
  vec3 grassB = C(0.34, 0.76, 0.14);
  vec3 col = mix(grassA, grassB, mowT * 0.9);
  float pat = fbm(wp * 0.03);
  col *= 0.80 + 0.36 * pat;
  col = mix(col, C(0.58, 0.82, 0.17), smoothstep(0.55, 0.85, fbm(wp * 0.015 + 9.0)) * 0.4);
  col = mix(col, C(0.12, 0.50, 0.12), smoothstep(0.6, 0.9, fbm(wp * 0.011 + 31.0)) * 0.3);
  col *= 0.94 + 0.12 * vn(wp * 2.6) * (1.0 - smoothstep(0.4, 1.4, pw * 2.6));
  // far hills: smooth rolling green, a few clean yellow bands that follow height contours
  float hill = smoothstep(0.08, 0.35, vH);
  if (hill > 0.0) {
    float hh = vWp.y;
    float bc = hh / 26.0 + 0.9 * (fbm(wp * 0.0035) - 0.5);
    float bi = floor(bc);
    float bf = fract(bc);
    float bw = max(fwidth(bc), 1e-3) * 1.4;
    float ys = step(0.6, fract(sin(bi * 12.9898 + 78.233) * 43758.5453));
    float inBand = smoothstep(0.06 - bw, 0.06 + bw, bf) * (1.0 - smoothstep(0.62 - bw, 0.62 + bw, bf));
    vec3 hg = mix(C(0.20, 0.58, 0.11), C(0.34, 0.74, 0.15), smoothstep(0.0, 0.7, bf) * 0.25 + 0.6 * fbm(wp * 0.01));
    hg *= 0.80 + 0.30 * smoothstep(10.0, 110.0, hh);
    vec3 yl = C(0.98, 0.82, 0.20) * (0.88 + 0.16 * bf);
    hg = mix(hg, yl, inBand * ys);
    // soft shade just below each band edge and a light lip on top, so the terraces read as 3D
    float lowEdge = (1.0 - smoothstep(0.0, 0.08 + bw, bf)) * smoothstep(0.0, 0.01 + bw, bf);
    hg *= 1.0 - 0.14 * (1.0 - smoothstep(0.62, 0.7 + bw, bf)) * smoothstep(0.6 - bw, 0.62, bf) * ys - 0.05 * lowEdge;
    col = mix(col, hg, hill);
  }

  // ---- sand runoff with soft organic edges
  float sEdge = hw + curb + run * sandW;
  float nz = (fbm(wp * 0.09) - 0.5) * 2.4 + (vn(wp * 0.6) - 0.5) * 0.45;
  float sandM = cv(sEdge + nz - a, max(wl, 0.3)) * smoothstep(0.02, 0.3, sandW) * nf;
  vec3 sandA = C(0.95, 0.85, 0.30);
  vec3 sandB = C(0.92, 0.79, 0.22);
  vec3 sandC = mix(sandA, sandB, fbm(wp * 0.6) * 0.8);
  float spk = smoothstep(0.72, 0.9, vn(wp * 26.0)) * (1.0 - smoothstep(0.25, 0.9, pw * 26.0));
  sandC *= 1.0 - 0.16 * spk;
  sandC *= 0.96 + 0.08 * vn(wp * 7.0) * (1.0 - smoothstep(0.3, 1.2, pw * 7.0));
  float rake = smoothstep(0.45, 0.5, abs(fract(dot(wp, vec2(0.6, 0.8)) * 0.35) - 0.5));
  sandC *= 1.0 - 0.05 * rake * (1.0 - smoothstep(0.3, 1.0, pw * 3.0));
  sandC *= 1.1;
  col = mix(col, sandC, sandM);

  // ---- curbs: green/white stripes
  float cm = bd(a, hw, hw + curb, wl) * smoothstep(0.05, 0.25, curb) * nf;
  float stripeM = bd(mod(s, 3.0), 0.0, 1.5, ws);
  vec3 curbC = mix(C(0.97, 0.97, 0.95), C(0.10, 0.70, 0.22), stripeM);
  col = mix(col, curbC, cm);

  // ---- asphalt
  float roadM = cv(hw - a, wl) * nf;
  float gFade = 1.0 - smoothstep(0.5, 1.8, pw * 16.0);
  float g2Fade = 1.0 - smoothstep(0.6, 2.0, pw * 3.3);
  float g1 = mix(0.5, vn(wp * 16.0) * 0.6 + vn(wp * 37.0) * 0.4, gFade);
  float g2 = mix(0.5, vn(wp * 3.3 + 3.0), g2Fade);
  vec3 road = C(0.35, 0.35, 0.39);
  road *= 0.72 + 0.4 * (0.55 * g1 + 0.45 * g2) + 0.12 * (fbm(wp * 0.22) - 0.5);
  road *= 1.0 - 0.1 * exp(-pow((a - hw * 0.5) / 1.1, 2.0));
  road *= 1.0 + 0.1 * exp(-pow(lat / 1.5, 2.0)) * 0.0;

  // start line (checkered, across the road at s = 0)
  float sw = s > uLen * 0.5 ? s - uLen : s;
  float roadIn = cv(hw - 1.25 - a, wl);
  float startM = bd(sw, -1.0, 1.0, ws) * roadIn;
  float chkF = smoothstep(0.25, 0.8, max(ws, wl));
  float sChk = mod(floor(lat) + floor(sw + 1.0), 2.0);
  vec3 startC = mix(mix(C(0.05, 0.05, 0.06), C(0.97, 0.97, 0.95), sChk), vec3(0.5), chkF);

  // edge checker strip + crisp white edge line
  float stripM = bd(a, hw - 1.25, hw - 0.18, wl) * (1.0 - roadIn * 0.0);
  float eChk = mod(floor((hw - a - 0.18) / 0.535) + floor(s / 0.535), 2.0);
  float eF = smoothstep(0.25, 0.7, max(ws, wl) / 0.535);
  vec3 eChkC = mix(mix(C(0.07, 0.07, 0.08), C(0.96, 0.96, 0.94), eChk), C(0.5, 0.5, 0.5), eF);
  float edgeM = bd(a, hw - 0.18, hw, wl);

  // dashed racing line
  float dashM = bd(lat, -0.12, 0.12, wl) * bd(mod(s, 5.0), 0.0, 2.6, ws);

  // grid boxes behind the line
  float gridM = 0.0;
  if (sw < -1.5 && sw > -45.0) {
    for (int c = 0; c < 2; c++) {
      float lc = c == 0 ? -4.0 : 4.0;
      float t = -sw - 6.0 - (c == 1 ? 4.0 : 0.0);
      float row = clamp(floor(t / 8.0 + 0.5), 0.0, 4.0);
      float d = t - 8.0 * row;
      float dl = lat - lc;
      float outer = bd(d, -2.2, 2.2, ws) * bd(dl, -1.4, 1.4, wl);
      float inner = bd(d, -2.06, 2.06, ws) * bd(dl, -1.26, 1.26, wl);
      gridM = max(gridM, outer * (1.0 - inner));
    }
  }

  road = mix(road, eChkC, stripM);
  road = mix(road, C(0.97, 0.97, 0.95), max(edgeM, max(dashM, gridM) * 0.95));
  road = mix(road, startC, startM);

  // turn chevrons: painted near the outer edge, pointing across the road toward the inside of the bend
  if (roadM > 0.0) {
    float fw = ws * 0.6 + wl;
    for (int i = 0; i < 40; i++) {
      if (i >= uMarkN) break;
      vec4 m = uMark[i];
      float du = s - m.x;
      if (abs(du) > 2.4) continue;
      float wd = m.z * (lat - m.y);
      float q = -wd - 0.62 * abs(du); // V tip at the largest wd, i.e. pointing toward the inside
      float inU = cv(2.1 - abs(du), fw);
      float fillM = max(bd(q, -0.55, 0.45, fw), bd(q, -2.25, -1.25, fw)) * inU;
      float outM = max(bd(q, -0.73, 0.63, fw), bd(q, -2.43, -1.07, fw)) * cv(2.28 - abs(du), fw);
      vec3 fill = mix(C(1.0, 0.52, 0.06), C(1.0, 0.30, 0.52), clamp(0.5 - (wd - 1.0) * 0.28, 0.0, 1.0));
      road = mix(road, C(0.98, 0.98, 0.96), outM);
      road = mix(road, fill, fillM);
    }
  }

  // boost pads
  for (int i = 0; i < 4; i++) {
    vec4 p = uPad[i];
    if (p.z <= 0.0) continue;
    float du = s - p.x;
    float dw = lat - p.y;
    float inside = bd(du, -p.z * 0.5, p.z * 0.5, ws) * bd(dw, -p.w * 0.5, p.w * 0.5, wl);
    if (inside <= 0.0) continue;
    float rim = inside * (1.0 - bd(du, -p.z * 0.5 + 0.18, p.z * 0.5 - 0.18, ws) * bd(dw, -p.w * 0.5 + 0.18, p.w * 0.5 - 0.18, wl));
    float x = du + 0.85 * abs(dw);
    float ph = fract(x / 1.6 - uTime * 0.9);
    float ch = smoothstep(0.0, 0.08, ph) * (1.0 - smoothstep(0.34, 0.5, ph));
    vec3 pc = mix(C(0.02, 0.28, 0.78), C(0.55, 0.95, 1.0), ch);
    pc = mix(pc, C(0.85, 1.0, 1.0), rim);
    float pulse = 0.75 + 0.25 * sin(uTime * 6.0);
    road = mix(road, pc, inside);
    gGlow += vec3(0.1, 0.65, 1.0) * (0.25 + 0.75 * ch + rim * 0.6) * pulse * inside * 0.9;
  }

  col = mix(col, road, roadM);
  diffuseColor.rgb = col;
}
`;

export function buildGround(track, sun) {
  const samples = track.samples;
  const N = samples.length - 1;
  const ds = track.sampleStep;
  const L = track.length;

  // Smoothed sand weights so sand tapers in and out instead of starting on a hard line.
  const rawL = new Float32Array(N);
  const rawR = new Float32Array(N);
  for (let n = 0; n < N; n++) {
    rawL[n] = samples[n].sandL ? 1 : 0;
    rawR[n] = samples[n].sandR ? 1 : 0;
  }
  const sandWL = circularBlur(rawL, 36);
  const sandWR = circularBlur(rawR, 36);

  const attrAt = (n, out, o) => {
    const sp = samples[n % N];
    const m = n % N;
    out.w.set([sp.halfWidth, sp.curbL, sp.curbR, sp.runL], o * 4);
    out.r.set([sp.runR, sandWL[m], sandWR[m], 0], o * 4);
  };

  // ── Ribbon ────────────────────────────────────────────────────────────────
  const rowStep = 2; // samples per ribbon row (1 m)
  const rows = [];
  for (let n = 0; n < N; n += rowStep) rows.push(n);
  rows.push(N);
  const offs = (sp, side) => {
    const curb = side > 0 ? sp.curbR : sp.curbL;
    const lim = sp.halfWidth + curb + (side > 0 ? sp.runR : sp.runL);
    return [curb + sp.halfWidth, lim, lim + 2, lim + 4, lim + MARGIN];
  };
  const stationsOf = (sp) => {
    const l = offs(sp, -1).reverse().map((v) => -v);
    const r = offs(sp, 1);
    return [...l, ...r];
  };
  const SC = 10;
  const rp = new Float32Array(rows.length * SC * 3);
  const rt = new Float32Array(rows.length * SC * 4);
  const rw = new Float32Array(rows.length * SC * 4);
  const rr = new Float32Array(rows.length * SC * 4);
  rows.forEach((n, ri) => {
    const sp = samples[n];
    const rx = -Math.sin(sp.h);
    const rz = Math.cos(sp.h);
    const st = stationsOf(sp);
    st.forEach((lat, j) => {
      const o = ri * SC + j;
      const x = sp.x + rx * lat;
      const z = sp.z + rz * lat;
      const edgeLat = sp.halfWidth + (lat > 0 ? sp.curbR + sp.runR : sp.curbL + sp.runL);
      const y = Math.abs(lat) <= edgeLat + 1e-6 ? track.heightAt(sp.s, lat) : track.terrainHeight(x, z);
      rp.set([x, y + LIFT, z], o * 3);
      rt.set([sp.s, lat, 0, 0], o * 4);
      attrAt(n, { w: rw, r: rr }, o);
    });
  });
  const ridx = [];
  for (let ri = 0; ri < rows.length - 1; ri++) {
    for (let j = 0; j < SC - 1; j++) {
      const a = ri * SC + j;
      const b = a + SC;
      ridx.push(a, a + 1, b, a + 1, b + 1, b);
    }
  }
  const rgeo = new THREE.BufferGeometry();
  rgeo.setAttribute('position', new THREE.BufferAttribute(rp, 3));
  rgeo.setAttribute('aTr', new THREE.BufferAttribute(rt, 4));
  rgeo.setAttribute('aW', new THREE.BufferAttribute(rw, 4));
  rgeo.setAttribute('aR', new THREE.BufferAttribute(rr, 4));
  rgeo.setAttribute('aH', new THREE.BufferAttribute(new Float32Array(rows.length * SC), 1));
  rgeo.setIndex(ridx);
  rgeo.computeVertexNormals();
  // Lap closure: the last row coincides with the first, so share their normals.
  const nrm = rgeo.attributes.normal;
  const last = (rows.length - 1) * SC;
  for (let j = 0; j < SC; j++) {
    const v = new THREE.Vector3(nrm.getX(j) + nrm.getX(last + j), nrm.getY(j) + nrm.getY(last + j), nrm.getZ(j) + nrm.getZ(last + j)).normalize();
    nrm.setXYZ(j, v.x, v.y, v.z);
    nrm.setXYZ(last + j, v.x, v.y, v.z);
  }

  // ── Terrain (non-uniform grid: dense near the track, stretching out to the far hills) ──────────
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (const sp of samples) {
    minX = Math.min(minX, sp.x); maxX = Math.max(maxX, sp.x);
    minZ = Math.min(minZ, sp.z); maxZ = Math.max(maxZ, sp.z);
  }
  const INNER = 150;
  const axis = (lo, hi, step, reach) => {
    const a = [];
    for (let v = lo; v <= hi + 1e-6; v += step) a.push(v);
    let st = step;
    for (let v = hi; v < hi + reach; ) { st *= 1.18; v += st; a.push(v); }
    st = step;
    for (let v = lo; v > lo - reach; ) { st *= 1.18; v -= st; a.unshift(v); }
    return a;
  };
  const xs = axis(minX - INNER, maxX + INNER, 4, 1500);
  const zs = axis(minZ - INNER, maxZ + INNER, 4, 1500);
  const nx = xs.length;
  const nz = zs.length;
  const tp = new Float32Array(nx * nz * 3);
  const tt = new Float32Array(nx * nz * 4);
  const tw = new Float32Array(nx * nz * 4);
  const tr = new Float32Array(nx * nz * 4);
  const th = new Float32Array(nx * nz);
  const cx = (minX + maxX) / 2;
  const cz = (minZ + maxZ) / 2;
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) {
      const x = xs[i];
      const z = zs[j];
      const o = j * nx + i;
      const inner = x > minX - INNER && x < maxX + INNER && z > minZ - INNER && z < maxZ + INNER;
      let y;
      if (inner) {
        const p = track.project(x, z);
        const n = Math.round(p.s / ds) % N;
        const sp = samples[n];
        const side = p.lateral >= 0 ? 1 : -1;
        const a = Math.abs(p.lateral);
        const lim = sp.halfWidth + (side > 0 ? sp.curbR + sp.runR : sp.curbL + sp.runL);
        y = track.terrainHeight(x, z);
        let far = 0;
        let lat = p.lateral;
        if (a > lim + MARGIN) {
          far = 1;
          lat = side * (lim + MARGIN + 1);
        } else {
          y -= SINK * (1 - smooth(lim + 2, lim + MARGIN, a));
        }
        tt.set([p.s, lat, p.lateral, far], o * 4);
        attrAt(n, { w: tw, r: tr }, o);
        tr[o * 4 + 3] = 1 - smooth(45, 130, a);
      } else {
        const d = Math.hypot(x - cx, z - cz);
        const big = smooth(480, 860, d);
        const ang = Math.atan2(z - cz, x - cx);
        const ridge = 0.5 + 0.5 * (0.6 * Math.sin(ang * 3 + 1.1) + 0.4 * Math.sin(ang * 7 + 0.3) * Math.cos(d / 140));
        const t = (big * (50 + 190 * ridge)) / 16;
        const terr = Math.floor(t) + smooth(0.3, 1.0, t - Math.floor(t));
        y = track.distantTerrain ? track.distantTerrain(x, z) : rollingHills(x, z) + (big > 0.001 ? (0.5 * t + 0.5 * terr) * 16 : 0);
        tt.set([0, 999, 0, 1], o * 4);
        th[o] = track.distantTerrain ? 0 : big;
        tw.set([8, 0, 0, 0], o * 4);
      }
      tp.set([x, y, z], o * 3);
    }
  }
  const tidx = new Uint32Array((nx - 1) * (nz - 1) * 6);
  let k = 0;
  for (let j = 0; j < nz - 1; j++) {
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      tidx.set([a, a + nx, a + 1, a + 1, a + nx, a + nx + 1], k);
      k += 6;
    }
  }
  const tgeo = new THREE.BufferGeometry();
  tgeo.setAttribute('position', new THREE.BufferAttribute(tp, 3));
  tgeo.setAttribute('aTr', new THREE.BufferAttribute(tt, 4));
  tgeo.setAttribute('aW', new THREE.BufferAttribute(tw, 4));
  tgeo.setAttribute('aR', new THREE.BufferAttribute(tr, 4));
  tgeo.setAttribute('aH', new THREE.BufferAttribute(th, 1));
  tgeo.setIndex(new THREE.BufferAttribute(tidx, 1));
  tgeo.computeVertexNormals();

  // ── Shared material + uniforms ────────────────────────────────────────────
  const uniforms = {
    uTime: { value: 0 },
    uLen: { value: L },
    uMarkN: { value: 0 },
    uMark: { value: Array.from({ length: 40 }, () => new THREE.Vector4()) },
    uPad: { value: Array.from({ length: 4 }, () => new THREE.Vector4(0, 0, 0, 0)) },
  };

  // Chevron markers near the outer edge of each turn, pointing toward the inside of the bend.
  const marks = [];
  for (const piece of track.pieces) {
    if (piece.kind !== 'arc') continue;
    const { s0, s1 } = track.pieceRange(piece.tag);
    const dir = piece.turn === 'right' ? 1 : -1;
    const spacing = 12;
    const span = s1 - s0 - 12;
    const count = Math.max(2, Math.floor(span / spacing) + 1);
    for (let i = 0; i < count; i++) {
      const sc = s0 + 6 + (span * i) / (count - 1);
      const hw = track.frameAt(sc).halfWidth;
      marks.push([sc, -dir * (hw - 4.6), dir]);
    }
  }
  marks.slice(0, 40).forEach((m, i) => uniforms.uMark.value[i].set(m[0], m[1], m[2], 0));
  uniforms.uMarkN.value = Math.min(40, marks.length);
  track.boostPads.slice(0, 4).forEach((p, i) => uniforms.uPad.value[i].set(p.s, p.lateral, p.length, p.width));

  const mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>\n${VERT_DECL}`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvTr = aTr; vW = aW; vR = aR; vH = aH; vWp = position;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${FRAG_DECL}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\n${FRAG_BODY}`)
      .replace('#include <opaque_fragment>', 'outgoingLight += gGlow;\n#include <opaque_fragment>');
  };
  mat.customProgramCacheKey = () => 'kart-ground';

  const ribbon = new THREE.Mesh(rgeo, mat);
  const terrain = new THREE.Mesh(tgeo, mat);
  for (const m of [ribbon, terrain]) {
    m.receiveShadow = true;
    m.frustumCulled = false;
  }
  void sun;
  return {
    group: new THREE.Group().add(terrain, ribbon),
    center: { x: cx, z: cz },
    tick(t) {
      uniforms.uTime.value = t;
    },
  };
}
