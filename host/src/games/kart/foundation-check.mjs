#!/usr/bin/env node
/**
 * Foundation coupling harness. Fails when kart consumers bind to the Luigi
 * Circuit module singleton instead of the race's track object, or when
 * characters lack stats that createRace can bake into per-kart scales.
 *
 * Run: node host/src/games/kart/foundation-check.mjs
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const failures = [];

function read(name) {
  return readFileSync(join(root, name), 'utf8');
}

function ban(file, pattern, why) {
  const src = read(file);
  if (pattern.test(src)) failures.push(`${file}: ${why}`);
}

// Consumers must not import geometry from the Luigi module path.
ban(
  'items.js',
  /from\s+['"]\.\/track\.js['"]/,
  'items must use race.track, not import ./track.js',
);
ban(
  'KartScene.jsx',
  /from\s+['"]\.\/track\.js['"]/,
  'KartScene must use the track prop / race.track.trackVisuals, not import ./track.js',
);
ban(
  'Minimap.jsx',
  /from\s+['"]\.\/track\.js['"]/,
  'Minimap must use the track prop, not import ./track.js',
);

// Character records must expose stats used by race physics.
const { CHARACTERS, characterById } = await import(pathToFileURL(join(root, 'characters.js')).href);
for (const character of CHARACTERS) {
  const stats = character.stats;
  if (!stats || typeof stats !== 'object') {
    failures.push(`characters.js: ${character.id} missing stats`);
    continue;
  }
  for (const key of ['speed', 'turn', 'drift', 'boost']) {
    if (!(Number(stats[key]) > 0)) {
      failures.push(`characters.js: ${character.id}.stats.${key} must be a positive number`);
    }
  }
}
const mario = characterById('mario');
if (!mario?.stats) failures.push('characterById(mario) missing stats');

// Track registry must expose trackVisuals on the track object.
const { TRACKS } = await import(pathToFileURL(join(root, 'tracks.js')).href);
for (const entry of TRACKS) {
  const track = entry.track;
  if (typeof track?.poseAt !== 'function') failures.push(`${entry.id}: missing poseAt`);
  if (typeof track?.sampleTrack !== 'function') failures.push(`${entry.id}: missing sampleTrack`);
  if (typeof track?.trackVisuals !== 'function') failures.push(`${entry.id}: missing trackVisuals`);
  if (typeof track?.HALF !== 'number') failures.push(`${entry.id}: missing HALF`);
  if (!Array.isArray(track?.itemBoxProgress) && typeof track?.itemBoxes !== 'function') {
    failures.push(`${entry.id}: missing itemBoxProgress or itemBoxes()`);
  }
}

if (failures.length) {
  console.error('foundation-check FAILED');
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
console.log('foundation-check OK');
