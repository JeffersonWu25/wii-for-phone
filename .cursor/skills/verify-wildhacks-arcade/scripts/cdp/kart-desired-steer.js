export const expression = `(() => {
  const el = document.querySelector('.kart-layout');
  if (!el) return { error: 'no-layout' };
  const key = Object.keys(el).find((k) => k.startsWith('__reactFiber') || k.startsWith('__reactInternalInstance'));
  if (!key) return { error: 'no-fiber' };
  let fiber = el[key];
  let race = null;
  while (fiber && !race) {
    let hook = fiber.memoizedState;
    while (hook) {
      const ref = hook.memoizedState;
      if (ref && typeof ref === 'object' && 'current' in ref) {
        const cur = ref.current;
        if (cur && Array.isArray(cur.karts) && cur.track) {
          race = cur;
          break;
        }
      }
      hook = hook.next;
    }
    fiber = fiber.return;
  }
  if (!race) return { error: 'no-race' };
  const kart = race.karts[0];
  if (!kart) return { error: 'no-kart' };
  if (race.phase !== 'racing') {
    return {
      phase: race.phase,
      steer: 0,
      lap: kart.finished ? 3 : Math.min(3, kart.completedLaps + 1),
      completedLaps: kart.completedLaps,
      progress: kart.progress,
    };
  }
  const look = 0.035;
  let targetProgress = kart.progress + look;
  if (targetProgress >= 1) targetProgress -= 1;
  const pose = race.track.poseAt(targetProgress);
  const sample = race.track.sampleTrack(kart.x, kart.z);
  const toX = pose.x - kart.x;
  const toZ = pose.z - kart.z;
  const desired = Math.atan2(toX, toZ);
  let err = desired - kart.facing;
  while (err > Math.PI) err -= Math.PI * 2;
  while (err < -Math.PI) err += Math.PI * 2;
  const lateral = sample?.lateral ?? 0;
  let steer = err * 1.35 - lateral * 0.08;
  if (steer > 1) steer = 1;
  if (steer < -1) steer = -1;
  return {
    phase: race.phase,
    steer,
    lap: kart.finished ? 3 : Math.min(3, kart.completedLaps + 1),
    completedLaps: kart.completedLaps,
    progress: kart.progress,
    lateral,
  };
})()`;
