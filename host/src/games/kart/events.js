// RNG and the renderer event log — pure. items.js re-exports both.

const MAX_EVENTS = 64;

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Append-only log for the renderer; it remembers the last seq it consumed.
export function pushEvent(race, ev) {
  race.events.push({ seq: ++race.eventSeq, t: race.time, ...ev });
  if (race.events.length > MAX_EVENTS) race.events.splice(0, race.events.length - MAX_EVENTS);
}
