# Grounding for architect arena

Repo: `/workspace` branch `cursor/kart-foundation-6164`.

## Callers that must keep working

```js
// onboarding handoff
return { players, track: entry.track };

// KartApp
const race = createRace(setup.players, now, setup.track);
<KartScene raceRef={raceRef} track={setup.track} />
<Minimap players={view.players} track={setup.track} />

// race step
race.track.followTrack?.(...) || race.track.sampleTrack(...)
stepItems(race, dt, KART_RADIUS)
```

## Track module surface today (Luigi Circuit)

Exports from `host/src/games/kart/track.js`: `PROGRESS_CONTINUITY`, `PERIM`, `HALF`, `poseAt`, `sampleTrack`, `followTrack`, `gridPose`, `trackVisuals`, plus internal `compile(plan)`.

Plan shape: waypoints, sandBands, dashes, corridors, grid, grassMargin. Compile asserts `PERIM` in (190, 245) which is Luigi-specific and must become per-track or move to tests.

## Character surface today

`{ id, name, body, hat, skin, css }` only. `PLAYABLE_IDS` gates onboarding. Race stores full character object on kart.

## Item surface today

`ITEMS` map with weight/label/color/mods/use/kind/guide/etc. `MODIFIERS` for speed/invuln/spin. `attachItems` places boxes at fixed progress fractions via singleton `poseAt`. Shells retire via singleton `sampleTrack`/`HALF`.

## Constraints

- Keep JS (no TS migration in this run).
- Prefer smallest diff that encodes the domain (model-the-domain, laziness).
- Existing node:test suites must stay the proof of non-regression.
- Phone client only needs item presentation labels/colors via race_status; do not redesign phone for foundation.
