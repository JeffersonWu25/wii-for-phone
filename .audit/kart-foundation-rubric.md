# Arena rubric (picker only)

1. **Extension cost.** Adding a map / character-with-stats / item touches one registry or plan file without editing race step core.
2. **Interface depth.** Small public surface that hides compile, box placement, and modifier rules.
3. **No singleton leakage.** Scene, minimap, and items cannot reach Luigi geometry except through the race's track object.
4. **Fits existing JS callers.** `createRace`, onboarding handoff, and host knobs keep working with a thin adapter, not a rewrite.
5. **Agent-safe.** An agent that opens one file and copies the nearest example cannot bypass the contract.
6. **Laziness.** No ECS, no plugin loader, no TypeScript migration required for the foundation.
