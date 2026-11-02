// Pure helpers for the Kart Racer host: player colors, countdown, minimap fit, relay payloads.
import { COUNTDOWN_SECONDS } from './race.js';

// ── Colors ───────────────────────────────────────────────────────────────────

const PALETTE = [0xe8423a, 0x3a7be8, 0xf2c230, 0x3fb55a, 0x9b5de5, 0xff8c1a, 0xff5fa2, 0x18c6c0];

export const cssColor = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
export const playerColor = (i) => PALETTE[((i % PALETTE.length) + PALETTE.length) % PALETTE.length];

export const ordinal = (n) => (n === 1 ? '1st' : n === 2 ? '2nd' : n === 3 ? '3rd' : `${n}th`);

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

// Fits the centerline into a width x height box (y flipped is not needed: +z is down-screen, matching top-down).
export function fitMinimap(samples, width, height, pad = 12, step = 8) {
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (const p of samples) {
    minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z);
  }
  const scale = Math.min((width - 2 * pad) / (maxX - minX), (height - 2 * pad) / (maxZ - minZ));
  const offX = (width - (maxX - minX) * scale) / 2 - minX * scale;
  const offZ = (height - (maxZ - minZ) * scale) / 2 - minZ * scale;
  const project = (x, z) => [x * scale + offX, z * scale + offZ];
  const pts = [];
  for (let i = 0; i < samples.length; i += step) pts.push(project(samples[i].x, samples[i].z));
  const path = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join('') + 'Z';
  return { project, path, scale };
}

// Perpendicular tick across the start line (samples[0] heads along its h).
export function startTick(project, sample, half = 6) {
  const [x, y] = project(sample.x, sample.z);
  const rx = -Math.sin(sample.h) * half;
  const ry = Math.cos(sample.h) * half;
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
