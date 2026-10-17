# BugMojo extension for the Gemini CLI

Wires the hosted BugMojo MCP into the Gemini CLI, plus the context file, the shared skills
and three commands.

> Capture with replay → executable repro pack → agent fix → verified in your own CI, with
> versioned test plans, evidence on every result, and a client report with sign-off.

## Install

```bash
gemini extensions install https://github.com/viveksinra/bugmojo-sdk --path packages/gemini-extension
```

Then authenticate once:

```text
/mcp auth bugmojo
```

The gallery listing is automatic for public repos carrying the `gemini-cli-extension` topic —
there is no submission form.

## What is in here

| Path | What it is |
| --- | --- |
| `gemini-extension.json` | The manifest: the hosted server over `httpUrl` with `oauth.enabled: true` and `trust: false` (every tool call stays confirmable), plus the `settings[]` the CLI prompts for. |
| `GEMINI.md` | The context file. Loaded into every session in this repo: what to pull before debugging, how to annotate a spec, what never to fabricate. |
| `commands/` | `/bugmojo:fix-bug`, `/bugmojo:triage-bugs`, `/bugmojo:test-context`. |
| `skills/` | Byte-identical copies of the Claude Code plugin's skills (`packages/claude-plugin/skills/`). |

## Settings

| Key | Required | Default | What it does |
| --- | --- | --- | --- |
| `mcp_url` | yes | `https://www.bugmojo.com/api/mcp?mode=qa` | The endpoint. Append `?workspace=<slug>` to pin a workspace, or `?mode=qa` to also expose the run-authoring and plan-review tools. |
| `default_project` | no | *(empty)* | Project key used when a command does not name one. Empty means "ask me". |

`httpUrl` is `${settings.mcp_url}`, so changing the setting re-points the server without
editing the manifest.

### API-key fallback

If a machine cannot complete a browser login, replace the server block with a header:

```json
{
  "mcpServers": {
    "bugmojo": {
      "httpUrl": "https://www.bugmojo.com/api/mcp?mode=qa",
      "headers": { "Authorization": "Bearer ${settings.api_key}" }
    }
  }
}
```

and add an `api_key` setting. Do not ship both OAuth and an `Authorization` header — the
server sees two credentials and honours one, which makes permission bugs very hard to read.

