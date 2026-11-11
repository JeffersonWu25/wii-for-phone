# On-court look

The reference photo (attached to the task, also at `/home/ubuntu/.cursor/projects/agent-repos-wii-for-phone/assets/809db3e5-30e8-4c6b-86c6-ba64356da851.png`) is the source of truth for the framing. Match its composition. Do not copy Nintendo meshes, textures, or curves.

Own only:

- `host/src/games/tennis/scene.js`
- `host/src/games/tennis/TennisApp.jsx`
- `host/src/games/tennis/match.css`
- `host/src/games/tennis/preview.js`

Leave the court geometry (lines, net, hedges, walls, crowd, grass, the x-mirror of the world) in place. The rally's +x is on the right when looking from side A toward side B. The world group is mirrored and `lookAt` negates x. Keep that contract. Side B's pane looks back down the court and still has that player's right on the correct side of the pane.

## Camera

- Camera y between 1.45 m and 2.05 m.
- About 3.2 m to 4.6 m behind the near baseline player, looking toward the far court so the near player's head is in the lower half, feet near the bottom, far baseline still visible.
- Field of view between 48 and 58 degrees.
- Vertical split, equal panes, when both sides have at least one player. One camera behind each side. Same ball, same players. A dark divider about 2 px.
- Score text centered along the top, above the join. Move the Quit button to the top-right so it does not cover the score.

Your approach note (tracked or locked) is in the brief. Stay inside the height, distance, and field-of-view band either way.

## Body and racket

The current arm is one cylinder. Add an upper arm and a forearm with an elbow, and a hand on the racket grip. Scale the racket head up so it reads about as large as the torso in the low camera (around 1.8× the current hoop). Keep a visible string bed.

Poses, blended with smoothstep, about 0.15 s when the hold changes so the arm does not pop:

- Ready: racket up on the forehand side, strings toward the net and slightly open. Not hanging by the knee.
- Forehand: racket back on that side, contact in front of the chest, follow-through up by the opposite shoulder.
- Backhand: one-handed on the other side, string bed rolled so the back of the hand leads, contact in front on that side, follow-through the other way.
- Serve: free arm up, racket cocked high, contact on the ball above the head, follow-through down across the body. Not a groundstroke.
- Walk: opposite leg phases, a small bob, arms moving against the legs, racket still in the ready hold. Speed 0 is the standing ready pose. Drive the cycle from `player.travel` and `player.speed` so it is frame-rate stable.

`handed: 'left'` is not on the view today. Mirror when `player.hand` is shown on a left-hander only if a `player.handed === 'left'` field is present. Default right-handed.

At the contact portion of the swing (`swingT` near 0.42, or the preview's contact pose), put the string bed on the ball when the ball is within 1.8 m. The ball mesh should intersect the strings. When `player.struck` is true, show a small bright contact mark at the strings for that moment.

Read these view fields when present, and keep working when they are absent (previews set them directly): `hand`, `shape`, `swingT`, `speed`, `travel`, `faceYaw`, `facePitch`, `struck`, ball `x,y,z`.

## Preview URLs

`host/tennis-preview.html` must support:

- `?pose=split` — four players, ready holds, a ball in flight, split on, score visible.
- `?pose=forehand` — near player at contact, ball on the strings, `struck` true.
- `?pose=backhand` — the other side, ball on the strings.
- `?pose=serve` — toss ball at the racket, free arm up.
- `?pose=walk` — mid-stride, speed > 0.

Set `container.dataset.ready = '1'`, `dataset.pose`, `dataset.split` (`1` or `0`), `dataset.camY` (metres, one decimal or more), and `dataset.fov`.

No debug text, no axes, no leftover logs.
