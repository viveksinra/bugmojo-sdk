# Changelog

All notable changes to `@bugmojo/cli` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-07-24

### Added

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
