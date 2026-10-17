---
name: report
description: Build the client-facing test report for a plan version — scope, what changed since the last version, coverage by feature, results by execution mode, the evidence behind each pass, open bugs, verified fixes, and the honest list of what was tested manually and why. Use when the user asks for a test report, a QA summary for a client, release sign-off, or "what did we test this release".
argument-hint: [plan-version id or plan name]
disable-model-invocation: true
---

# Build the client report

Target: **$ARGUMENTS** — a plan version id, a plan name, or nothing (the current version of
the project's plan).

The deliverable answers one question a client actually asks: *what did you test, what did
you find, and how do I know?* Every number in it comes from BugMojo. If a number cannot be
sourced, it does not go in the report — a report with one invented figure is worth less
than no report.

## 1. Gather — in this order

All of the read tools below need `?mode=qa` on the MCP URL. If they are missing from your
tool list, stop and tell the user to add it; do not substitute guesses.

1. **`get_project_test_context`** — orientation: plans, coverage counts, recent failures.
2. **`get_test_plan_version({ version_id })`** — the frozen document: scope, entry/exit
   criteria, environments, risks, and every pinned case **at the revision it was pinned
   at**. Note the `status` and `content_hash`: a published version has a hash, and that hash
   is what makes the report checkable later. Reporting on a DRAFT is legitimate ("interim
   status") but must be labelled as such.
3. **`diff_plan_versions({ from_version_id, to_version_id })`** — "what changed since v2".
   This section is the one clients read most closely: added cases, removed cases, mode
   changes, step-level edits.
4. **`get_coverage_ledger({ project })`** — features × accepted / automated / manual /
   hybrid cases, needs-reverify, results in the window, defect density, risk score. This is
   the coverage table. `uncovered_only: true` gives you the gaps section.
5. **The runs.** `list_regression_runs({ suite_id })` then `get_regression_run({ run_id })`
   for each run in scope — results, failure kinds and the evidence attached to each result.
   Prefer runs pinned to this plan version; if you had to include others, say which.
6. **The bugs.** `list_bugs` filtered to this project for what is open, and the linked bugs
   on the cases that failed. `regression_insights` gives flakiness and pass-rate trend.

## 2. Compose

Write these sections, in this order. Skip a section only when it is genuinely empty, and
say it is empty rather than deleting it.

**Summary** — three or four sentences a non-technical stakeholder can read: the release,
the plan version, how many cases, the pass rate, the number of open CRITICAL/HIGH bugs, and
whether the exit criteria are met. State the verdict plainly ("two CRITICAL defects remain
open; this build does not meet the exit criteria").

**Scope** — from `scope_md`, plus environments and the dates the runs cover. Include what
was explicitly out of scope; it is the section that prevents an argument later.

**What changed since the previous version** — from `diff_plan_versions`. Frame it as
behaviour: "six new cases cover the redesigned coupon engine; two cases were retired with
the old address book".

**Coverage by feature** — the ledger as a table: feature, accepted cases, automated,
manual, last result, defect density. Sorted by risk, highest first.

**Results by execution mode** — automated vs manual, pass / fail / blocked / skipped, with
flaky counted separately from failed. Never fold flaky into passed.

**Evidence** — for each significant pass, what backs it: trace, video, screenshots, console
and network logs, the manual tester's screenshots per step. Give an evidence-completeness
figure ("47 of 52 results carry at least one artifact") and be honest about the five that
do not.

**Defects found** — each bug with key, title, priority, status, and the case that found it.
Separate **open** from **fixed-and-verified**: a bug is VERIFIED_FIXED only when its repro
test passed on the patched build, and that distinction is the most valuable sentence in the
report.

**Known limitations** — the manual reasons, aggregated: "three flows could not be automated
because they require a one-time SMS code; they were executed by hand on 17 September and
the evidence is attached". This is the section that explains the bill, and it is the one
most vendors leave out.

**Sign-off** — who approves, what they are approving (the plan version number and its
content hash), and the date.

## 3. Publish

`create_test_report` builds it: pass the plan version and the runs, and it computes the
content hash and returns a share URL with its approval state. `get_report_status` reads the
approval back. Hand the user the link and tell them who still needs to approve.

Both tools need `?mode=qa` on the MCP URL. If they are not on this connection, do not
pretend. Say so plainly, then still deliver: write the report as markdown into the repo (a
path the user picks, e.g. `docs/test-reports/<plan>-v<n>.md`), include every number with its
source, and list the exact BugMojo links (run URLs, bug URLs) so a reader can verify any
claim. That is a real deliverable; a fabricated share link is not.

Either way, state the **content hash** of the plan version the report is built on. If the
version is a DRAFT with no hash, label the report INTERIM and tell the user that publishing
the version first makes it citable.

## 4. Before you hand it over

Check each of these, and fix what fails:

- Every number traces to a tool response you actually received in this session.
- No placeholder survives — no "TBD", no "approximately", no "~".
- Flaky is separated from passed.
- Open bugs are not described as fixed, and DEV_TESTING is not described as verified.
- The manual cases are counted and explained, not hidden.
- Anything not tested is listed as not tested.

## Guardrails

- Never invent a pass rate, a coverage percentage or an evidence count. If a run did not
  record, the report says the run did not record.
- Never report a DRAFT version as approved, and never report an unapproved report as
  signed off.
- A client report goes outside the company: no internal-only notes, no customer PII pasted
  from a session replay, no stack traces that leak infrastructure detail. Summarise.
- If the user wants the report to look better than the data supports, the fix is to run the
  missing tests, not to adjust the wording.
