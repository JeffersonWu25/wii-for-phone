# Kart foundation design (synthesized)

Arena candidates did not return artifacts in this run. Synthesis follows the provisional deepen-existing-contracts design, screened against architect design-red-flags, and verified by the foundation harness.

## Problem

Mario Kart MVP works as one circuit with cosmetic characters and a singleton track import. Adding maps, weight-class stats, and items required editing core race/scene code.

## Usage

```js
const track = entry.track; // from TRACKS registry
const race = createRace(players, now, track);
// kart scales = character.stats * race.tuning
attachItems(race); // race.track.itemBoxProgress + poseAt
track.trackVisuals(); // KartScene + Minimap via prop
// new item = ITEMS entry + optional MODIFIERS / GUIDES key
```

## Shape

- Track object owns geometry, boxes-at-progress, visuals. Consumers take the object, never `import './track.js'` for gameplay.
- Character records own cosmetics + `stats`. `tuningScales` multiplies stats by host knobs.
- Items stay a registry of defs with `use` fns, `MODIFIERS`, and `GUIDES`. World queries go through `race.track`.

## Synthesis decision

Base is deepen-existing-contracts (provisional). Arena seats produced no competing packages this run, so no graft. createTrack factory extraction is the remaining map-authoring step so a second plan file compiles without editing the Luigi module body.

## Tradeoffs accepted

- Stub oval in tests proves multi-track createRace before a second authored circuit exists.
- Host knobs remain race-wide multipliers, not per-kart UI.
- No ECS or TypeScript migration.

## Alternatives considered

- ECS / plugin loader. Lost. Interface depth worse for this codebase size.
- Keep singleton track and only document "don't import it". Lost. Agents copy nearest import.

## Next implementation step

Extract `createTrack(plan, opts)` from `track.js` and prove a tiny rectangle plan in tests.
