export function slots(count) {
  const n = Math.max(1, count);
  if (n === 1) return [{ x: 0, y: 0, w: 1, h: 1 }];
  if (n === 2) {
    return [
      { x: 0, y: 0, w: 0.5, h: 1 },
      { x: 0.5, y: 0, w: 0.5, h: 1 },
    ];
  }
  if (n === 3) {
    return [
      { x: 0, y: 0, w: 0.5, h: 0.5 },
      { x: 0.5, y: 0, w: 0.5, h: 0.5 },
      { x: 0.25, y: 0.5, w: 0.5, h: 0.5 },
    ];
  }
  const cols = n <= 4 ? 2 : n <= 6 ? 3 : n <= 9 ? 3 : 4;
  const rows = Math.ceil(n / cols);
  const out = [];
  for (let i = 0; i < n; i++) {
    const c = i % cols;
    const r = Math.floor(i / cols);
    out.push({ x: c / cols, y: r / rows, w: 1 / cols, h: 1 / rows });
  }
  return out;
}

export function viewports(count, width, height) {
  return slots(count).map((slot) => ({
    x: slot.x * width,
    y: (1 - slot.y - slot.h) * height,
    w: slot.w * width,
    h: slot.h * height,
    css: {
      left: `${slot.x * 100}%`,
      top: `${slot.y * 100}%`,
      width: `${slot.w * 100}%`,
      height: `${slot.h * 100}%`,
    },
  }));
}
