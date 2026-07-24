# @bugmojo/react

**Turn every bug in your React app into an agent-executable, verified fix.**

[![npm version](https://img.shields.io/npm/v/%40bugmojo%2Freact.svg)](https://www.npmjs.com/package/@bugmojo/react)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/react/LICENSE)
[![types: TypeScript](https://img.shields.io/badge/types-TypeScript-3178c6.svg)](https://www.npmjs.com/package/@bugmojo/react)

The official [BugMojo](https://www.bugmojo.com) SDK for **React** and **Next.js**
(App Router + Pages Router).

## Why

Bug reports usually arrive as "it's broken" with no way to reproduce. BugMojo is an
AI-native bug tracking platform ([bugmojo.com](https://www.bugmojo.com)). This SDK
mounts the BugMojo widget — whose report flow captures a full rrweb session replay,
console/network logs, and environment metadata — and adds what only React can tell
you: the exact **component stack** that broke. Unhandled render errors and
programmatic `report()` calls are filed automatically with environment metadata,
breadcrumbs, and the component trail, so your AI coding agent (or you) knows exactly
where to look.

## Features

- **Zero-config capture** — the widget's report flow records session replay,
  console + network logs, and screenshots.
- **React-native error boundary** — files a bug with the component stack
  automatically (error reports carry metadata + breadcrumbs; replay comes from the
  widget UI flow).
- **Component localization** — reports are enriched with the nearest component name
  **and the full ancestor component path** resolved from the React fiber tree
  (minified-name and `memo`/`forwardRef` aware), plus a sampled trail of which
  components the user clicked/typed into just before the bug — attached as compact
  metadata alongside the capture, never bloating the rrweb recording.
- **SSR / RSC-safe** — no `window` access during render; works in Next.js Server
  Components trees out of the box. rrweb is lazy-loaded in the browser only.
- **Never crashes your app** — every code path degrades to a safe no-op.

## Install

```bash
pnpm add @bugmojo/react
```

```bash
npm install @bugmojo/react
```

```bash
yarn add @bugmojo/react
```

`react` and `react-dom` (>= 18) are peer dependencies.

> **ESM-only.** This package ships native ES modules (no CommonJS build). Next.js,
> Vite, and every modern bundler consume it as-is, and `require()` works on
> Node >= 20.19 / 22.12 (`require(esm)`). If you test with Jest in default
> CJS mode, run Jest in [ESM mode](https://jestjs.io/docs/ecmascript-modules) or map
> the package to a mock — Vitest works out of the box.

## Quick start (Next.js App Router)

Get your `projectId` (the public embed token) from your project's widget settings in
the BugMojo dashboard at [https://www.bugmojo.com](https://www.bugmojo.com).

### 1. Wrap your app in the provider

`app/providers.tsx`:

```tsx
'use client';

import { BugMojoProvider } from '@bugmojo/react';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <BugMojoProvider
      projectId={process.env.NEXT_PUBLIC_BUGMOJO_PROJECT_ID!}
      // Optional: defaults to https://www.bugmojo.com — set for self-hosted installs.
      apiBase={process.env.NEXT_PUBLIC_BUGMOJO_API_BASE}
      env={process.env.NODE_ENV}
      release={process.env.NEXT_PUBLIC_APP_VERSION}
    >
      {children}
    </BugMojoProvider>
  );
}
```

`app/layout.tsx`:

```tsx
import { Providers } from './providers';

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
```

> `projectId` is your **public** BugMojo project identifier (the embed token). It is
> safe to expose to the browser — it is not a secret.

### 2. Catch render errors with the error boundary

```tsx
'use client';

import { BugMojoErrorBoundary } from '@bugmojo/react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <BugMojoErrorBoundary
      name="dashboard"
      fallback={({ reset }) => (
        <div role="alert">
          <p>Something went wrong. We&apos;ve been notified.</p>
          <button onClick={reset}>Try again</button>
        </div>
      )}
    >
      {children}
    </BugMojoErrorBoundary>
  );
}
```

When any child throws during render, BugMojo files a bug carrying the error **and**
the React `componentStack`, then renders your fallback. Your app keeps running.

### 3. Identify users and file bugs programmatically

```tsx
'use client';

import { useBugMojo } from '@bugmojo/react';

export function SupportButton() {
  const { report, identify, track } = useBugMojo();

  // Attach who the user is (also used for cohort-based capture sampling).
  // identify({ id: user.id, email: user.email, name: user.name });

  async function fileBug() {
    track('support_clicked');
    const result = await report({
      title: 'Checkout is stuck on the spinner',
      description: 'Clicked Pay, nothing happened.',
    });
    if (result.ok) {
      // result.number is the created bug number.
    }
  }

  return <button onClick={fileBug}>Report a problem</button>;
}
```

## Next.js Pages Router

Wrap `<Component />` once in `pages/_app.tsx` — no `'use client'` needed (the Pages
Router has no RSC boundary):

```tsx
import type { AppProps } from 'next/app';
import { BugMojoProvider, BugMojoErrorBoundary } from '@bugmojo/react';

export default function App({ Component, pageProps }: AppProps) {
  return (
    <BugMojoProvider projectId={process.env.NEXT_PUBLIC_BUGMOJO_PROJECT_ID!}>
      <BugMojoErrorBoundary fallback={<p>Something went wrong.</p>}>
        <Component {...pageProps} />
      </BugMojoErrorBoundary>
    </BugMojoProvider>
  );
}
```

## Plain React (Vite / CRA)

Wrap your root component in `main.tsx` (or `index.tsx`). The `'use client'`
directives shown above are Next.js App Router markers — they are unnecessary (and
harmless) outside it:

```tsx
import { createRoot } from 'react-dom/client';
import { BugMojoProvider, BugMojoErrorBoundary } from '@bugmojo/react';
import App from './App';

createRoot(document.getElementById('root')!).render(
  <BugMojoProvider projectId={import.meta.env.VITE_BUGMOJO_PROJECT_ID}>
    <BugMojoErrorBoundary fallback={<p>Something went wrong.</p>}>
      <App />
    </BugMojoErrorBoundary>
  </BugMojoProvider>,
);
```

## API

### `<BugMojoProvider>`

| Prop           | Type                              | Description                                                            |
| -------------- | --------------------------------- | ---------------------------------------------------------------------- |
| `projectId`    | `string`                          | Public project id (embed token). Required (or pass `embedToken`).     |
| `embedToken`   | `string`                          | Alias of `projectId`.                                                 |
| `apiBase`      | `string`                          | API origin. Defaults to `https://www.bugmojo.com` (hosted platform).  |
| `env`          | `string`                          | Environment label forwarded to remote config.                         |
| `release`      | `string`                          | Release/version, used for gating and attached to reports.             |
| `nonce`        | `string`                          | CSP nonce for the Shadow-DOM `<style>` injected by the widget.        |
| `position`     | `WidgetPosition`                  | Floating launcher position.                                           |
| `screenshot`   | `ScreenshotMode`                  | `'none'` (rrweb-derived, default), `'html2canvas'`, `'displaymedia'`. |
| `user`         | `WidgetUser`                      | Initial reporter identity.                                            |
| `customData`   | `Record<string, unknown>`         | Metadata attached to every submission.                                |
| `showLauncher` | `boolean`                         | Mount the floating UI. Default `true`. `false` = headless SDK only.   |
| `captureInteractions` | `boolean \| ComponentAnnotatorConfig` | Component-aware interaction annotations. Default `true`. `false` to disable, or an object to tune sampling/caps. |
| `onOpen` / `onClose` / `onSubmit` | callbacks      | Lifecycle hooks.                                                      |

### `useBugMojo()`

Returns `{ ready, report, identify, setUser, setRelease, track, open, close, api }`.
Safe to call **outside** a provider — every method becomes a no-op (`report()`
resolves to `{ ok: false }`), so it never throws.

| Member       | Signature                                                | Description                                               |
| ------------ | -------------------------------------------------------- | --------------------------------------------------------- |
| `ready`      | `boolean`                                                | True once the widget SDK has booted in the browser.       |
| `report`     | `(input: ReportInput) => Promise<ReportResult>`          | File a bug without opening the UI. Always resolves.       |
| `identify`   | `(user: WidgetUser) => void`                             | Merge reporter identity (id/email/name).                  |
| `setUser`    | `(user: WidgetUser) => void`                             | Alias of `identify`.                                      |
| `setRelease` | `(release: string) => void`                              | Update the release string attached to reports.            |
| `track`      | `(name: string, data?: Record<string, unknown>) => void` | Record a breadcrumb event (last 50 ride with reports).    |
| `open`       | `() => void`                                             | Open the floating widget panel.                           |
| `close`      | `() => void`                                             | Close the floating widget panel.                          |
| `api`        | `BugMojoApi \| null`                                     | Raw widget API escape hatch. `null` on the server.        |

### `<BugMojoErrorBoundary>`

| Prop               | Type                                                        | Description                                                       |
| ------------------ | ----------------------------------------------------------- | ----------------------------------------------------------------- |
| `children`         | `ReactNode`                                                 | Subtree to protect.                                               |
| `fallback`         | `ReactNode \| (({ error, reset }) => ReactNode)`            | Static node or render function; `reset()` re-renders children.    |
| `name`             | `string`                                                    | Label folded into the report title/metadata (e.g. a route name).  |
| `onError`          | `(error, info, result) => void`                             | Called after the report is filed (best-effort).                   |
| `disableReporting` | `boolean`                                                   | When `true`, no auto-report — handle it yourself via `onError`.   |

### `componentNameFromNode(node)`

Best-effort resolution of the nearest React component display name from a DOM node
(via the React Fiber). Returns `null` on failure. Used internally to enrich reports.

### `componentPathFromNode(node)`

Best-effort **component localization**: resolves the nearest component name **and the
ordered ancestor component path** (nearest first) from the fiber tree, unwrapping
`memo`/`forwardRef` and skipping minified/wrapper names. Returns
`{ name, path, entries }` (empty off-React). This feeds the future repro pack +
`summarize_replay` so a bug can be localized to a specific component subtree.

### `installComponentAnnotator(options?)`

Installs passive click/input listeners that map each interaction back to the nearest
React component and buffer a small, **sampled + length-capped** ring of annotations.
`<BugMojoProvider>` installs this automatically (see `captureInteractions`) and rides
the ring alongside every report as `component_annotations` — it is **never** injected
into the rrweb stream. Off-React / on the server it is a silent no-op. Returns
`{ getAnnotations, clear, dispose }`.

## SSR / RSC notes

- `<BugMojoProvider>`, `<BugMojoErrorBoundary>`, and the hook are **Client
  Components** (`'use client'`). Import them from client components or client
  boundaries.
- No browser globals are touched during render or module load. The widget bundle
  (including rrweb) is dynamically imported inside a `useEffect`, so it never runs on
  the server and stays out of your server bundle.
- Before hydration, `useBugMojo()` returns the no-op context — calls are safe.

## Troubleshooting / FAQ

**The launcher doesn't appear and nothing is reported.**
The most common cause is a missing `projectId`/`embedToken` — the SDK deliberately
no-ops instead of crashing. In development, check the console for
`[BugMojo] Missing projectId/embedToken — SDK will no-op.` Also verify the env var
is exposed to the browser (`NEXT_PUBLIC_…` in Next.js, `VITE_…` in Vite).

**`report()` resolves to `{ ok: false }`.**
Either no `projectId` was configured, or the hook is being used outside a
`<BugMojoProvider>` (where every method is a safe no-op by design). The `error`
field on the result says which.

**Jest fails with `SyntaxError: Cannot use import statement outside a module`.**
The package is ESM-only. Run Jest in
[ESM mode](https://jestjs.io/docs/ecmascript-modules), or map `@bugmojo/react` to a
mock in unit tests. Vitest consumes it without configuration.

**Is `projectId` a secret?**
No. It is the public embed token (the same value the script-tag widget uses in
`data-project`) and is safe to ship to the browser.

**Will this slow down or break my app?**
The widget core (including rrweb) is lazy-loaded via dynamic `import()` after mount,
so it stays out of your initial bundle and server bundle. If the bundle fails to load
(CSP, offline, ad-blocker), the SDK stays in a headless no-op state — your app is
never broken by BugMojo.

## Related packages

| Package | Use it for |
| ------- | ---------- |
| [`@bugmojo/widget`](https://www.npmjs.com/package/@bugmojo/widget) | Framework-agnostic on-site feedback + capture widget core |
| [`@bugmojo/react-native`](https://www.npmjs.com/package/@bugmojo/react-native) | React Native + Expo SDK — shake-to-report |
| [`@bugmojo/cli`](https://www.npmjs.com/package/@bugmojo/cli) | Pull a bug's Playwright repro pack, verify fixes locally |
| [`@bugmojo/mcp-server`](https://www.npmjs.com/package/@bugmojo/mcp-server) | Connect AI coding agents (Claude Code, Cursor) to BugMojo |

## Links

- Website: [https://www.bugmojo.com](https://www.bugmojo.com)
- Help center / docs: [https://www.bugmojo.com/help](https://www.bugmojo.com/help)
- Docs & issues (GitHub): [https://github.com/viveksinra/bugmojo-sdk](https://github.com/viveksinra/bugmojo-sdk)
- Changelog: [https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/react/CHANGELOG.md](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/react/CHANGELOG.md)

## License

[MIT](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/react/LICENSE) © Softech Infra
