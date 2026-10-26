# Kart foundation framing

## Definition of done (falsifiable)

A foundation lands when all of these hold on the real tree, not in a plan:

1. **Multi-map.** Adding a second raceable track is one plan file plus one `TRACKS` registry row. `race.js`, `items.js`, `KartScene.jsx`, and `Minimap.jsx` never import Luigi Circuit geometry as a module singleton. A harness script fails if those imports return. A unit test builds a race on a stub second track and steps without throwing.
2. **Multi-character stats.** Each character carries `stats: { speed, turn, drift, boost }`. `createRace` bakes those into per-kart scales. Host knobs remain a race-wide multiplier on top. A unit test shows two characters under identical host tuning reach different speed caps. Cosmetics stay on the character record.
3. **Extensible items.** A new item is one registry entry (data + `use` fn, optional mod). Item boxes and off-track retirement read the track from `race.track`. A unit test registers a one-off item via the public registry helper (or proves the existing registry pattern with a fixture) and activates it. No new `kind` switch arm is required for a self-buff item.
4. **Behavior preserved.** Existing `race.test.mjs`, `track.test.mjs`, `onboarding.test.mjs` stay green. No intentional gameplay bugfix unless it is forced by the reshape.

## Scope

Rough units: ~5k LOC under `host/src/games/kart` plus phone controller. Effort is a structural reshape of track/character/item ownership, not a second map or a new item in content.

Out of scope for this run: fixing shaky race feel, new maps as product content, new characters as product content, phone UX polish, visual fidelity.

## Rigor

High. Wrong boundaries here lock every later map and item. Gates are a failing-then-passing coupling harness, unit tests for the three extension stories, and a committed decision trail.

## Grounding (current shape)

- `tracks.js` already has a registry of one entry whose `track` is the `track.js` module namespace.
- `createRace(players, now, track)` already takes a track object and asserts `poseAt` / `sampleTrack` / `HALF`.
- Couplings that break multi-map: `items.js` imports `HALF`, `poseAt`, `sampleTrack` from `./track.js`; `KartScene` and `Minimap` call `trackVisuals()` from `./track.js` and ignore the `track` prop.
- Characters are cosmetics only. Physics uses race-wide `DEFAULT_TUNING` / host knobs.
- Items are partly data-driven (`ITEMS` + `MODIFIERS` + `use`) but box placement and shell bounds are singleton-track.

## Tradeoffs to accept up front

- Ship a stub second track in tests, not a second authored circuit, so the contract is proven without content work.
- Keep host tuning as race-wide overlay; character stats are the per-kart base. That matches Mario Kart feel and keeps the settings panel simple.
- Do not invent an ECS or plugin loader. Prefer registries and a track module contract (laziness).
