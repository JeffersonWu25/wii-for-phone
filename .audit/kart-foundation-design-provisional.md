# Provisional design (deepen existing contracts)

Pending arena graft. Base assumption: deepen track object + character stats + item registry.

## Usage

```js
import { createTrack } from './track.js';
import { luigiPlan } from './tracks/luigi-circuit-plan.js';

const luigi = createTrack(luigiPlan, {
  id: 'luigi-circuit',
  itemBoxProgress: [0.08, 0.22, 0.38, 0.55, 0.72, 0.88],
});

TRACKS.push({ id: luigi.id, name: 'Luigi Circuit', blurb: '...', track: luigi });

const race = createRace(players, now, track);
// kart.scales from character.stats * race.tuning
attachItems(race); // race.track.itemBoxProgress + poseAt
track.trackVisuals(); // scene + minimap via prop
```

## Shape

- **Track.** Opaque object from `createTrack(plan, opts)`. Owns geometry, surfaces, dash, boxes-at-progress, visuals. Luigi-specific PERIM band lives in plan opts or luigi tests, not the compiler.
- **Character.** Cosmetics + `stats: { speed, turn, drift, boost }`. `createRace` stores scales on each kart. Host knobs multiply those scales race-wide.
- **Items.** Keep ITEMS/MODIFIERS registry and use fns. Bind all world queries to `race.track`. Optional later: `GUIDES` map for shell guidance.

## Rejected

- ECS / plugin loader (laziness).
- TypeScript migration this run.
- Second authored circuit as product content (stub/test track only).
