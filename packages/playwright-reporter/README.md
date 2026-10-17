# @bugmojo/playwright-reporter

**Your Playwright run, kept as proof.** Every test you already run becomes a
recorded result in BugMojo — with the trace, the video, the screenshots and the
console output attached, tied to the exact commit and the exact deployed URL.

A failing test that BugMojo has never seen before becomes a test case **and a
bug**, automatically. That is how a bug an agent found at 2am is waiting for you
in the morning instead of scrolling past in a CI log.

> **It will never fail your build.** No API key, no network, an expired token, a
> 40 MB trace, a 500 from the server — the reporter writes one line to stderr and
> gets out of the way. Reporting is not allowed to be the reason `npx playwright
> test` goes red.

---

## Install

```bash
npm install -D @bugmojo/playwright-reporter
# or: pnpm add -D @bugmojo/playwright-reporter
```

## Configure (3 lines)

```ts
// playwright.config.ts
import { defineConfig } from '@playwright/test';

export default defineConfig({
  reporter: [['list'], ['@bugmojo/playwright-reporter']],          // 1
  use: {
    trace: 'retain-on-failure',                                     // 2
    video: 'retain-on-failure',                                     // 3
    screenshot: 'only-on-failure',
  },
});
```

Then two environment variables:

```bash
BUGMOJO_API_KEY=bm_key_...     # Settings -> API keys, with write permission
BUGMOJO_PROJECT=WEB            # your project key
```

That is the whole setup. `npx @bugmojo/cli init` writes both blocks for you if
you would rather not edit the config by hand.

---

## What you get

| After one `npx playwright test` | Where it lands |
| --- | --- |
| A **run** stamped with the commit SHA, deployed URL, environment and runner (LOCAL / CI) | the project's run history |
| One **result** per test — status, duration, retries, the first line of the failure | pinned to the test case's exact revision |
| The **trace.zip**, the **video**, the **screenshots**, **stdout/stderr**, and any JSON you attached | evidence on the failing result, replayable in the trace viewer |
| A **PROPOSED test case + a bug** for a failure with no matching case | the review queue, with the failure already written up |
| Flaky tests marked as flaky (failed, then passed on retry) | the flakiness report |

---

## How a spec finds its test case

Two conventions, both supported. Use whichever fits.

**1. Annotate the test** — survives renaming the file:

```ts
test('checkout with a saved card', async ({ page }) => {
  test.info().annotations.push({ type: 'bugmojo', description: 'WEB-42' });
  // ...
});
```

**2. Name the spec file** — the convention `@bugmojo/verify` already uses, so
repro specs exported from BugMojo work with no edits:

```
tests/bugmojo/WEB-42.spec.ts            -> WEB-42
tests/bugmojo/WEB-42-checkout.spec.ts   -> WEB-42   (prefix before the 2nd dash)
```

A `[WEB-42]` prefix in the test title and a `@WEB-42` Playwright tag work too.
An annotation can also carry a raw BugMojo test-case id.

**No match, and the test failed?** The reporter says so, and BugMojo creates the
case as `PROPOSED` plus a bug with the spec path and the failure line. Turn it
off with `BUGMOJO_CREATE_MISSING_CASES=false` or `createMissingCases: false`.

---

## Configuration reference

Every option can be set in `playwright.config.ts` or via the environment. The
config file wins.

| Option | Env var | Default | What it does |
| --- | --- | --- | --- |
| `apiKey` | `BUGMOJO_API_KEY` | — | Required. A key with write permission. |
| `project` | `BUGMOJO_PROJECT` | — | Required. Project key (`WEB`) or id. |
| `apiUrl` | `BUGMOJO_API_URL` | `https://www.bugmojo.com` | Self-hosted or staging instance. |
| `planVersionId` | `BUGMOJO_PLAN_VERSION` | — | Bind the run to a frozen test-plan version. |
| `suiteName` / `suiteId` | `BUGMOJO_SUITE` / `BUGMOJO_SUITE_ID` | `Automated (Playwright)` | Which suite the run hangs off. |
| `environment` | `BUGMOJO_ENVIRONMENT` | — | `staging`, `production`, … |
| `deployUrl` | `BUGMOJO_DEPLOY_URL` | `PLAYWRIGHT_BASE_URL` | The build under test. |
| `commitSha` | `BUGMOJO_COMMIT_SHA` | CI vars, then `git rev-parse HEAD` | What was tested. |
| `runner` | — | detected | `LOCAL` or `CI`. |
| `runId` | `BUGMOJO_RUN_ID` | — | Append to an existing run. |
| `externalRunId` | `BUGMOJO_RUN_KEY` | the CI run id | Shards of one job share it, so a sharded suite is ONE run. |
| `createMissingCases` | `BUGMOJO_CREATE_MISSING_CASES` | `true` | Failing test with no case -> PROPOSED case + bug. |
| `uploadEvidence` | `BUGMOJO_UPLOAD_EVIDENCE` | `true` | Upload artifacts at all. |
| `evidenceOnFailureOnly` | `BUGMOJO_EVIDENCE_ON_FAILURE_ONLY` | `true` | Skip artifacts for clean passes. |
| `includeStdio` | `BUGMOJO_INCLUDE_STDIO` | `true` | Attach captured stdout/stderr. |
| `timeoutMs` | `BUGMOJO_TIMEOUT_MS` | `120000` | Whole-reporter budget; exceeded means give up. |
| `disabled` | `BUGMOJO_DISABLED` | `false` | Turn reporting off entirely. |
| `debug` | `BUGMOJO_DEBUG` | `false` | Print what was resolved and uploaded. |

```ts
reporter: [
  ['@bugmojo/playwright-reporter', {
    project: 'WEB',
    environment: 'staging',
    evidenceOnFailureOnly: false,   // keep traces for green runs too
  }],
],
```

---

## In CI

```yaml
- run: npx playwright test
  env:
    BUGMOJO_API_KEY: ${{ secrets.BUGMOJO_API_KEY }}
    BUGMOJO_PROJECT: WEB
    BUGMOJO_ENVIRONMENT: staging
    PLAYWRIGHT_BASE_URL: ${{ steps.deploy.outputs.url }}
```

`GITHUB_SHA` (or the pull request's head SHA), `GITHUB_RUN_ID` and `CI` are read
automatically, so **sharded jobs merge into one BugMojo run** and a re-run of the
same job is idempotent rather than a duplicate.

---

## Sizes, and what gets skipped

Artifacts are uploaded straight to storage on a presigned URL — the bytes never
pass through the BugMojo API. Per-artifact ceilings:

| Kind | Cap |
| --- | --- |
| Trace, video | 100 MB |
| HAR, rrweb | 25 MB |
| Screenshot, JSON report, other files | 10 MB |
| Console output (stdout/stderr) | 5 MB, tail-truncated |

Plus 25 artifacts and 250 MB per test. Anything over is **skipped with a
warning** — the result itself is always recorded.

---

## Privacy

The reporter sends test titles, spec paths, failure messages, the artifacts
Playwright produced, and the run's commit/URL metadata. It never reads or uploads
your application source.

---

## Troubleshooting

| You see | Why |
| --- | --- |
| `reporting is off — no API key (set BUGMOJO_API_KEY)` | Expected on a contributor's machine with no key. The run is unaffected. |
| `No BugMojo test case matched …` | The spec carries no annotation, tag or recognised file name. Add an annotation, or let a failure create the case. |
| `evidence storage is not configured on this BugMojo instance` | A self-hosted instance without S3. Results still land; artifacts do not. |
| `reporting exceeded 120000ms — giving up` | The API was unreachable or very slow. Nothing else is affected. |

Set `BUGMOJO_DEBUG=1` to see the resolved project, runner, CI provider and API
URL before the run starts.

---

## License

MIT · [bugmojo.com](https://www.bugmojo.com)
