# BugMojo plugin for Cursor

Wires the hosted BugMojo MCP into Cursor and teaches it the loop:

> Capture with replay → executable repro pack → agent fix → verified in your own CI, with
> versioned test plans, evidence on every result, and a client report with sign-off.

Requires **Cursor 3.13.0 or later** (`minClientVersions.cursor` in the manifest).

## Install

**One click** — the generated deeplink (hosted endpoint, OAuth in the browser):

```text
cursor://anysphere.cursor-deeplink/mcp/install?name=bugmojo&config=eyJ1cmwiOiJodHRwczovL3d3dy5idWdtb2pvLmNvbS9hcGkvbWNwP21vZGU9cWEifQ%3D%3D
```

**Or from the marketplace** once the listing clears review: Cursor → Marketplace → BugMojo.

**Or by hand** — Settings → MCP → Add server:

```json
{ "mcpServers": { "bugmojo": { "url": "https://www.bugmojo.com/api/mcp?mode=qa" } } }
```

Append `?workspace=<slug>` to pin one workspace, or `?mode=qa` to also get the run-authoring
and plan-review tools.

## What is in here

| Path | What it is |
| --- | --- |
| `.cursor-plugin/plugin.json` | The plugin manifest, including the `minClientVersions.cursor` floor. |
| `mcp.json` | One server: the hosted endpoint. |
| `rules/bugmojo.mdc` | `alwaysApply: false`, globbed to `tests/**`, `e2e/**` and `playwright.config.*`. It only enters context when you are in test code — a rule that is always on is a tax on every request. |
| `skills/` | Byte-identical copies of the Claude Code plugin's skills (`packages/claude-plugin/skills/`). |

