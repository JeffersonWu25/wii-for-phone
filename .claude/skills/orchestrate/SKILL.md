---
name: orchestrate
description: Build a feature end to end as an orchestrator that delegates to Sonnet subagents, runs competing versions on up to two hard parts with a rubric-based evaluator, reviews the code, validates in the browser through the verify harness, documents the whole run, cleans up the harness, and opens a PR with screenshots as evidence. Use when the user types /orchestrate <feature>.
---

# Orchestrate a feature

The user names the feature and what success looks like in the arguments. Reference images they give are the source of truth for the look.

This session is the orchestrator. It should run on Opus 5.5 at Medium effort. If it is running on anything else, tell the user before starting. You plan, delegate, judge and own the quality.

## Rules

- **Subagents.** Start every subagent with the Agent tool and `model: "sonnet"`. Do small edits yourself, meaning a few lines in one file. Anything larger goes to a subagent.
- **Worktrees.** Give each subagent that writes files its own git worktree and branch. Fold finished work into the main checkout yourself, then remove the worktree.
- **Briefs.** Every brief states the user's goal, the files the subagent owns, the success criteria, and the rules from this file that apply.
- **Questions.** Ask the user when a decision is theirs: product, look, scope, or a change to their spec. Decide technical questions yourself and record the choice in the run log.

## Run log

Document everything so the user can read what happened. Keep the log in `.claude/runs/<feature-slug>/`:

- `RUN.md`: a timeline. Record each step, each decision with its reason, each subagent started (task, model, worktree, start and end time), and each edit you made yourself.
- `briefs/<nn>-<task>.md`: the exact prompt given to each subagent and its final report, unedited.
- `rubric.md`: the scoring criteria for each competing part, written before the competing runs start.
- `evaluation.md`: the evaluator's scores, verdict and graft plan.
- `review.md`: the code reviewer's findings and what was done about each one.

Update `RUN.md` as you go, not at the end.

## Steps

1. **Plan.** Read the relevant code and the verify harness. Write the plan in `RUN.md`: the parts of the feature, which subagent builds each one, and which parts get competing runs.

2. **Competing runs, at most two parts per feature.** Use them only for parts that are both important and difficult, such as the core look or core physics. For each one:
   1. Write `rubric.md` first: 4–8 concrete, checkable criteria with weights, taken from the success criteria.
   2. Start 2 Sonnet subagents in parallel, each given a different approach.
   3. Capture the same evidence for both: screenshots from the same camera spots, or the same tests.
   4. Start a separate Sonnet evaluator subagent. It scores both against the rubric, picks a base, and lists the specific parts of the other version worth grafting in. It only judges; it writes no feature code.
   5. Start one Sonnet subagent to build the base with the grafts.

   Every other part gets a single subagent.

3. **Review every diff yourself.** Don't trust a subagent's summary. Check what changed against the brief.

4. **Code review.** When the feature is assembled, start a Sonnet reviewer subagent on the full diff. It is not the evaluator, and it must not have written any of the code. It looks for bugs, dead code, leftover debug hooks, missing tests, and style that doesn't match the surrounding code. Fix the findings (small fixes yourself, larger ones through a subagent) and record each one in `review.md`.

5. **Extend the harness.** Use `.claude/skills/verify` (`scripts/instance.mjs` to launch, check and clean up; `scripts/drive.mjs` to drive features). Don't build a new harness. Keep every addition self-contained so the harness grows cleanly:
   - one feature means one drive entry, one `features/<id>.md` doc and one `artifacts/<id>/` folder
   - a shared helper goes in its own module only once two features use it
   - a feature never depends on another feature's code or artifacts
   - update `features/README.md` and `SKILL.md` to list the new feature

6. **Validate in the browser.**
   - Drive the real user path with the real controls.
   - Screenshot every section and state of the feature.
   - Look at each screenshot critically against the success criteria. Fix what's off and shoot it again.
   - Run all unit tests and every existing drive, not just the new one.

7. **Clean up the harness.** Remove throwaway scratch or preview scripts, update the feature docs and the feature map, and delete whatever the change made stale. Then re-run all unit tests and all drives.

8. **Open the PR.** Don't stop for approval. Commit on a feature branch, including the run log, and push. Open a PR whose description covers:
   - what was built
   - which parts got competing runs, the rubric scores, the verdict and what was grafted
   - the code review findings and how each was handled
   - test and drive results, with the commands
   - every screenshot, embedded with a one-line caption each and linked to the commit (`https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true`)
   - anything not verified or still rough
   - a link to the run log

   Then give the user the PR link and a short summary.
