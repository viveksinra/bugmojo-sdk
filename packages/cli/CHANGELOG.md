# Changelog

All notable changes to `@bugmojo/cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-09-18

First public release (the 2026-07-24 build was never published).

### Added

- `bugmojo run [playwright args]` — run the project's own Playwright suite and
  record the results in BugMojo. When `@bugmojo/playwright-reporter` is
  configured, the reporter records results and evidence itself; otherwise the
  CLI adds the JSON reporter, maps each test to a BugMojo test case (a
  `{ type: 'bugmojo', description: 'CASE-KEY' }` annotation, a `[CASE-KEY]`
  title tag / `@CASE-KEY` tag, or a `tests/bugmojo/CASE-KEY.spec.ts` file
  name) and POSTs to `/api/v1/test-runs/results`. Detects the `LOCAL` vs `CI`
  runner and the commit SHA. Supports `--url`, `--project`, `--suite`,
  `--plan-version`, `--commit`, `--deploy-url`, `--dry-run`, `--no-record`,
  `--json` and `-- <playwright args>`. The exit code mirrors Playwright's;
  recording failures are warnings.
- `bugmojo init` — writes an idempotent, marker-delimited BugMojo block into
  `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`,
  `.cursor/rules/bugmojo.mdc` and `GEMINI.md`, and adds
  `@bugmojo/playwright-reporter` + `trace` / `video` `retain-on-failure` and
  `screenshot: 'only-on-failure'` to `playwright.config.*` (created from a
  template when the project depends on `@playwright/test` but has no config).
  Re-running is byte-identical; user content outside the markers is preserved
  (CRLF files stay CRLF). Supports `--workspace`, `--project`, `--mcp-url`,
  `--api-url`, `--only`, `--playwright`, `--skip-playwright`, `--dry-run`.
  Needs no API token.
- Programmatic exports for both: `applyInit`, `upsertMarkedBlock`,
  `patchPlaywrightConfig`, `renderInstructionBlock`, `buildRunResultsPayload`,
  `resolveTestCaseKey`, `BugMojoApiClient.recordRunResults`.

- `bugmojo repro <bug-key>` — pull a bug's repro pack and write a self-contained
  repro directory: the executable `@playwright/test` spec, `logs.md`
  (errors-first console + network signals), `localization.md` (component +
  candidate source files), `pack.json`, and a `README.md`. Supports `--out`,
  `--force`, and `--json`.
- `bugmojo verify <bug-key> --url <deployed-url>` — run the repro spec locally
  with the project's own `@playwright/test` install against a deployed build.
  Exits `0` on pass / `1` on fail so CI can gate on it. `--report` POSTs the
  result to the BugMojo CI verify webhook, flipping the bug
  `DEV_TESTING → VERIFIED_FIXED` (pass) or `REOPENED` (fail). Also supports
  `--keep` and `--json`.
- `bugmojo fix <bug-key>` — print an agent-ready fix prompt (goal, localization,
  error signals, and the failing spec) to paste into Claude Code / Cursor.
  Supports `--out`.
- Env-driven configuration: `BUGMOJO_API_TOKEN` (required), `BUGMOJO_API_URL`
  (optional, defaults to the hosted BugMojo instance), `BUGMOJO_CI_SECRET`
  (only for `verify --report`). `--token` / `--api-url` flag overrides.
- Security: the server-provided repro spec runs in a temp Playwright project
  with a minimal allow-listed environment — `BUGMOJO_API_TOKEN` and
  `BUGMOJO_CI_SECRET` are never forwarded to the spec process.
- Programmatic API (`import { run, ... } from '@bugmojo/cli'`) with no
  side effects at import time.

[0.1.0]: https://github.com/viveksinra/bugmojo-sdk/tree/main/packages/cli
