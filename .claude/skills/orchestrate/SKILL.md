---
name: orchestrate
description: Build a feature end to end as an orchestrator that delegates to Sonnet subagents, runs competing versions on up to two hard parts (the evaluator writes the acceptance tests first, scores the candidates, and grafts the best parts), reviews the code, validates in the browser through the verify harness, logs the run locally, keeps the PR to the app change, and opens a PR with a few key screenshots as evidence. Use when the user types /orchestrate <feature>.
---

# Orchestrate a feature

The user names the feature and what success looks like in the arguments. Reference images they give are the source of truth for the look.

This session is the orchestrator. It should run on Opus 5.5 at Medium effort. If it is running on anything else, tell the user before starting. You plan, delegate, judge the results, and own the quality. You personally review the final screenshots and the critical diffs (steps 3 and 6).

## Quality and cost

Quality comes first. Aim to satisfy every success criterion and every rubric criterion at full weight. Never accept a known defect to save tokens. Minimize wasted tokens, not quality assurance: cost optimization removes redundant work, such as a duplicate file read, a check the last change could not have affected, or a competing run on a part that is already easy. It never removes a screenshot, test, review, or iteration that a success criterion needs. When a criterion is not met, spend what the fix needs, and record each iteration in `RUN.md`.

## Rules

- **Subagents.** Start every subagent with the Agent tool and `model: "sonnet"`. Make edits of a few lines in one file yourself. Anything larger goes to a subagent, including review fixes.
- **Concurrency.** Run at most three subagents at once. More than that hits rate limits, and stalled agents have to be resumed.
- **Worktrees.** Give each subagent that writes files its own worktree on its own branch, cut from the feature branch explicitly: `git worktree add -b <branch> <path> <feature-branch>`. Check the merge base with `git merge-base` before starting the agent. Fold finished work into the feature branch yourself, then remove the worktree.
- **Shared contract.** Write `contract.md` in the run folder once. It holds the goal, the success criteria, the fixed interfaces, the colors and values, the test commands, and the report format. Every brief points to it and does not repeat it.
- **Briefs.** A brief is short. It states the part's job, the files the subagent owns, the rubric section or success criteria it must meet, and "read `contract.md` first." Don't repeat rules that are already in the contract.
- **Reading.** Tell every subagent to read only the files it owns, plus the parts of other files it needs, found with grep and line ranges. Don't let it read whole harness files or the whole app.
- **Budget.** Give each subagent a starting budget in its brief: the rubric shots it must capture and a rough cap on files read. The budget guides spending and is not a hard limit. If a criterion needs another screenshot, test, or file read, the subagent takes it and says why in its report. You may also grant extra shots or iterations yourself. Record each one in `RUN.md` with its reason.
- **Reports.** The subagent writes its full report to a file in the run folder and ends its final message with a short summary of under 15 lines. Read the summary first. Open the full file when a number or decision matters, and read the critical diffs yourself (step 3).
- **Questions.** Ask the user when a decision is theirs: product, look, scope, or a change to their spec. Decide technical questions yourself and record the choice in the run log.
- **Usage.** When each subagent's report arrives, record its token use in `RUN.md` from the usage figures the Agent result reports: total tokens, tool uses, and duration, plus input, output, and cache figures if given separately. Write `n/a` for any figure that isn't available. Don't estimate.

## Run log

Record everything so the user can see what happened. Keep the log in `.claude/runs/<feature-slug>/`. The run log is local only. Never commit it or put it in the PR.

- `contract.md`: the shared contract (see above).
- `RUN.md`: a terse timeline. Record each step, each decision with its reason, each subagent started (part, model, effort, worktree, start time) and its usage when it returns, each edit you made yourself, and each extra shot, test, or iteration with its reason. One line per event.
- `briefs/<nn>-<task>.md`: the brief given to each subagent, unedited.
- `reports/<nn>-<task>.md`: each subagent's full final report.
- `rubric.md`: the scoring criteria for each competing part, written before the competing runs start.
- `evaluation.md`: the evaluator's scores, verdict, and graft list. The scores are written before any grafting.
- `review.md`: the code reviewer's findings and what was done about each one.
- `cost.md`: the token usage and process report and the general cost notes (step 9).

Update `RUN.md` as you go, not at the end.

## Steps

1. **Plan.** Read the relevant code and the verify skill's feature map only. Write the plan in `RUN.md`: the parts of the feature, which subagent builds each one, and which parts get competing runs. Write `contract.md`.

2. **Competing runs, at most two parts per feature.** Use them only for parts that are both important and difficult, such as the core look or core physics. For each one:
   1. Write `rubric.md` yourself, with no subagent. Include 4–8 concrete, checkable criteria with weights, taken from the success criteria. Each visual criterion names the one shot that proves it.
   2. Choose the two approaches yourself, before any candidate or evaluator starts. Write them in `RUN.md`, with one line on why each is worth trying. The approaches must differ in a real design choice, such as the physics model, the rendering technique, or the input mapping. Differences in naming, style, or tuning values don't count. The evaluator doesn't choose them, and a candidate must not switch to the other approach.
   3. Start one Sonnet evaluator before any candidate exists. It writes the acceptance tests from the rubric and the contract. Logic and numeric criteria become tests or probe scripts, with no implementation code. It commits them to the feature branch. Visual criteria are left for the shot review.
   4. Cut the two candidate worktrees from the commit that has those tests, so both candidates face the same bar. Start two Sonnet subagents in parallel, one per approach you chose. Put the assigned approach in each brief. Each builds until it passes the acceptance tests. It writes unit tests only for internal helpers it creates, and captures the shots the rubric names plus any extra shot a criterion needs.
   5. The evaluator scores both candidates against the acceptance tests and the shots. It writes the scores, the numbers behind each score, and the verdict to `evaluation.md` before any edit. It picks the higher scorer as the base and lists the grafts: only parts that score higher in the other candidate on a named criterion, never parts chosen for taste. It writes no feature code.
   6. If the graft list is empty, the base goes forward unchanged. Otherwise, one Sonnet graft subagent applies the listed grafts to the base. The evaluator then reruns the tests and the same shots on the result and records the final score in `evaluation.md`.
   7. If a criterion is still short, fix it with a subagent, rerun the shots that prove it, and rescore. Repeat until the criterion passes. If a remaining gap is a real trade-off rather than a defect, record it in `evaluation.md`, tell the user, and let them decide.

   Every other part gets a single Sonnet subagent. It writes the unit tests for its own part, since it already has the context.

3. **Check every diff against the brief.** Read each subagent's summary and diff stat. For critical code (physics, game state and scoring, network protocol, and anything a rubric criterion depends on), read the actual diff yourself, not the summary. Open the full report when a number or decision looks wrong. If a diff doesn't match the brief, send the fix back to the same worktree or start a fix subagent.

4. **Code review.** When the feature is assembled, start a Sonnet reviewer subagent on the diff against the base branch. The reviewer is not the evaluator, and it must not have written any of the code. It reads the diff, not whole files. It looks for bugs, dead code, leftover debug hooks, missing tests, and style that doesn't match the surrounding code. Read the critical parts of the diff yourself as well, and compare them with the reviewer's findings. Fix the findings: small fixes yourself, larger ones through a subagent. Re-review after any fix that changes behavior. Record each finding and its handling in `review.md`.

5. **Harness: fix what breaks, and add only what other features will reuse.** Use the verify skill's scripts to launch, check, and clean up, and to drive features. Don't build a new harness.
   - Run the existing drives the feature touches first.
   - When a drive breaks because of the change (a renamed or removed control, say), make the smallest edit that fixes it yourself.
   - Write a new drive only when the feature's user path is not covered and either it is a new top-level screen or game, or another feature is likely to reuse it. Otherwise, drive the feature with a scratch script under `.claude/runs/<feature-slug>/`. You decide this, and don't ask the user. A new drive is written by one Sonnet subagent with a budget, and it reads only the drive entries it touches.
   - Put harness changes (drive entries, feature docs, fixed drives) in the feature PR, along with the feature's unit and acceptance tests. Keep them small. If a harness change grows large, split it into its own `harness/<feature-slug>` PR from `main` and record the choice in `RUN.md`.
   - Write no harness documentation beyond the doc for a kept drive and the lines an edited drive needs.
   - Keep every drive and harness change reusable, not tied to this task. Name a drive for the user flow it tests (`kart-drift`, not `drift-fix-2`). Parameterize it on the controls and values it uses, not on this run's scores, timings, or ids. For a kept drive, add a feature file in `.claude/skills/verify/features/` and list it in `features/README.md`, so other tasks can find it. A drive that only serves this run stays in the run folder.

6. **Validate in the browser.**
   - Use the existing verify skill first. Drive the real user path with the real controls.
   - The evaluator or a harness subagent takes the screenshots and reports against the criteria.
   - You then open the final screenshots yourself. Compare each one with the reference images and the success criteria, and check every visual feature, state, and section. If something is off, fix it through a subagent, reshoot, and look again. Repeat until every visual criterion is satisfied. Take extra shots when a state or angle is not yet covered.
   - At the end, run all unit tests and every existing drive once, in this session.

7. **Clean up.** Delete scratch and preview scripts, test screenshots, and generated files. Restore regenerated harness artifacts to the base branch (`git checkout main -- <verify artifacts path>`) unless a kept drive's expected output really changed. Remove anything the change made stale. Re-run the tests and drives only if the clean-up changed code or expected output.

8. **Open the PR.** Don't stop for approval. The feature PR holds app code, the feature's unit and acceptance tests, and the harness changes from step 5. Before committing, check `git diff --stat <base>` and remove everything else: run logs, screenshots, and regenerated artifacts. Commit on a feature branch and push. Push the screenshots to a separate branch, `pr-assets/<feature-slug>`, which is never merged, so they don't add to the PR diff. Open a PR whose description covers:
   - what was built
   - which parts got competing runs, the rubric scores, the verdict, and what was grafted
   - the code review findings and how each was handled
   - test and drive results, with the commands, and any harness changes made
   - a few key screenshots (one per rubric criterion that matters most), each embedded with a one-line caption and linked to the `pr-assets/<feature-slug>` branch (`https://github.com/<owner>/<repo>/blob/<sha>/<path>?raw=true`)
   - anything not verified or still rough

9. **Report cost and process.** Once the PR is open, write `cost.md` in the run folder and put a short version in your final message. The report exists to improve this skill on later runs, so it shows what each step cost and what it bought. It has these parts:
   - **Orchestrator usage.** The orchestrator's own token use for the whole run, from `mcp__ccd_session_mgmt__get_usage` if it is available, else `n/a`. Give input, output, and cache reads and writes, with the model and effort.
   - **Subagents.** One row per Agent call, including resumes and fix rounds: name, role, phase, model, effort, worktree, input, output, cache reads and writes, total tokens, tool calls, screenshots taken, files read, wall-clock time, and outcome (passed, failed, resumed, or replaced). Add a total row. Take the figures from `RUN.md`, and mark any missing figure `n/a`.
   - **Per phase.** Totals for each step (plan, competing runs, build, review, validation, clean-up, PR), and which phase used the most tokens.
   - **Iterations and rework.** Each fix round, with the criterion or review finding it addressed, the tokens it cost, and what it changed. Note which work was needed and which was redundant.
   - **Quality outcome.** The final rubric scores, which criteria passed on the first try and which needed rounds, and any gap left and why.
   - **Skill feedback.** Each place where this skill's instructions were unclear, missing, or caused waste, with the specific edit you suggest.
   - **General cost notes.** Three to six short, reusable points on lowering cost without lowering quality, written as general practice rather than findings about this feature. For example: keep briefs short and point them at a shared contract; cap file reads to the ranges needed; run independent subagents in parallel within the concurrency limit; use the cheapest model that meets a role's bar; don't rerun checks the last change could not have affected.

   Then give the user the PR links, the cost report, and a short summary.
