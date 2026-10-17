---
name: fix-bug
description: Fix a BugMojo bug end to end. Use when the user gives a BugMojo bug id or key (e.g. WEB-42) and asks to reproduce, debug, localize, or fix it, or to open a PR for it. Pulls the bug's console/network logs and repro context over the BugMojo MCP, localizes the root cause in this repo, proposes a fix, and opens a PR that references the bug.
argument-hint: [bug-id-or-key]
disable-model-invocation: true
---

# Fix a BugMojo bug

Fix the BugMojo bug identified by: **$ARGUMENTS**

You have the **BugMojo MCP** connected (server name `bugmojo`). It exposes read + write
tools over the BugMojo bug tracker. If any `bugmojo` tool call returns a 401 / auth error,
tell the user to run `/mcp` and complete the BugMojo browser login (OAuth), then retry —
do not fabricate bug data.

A "bug id or key" is either the internal id or the human key `PROJECT-###` (for example
`WEB-42`, `API-17`). If the user gave you a key, you can pass it straight to `get_bug` as
the `issue_id`; if `get_bug` cannot resolve it, call `list_bugs` with a `search` term (the
key or some title text) to find the exact issue first. (`search_bugs` was folded into
`list_bugs` and is off the default tool surface — do not reach for it.)

## Workflow

Work through these steps in order. Do not skip the evidence-gathering steps (1-3) — the
whole point of BugMojo is that the console logs, network logs, and session replay tell you
what actually happened in the user's browser.

1. **Pull the bug.** Call `get_bug` with `issue_id="$ARGUMENTS"`. Read the title,
   description, status, priority, AI summary / suspected root cause (if present), the
   project key, and any comments. Note the artifact URLs it returns (rrweb recording,
   screenshots, console/network log files) — these are absolute, directly fetchable URLs.

2. **Pull the console logs.** Call `get_bug_console_logs` with the same `issue_id`. This
   returns error + warning lines inline as JSON (it prioritizes `error`/`warn` and reports
   `total_entries`, `returned`, `filtered_to`, `truncated`). Read the actual error
   messages and stack frames — these usually point straight at the failing file/function.
   If `available` is `false`, note that no console logs were captured and move on.

3. **Pull the network logs.** Call `get_bug_network_logs` with the same `issue_id`. This
   returns failed / non-2xx requests inline. Look for the failing API calls (4xx/5xx, or
   status 0 for aborted/blocked), their method + URL, and correlate them with the console
   errors. If `available` is `false`, note it and move on.

4. **Pull the repro pack — call `get_repro_pack` by name.** Call
   `get_repro_pack` with `issue_id="$ARGUMENTS"`. This is the single most valuable call in
   the skill: it compiles the captured session into an **executable** repro rather than a
   description of one, and returns

   - `script` — a self-contained `@playwright/test` spec (web) or `flow` — a Maestro flow
     (React Native). Captured strings are escaped literals; nothing is evaled.
   - `localization` — the components and candidate source files the capture points at.
     Start your search there instead of grepping the whole repo.
   - `logs` — an errors-first console + network summary, already deduplicated.
   - `environment` — URL, viewport, browser, and the state the user was in.

   Run the spec before you change anything:

   ```bash
   npx playwright test <the-saved-spec> --reporter=line
   ```

   A red run is the proof you have reproduced the bug; it is also the test that has to go
   green at the end. Write it to `tests/bugmojo/<PROJECT-###>.spec.ts` — that file-name
   convention is how BugMojo maps the run back to this bug. (`persist_repro_test` and
   `open_repro_pr` do the same thing server-side when the MCP URL carries `?mode=qa`.)

   **If it returns `not_found`** the bug has no compilable recording — that is a real
   answer, not an error to retry. Fall back to the replay summary and the logs from steps
   1–3 (`get_bug` with `include=replay_summary`, `summarize_replay`) and write the repro
   test yourself from the reported steps. Say which path you took.

5. **Localize the root cause in this repo.** Start from the `localization` block the repro
   pack returned — it names the components and candidate files the capture actually touched.
   Then use the error messages, stack traces and failing URLs to search the repository
   (Grep/Glob, then Read). State the specific file(s), function(s), and line(s) you believe
   cause the bug, and explain the causal chain from the captured evidence to that code. If
   you cannot confidently localize it, say what additional information you need rather than
   guessing.

6. **Propose and apply a fix.** Implement the minimal correct fix. Follow the repo's
   existing conventions (read neighboring code first). Keep the change focused on this bug.
   The repro spec from step 4 is the test: it was red before the fix and must be green
   after. Never edit the spec to make it pass — if it needs changing, the repro was wrong
   and you should say so.

7. **Reference the bug in your work.** Use the bug's human key `PROJECT-###` (the project
   key from step 1 plus the issue number — e.g. `WEB-42`) as the canonical reference.
   - Branch name: `fix/PROJECT-###-short-slug`.
   - Commit message + PR title: include the key, e.g. `fix: null guard on checkout total (WEB-42)`.
   - PR body: include a closing keyword line `Fixes PROJECT-###` **and** a link back to the
     bug in BugMojo so the two stay connected. (The founder's convention writes this as
     `Fixes BMJ-###`; use the real project key for this workspace, and keep `BMJ-###` only
     as an illustrative placeholder.)
   Only run git/PR commands the user has authorized. If the user has the `gh` CLI, offer to
   open the PR; otherwise summarize the exact branch name, commit message, and PR body for
   them to use.

8. **Close the loop in BugMojo.** After the fix is ready for review:
   - Call `link_pr` with the bug id and the PR URL. This is what connects the fix to the
     verified loop: on merge the bug moves to `DEV_TESTING`, and when the repro test passes
     in the customer's CI the webhook moves it to `VERIFIED_FIXED` (or `REOPENED` if it
     fails).
   - Call `add_comment` on the bug with a short summary: the root cause, the file(s)
     changed, the PR link, and how to verify.
   - Call `update_bug` to advance the status to the dev-testing / in-review state used by
     this workspace (for example `DEV_TESTING` or `IN_REVIEW`). If you are unsure which
     statuses exist, call `get_bug` again or list the workspace's statuses first rather than
     inventing one.

9. **If the bug came from a test case, re-run that case.** When `get_bug` shows a linked
   test case (a `TestCaseBugLink`, typical for a bug filed by `create_bug_from_result`), run
   that case's spec after the fix and record the run — `/bugmojo:run`. A fix with a recorded
   passing result on the new commit is what the evidence-gated merge check and the client
   report both read.

## Verified-fixed note (Team tier)

BugMojo's "verified-fixed" loop runs the PR'd repro test in the **customer's own CI** — there
is no hosted test runner in v1. So your job is to make the repro test real and runnable in
this repo; CI verification happens on the customer side after the PR merges. Auto-dispatch of
agents and the verified loop are gated behind the **Team tier** paywall — if a tool returns a
paywall / permission error, surface that to the user instead of retrying.

## Guardrails

- Never invent bug details, log lines, statuses, or issue keys. Everything comes from the
  `bugmojo` tools or the repo.
- Prefer the inline `get_bug_console_logs` / `get_bug_network_logs` tools over trying to
  fetch and gunzip the raw artifact URLs yourself — the tools already decode, prioritize
  errors, and truncate to a sane size.
- If you lack permission to write (comment / update the bug), still do the code fix and PR,
  and tell the user which BugMojo write step they need to perform manually.
- Tool errors are typed. Branch on the `code` (`needs_auth`, `forbidden`, `paywall`,
  `not_found`, `invalid_input`, `stale_version`), never on the message text, and surface
  `paywall` / `forbidden` to the user instead of retrying.
- Do not claim the fix is verified because the repro spec went green on your machine —
  it is verified when the run is recorded and, for the Team-tier loop, when CI says so.
