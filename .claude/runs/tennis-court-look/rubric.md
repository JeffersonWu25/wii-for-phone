# Rubric — on-court look

Written before the competing look runs. Both builds are shot from the same preview URLs at 1280×720. The reference photo is the picture to match in spirit: low, close, split, big rackets, near player large. Do not reward a copy of Nintendo's models.

Score each criterion 0–5. Weighted total is out of 100.

1. **Camera height and closeness (weight 20).** Camera y is between 1.45 m and 2.05 m. The near player's head sits in the lower half of the pane, feet near the bottom, and the far baseline is still in frame. A high broadcast view scores 0.

2. **Split (weight 15).** `?pose=split` shows two vertical panes of the same four players and the same ball. Each pane looks from behind that side. A divider separates them. The score is centered on the top. A single full-frame view scores 0.

3. **Racket read (weight 15).** The racket head is visibly larger than the current small hoop (on the order of the torso, not a stick). The oval, frame, and string bed read in the foreground of the low camera. The grip is in the hand.

4. **Forehand, backhand, and serve are different (weight 20).** At `?pose=forehand` the racket meets the ball in front of the chest on the forehand side and the follow-through pose is across the body. At `?pose=backhand` the racket is on the other side, one-handed, face rolled the other way, and it meets the ball. At `?pose=serve` the racket is up by the toss, the free arm is up, and the pose is not a groundstroke. Identical poses score 0.

5. **Contact (weight 15).** In the forehand, backhand, and serve previews the string bed intersects the ball. A swing that misses the ball by a body width scores 0. A small contact mark is present when `struck` is set.

6. **Walk cycle (weight 10).** At `?pose=walk` the legs are in opposite phases, the body is not a stiff slide, and the racket stays held rather than glued to a swing. Standing and walking are different.

7. **Smooth posing and court kept (weight 5).** Pose blends are continuous (no popped shoulders in the ready-to-swing frames if a contact sheet is provided). Court lines, net, hedges, walls, and grass are still the existing court. A rewritten court or a debug overlay scores 0.

Graft rule: the higher weighted total is the base. Graft a specific piece from the other only when that piece scores higher on a criterion by 2 or more, and name the functions to take.
