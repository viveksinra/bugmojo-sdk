# @bugmojo/cli

> Turn a captured BugMojo bug into a runnable Playwright repro, verify the fix against a real deploy, and brief an AI agent — from your terminal or CI.

[![npm version](https://img.shields.io/npm/v/%40bugmojo%2Fcli)](https://www.npmjs.com/package/@bugmojo/cli)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/cli/LICENSE)
[![node >= 20](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org)

## Why

[BugMojo](https://www.bugmojo.com) captures bugs with full context — an rrweb session recording, console logs, and network requests. This CLI closes the **verified loop**: it compiles that capture into an executable `@playwright/test` spec (via BugMojo's server-side repro compiler), runs it against your patched build, and reports the result — a bug is only **verified fixed** when its own repro passes. There is no BugMojo-hosted browser runner: *your* machine or CI runs the test, exactly like the rest of your suite.

```
bugmojo repro  <bug-key>            # pull + write the Playwright spec, logs, localization
bugmojo verify <bug-key> --url URL  # run the repro locally; exit 0 pass / 1 fail
bugmojo fix    <bug-key>            # print an agent-ready prompt to paste into an AI IDE
```

## Install

Run it ad-hoc with npx (no install):

```bash
npx @bugmojo/cli --help
```

…or add it to a project:

```bash
pnpm add -D @bugmojo/cli
npm  install --save-dev @bugmojo/cli
yarn add -D @bugmojo/cli
```

Only `verify` needs a browser. `@playwright/test` is an **optional peer
dependency** — install it in the project you run `verify` from:

```bash
pnpm add -D @playwright/test
npx playwright install chromium
```

## Quickstart

```bash
# 1. Get an API key: BugMojo Dashboard → Settings → API Keys (starts with bm_key_)
export BUGMOJO_API_TOKEN="bm_key_xxxxxxxxxxxxxxxxxxxx"

# 2. Pull the repro pack for a bug:
npx @bugmojo/cli repro WEB-42
#    → ./bugmojo-repro/WEB-42/  (spec, logs.md, localization.md, pack.json, README.md)

# 3. Hand the fix to your AI agent (Claude Code / Cursor):
npx @bugmojo/cli fix WEB-42 | pbcopy        # macOS  (Windows: | clip · Linux: | xclip -selection clipboard)

# 4. Verify the fix against a preview deploy and report it:
npx @bugmojo/cli verify WEB-42 --url https://preview.example.com --report
#    → PASSED ✓ → the bug flips DEV_TESTING → VERIFIED_FIXED
```

## Features

- **One-command repro** — a self-contained, runnable `@playwright/test` project written to disk from a bug key.
- **Real verification** — the repro runs on *your* build with *your* Playwright install; exit `0`/`1` so CI can gate merges on it.
- **CI status reporting** — `verify --report` flips the bug `DEV_TESTING → VERIFIED_FIXED` (pass) or `REOPENED` (fail) via the CI verify webhook.
- **Agent-ready prompts** — `fix` renders goal + localization + error signals + the failing spec, ready to paste into Claude Code or Cursor.
- **Secrets stay secret** — config is env-only, and the server-provided spec runs in a temp project with a minimal allow-listed environment; `BUGMOJO_API_TOKEN` / `BUGMOJO_CI_SECRET` are never forwarded to the spec process.
- **Embeddable** — `import { run } from '@bugmojo/cli'` exposes the dispatcher and pure helpers with no side effects at import time.

## Configuration (environment)

| Variable            | Required            | Description                                                                                                          |
| ------------------- | ------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `BUGMOJO_API_TOKEN` | yes                 | A `bm_key_…` API key (Dashboard → **Settings → API Keys**). Sent as a Bearer token.                                   |
| `BUGMOJO_API_URL`   | no                  | BugMojo base URL. Default `https://www.bugmojo.com` (hosted). Set your self-hosted URL, or `http://localhost:3000` for local development. |
| `BUGMOJO_CI_SECRET` | only for `--report` | Shared secret for the CI verify webhook (must match the deployment's CI secret).                                      |

> No secret is ever written to disk or embedded in output — everything is read
> from the environment at runtime. You can also pass `--token` / `--api-url` as flags.

## Commands

### `bugmojo repro <bug-key>`

Pulls the repro pack for a bug and writes a self-contained repro directory.

```bash
bugmojo repro WEB-42                 # → ./bugmojo-repro/WEB-42/
bugmojo repro WEB-42 --out ./repros  # custom directory
bugmojo repro WEB-42 --json          # print the raw pack to stdout instead
bugmojo repro WEB-42 --force         # overwrite an existing directory
```

| Option            | Description                                                       |
| ----------------- | ----------------------------------------------------------------- |
| `-o, --out <dir>` | Output directory (default `./bugmojo-repro/<bug-key>`).           |
| `--force`         | Overwrite existing files in the output dir.                       |
| `--json`          | Print the raw repro pack JSON to stdout instead of writing files. |

Writes:

| File              | Contents                                              |
| ----------------- | ----------------------------------------------------- |
| `<slug>.spec.ts`  | The executable `@playwright/test` spec.               |
| `logs.md`         | Errors-first console + network signals.               |
| `localization.md` | React component + candidate source files for the fix. |
| `pack.json`       | The raw repro pack (machine-readable).                |
| `README.md`       | How to run it.                                        |

### `bugmojo verify <bug-key> --url <deployed-url>`

Runs the bug's repro spec locally with your `@playwright/test` install against
`--url` (which becomes Playwright's `baseURL`). Prints pass/fail and **exits `0`
on pass, `1` on fail** so CI can gate on it.

```bash
bugmojo verify WEB-42 --url https://preview.example.com
bugmojo verify WEB-42 --url https://preview.example.com --json    # machine output
bugmojo verify WEB-42 --url https://preview.example.com --report  # POST result to CI
```

| Option            | Description                                                                 |
| ----------------- | --------------------------------------------------------------------------- |
| `-u, --url <url>` | Deployed URL to run the repro against (sets Playwright's `baseURL`).        |
| `--report`        | POST the pass/fail result to the CI verify webhook (needs `BUGMOJO_CI_SECRET`). |
| `--keep`          | Keep the temp Playwright project dir (debugging).                           |
| `--json`          | Also print the raw run result as JSON.                                      |

With `--report` (and `BUGMOJO_CI_SECRET` set) the result is POSTed to BugMojo's
CI verify webhook, which flips the bug's status:
`DEV_TESTING → VERIFIED_FIXED` on pass, `DEV_TESTING → REOPENED` on fail.

A skipped-only or empty run is **not** a pass — at least one test must actually
execute and pass, so a bug is never marked verified by a repro that didn't run.

### `bugmojo fix <bug-key>`

Prints an agent-ready prompt bundle — goal, localization, error signals, and the
failing spec — ready to paste into Claude Code / Cursor.

```bash
bugmojo fix WEB-42                          # to stdout
bugmojo fix WEB-42 --out prompt.md          # to a file
bugmojo fix WEB-42 | pbcopy                 # clipboard — macOS
bugmojo fix WEB-42 | clip                   # clipboard — Windows (cmd)
bugmojo fix WEB-42 | Set-Clipboard          # clipboard — Windows (PowerShell)
bugmojo fix WEB-42 | xclip -sel clipboard   # clipboard — Linux (X11; Wayland: wl-copy)
```

| Option             | Description                                 |
| ------------------ | ------------------------------------------- |
| `-o, --out <file>` | Write the prompt to a file instead of stdout. |

### `bugmojo help [command]` / `bugmojo version`

`help` shows the top-level screen or one command's help (`-h`/`--help` work
everywhere); `version` (or `-v`/`--version`) prints the CLI version.

## CI: verify a fix on every preview deploy

```yaml
# .github/workflows/verify-bug.yml
name: Verify bug fix
on:
  workflow_dispatch:
    inputs:
      bug_key:
        description: "BugMojo bug key (e.g. WEB-42)"
        required: true
      preview_url:
        description: "Deployed preview URL"
        required: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm install @bugmojo/cli @playwright/test
      - run: npx playwright install --with-deps chromium
      - run: npx bugmojo verify "${{ inputs.bug_key }}" --url "${{ inputs.preview_url }}" --report
        env:
          BUGMOJO_API_TOKEN: ${{ secrets.BUGMOJO_API_TOKEN }}
          BUGMOJO_CI_SECRET: ${{ secrets.BUGMOJO_CI_SECRET }}
```

The job fails when the repro fails (exit `1`), and `--report` flips the bug's
status in BugMojo either way.

## API contract consumed

- `GET /api/v1/bugs/{bug-key}/repro` → `{ issue_id, bug_key, repro_pack }`
  (auth: `Authorization: Bearer $BUGMOJO_API_TOKEN`). Backed server-side by the
  same compiler path as the `get_repro_pack` MCP tool. `{bug-key}` accepts the
  human key (`WEB-42`) or the raw issue id.
- `POST /api/webhooks/ci` (auth: `X-CI-Secret: $BUGMOJO_CI_SECRET`) — used by
  `verify --report`. Body: `{ bug_key, passed, proof_url? }` (the `--url` you
  verified against is sent as the proof link).

> **ESM-only.** The CLI requires Node >= 20 and ships native ES modules. The
> `bugmojo` bin works everywhere; programmatic consumers on CommonJS should use
> dynamic `import('@bugmojo/cli')` (or Node >= 20.19, where `require(esm)` works).

## Exit codes

| Code | Meaning                                          |
| ---- | ------------------------------------------------ |
| `0`  | Success (or repro passed for `verify`).          |
| `1`  | Runtime failure (or repro failed for `verify`).  |
| `2`  | Usage error (missing bug key / unknown command). |

## Troubleshooting / FAQ

**"Missing API token" error.**
Set `BUGMOJO_API_TOKEN` to a `bm_key_…` key from your BugMojo dashboard
(**Settings → API Keys**), or pass `--token`. Keys must start with `bm_key_`.

**"@playwright/test is not installed in this project" when running `verify`.**
`verify` uses the Playwright install of the directory you run it from. Fix:
`pnpm add -D @playwright/test && npx playwright install chromium`. `repro` and
`fix` never need a browser.

**`verify` reports "No tests executed (all skipped)".**
A skipped/empty run is deliberately treated as a failure — otherwise a repro
that never ran could mark a bug verified. Check the spec (run with `--keep` to
inspect the temp project) and make sure `--url` points at a reachable build.

**I'm self-hosting BugMojo / developing locally.**
Set `BUGMOJO_API_URL` to your deployment's base URL (e.g.
`https://bugs.your-company.com` or `http://localhost:3000`). The default is the
hosted instance at `https://www.bugmojo.com`.

**"The repro pack response is missing a `script`".**
The bug has no session recording to compile into a repro. Capture the bug with
the BugMojo browser extension (which records the session) and try again.

## Related packages

| Package | Use it for |
| ------- | ---------- |
| [`@bugmojo/widget`](https://www.npmjs.com/package/@bugmojo/widget) | Framework-agnostic on-site feedback + capture widget core |
| [`@bugmojo/react`](https://www.npmjs.com/package/@bugmojo/react) | React / Next.js SDK — provider, error boundary, hooks |
| [`@bugmojo/react-native`](https://www.npmjs.com/package/@bugmojo/react-native) | React Native + Expo SDK — shake-to-report |
| [`@bugmojo/mcp-server`](https://www.npmjs.com/package/@bugmojo/mcp-server) | Connect AI coding agents (Claude Code, Cursor) to BugMojo |

## License

[MIT](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/cli/LICENSE) © Softech Infra
— docs & issues at [viveksinra/bugmojo-sdk](https://github.com/viveksinra/bugmojo-sdk).
