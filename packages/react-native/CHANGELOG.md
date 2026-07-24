# Changelog

All notable changes to `@bugmojo/react-native` are documented here.

## 0.1.0

Initial release.

- `<BugMojoProvider>` — boots the SDK, renders the built-in report modal, wires shake-to-report.
- `<BugMojoErrorBoundary>` — auto-files a bug (with the React component stack) when a subtree crashes.
- `<BugMojoMask>` / `<BugMojoInput>` — mask sensitive views/inputs in the screenshot replay; honors the server-side `mask_all_inputs` / `mask_selector` / `block_selector` policy.
- `useBugMojo()` — `{ ready, capturing, report, identify, setUser, setRelease, track, open, close }`.
- `createBugMojoClient()` — headless (no-React) client for bootstrap/background code.
- Shake-to-report via an accelerometer state machine (`expo-sensors`, optional).
- Masked screenshot "replay": a rolling buffer of periodic screenshots via `react-native-view-shot` (optional), unsafe-by-default — requires both `enableScreenshotReplay` and `acknowledgeScreenshotRisk`, and fails closed when mask commits can't be confirmed before rasterizing.
- Automatic `console.*` and `fetch`/XHR capture with on-device PII + provider-secret redaction (shared engine with the BugMojo web SDK, bundled into `dist`).
- Fail-closed remote-config gating: capture runs only when the project's `CaptureRuleset` allows it (enabled + deterministic sticky sampling + cohort match), with a last-good config cache.
- Explicit native-module injection (`nativeModules` option / `registerNativeModules()`): pass your statically-imported `expo-sensors`, `expo-device`, `expo-constants`, `react-native-view-shot`, and `react-native` modules so they resolve reliably in Metro/Hermes release builds.
- Expo config plugin (`app.plugin.js`): sets `NSMotionUsageDescription`, merges the SDK's Apple Privacy Manifest entries into `ios.privacyManifests`, and adds the Android `HIGH_SAMPLING_RATE_SENSORS` permission.
- Crash-isolation guard around every capture hook with a circuit breaker (a faulting hook self-disables instead of crashing the host app).

## [0.1.1] - 2026-07-24

### Changed

- Repository, issues, license, and documentation links now point to the public
  SDK docs repo (https://github.com/viveksinra/bugmojo-sdk). No code changes.

