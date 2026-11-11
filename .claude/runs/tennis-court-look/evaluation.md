# Evaluation — on-court look

Evaluator: a fresh `grok-4.7-high` that did not write either look. It scored the attached reference and the screenshots named below. It wrote no feature code.

Build A is the tracked camera, commit `f252f8c`. Build B is the locked camera, commit `e1ffbb5`.

| Criterion | Weight | A | B |
|---|---:|---:|---:|
| Camera height and closeness | 20 | 4 | 5 |
| Split | 15 | 3 | 5 |
| Racket read | 15 | 5 | 4 |
| Forehand, backhand, and serve are different | 20 | 4 | 4 |
| Contact | 15 | 4 | 5 |
| Walk cycle | 10 | 4 | 5 |
| Smooth posing and court kept | 5 | 5 | 3 |
| Weighted total | 100 | 81 | 91 |

## Verdict

B is the base. The locked camera keeps the head in the lower half, the feet at the bottom, and the far baseline in frame. The split shows both sides of the enclosed court. A's side-B pane looks out into empty sky because that build did not add the far wall, and its camera pitches up into the sky.

## Grafts

From A, the only criterion it wins by 2 or more:

- Keep the string bed face-on through the forehand and the backhand, so the hoop does not turn into an edge-on blue bar. Take that behavior from A's stroke face and roll. Do not take A's camera or A's one-ended court.

## Shared gaps the graft also fixes

- Forehand contact sits out by the shoulder or down at the waist. Put the ball on the strings in front of the chest.
- The reference crops the feet on the bottom edge and runs the trees to the top of the frame. Both builds leave the shoes fully inside the pane and a band of sky above the trees. Bring the near player and the racket up in the frame, and keep the camera locked to the baseline center.
