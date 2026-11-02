# Brief E: evaluate the two split-screen HUD candidates

You are a judge. You write no feature code and change no files except the one output file named below.

## The user's goal

Kart Racer (a browser kart game on a TV, phones as controllers) now has local split screen for 1–4 players. Two Sonnet agents each built the split-screen **HUD** a different way. You score both against a fixed rubric, pick a base, and list the specific parts of the other candidate worth grafting into the base.

- Rubric (read first, apply exactly): `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/rubric.md`
- Spec and DOM contract: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/RUN.md` (Spec section)
- References (source of truth for the look; open them with Read): `.../kart-split-screen/ref-1p.webp`, `ref-2p.webp`, `ref-4p.webp` in that same folder.

## Candidates

Both ran the same harness drive (`drive.mjs kart-split`: same rounds N=1..5, same 1280x720 host, same timing), so the screenshots are like-for-like.

- **B1, HTML + CSS container queries.** Worktree `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-ad8bd80e31eb5a8c1`, branch `worktree-agent-ad8bd80e31eb5a8c1`. Its report: `briefs/03-hud-b1.md` (bottom section).
- **B2, SVG pieces scaled by a per-pane `--u`.** Worktree `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a2cf540c8e0e94e60`, branch `worktree-agent-a2cf540c8e0e94e60`. Its report: `briefs/03-hud-b2.md` (bottom section).

Evidence per candidate, in `<worktree>/.claude/skills/verify/artifacts/kart-split/`: `n1..n4-countdown.png`, `n1..n4-racing.png`, `n5-*` (5 phones, 4 racers), `result.json`. Diff: `git -C <worktree> diff feat/kart-split-screen -- host` (both merged `feat/kart-split-screen` first).

## What to do

1. Open every screenshot of both candidates and the three references. Compare element by element: item slots, pills (icons, `00`, `1/3` with smaller `/3`), place number (size, gradient, outline, slot colour, suffix), minimap (placement, transparency, markers), dividers, Quit button, countdown. Use the Read tool's image view; zoom by reasoning about pixel positions where needed (the screenshots are 1280x720).
2. Read both diffs in full for criteria 5 and 6 (contract/harness, code quality: dead code, debug leftovers, clarity, tests).
3. Score each rubric criterion 0–5 for each candidate with one or two sentences of evidence each (cite the screenshot and what you saw). Compute the weighted totals out of 100.
4. Verdict: the base candidate (higher total; ties per the rubric).
5. Graft plan: a numbered list of concrete parts of the other candidate to bring into the base, each with the file(s) and the reason, and anything in the base that should be fixed while grafting (issues you saw in the screenshots). Be specific enough that another agent can execute it without re-judging. Also list issues common to both.

## Output

Write your result to `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/evaluation.md` (scores table per candidate, totals, verdict, graft plan, common issues). Your final message repeats the totals, verdict and graft plan.

## Rules

- Judge only. Do not edit code, do not run the harness, do not commit.
- Be critical: the user said the reference images are the source of truth for style and placement.

---

## Final report (E, unedited)

Evaluation written to /Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-split-screen/evaluation.md. I did not run the harness or re-run `kart-race`. I read both candidates' `result.json` (both `passed: true`) and their diffs.

**Totals (out of 100):** B1 = 87, B2 = 77. The rubric weights are placement 25, minimap 20, styling 20, scaling 15, contract 10, code 10.

| Criterion | B1 | B2 |
|---|---|---|
| 1 Placement | 5 | 4 |
| 2 Minimap | 4 | 4 |
| 3 Styling | 4 | 4 |
| 4 Scaling | 4 | 3 |
| 5 Contract/harness | 5 | 5 |
| 6 Code quality | 4 | 3 |

**Verdict: base = B1 (HTML + CSS container queries).**
- **Placement:** Both match the references' item, pill and place layout in every N. B2 puts Quit inside pane 0 next to the item slots, where it is jammed against the main slot in 1p and sits on the floodlight in 3p/4p. B1 puts it top-centre on the divider.
- **Proportions in 1p:** B1's main slot (about 17% of height) and big place number (about 14%) match the reference. B2's are smaller (about 14% and 12.5%).
- **Scaling:** B1 scales with CSS `cqmin` units alone. B2 needs a JS `paneUnit`, a `screen` resize state and magic digit widths.
- **Code:** B1 also fixes `ordinal` for 11–13, tested, and puts `mapTall` in `splitLayout`. B2 has more tests.

**Graft plan into B1:**
1. **3p minimap legibility.** In `host/src/style.css` and the `Minimap` in `host/src/games/kart/Hud.jsx`, take B2's two-path treatment (`kart-map-shade` plus `kart-map-road`): a grey road band with a darker rim. B1's thin outline is faint in the 3p quadrant. Keep it translucent, and keep the thin look in 1p/2p if the band feels heavy.
2. **Tests.** In `host/src/games/kart/hud.test.mjs`, add B2's rotated-map bounds assertion and its "start tick stays perpendicular on a rotated map" test, using a real `fitMinimap`. Don't import `paneUnit`.
3. **Pill size.** In `host/src/style.css`, reduce `--pill-h` and the pill font (about 9cqmin to 7.5cqmin). B1's 1p pills are about 8.6% of height against the reference's 5.8%. B2's 2p pills (about 5.3%) are closer to the reference's 6%. Keep B1's item-slot and place sizes.
4. **2p minimap size (fix in B1).** Reduce `.kart-app[data-players="2"] .kart-minimap` from 58vh to about 46vh. It covers both views and its markers pile onto the right pane's kart.
5. **Edge clearance (fix in B1).** Add bottom inset for the 1p `1st`, which nearly touches the bottom edge. Add left inset for the 3p/4p `3rd`, which touches the left edge.
6. **Redundant CSS (fix in B1).** Collapse the `left:auto; right:auto` resets and the side-specific `:is(...)` rules for 3p/4p.

**Common issues:**
- The 3p map quadrant is a flat sky-blue fill and looks unfinished.
- The 2p/4p minimap markers hide part of a kart view.
- The countdown "3" in 2p partly sits under the minimap.
- Item slots are empty with no icon, as specified.
