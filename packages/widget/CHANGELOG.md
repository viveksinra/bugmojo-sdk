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


## [0.2.0] - 2026-10-17

### Added

- `shakeToReport` option on `WidgetSettings` (`boolean | ShakeToReportSettings`, off by
  default): shaking the device starts capture and opens the Bug form. It only acts on the
  mobile layout with the Bug category enabled, and never while the panel is already open.
- `ShakeToReportSettings` type with `enabled`, `threshold` (default 1.8 g), `requiredHits`
  (3), `windowMs` (1000 ms) and `cooldownMs` (2000 ms). Script-tag embeds can set it through
  `window.bugmojoSettings`; a value passed in the settings object wins.
- On iOS 13+ Safari, where motion access needs a tap, the panel shows an "Enable shake to
  report" button. Elsewhere shake turns on at load; devices without motion data skip it.
- Mobile layout for touch devices and viewports 560px wide or less: a full-width bottom
  sheet with larger tap targets, a 60px toggle and a tap-to-close backdrop. It stays above
  the on-screen keyboard, respects safe-area insets and `prefers-reduced-motion`, and uses
  16px inputs so iOS Safari doesn't zoom. It switches live on rotation or resize.
- Reports include device context in `environment`: pointer type, touch support,
  orientation, `orientation_changes`, screen and visual-viewport size, and a `device` block.

### Changed

- On the mobile layout, `right-middle` and `left-middle` place the toggle at the bottom of
  their side, and the toggle hides while the sheet is open.
- On touch devices, session replay samples pointer/touch movement every 20 ms and scroll
  every 100 ms (was 150 ms), so swipes and momentum scrolls replay more accurately.
- The submit button is no longer disabled while sending; it shows a busy state and ignores
  repeat taps.

### Fixed

- Session replay no longer stops recording page activity for the rest of the session after
  a burst of heavy DOM updates: the throttle lifts after one second and a fresh snapshot
  resyncs the replay. While throttled it drops only DOM/style changes, keeping taps, touch
  moves, scrolls, input and viewport resizes.
- Replays no longer clip or overlap after the device rotates (a full snapshot is taken about
  350 ms after each orientation change).
- `environment.os` reports `Android` and `iOS` on phones and tablets instead of `Linux` and
  `macOS`, and `environment.framework` detects Astro sites.

No breaking changes: `types.ts` and `index.ts` only gained additions.
