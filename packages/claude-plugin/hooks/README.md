# BugMojo hooks — the proof-of-work gate

Three hooks ship with this plugin. Two of them exist for one reason: **a test run
nobody recorded did not happen.**

| Event | Script | What it does |
| --- | --- | --- |
| `SessionStart` | `scripts/session-start.mjs` | Injects your open bugs, assigned cases and recent failures. |
| `PostToolUse` (Bash) | `scripts/post-playwright.mjs` | After a Bash call that ran Playwright, records the run in BugMojo — through the reporter if it is wired, otherwise from the JSON report. |
| `Stop` | `scripts/stop-proof-of-work.mjs` | Refuses to let a session end claiming a green suite it never recorded. |

## Configuration

Every setting is an environment variable. The hooks never read a secret from
disk and never take one on argv — argv is world-readable in a process list.

| Variable | Default | Meaning |
| --- | --- | --- |
| `BUGMOJO_API_KEY` | — | `bm_key_…` from Settings → API Keys. Without it the hooks fall back to purely local signals. |
| `BUGMOJO_PROJECT` | — | Project key, e.g. `WEB`. |
| `BUGMOJO_API_URL` | `https://www.bugmojo.com` | Base URL. |
| `BUGMOJO_HOOKS` | on | `off` disables every BugMojo hook. |
| `BUGMOJO_SESSION_CONTEXT` | on | `off` keeps `SessionStart` offline (local signals only). |
| `BUGMOJO_PROOF_OF_WORK` | `warn` | `warn` · `block` · `off` — how strict the `Stop` gate is. |
| **`BUGMOJO_ALLOW_UNVERIFIED`** | unset | **The escape hatch.** `1` / `true` / `yes` / `on` lets this session end with an unrecorded run, whatever `BUGMOJO_PROOF_OF_WORK` says. |
| `BUGMOJO_HOOK_TIMEOUT_MS` | `4000` | Per-call network deadline, clamped to 500–15000. |

### The escape hatch is not a courtesy

`BUGMOJO_PROOF_OF_WORK=block` makes the `Stop` hook exit 2 with its reason on
stderr, which Claude Code feeds back to the model so it can close the gap
itself. A blocking hook with no documented way out is a hook that gets ripped
out of `settings.json` at the worst possible moment — so the block message names
`BUGMOJO_ALLOW_UNVERIFIED` in its own text, and setting it is honoured before
anything else is computed: no state read, no network call, no delay.

```bash
# Enforce the gate for the team…
export BUGMOJO_PROOF_OF_WORK=block

# …and get out of it for one session, on purpose.
BUGMOJO_ALLOW_UNVERIFIED=1 claude
```

## It fails open, by design

A BugMojo outage must never be able to wedge someone's session. Before the
`Stop` hook objects to anything, it gives each unrecorded run one more attempt
on a short deadline (6 s for the whole pass, whatever `BUGMOJO_HOOK_TIMEOUT_MS`
says per call). Then:

- the retry **succeeded** → the run is recorded, the session ends quietly;
- the retry **failed for a network reason** (timeout, 5xx, connection refused) →
  the gate degrades to a warning that says BugMojo was unreachable, and **never
  blocks**;
- the retry **failed for a configuration reason** (bad key, unknown project), or
  there was nothing to retry → this is a real gap, and the gate does its job.

Both halves are pinned by tests: an unreachable API produces a warning, not a
block, and it costs seconds rather than minutes.

## What counts as recorded

In descending order of proof:

1. `SELF_RECORDING` — `@bugmojo/playwright-reporter` or `bugmojo run` recorded
   the run itself, with trace, video and screenshots.
2. `RECORDED` — the `PostToolUse` hook (or the `Stop` retry) posted the
   Playwright JSON report. Statuses only: no evidence artifacts.
3. `PENDING` / `FAILED` — nothing reached BugMojo. This is what the `Stop` hook
   objects to.

Run `npx @bugmojo/cli init` to move a repo from 2 to 1.
