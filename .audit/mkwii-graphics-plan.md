# MKWii graphics upgrade playbook

## Phase A frame

**Done predicate (falsifiable).** A live 2-player race on Luigi Circuit shows, in screenshots under `visual-baseline/current/` and `/opt/cursor/artifacts/`:

1. Karts with multi-part bodies, distinct wheels/hubs, and character silhouettes beyond a sphere-plus-box.
2. Track surfaces that read as asphalt, sand, and grass (textured or patterned, not flat solid colors for grass/sand).
3. Visible curb striping, start grid / checkered stripe, and orange boost dash panels.
4. Bright outdoor lighting with readable soft shadows under karts.
5. Chase camera with the kart in the lower-center of each pane (SPEC camera contract).
6. Drift charge and boost produce visible sparks / flame / smoke beyond a single opacity sphere and cone.
7. `foundation-check.mjs` and existing kart unit tests pass.
8. Repo contains no Nintendo ripped binary models/textures from spriters-resource.

**Scope.** Host kart rendering only (`host/src/games/kart/`). No phone, relay, race physics, or item rule changes unless a visual hook needs a read-only field that already exists.

**Rigor.** High for visual claims (before/after screenshots on the real host). Medium for physics (existing tests must stay green). License gate on every asset.

**Skip full architect/arena.** Shape is locked by constraints: keep vanilla Three.js, keep the lofted `trackVisuals()` pipeline, no R3F rewrite, no Nintendo binaries. mario-kart-js is a technique reference only (follow-light shadows, particle VFX ideas), not a stack to port.

## Units

| Id | Hypothesis | Check |
|---|---|---|
| U0 | Fresh baseline exists and harness can re-shot | screenshot script exit 0 |
| U1 | Richer procedural karts read as MKWii-like | before/after race shot |
| U2 | Textured course surfaces match Luigi Circuit read | race shot at bank + dash |
| U3 | Outdoor sun + soft shadows improve depth | race shot |
| U4 | Chase cam framing matches SPEC | layout/camera check |
| U5 | Drift/boost VFX are satisfying | forced-drift demo shot |
| U6 | Tone mapping helps without muddy colors | A/B shot or skip |
| U7 | Full verify + PR | tests + artifacts |

## Non-goals this run

- Porting to react-three-fiber / postprocessing stack from mario-kart-js.
- Shipping ripped Nintendo GLBs.
- Photorealism or heavy bloom.
- Changing multiplayer message protocol.
