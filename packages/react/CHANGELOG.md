# Changelog

All notable changes to `@bugmojo/react` are documented here.

## 0.1.0

Initial public release.

- `<BugMojoProvider>` — boots the BugMojo widget SDK in the browser only (SSR/RSC-safe), with `projectId`/`embedToken`, `apiBase`, `env`, `release`, launcher position, screenshot mode, user identity, custom data, and lifecycle callbacks.
- `<BugMojoErrorBoundary>` — catches render errors, files a bug carrying the React `componentStack` (plus nearest component name and ancestor component path), then renders your fallback.
- `useBugMojo()` — `{ ready, report, identify, setUser, setRelease, track, open, close, api }`; every method is a safe no-op outside a provider.
- Component localization — `componentNameFromNode()` and `componentPathFromNode()` resolve the nearest React component name and ordered ancestor path from the fiber tree (`memo`/`forwardRef` aware).
- `installComponentAnnotator()` — sampled, length-capped interaction→component annotation ring attached to reports as `component_annotations` (installed automatically by the provider; tune or disable via `captureInteractions`).
- ESM-only build with a top-level `'use client'` directive so the package works as a Client Component boundary in Next.js App Router.

## [0.1.1] - 2026-07-24

### Changed

- Repository, issues, license, and documentation links now point to the public
  SDK docs repo (https://github.com/viveksinra/bugmojo-sdk). No code changes.

