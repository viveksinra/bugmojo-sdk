# BugMojo SDKs and agent plugins

Official SDKs, CLI, MCP server and AI-agent plugins for [BugMojo](https://www.bugmojo.com) — the
AI-native bug tracker that captures a full session replay, console + network
logs, and environment context in one click, then hands the bug to your AI
coding agent to fix and **verify**.

This repository hosts the **documentation, changelogs, and public issue
tracker** for the published packages, plus the install files for the agent
plugins (Claude Code, ChatGPT + Codex, Cursor, Gemini CLI). The npm packages
themselves are distributed via npm.

## Agent plugins

Every plugin connects to the hosted MCP endpoint (`https://www.bugmojo.com/api/mcp`)
with a browser login — no API key to paste.

| Client | Install | Docs |
| ------ | ------- | ---- |
| **Claude Code** | `/plugin marketplace add viveksinra/bugmojo-sdk` then `/plugin install bugmojo@bugmojo` | [README](./packages/claude-plugin/README.md) |
| **Codex** | `codex plugin marketplace add viveksinra/bugmojo-sdk` then `codex plugin add bugmojo` | [README](./packages/openai-plugin/README.md) |
| **Cursor** | One-click deeplink in the [plugin README](./packages/cursor-plugin/README.md#install), or Settings → MCP → Add server `https://www.bugmojo.com/api/mcp?mode=qa` (Cursor 3.13+) | [README](./packages/cursor-plugin/README.md) |
| **Gemini CLI** | `gemini extensions install https://github.com/viveksinra/bugmojo-sdk --path packages/gemini-extension` | [README](./packages/gemini-extension/README.md) |

Each plugin ships the same nine skills (`setup`, `plan-tests`, `generate-tests`,
`run`, `assign`, `report`, `fix-bug`, `triage-bugs`, `bugmojo-conventions`).

## Packages

| Package | Install | What it does |
| ------- | ------- | ------------ |
| [`@bugmojo/widget`](https://www.npmjs.com/package/@bugmojo/widget) | `npm i @bugmojo/widget` | Framework-agnostic on-site feedback + capture widget core (rrweb session replay, console/network capture, PII redaction). [Docs](./packages/widget/README.md) |
| [`@bugmojo/react`](https://www.npmjs.com/package/@bugmojo/react) | `npm i @bugmojo/react` | React / Next.js SDK — drop-in provider, error boundary with component-stack capture, and programmatic reporting. [Docs](./packages/react/README.md) |
| [`@bugmojo/react-native`](https://www.npmjs.com/package/@bugmojo/react-native) | `npx expo install @bugmojo/react-native` | React Native + Expo SDK — shake-to-report, masked screenshot replay, on-device PII redaction. [Docs](./packages/react-native/README.md) |
| [`@bugmojo/mcp-server`](https://www.npmjs.com/package/@bugmojo/mcp-server) | `npx -y @bugmojo/mcp-server` | MCP server (stdio) connecting AI coding agents (Claude Code, Cursor, VS Code) to BugMojo with an API key. [Docs](./packages/mcp-server/README.md) |
| [`@bugmojo/cli`](https://www.npmjs.com/package/@bugmojo/cli) | `npx @bugmojo/cli` | Pull a bug's executable Playwright repro, verify a fix locally or in CI, generate agent-ready fix prompts, and `init` a repo for every agent. [Docs](./packages/cli/README.md) |
| [`@bugmojo/playwright-reporter`](https://www.npmjs.com/package/@bugmojo/playwright-reporter) | `npm i -D @bugmojo/playwright-reporter` | Records every Playwright run in BugMojo with traces, videos and screenshots, mapped to test cases. [Docs](./packages/playwright-reporter/README.md) |
| [`@bugmojo/codemap`](https://www.npmjs.com/package/@bugmojo/codemap) | `npx -y @bugmojo/cli map` | Deterministic, offline codebase mapper — routes, APIs, components and forms into a feature map. [Docs](./packages/codemap/README.md) |

## Quick start

The fastest way to see BugMojo in action:

```bash
# React / Next.js app
npm install @bugmojo/react
```

```tsx
import { BugMojoProvider } from '@bugmojo/react';

<BugMojoProvider projectId="YOUR_PUBLIC_EMBED_TOKEN">
  <App />
</BugMojoProvider>
```

Grab your free embed token at [bugmojo.com](https://www.bugmojo.com) →
Project Settings → Widget.

Prefer no code? Install the [BugMojo Chrome extension](https://chromewebstore.google.com/detail/fichdmopapecnfmbdocpkipdkoibdean)
(it also works in Microsoft Edge).

## Support & issues

- 🐛 **Bugs / feature requests for any SDK or plugin**: [open an issue](https://github.com/viveksinra/bugmojo-sdk/issues)
- 📚 **Product docs & help center**: [bugmojo.com/help](https://www.bugmojo.com/help)
- 🤖 **Machine-readable overview for agents**: [bugmojo.com/llms.txt](https://www.bugmojo.com/llms.txt)
- ✉️ **Direct support**: via the in-app messenger at [bugmojo.com](https://www.bugmojo.com)

## License

All packages and plugins are published under the [MIT License](./LICENSE) © 2026 Softech Infra.
