// Pure helpers for the Kart Racer host: player colors, countdown, minimap fit, relay payloads.
import { COUNTDOWN_SECONDS } from './race.js';

// ── Colors ───────────────────────────────────────────────────────────────────

const PALETTE = [0xe8423a, 0x3a7be8, 0xf2c230, 0x3fb55a, 0x9b5de5, 0xff8c1a, 0xff5fa2, 0x18c6c0];

export const cssColor = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
export const playerColor = (i) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

const ordinalSuffix = (n) => (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th');

export const ordinal = (n) => `${n}${ordinalSuffix(n)}`;

// The big digits and the small suffix are styled apart in the HUD.
export const placeParts = (n) => ({ num: String(n), suffix: ordinalSuffix(n) });

// ── Split screen ─────────────────────────────────────────────────────────────

// Pane rectangles for 1..4 racers in screen fractions (y from the top), plus where the shared minimap goes.
// 3p leaves the bottom-right quadrant for a large map (mapRect); other counts overlay a small one.
// mapTall: the map is turned upright, for the narrow strip of 1p and the divider of 2p.
export function splitLayout(n) {
  const count = Math.max(1, Math.min(4, Math.round(n) || 1));
  const cols = count === 1 ? 1 : 2;
  const rows = count <= 2 ? 1 : 2;
  const views = Array.from({ length: count }, (_, slot) => {
    const col = slot % cols;
    return { slot, x: col / cols, y: Math.floor(slot / cols) / rows, w: 1 / cols, h: 1 / rows, side: col === 0 ? 'left' : 'right' };
  });
  const map = count === 1 ? 'side' : count === 3 ? 'quadrant' : 'center';
  return { views, map, mapTall: count <= 2, mapRect: count === 3 ? { x: 0.5, y: 0.5, w: 0.5, h: 0.5 } : null };
}

// ── Countdown ────────────────────────────────────────────────────────────────

// Start-light state for scene.setStartLights: 0..5 lit, 'go', or null once the lights go out.
export function countdownLights(race) {
  if (race.phase === 'countdown') {
    const lit = Math.ceil(((COUNTDOWN_SECONDS - race.countdown) / COUNTDOWN_SECONDS) * 5);
    return Math.max(0, Math.min(5, lit));
  }
  return race.phase === 'racing' && race.goTimer > 0 ? 'go' : null;
}

export function countdownLabel(race) {
  if (race.phase === 'countdown') return String(Math.max(1, Math.ceil(race.countdown)));
  return race.phase === 'racing' && race.goTimer > 0 ? 'GO!' : null;
}

// ── Minimap ──────────────────────────────────────────────────────────────────

// Fits the centerline into a width x height box (+z is down-screen, matching top-down).
// `rotate` turns the map a quarter turn so a wide track fills a tall box.
export function fitMinimap(samples, width, height, pad = 12, step = 8, rotate = false) {
  const turn = (x, z) => (rotate ? [-z, x] : [x, z]);
  const pts = samples.map((p) => turn(p.x, p.z));
  const minU = Math.min(...pts.map((p) => p[0])), maxU = Math.max(...pts.map((p) => p[0]));
  const minV = Math.min(...pts.map((p) => p[1])), maxV = Math.max(...pts.map((p) => p[1]));
  const scale = Math.min((width - 2 * pad) / (maxU - minU), (height - 2 * pad) / (maxV - minV));
  const offU = (width - (maxU - minU) * scale) / 2 - minU * scale;
  const offV = (height - (maxV - minV) * scale) / 2 - minV * scale;
  const project = (x, z) => {
    const [u, v] = turn(x, z);
    return [u * scale + offU, v * scale + offV];
  };
  const path = samples
    .filter((_, i) => i % step === 0)
    .map((p, i) => {
      const [x, y] = project(p.x, p.z);
      return `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join('') + 'Z';
  return { project, path, scale };
}

// Perpendicular tick across the start line (samples[0] heads along its h), in projected pixels.
export function startTick(project, sample, half = 6) {
  const [x, y] = project(sample.x, sample.z);
  const [ex, ey] = project(sample.x - Math.sin(sample.h), sample.z + Math.cos(sample.h));
  const len = Math.hypot(ex - x, ey - y);
  const rx = ((ex - x) / len) * half;
  const ry = ((ey - y) / len) * half;
  return [x - rx, y - ry, x + rx, y + ry];
}

// ── Relay payloads ───────────────────────────────────────────────────────────

export function buildStatus(race, cssById) {
  const players = {};
  for (const k of race.karts) {
    players[k.id] = {
      lap: Math.min(k.lap + 1, race.laps),
      laps: race.laps,
      place: k.place,
      color: cssById[k.id],
      finished: k.finished,
    };
  }
  return { type: 'kart_status', phase: race.phase, players };
}

// Stable string for change detection (key order is fixed by construction).
export const statusKey = (status) => JSON.stringify(status);

export function buildResults(race, cssById) {
  const results = [...race.karts]
    .sort((a, b) => a.place - b.place)
    .map((k) => ({
      playerId: k.id,
      name: k.name,
      place: k.place,
      time: k.finished ? k.finishTime : null,
      color: cssById[k.id],
      bestLap: k.lapTimes.length ? Math.min(...k.lapTimes) : null,
    }));
  return { type: 'kart_results', results };
}
