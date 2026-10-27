import test from 'node:test';
import assert from 'node:assert/strict';
import { paintItemButton } from './index.js';

function button() {
  const classes = new Set();
  return {
    textContent: '',
    classList: {
      toggle(name, on) {
        if (on) classes.add(name);
        else classes.delete(name);
      },
      contains(name) {
        return classes.has(name);
      },
    },
  };
}

test('a rolling primary shows an ellipsis and does not arm', () => {
  const el = button();
  paintItemButton(el, {
    primaryFace: 'roll',
    itemPrimary: 'mushroom',
    itemLabel: 'Mushroom',
    effect: 'spin',
  });
  assert.equal(el.textContent, '\u2026');
  assert.equal(el.classList.contains('is-rolling'), true);
  assert.equal(el.classList.contains('is-armed'), false);
  assert.equal(el.classList.contains('is-spinning'), true);
  assert.equal(el.textContent.includes('mushroom'), false);
  assert.equal(el.textContent.includes('Mushroom'), false);
});

test('a held primary shows the label and arms the button', () => {
  const el = button();
  paintItemButton(el, {
    primaryFace: 'held',
    itemPrimary: 'banana',
    itemLabel: 'Banana',
    effect: null,
  });
  assert.equal(el.textContent, 'Banana');
  assert.equal(el.classList.contains('is-armed'), true);
  assert.equal(el.classList.contains('is-rolling'), false);
  assert.equal(el.classList.contains('is-spinning'), false);
});

test('an item id with an empty face stays on Use item', () => {
  const el = button();
  paintItemButton(el, {
    primaryFace: null,
    itemPrimary: 'mushroom',
    itemLabel: null,
    effect: null,
  });
  assert.equal(el.textContent, 'Use item');
  assert.equal(el.classList.contains('is-armed'), false);
  assert.equal(el.classList.contains('is-rolling'), false);
});

test('the button follows the face from roll to held', () => {
  const el = button();
  paintItemButton(el, {
    primaryFace: 'roll',
    itemPrimary: 'star',
    itemLabel: null,
    effect: null,
  });
  paintItemButton(el, {
    primaryFace: 'held',
    itemPrimary: 'star',
    itemLabel: 'Star',
    effect: 'star',
  });
  assert.equal(el.textContent, 'Star');
  assert.equal(el.classList.contains('is-rolling'), false);
  assert.equal(el.classList.contains('is-armed'), true);
  assert.equal(el.classList.contains('is-star'), true);
  assert.equal(el.classList.contains('is-spinning'), false);
});
