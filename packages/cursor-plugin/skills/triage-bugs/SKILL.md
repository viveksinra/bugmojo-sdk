---
name: triage-bugs
description: List, search and prioritize BugMojo bugs over MCP, in the context of the project's test plan. Use when the user asks what bugs are open, to find or triage BugMojo issues, to summarize bug status, or to pick the next bug to work on. Reads bugs and the testing context via the BugMojo MCP and ranks them so you can decide what to fix — and what to re-test — next.
---

# Triage BugMojo bugs

Use the connected **BugMojo MCP** (server `bugmojo`) to answer what exists and what to work
on. If a `bugmojo` tool returns a 401 / `needs_auth`, tell the user to run `/mcp` and
complete the BugMojo login, then retry. Never invent a bug, a count or a status.

## How to triage

1. **Scope it.** If the user named a project, call `list_projects` to resolve its id/key.
   Otherwise triage across the workspace.

2. **Pull the testing context.** Call `get_project_test_context` for the project. This is
   what turns a list of bugs into a decision. It gives you:
   - **recent failures** — cases failing right now, which usually explains the newest bugs;
   - **plan versions** — whether there is an active plan and a release in flight;
   - **coverage counts** — how much of the product has accepted cases at all;
   - **known flaky patterns** — so you do not send someone to chase a flake.

3. **Fetch the bugs.** `list_bugs` does all three shapes — the old `search_bugs` and
   `my_assigned_bugs` aliases were folded into it and are off the default tool surface.
   - Project board view: `list_bugs({ scope: "project", project_id, status, priority })`.
   - Workspace-wide search: `list_bugs({ scope: "all", search: "coupon" })` — full text over
     title and description.
   - What is assigned to me: `list_bugs({ scope: "assigned_to_me" })`.
   - Counts for a summary: `bug_status_counts`.

4. **Rank.** Priority `CRITICAL → HIGH → MEDIUM → LOW`, then status (surface `OPEN` and
   `REOPENED` first), then recency. Then adjust with what the test context told you:
   - A bug **linked to a test case** (a `TestCaseBugLink`) outranks an equal-priority bug
     with none — it has a reproducible case and a spec, so it is cheaper to fix and provable
     when fixed.
   - A bug in a feature with **high defect density** in the coverage ledger
     (`get_coverage_ledger`, `?mode=qa`) is a symptom of something structural. Say so.
   - A `REOPENED` bug beats a new one of the same priority: it failed verification once
     already, which means the first fix was wrong.
   - A bug in an area with **no test coverage** deserves a case, not just a fix. Note it —
     `/bugmojo:generate-tests <area>` closes that gap.

5. **Check what is waiting on verification.** Bugs sitting in `DEV_TESTING` are fixed but
   not proven: their repro test has not passed in CI yet. These are often the cheapest wins
   in the list — nothing to fix, just a run to record. Call them out separately from the
   open ones.

6. **Recommend the next bug, and justify it.** One bug, one reason. If the user wants to
   fix it, hand off: `/bugmojo:fix-bug <KEY>` — that skill pulls the console and network
   logs and the executable repro pack.

## Output shape

Lead with the decision, not the dump:

- One line of state: "14 open (3 CRITICAL), 2 reopened, 5 awaiting verification".
- The recommendation and why.
- A short table of the top 5–10, with key, priority, status, title, and whether a test case
  is linked.
- Any pattern worth naming: three bugs in one feature, a cluster since a deploy, a bug that
  keeps reopening.

## Guardrails

- Never invent bugs, counts or statuses; everything comes from the `bugmojo` tools. If a
  call fails, say the number is unavailable rather than estimating it.
- A bug's human key is `PROJECT-###` (project key + issue number, e.g. `WEB-42`). Do not
  invent keys, and do not renumber one you half-remember.
- Do not dump logs here. To go deep on one bug (evidence, root cause, fix), use
  `/bugmojo:fix-bug <KEY>` — that skill pulls the console and network logs and the repro
  pack.
- `get_coverage_ledger` and the plan-reading tools need `?mode=qa` on the MCP URL. If they
  are not in the tool list, triage on the bugs alone and say which context you could not
  reach.
- Triage ranks work; it does not do it. Do not start fixing a bug from inside this skill
  without the user asking.
- `DEV_TESTING` is not `VERIFIED_FIXED`. Never describe a bug as fixed until its repro test
  has passed on the patched build.
