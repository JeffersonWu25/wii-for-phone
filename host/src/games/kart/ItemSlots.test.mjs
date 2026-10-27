import test from 'node:test';
import assert from 'node:assert/strict';
import esbuild from 'esbuild';
import { createRequire } from 'node:module';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const kartDir = fileURLToPath(new URL('.', import.meta.url));

async function loadRenderer() {
  const dir = mkdtempSync(join(tmpdir(), 'item-slots-'));
  // react-dom/server require()s node builtins. A .mjs name would parse this bundle as ESM.
  const outfile = join(dir, 'render.cjs');
  await esbuild.build({
    stdin: {
      contents: `
        import React from 'react';
        import { renderToStaticMarkup } from 'react-dom/server';
        import ItemSlots from './ItemSlots.jsx';
        export function renderSlots(props) {
          return renderToStaticMarkup(React.createElement(ItemSlots, props));
        }
      `,
      resolveDir: kartDir,
      sourcefile: 'item-slots-render-entry.js',
      loader: 'js',
    },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    outfile,
    jsx: 'automatic',
    logLevel: 'silent',
  });
  const mod = createRequire(import.meta.url)(outfile);
  return {
    renderSlots: mod.renderSlots,
    cleanup() {
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

let renderSlots;
let cleanup;

test.before(async () => {
  const loaded = await loadRenderer();
  renderSlots = loaded.renderSlots;
  cleanup = loaded.cleanup;
});

test.after(() => {
  cleanup?.();
});

test('a rolling slot hides the item id and shows the reel', () => {
  const html = renderSlots({
    primary: 'mushroom',
    secondary: 'star',
    color: '#e23b3b',
    secondaryColor: '#ffe566',
    primaryFace: 'roll',
    secondaryFace: 'roll',
    effect: null,
  });
  assert.match(html, /kart-item-primary[^"]*is-rolling/);
  assert.match(html, /kart-item-secondary[^"]*is-rolling/);
  assert.equal((html.match(/kart-item-roll/g) || []).length, 2);
  assert.equal(html.includes('kart-item-icon'), false);
  assert.equal(html.includes('mushroom'), false);
  assert.equal(html.includes('star'), false);
  assert.equal(html.includes('#e23b3b'), false);
  assert.equal(html.includes('#ffe566'), false);
});

test('a held slot shows that item color and glyph', () => {
  const html = renderSlots({
    primary: 'mushroom',
    secondary: 'star',
    color: '#e23b3b',
    secondaryColor: '#ffe566',
    primaryFace: 'held',
    secondaryFace: 'held',
    effect: 'spin',
  });
  assert.match(html, /kart-items kart-fx-spin/);
  assert.match(html, /item-mushroom/);
  assert.match(html, /item-star/);
  assert.match(html, /#e23b3b/);
  assert.match(html, /#ffe566/);
  assert.equal(html.includes('is-rolling'), false);
  assert.equal(html.includes('kart-item-roll'), false);
});

test('roll and held can share the two slots', () => {
  const html = renderSlots({
    primary: 'mushroom',
    secondary: 'banana',
    color: '#e23b3b',
    secondaryColor: '#ffe14a',
    primaryFace: 'roll',
    secondaryFace: 'held',
    effect: null,
  });
  assert.match(html, /kart-item-primary[^"]*is-rolling/);
  assert.match(html, /kart-item-secondary[^"]*is-filled/);
  assert.equal(/kart-item-secondary[^"]*is-rolling/.test(html), false);
  assert.match(html, /item-banana/);
  assert.match(html, /#ffe14a/);
  assert.equal(html.includes('mushroom'), false);
  assert.equal(html.includes('#e23b3b'), false);
  assert.equal((html.match(/kart-item-roll/g) || []).length, 1);
});

test('an id with an empty face draws an empty slot', () => {
  const html = renderSlots({
    primary: 'mushroom',
    secondary: null,
    color: '#e23b3b',
    secondaryColor: null,
    primaryFace: null,
    secondaryFace: null,
    effect: null,
  });
  assert.equal(html.includes('is-filled'), false);
  assert.equal(html.includes('is-rolling'), false);
  assert.equal(html.includes('kart-item-icon'), false);
  assert.equal(html.includes('kart-item-roll'), false);
  assert.equal(html.includes('mushroom'), false);
});
