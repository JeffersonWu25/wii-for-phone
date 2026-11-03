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
// 3p leaves the bottom-right quadrant for a large map; other counts overlay a small one.
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
  return { views, map, mapTall: count <= 2 };
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
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (const [u, v] of pts) {
    minU = Math.min(minU, u); maxU = Math.max(maxU, u);
    minV = Math.min(minV, v); maxV = Math.max(maxV, v);
  }
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

// Slot kinds only once the roll has landed; `rolling` flags a slot still spinning.
export function itemState(kart) {
  const { main, reserve, rollMain, rollReserve } = kart.item;
  return {
    item: {
      main: main && rollMain <= 0 ? main : null,
      reserve: reserve && rollReserve <= 0 ? reserve : null,
      rolling: !!main && rollMain > 0,
      rollingReserve: !!reserve && rollReserve > 0,
    },
  };
}

// ── Item roulette ────────────────────────────────────────────────────────────

export const ROULETTE_KINDS = ['mushroom', 'banana', 'green', 'red'];
export const ROLL_TOTAL = 1.6;
export const ROLL_TOTAL_STACKED = 1.9;
const ROULETTE_FAST = 12; // icons per second
const ROULETTE_SLOW = 0.6; // seconds of slow-down before landing
const ROULETTE_END_RATE = 2;
const BUMP_TIME = 0.25;
const BUMP_PEAK = 1.25;

// Icon shown `elapsed` s into a roll of `total` s: constant fast cycle, then a linear slow-down to a crawl.
export function rouletteFrame(elapsed, total = ROLL_TOTAL, kinds = ROULETTE_KINDS) {
  const t = Math.max(0, Math.min(elapsed, total));
  const t0 = Math.max(0, total - ROULETTE_SLOW);
  const d = t - t0;
  const decel = (ROULETTE_FAST - ROULETTE_END_RATE) / ROULETTE_SLOW;
  const pos = ROULETTE_FAST * Math.min(t, t0) + (d > 0 ? ROULETTE_FAST * d - 0.5 * decel * d * d : 0);
  return kinds[Math.floor(pos) % kinds.length];
}

// 1 -> 1.25 -> 1 over BUMP_TIME after the icon lands; 1 outside the bump.
export function landingScale(sinceLand) {
  if (sinceLand < 0 || sinceLand >= BUMP_TIME) return 1;
  return 1 + (BUMP_PEAK - 1) * Math.sin((Math.PI * sinceLand) / BUMP_TIME);
}

// Per-slot clock fed with each HUD snapshot: remembers when the slot started rolling and when it landed.
export function nextSlotClock(clock, rolling, now, total = ROLL_TOTAL) {
  if (rolling) return clock?.rolling ? clock : { rolling: true, since: now, total };
  return clock?.rolling ? { rolling: false, since: now, landed: true } : clock ?? { rolling: false, since: -Infinity };
}

// What a slot shows at `now`: the cycling icon while rolling, else the landed kind (or empty), scaled by the bump.
export function slotView(clock, kind, now) {
  if (clock?.rolling) return { icon: rouletteFrame(now - clock.since, clock.total), scale: 1, rolling: true };
  return { icon: kind ?? null, scale: kind && clock?.landed ? landingScale(now - clock.since) : 1, rolling: false };
}

export function buildStatus(race, cssById) {
  const players = {};
  for (const k of race.karts) {
    players[k.id] = {
      lap: Math.min(k.lap + 1, race.laps),
      laps: race.laps,
      place: k.place,
      color: cssById[k.id],
      finished: k.finished,
      ...itemState(k),
      hit: k.hit?.kind ?? null,
      incoming: race.entities.some((e) => e.kind === 'red' && e.target === k.id),
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
