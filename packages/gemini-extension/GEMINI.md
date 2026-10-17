# BugMojo

The **BugMojo MCP** is connected as `bugmojo`. It is the system of record for this
project's bugs, test plans, test cases, test runs and evidence.

If a `bugmojo` tool returns `needs_auth`, tell the user to run `/mcp auth bugmojo`
and complete the browser login, then retry. **Never** invent bug, run or coverage
data to fill a gap — the value of BugMojo is that every number came from a real
session or a real run.

## What BugMojo gives you that the repo does not

A BugMojo bug is a recorded browser session, not a paragraph. Before you read any
source for a reported bug, pull the evidence:

| You want | Call |
| --- | --- |
| The bug, its status, AI summary and artifacts | `get_bug` (accepts the key, e.g. `WEB-42`) |
| The errors the user's browser actually threw | `get_bug_console_logs` |
| The requests that actually failed | `get_bug_network_logs` |
| What the user actually did, in order | `summarize_replay` |
| A runnable Playwright spec for the repro | `get_repro_pack` |

`get_repro_pack` compiles the rrweb recording into a spec you can run right now.
Run it, watch it fail, fix, watch it pass. That is the loop.

## Closing the loop

1. `link_pr` when the PR is open — BugMojo tracks the bug against the branch.
2. Merge moves the bug to `DEV_TESTING`.
3. The CI webhook moves it to `VERIFIED_FIXED` when the repro test passes, or
   back to `REOPENED` when it does not.

A bug is not fixed because you say so. It is fixed when the test says so.

## Writing tests

Call `get_project_test_context` **once** before proposing or writing any test. It
returns this project's testing conventions, selector hints and open coverage
gaps, so you write in the house style instead of inventing one.

Link a spec to a BugMojo case with an annotation — it survives a rename, a
filename convention does not:

```ts
test.info().annotations.push({ type: 'bugmojo', description: 'WEB-42' });
```

Propose new cases with `propose_test_cases`; they land in the review queue rather
than silently entering the plan. Anything that cannot be automated
deterministically — OTP/2FA, CAPTCHA, real payments, email or SMS delivery,
visual or accessibility judgment, hardware — must be proposed as `MANUAL` with
its reason, never faked as an automated pass.

## Recording runs

Use `@bugmojo/playwright-reporter` (`npx @bugmojo/cli init` wires it up), or over
MCP: `record_run_results` then `upload_evidence`. Keep
`trace: 'retain-on-failure'`, `video: 'retain-on-failure'` and
`screenshot: 'only-on-failure'` — a FAIL without evidence cannot be triaged, and
a bug opened from it arrives empty.

Some tools live behind `?mode=qa` on the MCP URL (run authoring and execution,
plan review). If a tool you need is not in the list, say so and tell the user to
add `?mode=qa` to the `mcp_url` setting rather than working around it.

## Commands

| Command | Does |
| --- | --- |
| `/bugmojo:fix-bug <key>` | The full evidence → fix → PR loop for one bug. |
| `/bugmojo:triage-bugs [project]` | List, rank and pick the next bug to fix. |
| `/bugmojo:test-context [project]` | Print this project's testing conventions and coverage gaps. |
