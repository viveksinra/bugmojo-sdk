# @bugmojo/widget

**The framework-agnostic core of the [BugMojo](https://www.bugmojo.com) on-site feedback + bug capture widget — session replay, console/network logs, and PII-safe reporting from a single embed.**

[![npm version](https://img.shields.io/npm/v/%40bugmojo%2Fwidget.svg)](https://www.npmjs.com/package/@bugmojo/widget)
[![license: MIT](https://img.shields.io/npm/l/%40bugmojo%2Fwidget.svg)](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/widget/LICENSE)

## Why

Bug reports without context are guesswork. This widget attaches an rrweb session
replay, console logs, and network activity to every report — redacted client-side
before anything leaves the browser — and files it straight into the
[BugMojo](https://www.bugmojo.com) platform, where your team (and your AI coding
agents, via MCP) can act on it. It targets a single page world only: **zero**
browser-extension (`chrome`/`wxt`) references.

## Two delivery modes

1. **Hosted loader (recommended)** — a lightweight `/widget.js` IIFE served by
   BugMojo. It boots the widget and lazy-loads a separate `widget-capture.js` chunk
   containing the rrweb recording engine, so rrweb never bloats the initial script.
   You do not need this npm package for the hosted mode:

   ```html
   <!-- Place early in <head> so capture installs before your app emits events -->
   <script
     src="https://www.bugmojo.com/widget.js"
     data-project="YOUR_PUBLIC_EMBED_TOKEN"
     data-position="bottom-right"
     data-env="production"
     async
   ></script>
   ```

   The loader also reads `data-release` (release gating) and `data-nonce` (CSP
   nonce), or an optional `window.bugmojoSettings` object for programmatic
   configuration. Once booted it exposes `window.BugMojo` and dispatches a
   `bugmojo:ready` event.

2. **Same-origin npm fallback (this package)** — for sites whose
   Content-Security-Policy blocks the hosted script. Import `initWidgetBundled`,
   serve the widget from your own origin under a strict `script-src 'self'` policy,
   and everything (rrweb included) ships in your own bundle.

## Features

- **Session replay** — rrweb DOM recording with a rolling buffer (no video).
- **Console + network capture** — patched in the page's main world, PII-redacted
  client-side before anything leaves the browser.
- **Deterministic sticky sampling** — a given tab session is consistently in or out
  of the capture sample without a server round-trip.
- **Fail-closed config cache** — serves the last-good ruleset through short outages
  but disables capture after a 24h hard cap.
- **Shadow-DOM UI** — style-isolated launcher + form; CSP-nonce aware.
- **Clean teardown** — `destroy()` restores native `console`/`fetch`/XHR and
  removes the UI (safe for SPA route changes).

## Install

```bash
pnpm add @bugmojo/widget
# or
npm install @bugmojo/widget
# or
yarn add @bugmojo/widget
```

`rrweb` is a runtime dependency (used by the capture engine). It is kept external
in the published bundle so your bundler can dedupe / code-split it.

## Quickstart (same-origin / bundled)

```ts
import { initWidgetBundled } from '@bugmojo/widget';

const api = await initWidgetBundled({
  embedToken: 'YOUR_PUBLIC_EMBED_TOKEN', // the data-project identifier (not a secret)
  apiBase: 'https://www.bugmojo.com',
  position: 'bottom-right',
});

// Imperative API (the hosted loader exposes the same object as window.BugMojo):
api.setUser({ id: 'u_123', email: 'jane@example.com' });
api.open();
api.destroy(); // clean teardown on SPA route change
```

Grab your embed token from **Project Settings → Widget** in the
[BugMojo dashboard](https://www.bugmojo.com).

For the split loader/capture setup use the lower-level
`initWidget(settings, { loadCapture })`, exported alongside
`createCaptureController`.

## Using React?

Use [`@bugmojo/react`](https://www.npmjs.com/package/@bugmojo/react) instead — the
official React SDK wraps this core with a provider component, an error boundary,
and hooks for React and Next.js apps.

## Configuration (`WidgetSettings`)

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `embedToken` | `string` | **required** | Public embed token (the `data-project` value). An identifier, not a secret. |
| `apiBase` | `string` | loader script origin | API origin. For npm usage, set it explicitly (e.g. `https://www.bugmojo.com`). |
| `position` | `'bottom-right' \| 'bottom-left' \| 'right-middle' \| 'left-middle'` | from server config | Launcher position override. |
| `env` | `string` | — | Environment label forwarded to `GET /config?env=` so the server resolves the right capture ruleset. Not access control. |
| `release` | `string` | — | Release/version string forwarded to `GET /config?release=` for min/max release gating. |
| `nonce` | `string` | — | CSP nonce applied to the Shadow-DOM `<style>`. |
| `screenshot` | `'none' \| 'html2canvas' \| 'displaymedia'` | `'none'` | Screenshot strategy. `none` derives the visual from the rrweb snapshot (masking already applied). `html2canvas` is best-effort (only used when the host page provides `window.html2canvas`). `displaymedia` shows a browser permission prompt. |
| `user` | `WidgetUser` | — | Initial reporter identity: `{ id?, email?, name?, cohort? }`. `cohort` is matched client-side against the ruleset's allowed cohorts to gate capture. |
| `customData` | `Record<string, unknown>` | — | Arbitrary metadata attached to every submission. |
| `onOpen` / `onClose` | `() => void` | — | Lifecycle callbacks (also available via `api.on(...)`). |
| `onSubmit` | `(detail: SubmitDetail) => void` | — | Called after a submission with `{ category, number?, pendingModeration? }`. |

## Imperative API (`BugMojoApi`)

Returned by `initWidgetBundled` / `initWidget`; the hosted loader exposes the same
object as `window.BugMojo`.

| Method | Description |
| ------ | ----------- |
| `open()` | Open the feedback panel. |
| `close()` | Close the panel. |
| `show()` | Show the launcher button. |
| `hide()` | Hide the launcher (the JS API keeps working). |
| `capture()` | Start recording (if the capture gate allows it) and open the panel directly on the Bug category. |
| `setUser(user)` | Merge the reporter identity (`{ id?, email?, name?, cohort? }`) into the current one. |
| `setReporter(user)` | Alias of `setUser`. |
| `setCustomData(data)` | Merge custom metadata into what is attached to submissions. |
| `on(event, cb)` | Subscribe to `'open'`, `'close'`, or `'submit'`. Returns an unsubscribe function. |
| `off(event, cb)` | Remove a listener. |
| `destroy()` | Full teardown: stops rrweb, uninstalls the console/network patches (restoring native `console`/`fetch`/XHR), and removes the Shadow-DOM UI. Idempotent. |

## What's exported

| Export | Purpose |
| ------ | ------- |
| `initWidgetBundled(settings)` | All-in-one initializer with rrweb statically bundled. |
| `initWidget(settings, deps)` | Loader-driven init; `deps.loadCapture` supplies the rrweb chunk. |
| `createCaptureController(opts)` | The rrweb-bearing capture controller factory. |
| `WidgetSettings`, `BugMojoApi`, … | Public TypeScript types. |

> **Note:** the `./src/*` subpath exports raw TypeScript source for BugMojo's own
> monorepo build. It is not a supported public entry point — use the package root
> import.

## Bundler required (no bare Node / SSR import)

This package is **ESM-only and browser-targeted** — it must be processed by a
bundler (Vite, webpack, Next.js, etc. all work). It cannot be imported in a bare
Node runtime: `rrweb@2.0.0-alpha.4` is not Node-ESM resolvable, so a plain
`node`/vitest-node import fails with
`The requested module 'rrweb' does not provide an export named 'record'`.

For SSR frameworks, import it only on the client — e.g. behind a browser guard:

```ts
if (typeof window !== 'undefined') {
  const { initWidgetBundled } = await import('@bugmojo/widget');
  await initWidgetBundled({ embedToken: '…', apiBase: 'https://www.bugmojo.com' });
}
```

## Troubleshooting / FAQ

**The widget doesn't appear.**
Check the browser console. `[BugMojo] missing embed token` means no
`data-project` / `embedToken` was provided; `[BugMojo] widget failed to
initialize` means the config fetch failed — verify `apiBase` and that the embed
token matches your project's Widget Settings. On total config failure the JS API
still exists but the UI is a no-op by design (the widget never crashes the host
page).

**Reports arrive without replay / console / network data.**
Capture is gated by the server ruleset: it can be disabled for your environment,
sampled out (`sample_rate`), cohort-restricted (set `user.cohort`), or blocked by
`require_login` when no reporter identity (`id`/`email`) is set. The widget also
skips instrumentation if another BugMojo capture (e.g. the browser extension) is
already patching the page. Config changes propagate within the cache TTL
(60 seconds by default).

**`The requested module 'rrweb' does not provide an export named 'record'`.**
You imported the package in a bare Node runtime (plain script, vitest node
environment, or SSR with externalized deps). Use a bundler, or a client-only
dynamic import — see "Bundler required" above.

**My CSP blocks the hosted `widget.js`.**
That is exactly what this package is for: bundle `initWidgetBundled` into your own
app and serve it from your origin under `script-src 'self'`. Pass a `nonce` if
your policy requires one for the Shadow-DOM style tag.

**How do I remove the widget on SPA route change?**
Call `api.destroy()`. It is idempotent and fully restores the native
`console`/`fetch`/XHR before removing the UI, so you can safely re-init later.

## Related packages

| Package | Use it for |
| ------- | ---------- |
| [`@bugmojo/react`](https://www.npmjs.com/package/@bugmojo/react) | React / Next.js SDK — provider, error boundary, hooks |
| [`@bugmojo/react-native`](https://www.npmjs.com/package/@bugmojo/react-native) | React Native + Expo SDK — shake-to-report |
| [`@bugmojo/cli`](https://www.npmjs.com/package/@bugmojo/cli) | Pull a bug's Playwright repro pack, verify fixes locally |
| [`@bugmojo/mcp-server`](https://www.npmjs.com/package/@bugmojo/mcp-server) | Connect AI coding agents (Claude Code, Cursor) to BugMojo |

## Links

- Website: [https://www.bugmojo.com](https://www.bugmojo.com)
- Dashboard: [https://www.bugmojo.com](https://www.bugmojo.com)
- Docs & issues (GitHub): [https://github.com/viveksinra/bugmojo-sdk](https://github.com/viveksinra/bugmojo-sdk)
- React SDK: [https://www.npmjs.com/package/@bugmojo/react](https://www.npmjs.com/package/@bugmojo/react)

## License

MIT © Softech Infra — see [LICENSE](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/widget/LICENSE).
