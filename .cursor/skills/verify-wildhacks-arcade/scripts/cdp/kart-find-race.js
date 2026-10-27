export const expression = `(() => {
  const el = document.querySelector('.kart-layout');
  if (!el) return { error: 'no-layout' };
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  if (!key) return { error: 'no-fiber' };
  let fiber = el[key];
  while (fiber) {
    let hook = fiber.memoizedState;
    while (hook) {
      const ref = hook.memoizedState;
      if (ref && typeof ref === 'object' && 'current' in ref) {
        const race = ref.current;
        if (race && Array.isArray(race.karts) && typeof race.phase === 'string') {
          const kart = race.karts[0];
          return {
            phase: race.phase,
            countdown: race.countdown,
            playerId: kart?.playerId ?? null,
            lap: kart ? (kart.finished ? 3 : Math.min(3, kart.completedLaps + 1)) : null,
            completedLaps: kart?.completedLaps ?? null,
            progress: kart?.progress ?? null,
            itemPrimary: kart?.itemPrimary ?? null,
            effect: kart?.modifiers
              ? (kart.modifiers.invuln > 0 ? 'star'
                : kart.modifiers.spin > 0 ? 'spin'
                : kart.modifiers.speed > 0 ? 'boost'
                : null)
              : null,
            entities: (race.entities || []).map((e) => e.kind),
            itemPresses: kart?.itemPresses ?? 0,
          };
        }
      }
      hook = hook.next;
    }
    fiber = fiber.return;
  }
  return { error: 'no-race' };
})()`;
