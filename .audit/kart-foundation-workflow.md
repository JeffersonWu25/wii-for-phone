# Designed workflow (Phase B)

Riskiest unknown first. Harness before features.

1. **Harness (scaffold).** Commit `foundation-check.mjs` that fails on current singleton coupling and missing character stats. Capture baseline log.
2. **Architect arena.** Two whole-shape designs for track / character / item ownership. Cross-judge. Synthesize into `.audit/kart-foundation-design.md` + sketch.
3. **Track contract.** Split Luigi plan from compiler. Track object owns `poseAt`, `sampleTrack`, `followTrack`, `HALF`, `gridPose`, `trackVisuals`, item-box progress. Point scene/minimap/items at that object. Keep Luigi Circuit as the sole product track. Prove with stub second track in tests + harness green for track rules.
4. **Character stats.** Add `stats` to each character. Bake into per-kart scales in `createRace`. Host knobs multiply race-wide. Prove with two-character speed-cap test.
5. **Item extensibility.** `attachItems` / shell bounds use `race.track`. Keep registry. Prove with fixture self-item test if public register API is added, else prove via existing mushroom path plus a test that a new def in ITEMS works without race.js edits.
6. **Whole predicate.** Re-run foundation-check + full kart test suite. Decision trail row per unit. PR.

Each unit ends VERIFIED / NOT VERIFIED / INCONCLUSIVE before the next starts.
