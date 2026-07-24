# Changelog

All notable changes to `@bugmojo/widget` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0

Initial release.

### Added

- Framework-agnostic widget core shared by the hosted `/widget.js` loader and the
  npm package.
- `initWidgetBundled(settings)` — all-in-one same-origin initializer with the rrweb
  capture engine statically bundled, for sites whose Content-Security-Policy blocks
  the hosted script (`script-src 'self'`).
- `initWidget(settings, deps)` — lower-level loader-driven initializer where
  `deps.loadCapture` supplies the rrweb capture chunk.
- `createCaptureController(opts)` — rrweb-bearing capture controller factory with a
  60-second rolling event buffer.
- Session replay via rrweb DOM recording (no video).
- Console + network capture patched in the page's main world, with client-side PII
  redaction before anything leaves the browser.
- Deterministic sticky sampling — a given tab session is consistently in or out of
  the capture sample without a server round-trip.
- Fail-closed config cache — serves the last-good ruleset through short outages but
  disables capture after a 24h hard cap.
- Imperative `BugMojoApi` (`open`, `close`, `show`, `hide`, `capture`, `setUser`,
  `setReporter`, `setCustomData`, `on`, `off`, `destroy`) with idempotent teardown
  that restores native `console`/`fetch`/XHR.

## [0.1.1] - 2026-07-24

### Changed

- Repository, issues, license, and documentation links now point to the public
  SDK docs repo (https://github.com/viveksinra/bugmojo-sdk). No code changes.

