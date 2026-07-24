# @bugmojo/mcp-server

MCP server that connects AI coding agents — **Claude Code, Cursor, VS Code, Claude Desktop** — to [BugMojo](https://www.bugmojo.com) bug tracking.

[![npm version](https://img.shields.io/npm/v/%40bugmojo%2Fmcp-server)](https://www.npmjs.com/package/@bugmojo/mcp-server)
[![license: MIT](https://img.shields.io/npm/l/%40bugmojo%2Fmcp-server)](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/mcp-server/LICENSE)

## Why

[BugMojo](https://www.bugmojo.com) captures pixel-perfect bug reports straight from the browser — session replay, console logs, network requests, screenshots. This MCP server hands that context to your AI coding agent: it can list, search, and read bugs, file new ones, update status/priority/assignee, and add comments over BugMojo's API-key-authenticated REST API. Your agent fixes bugs with the full capture context instead of a one-line description.

> **Want the full surface?** Regression suites/runs, testing workflow, agents, session-replay summaries, and inline console/network logs are available on the **hosted, OAuth-authenticated HTTP endpoint** at `https://www.bugmojo.com/api/mcp` — see [Full surface (OAuth HTTP)](#full-surface-oauth-http) below. This npm package intentionally stays a minimal bugs shim so every tool maps to a real endpoint (nothing 404s).

## Install

**Requires Node.js 18+.** No install needed — MCP clients run it with `npx`:

```bash
npx -y @bugmojo/mcp-server
```

Or install the `bugmojo-mcp` command globally:

```bash
npm install -g @bugmojo/mcp-server
# or
pnpm add -g @bugmojo/mcp-server
# or
yarn global add @bugmojo/mcp-server
```

It speaks MCP over **stdio** and reads two environment variables (below).

## Quickstart (Claude Code, 60 seconds)

1. Generate an API key in your [BugMojo dashboard](https://www.bugmojo.com) under **Settings → API Keys** (it starts with `bm_key_`).
2. Register the server:

```bash
claude mcp add bugmojo -e BUGMOJO_API_KEY=bm_key_your_key_here -- npx -y @bugmojo/mcp-server
```

3. Ask Claude: *"List the open CRITICAL bugs and summarise the newest one."*

## Configuration

| Variable | Required | Description |
| --- | --- | --- |
| `BUGMOJO_API_KEY` | ✅ | Your BugMojo API key (starts with `bm_key_`). Generate one in the dashboard under **Settings → API Keys**. |
| `BUGMOJO_API_URL` | — | Base URL of your BugMojo instance. Defaults to `https://www.bugmojo.com` — only set this for self-hosted or local instances (e.g. `http://localhost:3000`). |

## Client setup

### Claude Code

Either use the CLI (per-user):

```bash
claude mcp add bugmojo -e BUGMOJO_API_KEY=bm_key_your_key_here -- npx -y @bugmojo/mcp-server
```

Or check a project-scoped `.mcp.json` into your repo root so the whole team gets it:

```json
{
  "mcpServers": {
    "bugmojo": {
      "command": "npx",
      "args": ["-y", "@bugmojo/mcp-server"],
      "env": {
        "BUGMOJO_API_KEY": "bm_key_your_key_here"
      }
    }
  }
}
```

### Claude Desktop

Add to `claude_desktop_config.json` (**Settings → Developer → Edit Config**):

```json
{
  "mcpServers": {
    "bugmojo": {
      "command": "npx",
      "args": ["-y", "@bugmojo/mcp-server"],
      "env": {
        "BUGMOJO_API_KEY": "bm_key_your_key_here"
      }
    }
  }
}
```

### Cursor

`~/.cursor/mcp.json` (global) or `.cursor/mcp.json` (per project):

```json
{
  "mcpServers": {
    "bugmojo": {
      "command": "npx",
      "args": ["-y", "@bugmojo/mcp-server"],
      "env": {
        "BUGMOJO_API_KEY": "bm_key_your_key_here"
      }
    }
  }
}
```

### VS Code (MCP)

`.vscode/mcp.json`:

```json
{
  "servers": {
    "bugmojo": {
      "command": "npx",
      "args": ["-y", "@bugmojo/mcp-server"],
      "env": {
        "BUGMOJO_API_KEY": "bm_key_your_key_here"
      }
    }
  }
}
```

### Any other MCP client

Point it at the same stdio command: `npx -y @bugmojo/mcp-server` (or `bugmojo-mcp` if installed globally) with `BUGMOJO_API_KEY` in the environment. Add `BUGMOJO_API_URL` only if you self-host.

## Tools

| Tool | What it does |
| --- | --- |
| `list_bugs` | List/filter bugs by project, status, priority, assignee (paginated). |
| `get_bug` | Full details of one bug: description, comments, labels, recordings/screenshots. |
| `search_bugs` | Full-text search across bug titles and descriptions. |
| `create_bug` | Create a bug in a project (title, description, priority, assignee). Needs a write-scoped key. |
| `update_bug` | Update status, priority, assignee, title, or description. Needs a write-scoped key. |
| `add_comment` | Add a comment to a bug. Needs a write-scoped key. |

That's the whole npm package — six tools, each mapping to a real `/api/v1/bugs/*` endpoint.

## Full surface (OAuth HTTP)

Regression suites/runs, the testing (QA) workflow, agents, **session-replay summaries** (`summarize_replay`), and **inline console/network logs** (`get_bug_console_logs`, `get_bug_network_logs`) are served by the hosted, OAuth 2.1-authenticated streaming endpoint — not this npm package. Point an HTTP-capable MCP client at:

```
https://www.bugmojo.com/api/mcp
```

The client opens a browser login the first time (no API key to manage). Optional query params: `?workspace=<slug>` binds the connection to a workspace, and `?mode=admin` additionally exposes the admin-management tools.

```jsonc
// Claude Code / clients that support remote MCP servers
{
  "mcpServers": {
    "bugmojo": {
      "type": "http",
      "url": "https://www.bugmojo.com/api/mcp"
    }
  }
}
```

## Example

Once configured, ask your agent things like:

> "List the open CRITICAL bugs in project X, open the newest one, and summarise the repro steps."

The agent calls `list_bugs` (`status=OPEN`, `priority=CRITICAL`), then `get_bug` for the full context — including the session replay BugMojo captured in the browser.

## How it works

This package is a thin, stateless client: it translates MCP tool calls into authenticated HTTPS requests to the BugMojo REST API (`/api/v1`). All business logic and data live in your BugMojo instance — nothing is stored locally.

## Troubleshooting

**"BUGMOJO_API_KEY environment variable is required"**
The key isn't reaching the server process. Put it in the `env` block of your MCP config (or pass `-e BUGMOJO_API_KEY=...` to `claude mcp add`) — shell exports are not inherited by every MCP client.

**"BUGMOJO_API_KEY must start with 'bm_key_' prefix"**
You copied the wrong value (e.g. a session token or a truncated key). Regenerate the key in the dashboard under **Settings → API Keys** and copy the whole `bm_key_...` string.

**"Authentication failed ... Check your BUGMOJO_API_KEY" (401)**
The key was revoked or belongs to a different instance. Generate a fresh key; if you self-host, also confirm `BUGMOJO_API_URL` points at that instance.

**"Permission denied" (403) on create/update/comment**
Your key is read-only. `create_bug`, `update_bug`, and `add_comment` need a write-scoped key.

**"fetch failed" / ECONNREFUSED**
The server can't reach `BUGMOJO_API_URL`. The default is `https://www.bugmojo.com`; if you set a self-hosted/local URL, make sure that instance is running and reachable.

**Server disconnects immediately on first run**
Make sure your config uses `"args": ["-y", "@bugmojo/mcp-server"]` — without `-y`, npx's first-run "Ok to proceed?" prompt hangs the stdio handshake. Also confirm `node --version` is 18 or newer.

## Related packages

| Package | Use it for |
| ------- | ---------- |
| [`@bugmojo/widget`](https://www.npmjs.com/package/@bugmojo/widget) | Framework-agnostic on-site feedback + capture widget core |
| [`@bugmojo/react`](https://www.npmjs.com/package/@bugmojo/react) | React / Next.js SDK — provider, error boundary, hooks |
| [`@bugmojo/react-native`](https://www.npmjs.com/package/@bugmojo/react-native) | React Native + Expo SDK — shake-to-report |
| [`@bugmojo/cli`](https://www.npmjs.com/package/@bugmojo/cli) | Pull a bug's Playwright repro pack, verify fixes locally |

## Links

- Website — https://www.bugmojo.com
- Docs & issues (GitHub) — https://github.com/viveksinra/bugmojo-sdk
- Issues — https://github.com/viveksinra/bugmojo-sdk/issues
- Changelog — https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/mcp-server/CHANGELOG.md
- Model Context Protocol — https://modelcontextprotocol.io

## License

MIT © Softech Infra
