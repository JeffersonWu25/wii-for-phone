// Pure helpers for the phone ITEM button: roulette frame, landing bump, and the button's view model.
// The roulette timing mirrors host/src/games/kart/hud.js (status arrives at <= 4 Hz, so the phone animates locally).

export const ROULETTE_KINDS = ['mushroom', 'banana', 'green', 'red'];
export const ROLL_TOTAL = 1.6;
const FAST = 12; // icons per second
const SLOW = 0.6; // seconds of slow-down before landing
const END_RATE = 2;
const BUMP_TIME = 0.25;
const BUMP_PEAK = 1.25;

export function rouletteFrame(elapsed, total = ROLL_TOTAL, kinds = ROULETTE_KINDS) {
  const t = Math.max(0, Math.min(elapsed, total));
  const t0 = Math.max(0, total - SLOW);
  const d = t - t0;
  const decel = (FAST - END_RATE) / SLOW;
  const pos = FAST * Math.min(t, t0) + (d > 0 ? FAST * d - 0.5 * decel * d * d : 0);
  return kinds[Math.floor(pos) % kinds.length];
}

export function landingScale(sinceLand) {
  if (sinceLand < 0 || sinceLand >= BUMP_TIME) return 1;
  return 1 + (BUMP_PEAK - 1) * Math.sin((Math.PI * sinceLand) / BUMP_TIME);
}

// state: 'empty' | 'rolling' | 'ready'. Only a landed main item is usable.
export function buttonView(item) {
  const main = item?.main ?? null;
  const rolling = !!item?.rolling;
  const state = rolling ? 'rolling' : main ? 'ready' : 'empty';
  return { state, main, usable: state === 'ready', reserve: item?.reserve ?? null, reserveRolling: !!item?.rollingReserve };
}

// Which buzzes a status change earns: once when `incoming` turns on, once when a hit starts.
export function buzzEvents(prev, next) {
  return { incoming: !!next?.incoming && !prev?.incoming, hit: !!next?.hit && !prev?.hit };
}
