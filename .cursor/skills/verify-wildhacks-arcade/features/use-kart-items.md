# Use every Mario Kart item

Use every Mario Kart item proves the phone `Use item` control for each catalog item: Mushroom, Banana, Green Shell, and Star. The harness grants the slot on the host so coverage does not depend on item-box RNG. The press still comes from the phone button.

## Sub-features

- `kart-item-grant` puts one catalog id into the live kart's primary slot.
- `kart-item-arm` shows that label on `#kart-item` with class `is-armed`.
- `kart-item-fire` sends `use_item` from a phone pointer press and clears the slot.
- `kart-item-effect` shows the matching result: boost or star FX for self-buffs, a banana or shell entity for drops and launches.

## How to get to it (user POV)

- Start a Mario Kart race the same way as Completing one lap, through `Start Race` and `race_go`.
- Drive through an item box on the course to fill the slot, or accept a granted slot in the harness.
- Tap `Use item` on the phone. The TV shows the boost, star glow, dropped banana, or fired shell.

## Driving it with cursor-ide-browser

Preconditions:

- `scripts/doctor.sh` prints `DOCTOR OK`.
- The race is in `phase: "racing"` with `#kart-stick` and `#kart-item` mounted. Reuse the race-start steps from `complete-lap` when needed.
- Catalog ids under test, in order: `mushroom`, `banana`, `green_shell`, `star`.

For each id:

- **Grant.** On the host tab, `browser_cdp` `Runtime.evaluate` the expression in `scripts/cdp/kart-grant-item.js` after replacing `__ITEM_ID__` with the JSON string for that id (for example `"mushroom"`). Expect `ok: true` and `itemPrimary` equal to that id.
- **Confirm arming.** Wait until the phone `#kart-item` text is the presentation label (`Mushroom`, `Banana`, `Green Shell`, or `Star`) and the button has class `is-armed`. Host `.kart-item-primary` contains `.item-<id>`. Snapshot both tabs into `artifacts/use-kart-items/<id>-armed.aria.txt` and `<id>-armed.png` (host and phone prefixes as needed).
- **Fire.** On the phone tab, `browser_cdp` `Runtime.evaluate` the expression in `scripts/cdp/kart-use-item.js`. Expect `before.armed` true and a label match. After the press, the button returns toward `Use item` with `is-armed` false once the next `race_status` lands.
- **Observe the effect.** On the host, evaluate `scripts/cdp/kart-find-race.js`:
  - `mushroom`: `effect` is `boost` (or was, within the 1.5s buff window).
  - `star`: `effect` is `star` (within the 5s window).
  - `banana`: `entities` includes `banana`.
  - `green_shell`: `entities` includes `shell` at least once in the first ~1.5s (shells leave the track fast).
  Save that JSON as `artifacts/use-kart-items/<id>-after.json`. The grant expression parks the kart on the racing line before launch so the shell is observable.
- **Proof.** Keep the armed screenshots plus the after JSON for all four ids. A run that only uses one RNG drop is incomplete.

## Gotchas

- Item boxes roll weighted RNG (`mushroom` 35, `banana` 30, `green_shell` 25, `star` 10). Do not rely on boxes for full catalog coverage. The grant expression is the harness. The phone press is still the user action under test.
- `browser_click` on `Use item` may not fire `pointerdown` the way the control listens. Use the CDP pointer expression.
- Synthetic pointer events are untrusted. `setPointerCapture` throws inside the phone listener and would skip `use_item`. The CDP expression stubs `setPointerCapture` on `#kart-item` for that press only.
- Granting while `phase` is still `countdown` returns `no-race` or ignores the use. Wait for `racing`.
- Self-buff FX expire. Read `effect` promptly after mushroom or star. Banana and shell proof is the entity kind list, not FX.
- Do not send a raw `use_item` WebSocket frame from the host or relay tooling. The phone page must send it.
- Labels are fixed in `host/src/games/kart/items.js` (`presentation`). Assert those strings, not the raw id, on the phone button.
