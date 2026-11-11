You are a subagent grafting the winning tennis look. Work only in `/tmp/worktrees/tennis-look-graft`. Do not touch `/agent/repos/wii-for-phone`. Do not push.

The base is already this worktree: the locked-camera look, commit `e1ffbb5`. Keep that camera behavior (locked to each side's baseline center, do not follow the player's x) and keep the far-end wall, trees, and stands.

The reference photo is attached. It is the source of truth for the frame.

Do these three things and nothing else to the design:

1. The string bed stays face-on through the forehand and the backhand. In this base, one frame of each swing turns the hoop into an edge-on blue bar. The other look, in `/tmp/worktrees/tennis-look-grok/host/src/games/tennis/scene.js`, keeps the strings readable. Read how that file orients the racket face and apply that behavior here. Do not copy that file's camera.

2. At contact, the ball meets the strings in front of the chest, not out by the shoulder and not down at the waist. The serve still meets the ball overhead.

3. Frame the reference more closely while staying inside camera y 1.45–2.05 m, 3.2–4.6 m behind the baseline, field of view 48–58. The near player's feet should meet the bottom edge, and the trees should sit higher so there is less empty sky. Try about y 1.7 m, about 3.3 m back, and a slightly stronger downward pitch. The camera stays locked.

Re-shoot, at 1280×720, into `/opt/cursor/artifacts/`:

- `graft-split.png` from `?pose=split`
- `graft-forehand.png` from `?pose=forehand`
- `graft-backhand.png` from `?pose=backhand`
- `graft-serve.png` from `?pose=serve`
- `graft-walk.png` from `?pose=walk`
- `graft-sheet-forehand.png`, `graft-sheet-backhand.png`, `graft-sheet-serve.png` the same way this worktree already builds contact sheets

Commit on `cursor/tennis-look-graft-d216`. Report the camera numbers and confirm the hoop stays a hoop in every sheet frame.
