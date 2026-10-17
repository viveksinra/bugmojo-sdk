# BugMojo plugin for Claude Code

Claude Code writes tests for you already. It cannot tell you which ones you agreed to run,
which ones a human has to do by hand, whether the last run actually happened, or what to
send a client at the end of the sprint. That is what this plugin adds.

> Interview → versioned test plan → cases in a review queue with an automatable-vs-manual
> verdict → Playwright specs verified against the running app → runs recorded with trace,
> video and screenshots → failures filed as bugs with an executable repro → a client report
> somebody signs.

BugMojo is the system of record and proof for every test a human or an agent runs. This
plugin puts all of it inside your terminal.

## Install

```text
/plugin marketplace add viveksinra/bugmojo-sdk
/plugin install bugmojo@bugmojo
```

When prompted, accept the **BugMojo MCP URL** default
(`https://www.bugmojo.com/api/mcp?mode=qa`). Then run `/mcp`, complete the BugMojo browser
login, and start with:

```text
/bugmojo:setup
```

## Skills

| Skill | Invoke | What it does |
| --- | --- | --- |
| `/bugmojo:setup [workspace\|project]` | you | Prove the MCP login, pick or create the project, get an API key for the machine paths, run `bugmojo init`, wire `@bugmojo/playwright-reporter`, and verify each connection instead of assuming it. |
| `/bugmojo:plan-tests [scope]` | you | Interviews you — depth, target count per area, which routes, environments, who runs the manual cases, specs now or after review — maps the codebase, proposes the cases, and pins them into a DRAFT plan version with the interview stored on it so v2 reuses it. |
| `/bugmojo:generate-tests [feature\|diff\|all]` | you | Proposes cases for a scope, classifies them, and writes Playwright specs — but only after verifying every selector against the running app, and only attaches a spec that has run green. |
| `/bugmojo:run [plan-version\|suite]` | you | Checks the reporter is wired, runs the specs, **confirms the run recorded**, and triages every failure into BUG / FLAKY / ENVIRONMENT / TEST_DEFECT. |
| `/bugmojo:assign [plan-version]` | you | Balances the manual cases across the team by constraint, area affinity and load; creates the run, attaches the assignments, and writes each person's list. |
| `/bugmojo:report [plan-version]` | you | Builds the client report: scope, what changed since the last version, coverage by feature, results by mode, the evidence behind each pass, open bugs, verified fixes, and the honest list of what was manual and why. |
| `/bugmojo:fix-bug <KEY>` | you | Pulls the bug with its console and network logs, calls `get_repro_pack` for an executable repro, localizes, fixes, opens a PR that references the bug, and closes the loop with `link_pr`. |
| `/bugmojo:triage-bugs` | you or Claude | Ranks open bugs in the context of the test plan: linked cases, defect density, reopens, and what is merely waiting on verification. |
| `bugmojo-conventions` | Claude, automatically | Fires when you touch `tests/**` or `e2e/**`: how to name and annotate a spec so BugMojo maps the result to the case, plus the flakiness rules. |

## Subagents

Delegate the noisy parts without filling the main conversation.

| Agent | Tools | Job |
| --- | --- | --- |
| `test-planner` | Read/Grep/Glob + BugMojo MCP | Maps routes, APIs, forms and roles into proposed cases. Writes proposals, never specs, never code. |
| `test-generator` | + Bash | Writes Playwright specs, grounds every selector against the live app, lints for the flakiness patterns, attaches the spec only once it is green. |
| `test-runner` | Bash + BugMojo MCP, bounded turns | Runs the suite and confirms the run recorded. Never retries to get green, never edits a spec. |
| `evidence-reviewer` | Read/Bash + BugMojo MCP | Triages each FAIL into BUG / FLAKY / ENVIRONMENT / TEST_DEFECT from the trace, video and logs, and files the real bugs with `create_bug_from_result`. |

## Hooks

Three, all fail-silent, all disabled in one move with `BUGMOJO_HOOKS=off`.

| Hook | When | What it does |
| --- | --- | --- |
| **SessionStart** | session start / resume / clear | Injects ~20 lines: the open bugs, whether the reporter is wired in this repo, how many specs map to cases, any unrecorded run, and the one tool to call first (`get_project_test_context`). One HTTP call with a 4s deadline; `BUGMOJO_SESSION_CONTEXT=off` keeps it offline. |
| **PostToolUse** (Bash) | after a `playwright test` (including through `npm run …`) | Records the run. If the reporter is configured it notes the run and stays quiet; if not, it posts the Playwright JSON report to `/api/v1/runs/results` so the statuses at least exist; if it cannot, it marks the run unrecorded and says exactly why. |
| **Stop** | end of a turn | Proof of work: warns if the session ran tests nothing recorded, or claimed a green suite with no run behind it. Warn by default; `BUGMOJO_PROOF_OF_WORK=block` makes it a gate, `=off` silences it. |

### Environment the hooks read

Hooks are detached processes with no browser, so they use the REST API with the same
`bm_key_…` key the reporter and CLI use — never a secret on the command line, never a file
in your repo. State lives in the OS temp directory, keyed by session.

| Variable | Effect |
| --- | --- |
| `BUGMOJO_API_KEY` (or `BUGMOJO_API_TOKEN`) | lets the hooks read bugs and record runs |
| `BUGMOJO_PROJECT` | the project key, e.g. `WEB` |
| `BUGMOJO_API_URL` | self-hosted / local deployments |
| `BUGMOJO_HOOKS=off` | disable all three hooks |
| `BUGMOJO_SESSION_CONTEXT=off` | SessionStart uses local signals only |
| `BUGMOJO_PROOF_OF_WORK=block\|warn\|off` | Stop-hook strictness (default `warn`) |

Without credentials nothing breaks: SessionStart falls back to repo signals and the
PostToolUse hook tells you what is missing.

## The MCP connection

`.mcp.json` declares one HTTP server named `bugmojo` at the URL you configure. It
authenticates with Better Auth OAuth 2.1, so the first tool call opens a browser login
(`/mcp` triggers it manually).

```json
{ "mcpServers": { "bugmojo": { "type": "http", "url": "${user_config.mcp_url}" } } }
```

The default URL carries `?mode=qa` on purpose: the plan-reading, review-queue, run and
evidence tools (`list_test_plans`, `get_test_plan_version`, `diff_plan_versions`,
`get_coverage_ledger`, `list_review_queue`, `review_test_case`, `classify_test_case`,
`record_run_results`, `upload_evidence`, `create_bug_from_result`) are in the QA wing, and
`/bugmojo:run`, `/bugmojo:assign` and `/bugmojo:report` need them. Add `?workspace=<slug>`
to pin a workspace, or `?mode=all` for the admin wing as well.

The default surface (28–32 tools) already carries what a coding agent needs without any
flag: `get_project_test_context`, `propose_test_cases`, `create_test_plan_version`,
`attach_spec`, the test-case CRUD, the bug tools, `get_repro_pack`, `link_pr` and
`regression_insights`.

> **Why the skills do not declare `allowed-tools`.** A too-narrow allowlist would strip the
> `bugmojo` MCP server out of the skill that depends on it, and every BugMojo tool is
> already permission-gated server-side by workspace role — a VIEWER cannot even see the
> write tools. The one skill that does declare it (`bugmojo-conventions`) is advisory and
> needs no MCP at all.

## Bug key convention

BugMojo bug keys are `PROJECT-###` — project key plus issue number (`WEB-42`, `API-17`).
`fix-bug` uses that key in the branch, the commit and the PR (`Fixes PROJECT-###`).

Test **cases** are referenced by their `external_key` (`checkout/coupon-below-minimum`) or
their id — see the `bugmojo-conventions` skill for how a spec declares which case it runs.

## Verified-fixed (Team tier)

The verified loop runs the PR'd repro test in **your own CI** — there is no hosted runner
today. `fix-bug` therefore focuses on producing a real, runnable repro test; CI verifies it
after merge and the webhook moves the bug to `VERIFIED_FIXED` or `REOPENED`. Auto-dispatch
and the verified loop are Team-tier gates; a `paywall` error is surfaced, never retried.

## Other clients

The same hosted endpoint works everywhere; the plugin itself is Claude Code only.

- Codex CLI: `codex mcp add bugmojo --url https://www.bugmojo.com/api/mcp` then `codex mcp login bugmojo`
- Cursor: `.cursor/mcp.json` → `{ "mcpServers": { "bugmojo": { "url": "https://www.bugmojo.com/api/mcp" } } }`
- VS Code / Copilot: `code --add-mcp '{"name":"bugmojo","type":"http","url":"https://www.bugmojo.com/api/mcp"}'`
- Gemini CLI: `gemini mcp add --transport http bugmojo https://www.bugmojo.com/api/mcp`

`npx @bugmojo/cli init` writes the same instruction block into `AGENTS.md`, `CLAUDE.md`,
`.github/copilot-instructions.md`, `.cursor/rules/bugmojo.mdc` and `GEMINI.md`, so every
agent in the repo learns the same loop.

## Related

- Machine-readable product overview + tool list: `https://www.bugmojo.com/llms.txt`
- MCP server package: [`@bugmojo/mcp-server`](https://www.npmjs.com/package/@bugmojo/mcp-server)
- Playwright reporter: [`@bugmojo/playwright-reporter`](https://www.npmjs.com/package/@bugmojo/playwright-reporter)
- Docs & issues: [viveksinra/bugmojo-sdk](https://github.com/viveksinra/bugmojo-sdk)
