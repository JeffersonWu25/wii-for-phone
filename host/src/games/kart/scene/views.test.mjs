import test from 'node:test';
import assert from 'node:assert/strict';
import { viewFov, viewRect } from './views.js';
import { splitLayout } from '../hud.js';

test('a 16:9 view keeps the base FOV and a narrow 2p half widens it', () => {
  assert.equal(viewFov(16 / 9), 60);
  assert.ok(viewFov(640 / 720) > 60);
});

test('four quadrant rects tile an odd canvas exactly', () => {
  const [width, height] = [1281, 721];
  const grid = Array.from({ length: height }, () => new Array(width).fill(0));
  for (const v of splitLayout(4).views) {
    const { x, y, w, h } = viewRect(v, width, height);
    for (let r = y; r < y + h; r++) for (let c = x; c < x + w; c++) grid[r][c]++;
  }
  assert.ok(grid.every((row) => row.every((n) => n === 1)));
});
