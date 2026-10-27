/**
 * Phone Runtime.evaluate expression.
 * Presses #kart-item the same way a finger would (pointerdown → use_item).
 */
export const expression = `(() => {
  const btn = document.querySelector('#kart-item');
  if (!btn) return { error: 'no-item' };
  const before = {
    label: btn.textContent,
    armed: btn.classList.contains('is-armed'),
  };
  if (!before.armed) return { error: 'not-armed', before };
  const rect = btn.getBoundingClientRect();
  const clientX = rect.left + rect.width / 2;
  const clientY = rect.top + rect.height / 2;
  const common = {
    bubbles: true,
    cancelable: true,
    pointerId: 2,
    pointerType: 'touch',
    isPrimary: true,
    clientX,
    clientY,
  };
  // Synthetic pointer events are untrusted. setPointerCapture throws and would
  // abort the listener before sendMsg({ type: 'use_item' }). Stub it for the press.
  const capture = btn.setPointerCapture;
  btn.setPointerCapture = () => {};
  try {
    btn.dispatchEvent(new PointerEvent('pointerdown', common));
    btn.dispatchEvent(new PointerEvent('pointerup', common));
  } finally {
    btn.setPointerCapture = capture;
  }
  return {
    before,
    after: {
      label: btn.textContent,
      armed: btn.classList.contains('is-armed'),
      spinning: btn.classList.contains('is-spinning'),
      star: btn.classList.contains('is-star'),
    },
  };
})()`;
