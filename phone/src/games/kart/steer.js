function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

/**
 * Stick policy. Lengths are fractions of the stick radius.
 * The stick has three radial zones:
 *   |x| <= deadZone                        steer 0
 *   deadZone < |x|  and  |knob| < driftAt  curved steer, no drift
 *   |knob| >= driftAt  (the rim band)      drift; steer still follows x and is full lock at |x| >= driftAt
 * Invariant (tested): 0 <= deadZone < driftAt <= 1.
 * @typedef {{ readonly deadZone: number, readonly driftAt: number, readonly curve: number }} StickPolicy
 */

/**
 * What the stick means right now. Produced only by stickInput.
 * @typedef {Object} StickInput
 * @property {number}  steer  -1..1. +1 is a full left turn. Stick right gives negative steer.
 * @property {boolean} drift  true iff hypot(knobX, knobY) >= STICK.driftAt.
 * @property {number}  knobX  Knob centre on the unit disc, screen axes, +x right.
 * @property {number}  knobY  +y down. knobX² + knobY² <= 1.
 */

/** @type {StickPolicy} */
export const STICK = Object.freeze({
  deadZone: 0.12,
  driftAt: 0.92,
  curve: 1.35,
});

const CENTER = Object.freeze({ steer: 0, drift: false, knobX: 0, knobY: 0 });

/**
 * Map a touch offset from the stick centre to drive intent and the knob position to draw.
 * Pure and total. Non-finite input or a radius that is not positive returns the centred input.
 *
 * @param {number} dx      px, touch.x - centre.x (+ right)
 * @param {number} dy      px, touch.y - centre.y (+ down)
 * @param {number} radius  px, centre to rim; the knob centre sits on the rim at full deflection
 * @returns {StickInput}
 */
export function stickInput(dx, dy, radius) {
  if (!(radius > 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return CENTER;
  let x = dx / radius;
  let y = dy / radius;
  let m = Math.hypot(x, y);
  if (m > 1) {
    x /= m;
    y /= m;
    m = 1;
  }
  const drift = m >= STICK.driftAt;
  const ramp = clamp((Math.abs(x) - STICK.deadZone) / (STICK.driftAt - STICK.deadZone), 0, 1);
  const mag = ramp ** STICK.curve;
  const steer = mag === 0 ? 0 : (x < 0 ? mag : -mag);
  return { steer, drift, knobX: x, knobY: y };
}
