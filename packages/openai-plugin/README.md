# BugMojo plugin for ChatGPT and Codex

One package, two surfaces. Since the OpenAI plugin format unified (July 2026) a single
root `plugin.json` on the **agent-plugins 1.0.0** schema serves ChatGPT (as an app, with an
Apps SDK widget) and Codex (as a CLI plugin).

> Capture with replay → executable repro pack → agent fix → verified in your own CI, with
> versioned test plans, evidence on every result, and a client report with sign-off.

## Install

**Codex, from our own marketplace** (no directory review needed):

```bash
codex plugin marketplace add viveksinra/bugmojo-sdk
codex plugin add bugmojo
codex mcp login bugmojo     # OAuth in the browser
```

The marketplace manifest is `.agents/plugins/marketplace.json` at the **repo root** — Codex
clones the repo and reads it there, the same way Claude Code reads
`.claude-plugin/marketplace.json`.

**ChatGPT**: through the ChatGPT plugins directory once the listing is approved.

## What is in here

| Path | What it is |
| --- | --- |
| `plugin.json` | agent-plugins 1.0.0 manifest. `extensions["com.openai"]` carries the directory `interface` (display name, subtitle, category), the legal/verification URLs, and the widget→tool binding. |
| `mcp.json` | One server, `streamable-http` → `https://www.bugmojo.com/api/mcp?mode=qa`. No API key: the hosted endpoint authenticates with OAuth 2.1. |
| `skills/` | Byte-identical copies of the Claude Code plugin's skills (`packages/claude-plugin/skills/`). |
| `hooks/hooks.json` | A single `SessionStart` hook that prints the BugMojo working agreement. It makes no network call and reads no credentials, so it is safe to install before login. |
| `.codex-plugin/plugin.json` | Compatibility fallback for Codex builds that still look in `.codex-plugin/`. It reuses the same `mcp.json`, `skills/` and `hooks/` rather than forking them. |

## The Apps SDK widget

`get_regression_run` returns its usual JSON **plus** a `structuredContent` payload, and
declares `_meta.ui.resourceUri` (agent-plugins) and `openai/outputTemplate` (Apps SDK)
pointing at `ui://widget/bugmojo-run-results.html`. ChatGPT renders it inline as a card:

- pass/fail matrix **by feature** — "checkout is red, auth is green" beats "17/92 failed";
- failure counts split by kind (bug / flaky / environment / test defect);
- evidence thumbnails from the failed results;
- links to the run page and, once published, the client report.

Every other client ignores `_meta` and reads the same text result it always did.

**CSP.** `connect_domains: []` — the document makes no `fetch`, XHR or WebSocket call of any
kind; it renders `window.openai.toolOutput` and nothing else. `resource_domains` is the
dashboard origin plus the deployment's own S3 origin (derived from `getPublicUrl()`, not
hard-coded), because presigned evidence thumbnails are the only external bytes it loads. A
deployment without object storage grants nothing extra.

