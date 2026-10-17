# Changelog

All notable changes to `@bugmojo/react-native` are documented here.

## [0.3.0] - 2026-09-18

### Added

- **Test Mode (T3.3) — shake to run an assigned test case, not just to file a bug.**
  In a build that opts in (`testMode={{ enabled: true, testerToken, projectKey }}`), the
  shake gesture opens a test-run sheet instead of the report modal: the tester picks one
  of the cases assigned to them, walks a step checklist marking PASS / FAIL / BLOCKED /
  SKIP, and submits a real `TestResult` with `runner: 'MOBILE'`. The evidence is the same
  shape CI produces — a masked screenshot per ruled step, the masked filmstrip for the
  session, and the redacted console and network logs — posted through the existing
  `/api/v1/runs/results` + `/api/v1/runs/evidence` endpoints, so a phone-run manual case
  is indistinguishable in the record from an automated one.
  - **HYBRID cases resume.** When the server hands down a handoff
    (`resume_step_index` + `automated_context`), the sheet greys out the steps CI already
    ran, shows what it left behind (commit, deploy URL, app state, evidence), and opens
    the checklist at the exact step the human owns.
  - **Consent is a hard gate (Apple guideline 2.5.14).** Picking a case does NOT start
    recording; an explicit consent screen does, and closing the sheet stops it and drops
    the buffers. Test Mode is tester-context only — it requires a credential a shipping
    build never carries — and is never always-on.
  - **No privacy control is relaxed.** The filmstrip still requires
    `acknowledgeScreenshotRisk`, frames are still skipped when masks cannot be confirmed
    committed, and console/network are still redacted on-device before upload.
  - New exports: `TestModeController`, `TestRunSheet`, `createHttpTestModeTransport`,
    `buildTestResultPayload`, `buildEvidenceArtifacts`, and the `testMode` /
    `openTestRun()` / `closeTestRun()` members of `useBugMojo()`. Hosts running their own
    tester UI can pass `renderTestRunSheet={false}` and drive the controller directly, or
    supply a custom `transport` that proxies through their own backend (recommended for
    anything wider than a tester build).

## [0.2.0] - 2026-08-20

### Added

- **Touch trail.** Taps and swipes are now sampled and shipped on the replay as
  `touches`, so the dashboard filmstrip shows what the user *did* between frames, not
  just what the screen looked like. Capture is purely observational — the SDK attaches
  React Native's bubble-phase `onTouch*` notifications to one wrapper View and never
  enters responder negotiation, so it cannot take a scroll, tap or swipe from the host
  app. Configurable via `captureTouches` (default on), `touchBufferSize`,
  `touchMoveThrottleMs`, `touchMoveMinDistancePx`, and `touchCaptureStyle` on the
  provider.
- **Crash-linked capture for non-React crashes.** The client now chains React Native's
  `ErrorUtils` global handler, so an uncaught JS error anywhere — async callbacks,
  native module handlers, fatals — auto-files a report carrying the console, network and
  masked frames captured *before* the crash. Previously only errors caught by
  `<BugMojoErrorBoundary>` produced a report. Deduped by signature and capped by
  `maxCrashReports` (default 3) per session; disable with `captureCrashes={false}`.
- **Navigation breadcrumbs.** Optional automatic screen-transition trail from React
  Navigation or Expo Router, folded into the existing breadcrumb stream. Pass
  `navigationRef` (from either router's `useNavigationContainerRef()`), or spread
  `createNavigationStateHandlers(track)` onto `<NavigationContainer>`. The integration
  is duck-typed on the container ref and imports neither router, so an app without one
  is silently unaffected.
- **Screenshot annotation + redaction editor.** The built-in report sheet now previews
  the screen as it looked when the reporter opened it (shake or `open()`), and lets them
  draw on it: pen, arrow, rectangle and a **Hide** tool that burns an opaque fill over
  the selected area. "Hide" is a real redaction — the pixels are removed from the
  exported image, not covered by a translucent overlay — and the annotated image
  **replaces** the buffered filmstrip at submit time, so the original unredacted frames
  are never uploaded alongside it. Exported as `AnnotationCanvas` for hosts running
  their own UI with `renderModal={false}`.
- Frame-capture tuning: `screenshotFormat`, `screenshotQuality`, `consoleBufferSize`,
  and `networkBufferSize`. All tuning values are clamped to safe ranges rather than
  honoured verbatim (see `resolveCaptureTuning`).
- `OVERHEAD.md` gains a **Capture-window envelope** section modelling replay memory,
  upload size and tick rate as a function of the cadence/buffer settings.

### Changed

- **Replay defaults.** `screenshotIntervalMs` 2000 → **1000** and `screenshotBufferSize`
  10 → **20** (same 20-second window at twice the temporal resolution), with frames now
  encoded as **JPEG at quality 0.5** instead of PNG — which more than pays for the extra
  frames in bytes.
- Crash reports no longer capture a *fresh* screenshot. By the time a crash handler runs
  the UI has already swapped to a fallback, so the last pre-crash frame in the rolling
  buffer is used instead of rasterizing the error screen.
- Auto-filed crash reports carry `bugmojo_crash: true` metadata so triage can tell them
  apart from user-written reports.

### Fixed

- `screenshotBufferSize` was documented but never applied — the screenshot ring buffer
  always used its built-in default. It is now wired through, along with the new
  console/network/touch buffer sizes.
- Teardown now unwinds capture hooks LIFO. Previously `destroy()` could leave a
  destroyed client's error handler installed in `ErrorUtils`, because the console patch
  restored the handler it had chained *after* that handler was already removed.
- The periodic screenshot loop is now restarted when the app returns to the foreground.
  It was stopped on background but never resumed, so after a single app-switch the
  filmstrip stayed empty for the rest of the session.

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

