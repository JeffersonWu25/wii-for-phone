export function expressionFor(steer) {
  const value = Number(steer);
  const safe = Number.isFinite(value) ? Math.max(-1, Math.min(1, value)) : 0;
  return expression.replace('__STEER__', String(safe));
}

export const expression = `(() => {
  const steer = __STEER__;
  const stick = document.querySelector('#kart-stick');
  if (!stick) return { error: 'no-stick' };
  const rect = stick.getBoundingClientRect();
  if (!(rect.width > 0)) return { error: 'stick-flat' };
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  const radius = rect.width / 2;
  const x = -steer * radius * 0.9;
  const y = -radius * 0.55;
  const clientX = cx + x;
  const clientY = cy + y;
  const common = {
    bubbles: true,
    cancelable: true,
    pointerId: 1,
    pointerType: 'touch',
    isPrimary: true,
    clientX,
    clientY,
  };
  if (!stick.hasPointerCapture?.(1)) {
    stick.dispatchEvent(new PointerEvent('pointerdown', common));
  }
  stick.dispatchEvent(new PointerEvent('pointermove', common));
  const lap = document.querySelector('#kart-lap')?.textContent ?? '';
  const item = document.querySelector('#kart-item')?.textContent ?? '';
  return { ok: true, steer, lap, item };
})()`;
