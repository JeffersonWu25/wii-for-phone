# Play a tennis point

Five phones join one host. The host selects Tennis, sets the sides, and starts a one-game match. Ada tosses and serves with the phone's motion listener. The court shows the point once the score leaves 0–0 or the phase is `called`.

## Sub-features

- `teams-five`: with Ada, Bea, Cal, Dee, and Eve joined, the team screen says `Choose sides`, the format is `2v2`, Ada and Bea are Side A, Cal and Dee are Side B, Eve sits out, Best of 3 is pressed, and Start is enabled.
- `teams-illegal`: moving Eve to Side A shows `Need 2 to 4 players` and disables Start. Eve then sits out again.
- `teams-singles`: moving Bea to Side B and sitting Cal and Dee out shows `1v1` and enables Start.
- `teams-one-two`: putting Cal on Side B shows `1v2`. Sitting Cal out again leaves Ada against Bea.
- `roles-on-court`: `One game` then Start shows `.tennis-court canvas`. Ada's label is `Swing up to toss`, Bea's is `Watch the point`, and Eve's is `Sitting this one out`.
- `toss-and-serve`: a four-sample upward flick sends one `toss`, then a four-sample forehand sends one `swing`. Both frames leave Ada's phone and arrive at the host.
- `point-leaves-love`: `window.__tennisView()` then shows a score other than 0–0, or phase `called`.

## How to get to it (user POV)

- Open the host and join five phones: Ada, Bea, Cal, Dee, Eve.
- Press `Select Game` and choose the Tennis card.
- Read the sides. Move Eve onto Side A, then sit Eve out. Move Bea to Side B and sit Cal and Dee out. Put Cal on Side B, then sit Cal out so Ada plays Bea.
- Press `One game`, then `Start`.
- On Ada's phone, flick up to toss, then swing a forehand to serve.
- Watch the court until the point is called or the score changes.

## Driving it with Playwright

Preconditions: instance doctor is `DOCTOR OK`. The script opens one fresh host at 1280×720 and joins Ada, Bea, Cal, Dee, and Eve before selecting Tennis.

Run it:

```bash
node .claude/skills/verify/scripts/drive.mjs tennis-match
```

Steps the script performs:

- Join the five phones, press `Select Game`, and click the Tennis card.
- Expect `.tennis-title` `Choose sides`, `.tennis-format` `2v2`, Side A pressed for Ada and Bea, Side B pressed for Cal and Dee, Sit out pressed for Eve, `.tennis-length[data-best-of="3"]` pressed, and `.tennis-start` enabled. Capture `host-teams-five`.
- Click Eve's `.tennis-side-a`. Expect format `Need 2 to 4 players` and Start disabled. Capture `host-teams-illegal`. Click Eve's `.tennis-sit`.
- Click Bea's `.tennis-side-b`, then Cal's `.tennis-sit` and Dee's `.tennis-sit`. Expect format `1v1`, Ada on Side A, Bea on Side B, and Start enabled. Capture `host-teams-singles`.
- Click Cal's `.tennis-side-b`. Expect format `1v2`. Capture `host-teams-one-two`. Click Cal's `.tennis-sit` so the format is `1v1` again, Ada against Bea.
- Click `.tennis-length[data-best-of="1"]` (`One game`), then `.tennis-start`.
- Expect `.tennis-court canvas`. Expect `#tennis-label` `Swing up to toss` on Ada, `Watch the point` on Bea, and `Sitting this one out` on Eve. Capture `host-court`, `phone-toss`, and `phone-sitting`.
- On Ada's page, dispatch four `devicemotion` events about 30 ms apart with `rotationRate.beta` 100, 200, 120, 80, `gamma` 0, and `accelerationIncludingGravity` `{x:0,y:0,z:0}`. Wait until her label is `Swing to serve`.
- Dispatch five more events about 30 ms apart. The first four have `rotationRate.gamma` 400, 500, 420, 200 and `beta` 0. The fifth has `gamma` 0 so the burst can end. Every event also carries `accelerationIncludingGravity` and `rotationRate`.
- From `frames.jsonl`: expect one outbound `toss` and one outbound `swing` from `phone:Ada`, in that order, and the same two inbound frames on the host.
- Poll `window.__tennisView()` (read only) until `phase` is `called` or the points or games are not 0–0. Capture `host-point`.

Evidence in `artifacts/tennis-match/`: `host-teams-five`, `host-teams-illegal`, `host-teams-singles`, `host-teams-one-two`, `host-court`, `phone-toss`, `phone-sitting`, and `host-point`, each as `.png` and `.aria.txt`, plus `frames.jsonl`.

## Gotchas

- The flick is synthetic `devicemotion` events. The phone's own listener, buffer, and `readMotion` classifier send the `toss` and `swing`. It is not a proof of how a human swing feels.
- The phone ignores a `devicemotion` event unless both `accelerationIncludingGravity` and `rotationRate` are present. `beta` and `gamma` on the sample are the rotation rates, not orientation angles.
- Read `window.__tennisView()`. Do not assign it and do not call rally or scene functions. Do not move the camera. The `host-point` picture is the grass check: read that screenshot. A cropped near baseline is reported from the picture.
- Default seating for five players puts the first two on Side A and the next two on Side B. Ada and Bea start on the same side. A 1v1 between them needs Bea moved to Side B before Cal and Dee sit out.
- A serve that is still in flight has not changed the score yet. The wait covers the flight and the bounce. The first read of the view can already be the next serve, with the points no longer 0–0.
