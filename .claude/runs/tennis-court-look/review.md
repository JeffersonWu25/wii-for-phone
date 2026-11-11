# Code review

Reviewer: a fresh `grok-4.7-high` that wrote none of the feature. It stepped the rally in Node. It did not render the scene.

## Findings

1. **Bug, fixed in `005cbe2`.** `swing()` used to redirect the ball at `swingT` 0, while the strings meet the ball near `swingT` 0.42. The swing now starts on the contact frame.

2. **Bug, fixed in `005cbe2`.** `launch()` opened or closed the return window even when the swing missed. A miss leaves the open window alone.

3. **Bug, fixed in `005cbe2`.** Reach was horizontal only, so a ball 6 m overhead counted as a hit. A ball above 3.2 m is out of reach. A serve toss, which peaks near 2.7 m, still connects.

4. **Bug, fixed in `005cbe2`.** After the called hold, `serve` froze anyone still off their mark, and a chase could run past the baseline. Players walk home during the serve, the server holds still only once the toss is up, and a chase stays on that player's own side of the court.

5. **Bug, fixed in `005cbe2`.** The scene mirrors a left-hander only when `player.handed === 'left'`, and the view never sent `handed`. The view now carries the hand from the last swing.

The court element also records `data-split` and `data-cam-y`, and the divider and score have classes, so the rally drive can read the framing.

## Not changed

The reviewer did not render the split panes. That is covered by the preview shots and the browser drive.
