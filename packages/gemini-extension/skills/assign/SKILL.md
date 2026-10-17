---
name: assign
description: Distribute a plan version's manual test cases across the team — list what must be executed by a human, balance it by load and area familiarity, create the run and attach the assignments, and hand each person a message telling them exactly what they own. Use when the user asks who should test what, to assign test cases, to split the manual testing, or to prepare a regression cycle for the team.
argument-hint: [plan-version id | suite name | member names]
disable-model-invocation: true
---

# Assign the manual test cases

Target: **$ARGUMENTS** — a plan version, a suite, or the people to split the work across.

Automated cases run themselves. This skill is about the rest: the OTP flows, the real
payments, the "does this look right", the hardware — cases a human has to execute, which
means somebody specific has to own each one, with a due date and a way to report what they
found.

## 1. Find the manual work

**From a plan version** (the usual case): `get_test_plan_version` (`?mode=qa`) and take
every pinned case whose `execution_mode` is `MANUAL` or `HYBRID`. HYBRID counts — its human
step still needs an owner even though CI runs the first half.

**From a suite**: `list_test_cases({ suite_id })` and filter on `execution_mode`. Do not
filter on the legacy `automated` boolean; `execution_mode` is the field that carries the
truth, and the two disagree on older rows.

**From the review queue**: `list_review_queue({ project, execution_mode: "MANUAL" })` when
the user wants to assign what was just proposed. Cases still PROPOSED can be assigned, but
say so — a tester should not spend an hour on a case a reviewer is about to reject.

Group what you found by **area** (the case `folder` / section) and by **manual reason**.
The reason matters for who gets it: `REAL_PAYMENT` needs someone with a test card and
permission to use it; `LEGAL_SIGNOFF` needs the person who can actually sign.

## 2. Find the people

`list_assignees` returns every workspace member and every active AI agent with the `id` and
`type` you need (`MEMBER` / `AGENT`). If the user named people in `$ARGUMENTS`, match on
name or email and confirm the match before assigning — assigning to the wrong Sam is worse
than asking.

Ask if you do not know:

- Who is actually available this cycle (someone is always on leave).
- Who owns which area — area familiarity beats perfect load balance, because a tester who
  knows checkout finds bugs a stranger walks past.
- Any hard constraints: only one person has the test payment card, only the designer judges
  the visual cases, the client's own QA takes the sign-off cases.

## 3. Balance

Assign in this order of priority:

1. **Constraints first.** Cases that only one person can execute go to that person before
   anything else is distributed.
2. **Area affinity.** Keep an area with one owner where you can — context switching is the
   hidden cost in manual testing, and a tester in one area gets faster with every case.
3. **Then load.** Balance by *estimated effort*, not by case count. A ten-step checkout
   case with a real payment is not the same as a three-step validation check. If you have
   no effort data, count steps as a rough proxy and say that is what you did.
4. **Priority order.** CRITICAL and HIGH cases get assigned first and get the earlier due
   dates, so a cycle that runs out of time runs out on the cheap cases.

Show the user the proposed split **before** writing it: person, case count, areas, the
CRITICAL count each, and anything you could not place. Let them move things. This is a
thirty-second conversation that prevents a week of resentment.

## 4. Write the assignments

Assignments hang off a **run** — that is what turns "you own this case" into "you own this
case in this cycle, and here is where your result goes".

```text
create_regression_run({ suite_id: "…", tier_filter: "CORE", executor_type: "HUMAN",
                        test_case_ids: [ …the manual cases… ] })   // ?mode=qa
start_regression_run({ run_id: "…", assignments: [
  { testCaseId: "…", assigneeId: "…", assigneeType: "MEMBER" }, …
] })                                                               // ?mode=qa
```

Both tools need `?mode=qa` on the MCP URL and the `execute_regression` permission. If they
are not in your tool list, say exactly that and give the user the alternative (the dashboard's
run screen) rather than pretending the work is done.

Notes on the current shape of this path, which you should be straight about:

- Assignments are **per run**. There is no standing "Priya owns checkout forever" yet.
- A run's cases come from one suite. A plan version that spans several suites needs one run
  per suite — do that, and number them so the team can tell them apart.
- **Notification is not automatic yet.** `notified_at` exists on the assignment and the
  email/Slack digests are a later wave. So finish the job by hand: produce a per-person
  message (below) and tell the user to send it.

## 5. Hand each person their list

For every assignee, produce a short block the user can paste into Slack, email or a ticket:

```text
@priya — Checkout, 6 manual cases, due Friday
  CRITICAL  Apply a coupon at the minimum order value        (real payment — use the test card)
  CRITICAL  Refund a completed order
  HIGH      Checkout with a saved address
  …
Run: <run url>    Plan: Release regression v3
Report each case as PASS / FAIL / BLOCKED with a screenshot per step.
A FAIL should open a bug from the result so the evidence travels with it.
```

Tell testers how to report:

- **Dashboard** — open the run, execute a case, submit PASS / FAIL / BLOCKED with notes and
  a screenshot or a recording id.
- **Over MCP / this plugin** — `submit_test_result({ run_id, test_case_id, result, notes,
  screenshot_id, recording_id, execution_log_url })`. Evidence ids come from an upload, so a
  result with no evidence is a result with no proof. Push for at least a screenshot.
- **BLOCKED is a real answer.** "I could not run this because staging has no seed data" is
  information; a guessed PASS is a lie that reaches a client report.

## 6. Track and close

- `get_regression_run` / `list_regression_runs` (`?mode=qa`) show progress.
- Chase what is still `ASSIGNED` when the due date passes; re-assign rather than letting it
  rot — an unexecuted case is indistinguishable from an untested feature.
- When every case has a result, `complete_regression_run` computes the stats.
- Then `/bugmojo:report <plan-version>` turns the whole cycle — automated and manual — into
  the client-facing report.

## Guardrails

- Never assign a case to somebody without checking they exist in the workspace
  (`list_assignees`), and never invent an email address.
- Never mark a case done on a tester's behalf, and never submit a result you did not
  personally execute. This skill assigns work; it does not do it.
- Say plainly which half of the work this covers: "18 automated cases run in CI; these 11
  need a person".
- If the user wants the manual count reduced, the honest lever is registering fixtures
  (an OTP bypass, a test-mode PSP key, seeded data) and re-running `classify_test_case` —
  not re-labelling the cases.
