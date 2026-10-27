/**
 * Host Runtime.evaluate expression factory.
 * Grants itemPrimary on the first kart so the phone Use item path can be proved
 * for each catalog id without waiting on RNG item boxes.
 *
 * Replace __ITEM_ID__ with mushroom | banana | green_shell | star.
 */
export function expressionFor(itemId) {
  return expression.replace('__ITEM_ID__', JSON.stringify(itemId));
}

export const expression = `(() => {
  const want = __ITEM_ID__;
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
        if (race && Array.isArray(race.karts) && race.phase === 'racing') {
          const kart = race.karts[0];
          if (!kart || kart.finished) return { error: 'no-live-kart' };
          // Park on the racing line so launched shells stay on asphalt long enough to observe.
          const pose = race.track.poseAt(kart.progress);
          kart.x = pose.x;
          kart.z = pose.z;
          kart.facing = pose.heading;
          kart.modifiers = {};
          kart.speedMul = 1;
          kart.itemPrimary = want;
          kart.itemSecondary = null;
          return { ok: true, itemPrimary: kart.itemPrimary, playerId: kart.playerId };
        }
      }
      hook = hook.next;
    }
    fiber = fiber.return;
  }
  return { error: 'no-race' };
})()`;
