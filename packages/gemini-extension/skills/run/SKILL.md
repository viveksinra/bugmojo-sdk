---
name: run
description: Run this repo's Playwright tests so the results land in BugMojo with evidence — check the reporter is wired, select the specs for a plan version / suite / tag, run them, confirm the run actually recorded, and triage every failure into BUG / FLAKY / ENVIRONMENT / TEST_DEFECT. Use when the user asks to run the tests, run a regression, run a plan version, or check whether the suite is green.
argument-hint: [plan-version id | suite name | tag | file path]
disable-model-invocation: true
---

# Run the tests and record the proof

Target: **$ARGUMENTS** — a plan version id, a suite name, a Playwright tag, a file path, or
nothing (the whole suite).

A run that BugMojo did not record proves nothing: no evidence, no coverage, nothing for the
client report, and nothing the evidence-gated merge check can read. So the run is only half
of this skill; **confirming it landed** is the other half.

## 1. Check the wiring before running anything

Three things must be true for a run to record itself. Check all three and fix what is
missing — it takes seconds now and saves a re-run later.

1. **The reporter is configured.** Read `playwright.config.*`: `@bugmojo/playwright-reporter`
   must be in the `reporter` array, and `use` must carry `trace: 'retain-on-failure'`,
   `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'`. Without the `use`
   settings a failure records a status and no evidence — which is the whole point missed.
   Fix: `npx @bugmojo/cli init`, then `pnpm add -D @bugmojo/playwright-reporter`.
2. **The credentials exist.** `BUGMOJO_API_KEY` (a `bm_key_…` key with write permission)
   and `BUGMOJO_PROJECT` (the project key). Without them the reporter prints one line on
   stderr and stays inert — deliberately, so it can be added to a repo before anyone logs
   in. Check with `printenv BUGMOJO_PROJECT` (never print the key).
3. **The app under test is reachable.** A base URL — `PLAYWRIGHT_BASE_URL`, the config's
   `use.baseURL`, or a `webServer` block that starts it. A suite that fails because nothing
   was listening is an ENVIRONMENT failure, not a bug, and it wastes the triage.

If the user would rather not manage the config, `npx @bugmojo/cli run` does the run and the
recording in one command, with the JSON reporter as its fallback path.

## 2. Decide what to run

**A plan version** (`$ARGUMENTS` is a version id, or the user said "run the plan"):
read it with `get_test_plan_version` (`?mode=qa`), take the AUTOMATED cases, and collect
each one's spec file from its `source_refs` (`kind: "file"`). Run exactly those files, and
pin the run to the version so the results count toward it:

```bash
BUGMOJO_PLAN_VERSION=<version-id> npx playwright test tests/bugmojo/checkout-coupon.spec.ts tests/bugmojo/auth-login.spec.ts
```

Tell the user which cases in the version are MANUAL and therefore not in this run — those
go through `/bugmojo:assign` and a human. A "plan version run" that silently drops a third
of the plan is a misleading green.

**A suite** — `BUGMOJO_SUITE="Checkout"` names the suite the run attaches to (found or
created), or `BUGMOJO_SUITE_ID=<id>` for an exact one.

**A tag or a path** — pass it straight through: `npx playwright test --grep @smoke`, or the
file path.

**Nothing** — run the whole suite.

## 3. Run

```bash
BUGMOJO_ENVIRONMENT=staging \
BUGMOJO_DEPLOY_URL=https://staging.example.com \
npx playwright test
```

Useful environment variables (all optional):

| Variable | Effect |
| --- | --- |
| `BUGMOJO_PLAN_VERSION` | pin the run to an immutable plan version |
| `BUGMOJO_SUITE` / `BUGMOJO_SUITE_ID` | which suite the run belongs to |
| `BUGMOJO_ENVIRONMENT` | environment name recorded on the run |
| `BUGMOJO_DEPLOY_URL` | the URL under test (defaults to `PLAYWRIGHT_BASE_URL`) |
| `BUGMOJO_COMMIT_SHA` | override the commit (defaults to CI vars, then `git rev-parse HEAD`) |
| `BUGMOJO_RUN_ID` | append to an existing run instead of creating one |
| `BUGMOJO_CREATE_MISSING_CASES=false` | stop a failing unmapped spec from creating a PROPOSED case + bug |
| `BUGMOJO_UPLOAD_EVIDENCE=false` | statuses only, no artifacts |
| `BUGMOJO_DEBUG=1` | print what the reporter uploaded, per test |

Do not add `--reporter=…` on the command line: it **replaces** the configured reporter list
and silently disables BugMojo. If you need extra console output, use
`--reporter=list,@bugmojo/playwright-reporter`.

Let the tests fail. Never retry until green, never drop a failing spec from the run, never
weaken an assertion to finish. A red run recorded honestly is worth more than a green run
that was arranged.

## 4. Confirm the run landed

This is the step people skip. The reporter prints a run URL at the end; if you did not see
one, the run did not record. Verify:

- The reporter's final line names the run and its URL, or
- `list_regression_runs` (`?mode=qa`) shows a run whose `commit_sha` is this commit, or
- the plugin's PostToolUse hook told you exactly what was missing — read its message.

If nothing recorded: fix the cause (usually missing credentials or a `--reporter` override),
and re-run. Do not paper over it by summarising the terminal output — terminal output is
not evidence.

State the result in the honest form: **"18 passed, 2 failed, 1 flaky — recorded as run
<id>, trace and video attached to both failures"**.

## 5. Triage every failure

A FAIL is not automatically a bug. Classify each one — the `evidence-reviewer` subagent
does exactly this, or do it inline:

| Verdict | What it means | What to do |
| --- | --- | --- |
| `BUG` | the app is wrong | `create_bug_from_result` (`?mode=qa`) — it pre-fills the bug from the executed revision, links the case, copies the evidence and compiles a repro when a replay exists. Never file it by hand. |
| `FLAKY` | the test is unreliable | fix the spec (see the flakiness lint in `/bugmojo:generate-tests`) and `attach_spec` the fix |
| `ENVIRONMENT` | the env broke, not the app | fix the env, re-run; say so in the report |
| `TEST_DEFECT` | the test is wrong | fix the spec, `attach_spec`, re-run |

Use the evidence before deciding: the trace, the video, the console and network panes are on
the result in the dashboard. Guessing from an error string is how a real bug gets filed as
"flaky" and shipped.

Then close the loop: `/bugmojo:fix-bug <KEY>` on the bugs you filed.

## 6. Report

- Counts, with flaky called out separately from failed.
- The run URL.
- Per failure: the verdict, and what you did about it (bug key, spec fix, env note).
- Which parts of the plan version this run did **not** cover (manual cases, skipped specs).
- Evidence completeness: did trace/video/screenshots actually attach? If not, say why —
  that is the number the client report grades.

## Guardrails

- Never report a pass without a recorded run. If recording failed, say "the suite passed
  locally but nothing was recorded", not "the tests pass".
- Never use `--reporter=` alone; it disables the BugMojo reporter.
- Never re-run a failing test hoping for green and then report the green one. If a test
  passes on retry, that is FLAKY and it gets recorded as such.
- Run the tests; do not simulate them. A summary written without executing anything is the
  exact failure mode the Stop hook exists to catch.
