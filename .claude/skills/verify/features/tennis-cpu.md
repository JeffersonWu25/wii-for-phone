# Play a CPU

One phone sits on side B, Add CPU fills side A, and the CPU serves the first point. The phone is not asked to toss.

## Sub-features

- `seat-cpu`: one phone is not a match until Add CPU makes it 1v1.
- `cpu-serve`: the court has four bodies, the CPU owns two, and the point reaches a flight with no phone swing. Both players are already on a forehand or a backhand.

## How to get to it (user POV)

- Open the host, join one phone, choose Tennis, put the phone on side B, press Add CPU, choose One game, and press Start.

## Driving it with Playwright

Preconditions: `DOCTOR OK`.

- Join Ada and open Tennis. Expect `.tennis-format` `Need 2 to 4 players`.
- Press Ada's `.tennis-side-b`, then `.tennis-cpu`. Expect a CPU row and format `1v1`.
- Press `.tennis-length[data-best-of="1"]`, capture `host-teams`, then `.tennis-start`.
- Expect four players from `window.__tennisView()`, two with `controlledBy` `cpu`.
- Wait until the phone's `#tennis-label` is `Swing`. Expect phase `flight`, `serverId` `cpu`, and no outbound phone `swing` frame. Expect every `hand` to be `forehand` or `backhand`. Capture `host-cpu`.

## Gotchas

- A single phone is seated out, so the drive has to place Ada on side B before Add CPU. Add CPU then takes the empty side A and serves.
- The CPU tosses on its own. Do not send a toss from the phone.
