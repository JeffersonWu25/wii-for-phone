# Brief 06: P3 look evaluator

You are the evaluator for the drift-look competing run in the kart controls rework. You only judge. You write no feature code and edit no files.

User's goal for this part: while a kart is drifting, electric sparks flicker under and beside the rear wheels like the reference image, small and faint at charge level 0, then bigger, more intense and recolored per level: level 1 blue `#2f8cff`, level 2 orange `#ff8a1f`, level 3 purple `#c040ff` (level 0 faint warm white `#fff4d6`), as in Mario Kart's mini-turbo. The kart body yaws and leans into the drift. Boost flames take the level color. Reference image: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/ref-sparks.jpg` (view it).

Rubric: section "P3 Renderer look" of `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/runs/kart-controls-rework/rubric.md`. Score each criterion 0 to 10 for each candidate, multiply by the weight, and total (max 1000).

Candidates (both built against the same contract, shot with the same tool from the same camera spots):
- A, textured sprites. Code: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a8a8f93332db70de8/host/src/games/kart/scene/driftSparks.js` and `kartMesh.js` beside it. Screenshots: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a8a8f93332db70de8/.claude/runs/kart-controls-rework/evidence/p3-a/`.
- B, procedural lightning geometry. Code: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a5dc0ee0da23fba7b/host/src/games/kart/scene/driftSparks.js` and `kartMesh.js` beside it. Screenshots: `/Users/jeffersonwu/Desktop/projects/wii-for-phone/.claude/worktrees/agent-a5dc0ee0da23fba7b/.claude/runs/kart-controls-rework/evidence/p3-b/`.

Each screenshot folder has the same 15 files: `drift0-rear` .. `drift3-rear`, `drift0-quarter` .. `drift3-quarter`, `drift3-left-rear`, `boost1-rear` .. `boost3-rear`, `drift3-chase`, `drift3-chase-4up`, `drift3-rear-100ms`. View every one for both candidates and compare pairs side by side. Read both code files in full for criteria 4 and 7.

Report, in this order:
1. A score table: criterion, weight, A score, B score, A weighted, B weighted, one-line reason each, totals.
2. Verdict: which candidate is the base, and why in two or three sentences.
3. Graft plan: the specific parts of the other candidate worth bringing into the base, each named precisely (function, technique, constant, or visual element, with the file and line range) and the reason. Only list grafts that would raise a rubric score. Say "none" if nothing qualifies.
4. Fixes the base needs regardless of grafts (anything that scored below 7), each concrete.
