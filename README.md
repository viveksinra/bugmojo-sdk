# BugMojo SDKs

Official SDKs, CLI, and MCP server for [BugMojo](https://www.bugmojo.com) — the
AI-native bug tracker that captures a full session replay, console + network
logs, and environment context in one click, then hands the bug to your AI
coding agent to fix and **verify**.

This repository hosts the **documentation, changelogs, and public issue
tracker** for the published packages. The packages themselves (including their
source) are distributed via npm.

## Packages

| Package | Install | What it does |
| ------- | ------- | ------------ |
| [`@bugmojo/widget`](https://www.npmjs.com/package/@bugmojo/widget) | `npm i @bugmojo/widget` | Framework-agnostic on-site feedback + capture widget core (rrweb session replay, console/network capture, PII redaction). [Docs](./packages/widget/README.md) |
| [`@bugmojo/react`](https://www.npmjs.com/package/@bugmojo/react) | `npm i @bugmojo/react` | React / Next.js SDK — drop-in provider, error boundary with component-stack capture, and programmatic reporting. [Docs](./packages/react/README.md) |
| [`@bugmojo/react-native`](https://www.npmjs.com/package/@bugmojo/react-native) | `npx expo install @bugmojo/react-native` | React Native + Expo SDK — shake-to-report, masked screenshot replay, on-device PII redaction. [Docs](./packages/react-native/README.md) |
| [`@bugmojo/cli`](https://www.npmjs.com/package/@bugmojo/cli) | `npx @bugmojo/cli` | Pull a bug's executable Playwright repro, verify a fix locally or in CI, generate agent-ready fix prompts. [Docs](./packages/cli/README.md) |
| [`@bugmojo/mcp-server`](https://www.npmjs.com/package/@bugmojo/mcp-server) | `npx -y @bugmojo/mcp-server` | MCP server connecting AI coding agents (Claude Code, Cursor, VS Code) to BugMojo. [Docs](./packages/mcp-server/README.md) |

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

## Support & issues

- 🐛 **Bugs / feature requests for any SDK**: [open an issue](https://github.com/viveksinra/bugmojo-sdk/issues)
- 📚 **Product docs & help center**: [bugmojo.com/help](https://www.bugmojo.com/help)
- ✉️ **Direct support**: via the in-app messenger at [bugmojo.com](https://www.bugmojo.com)

## License

All packages are published under the [MIT License](./LICENSE) © 2026 Softech Infra.
