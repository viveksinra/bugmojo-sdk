# @bugmojo/react-native

Official **React Native + Expo** SDK for [BugMojo](https://www.bugmojo.com) — shake-to-report, masked screenshot "replay", automatic console + network capture, on-device PII & secret redaction, and remote-config-gated bug capture. Expo-first, mostly JavaScript, zero required native code.

[![npm version](https://img.shields.io/npm/v/%40bugmojo%2Freact-native.svg)](https://www.npmjs.com/package/@bugmojo/react-native)
[![license: MIT](https://img.shields.io/npm/l/%40bugmojo%2Freact-native.svg)](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/react-native/LICENSE)

Docs & dashboard: [https://www.bugmojo.com](https://www.bugmojo.com)

## Why

Mobile bug reports usually arrive as "it broke" with no logs, no device info, and no picture. This SDK captures the console, network activity, device metadata, and (opt-in) masked screenshots at the moment a user shakes their phone — redacts PII and provider secrets **on the device**, then files everything into your [BugMojo](https://www.bugmojo.com) inbox. It reuses the exact redaction engine and ingest endpoint (`POST /api/widget/v1/captures`) as the BugMojo web widget, so mobile bugs land next to your web bugs — already redacted, already sampled, already gated by the same remote-config kill switch.

## Requirements

- Expo SDK 50+ (`expo >= 50`) — or bare React Native 0.73+
- React 18+
- Node 18+ (for `expo prebuild` running the config plugin)

`expo-device`, `expo-constants`, `expo-sensors`, and `react-native-view-shot` are **optional** peer dependencies — each missing module just disables its feature (no `expo-sensors` → no shake gesture).

## Install

```sh
# Expo (recommended — installs compatible versions)
npx expo install @bugmojo/react-native expo-device expo-constants expo-sensors react-native-view-shot
```

```sh
# or plain package managers
pnpm add @bugmojo/react-native
npm install @bugmojo/react-native
yarn add @bugmojo/react-native
```

### Expo config plugin (zero native code)

Add the plugin to your `app.json` / `app.config.js` so the iOS motion permission, the Apple Privacy Manifest entries, and the Android sensor permission are wired for you:

```json
{
  "expo": {
    "plugins": [
      ["@bugmojo/react-native", { "motionUsageDescription": "Shake to report a bug." }]
    ]
  }
}
```

Then run `npx expo prebuild` (or build with EAS). The plugin:

- sets `NSMotionUsageDescription` (iOS accelerometer permission copy for shake-to-report);
- merges the SDK's privacy-manifest entries (required-reason APIs + collected data types) into `expo.ios.privacyManifests`, which prebuild aggregates into your app's generated `PrivacyInfo.xcprivacy`;
- adds the Android `HIGH_SAMPLING_RATE_SENSORS` permission (normal, non-dangerous — Android 12+).

Bare React Native apps (no prebuild): copy the entries from [`ios/PrivacyInfo.xcprivacy`](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/react-native/ios/PrivacyInfo.xcprivacy) (shipped in this package) into your own privacy manifest and set `NSMotionUsageDescription` in `Info.plist` yourself.

## Quickstart

```tsx
import { BugMojoProvider, useBugMojo } from '@bugmojo/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ReactNative from 'react-native';
import * as Sensors from 'expo-sensors';
import * as Device from 'expo-device';
import Constants from 'expo-constants';

export default function App() {
  return (
    <BugMojoProvider
      projectId="YOUR_EMBED_TOKEN"            // PUBLIC data-project token (not a secret)
      apiBase="https://www.bugmojo.com"        // where BugMojo is served
      env="production"
      release="1.4.2"
      store={AsyncStorage}                     // persists the last-good config cache
      // Inject the optional modules you installed — Metro/Hermes release builds cannot
      // resolve modules by name at runtime, so this is the reliable path (see below).
      nativeModules={{
        sensors: Sensors,
        device: Device,
        constants: Constants,
        reactNative: ReactNative,
      }}
    >
      <RootNavigator />
    </BugMojoProvider>
  );
}
```

Shake the device to open the report modal, or file a report programmatically:

```tsx
function PayButton() {
  const { report, identify, track } = useBugMojo();
  identify({ id: user.id, email: user.email });
  track('checkout_started', { cartId });
  // ...
  await report({ title: 'Payment button unresponsive' });
}
```

## Features

- **Shake-to-report** — accelerometer state machine (threshold/window/cooldown) opens the built-in report modal; fully configurable or replaceable with your own UI.
- **Masked screenshot "replay"** — opt-in rolling buffer of periodic screenshots (rrweb DOM recording doesn't exist on native); fails closed if masking can't be confirmed before rasterizing.
- **Touch trail** — taps and swipes are sampled and overlaid on the replay filmstrip, so you can see *what the user did* between frames. Purely observational: it never claims the touch responder, so your gestures are unaffected.
- **Crash-linked capture** — an uncaught JS error (anywhere, not just inside a React subtree) auto-files a report carrying the console, network and frames from **before** the crash.
- **Navigation breadcrumbs** — optional automatic screen-transition trail from React Navigation or Expo Router.
- **Console + network capture** — patches `console.*` and `fetch`/XHR into ring buffers; attached to every report.
- **On-device PII + secret redaction** — emails, cards (Luhn-gated), SSNs, phones, auth headers, JWTs, and provider secrets (AWS/Stripe/GitHub/Slack/Google/PEM) are scrubbed **before** anything leaves the device, using the same engine as the BugMojo web SDK (bundled into `dist` — no extra dependency).
- **Remote-config gating** — capture runs only when your project's `CaptureRuleset` says `enabled`, the session passes deterministic sticky sampling, and the user's cohort matches. Fail-closed with a last-good cache.
- **Error boundary** — `<BugMojoErrorBoundary>` auto-files a bug with the React component stack.
- **Crash-isolated** — every capture hook runs behind a guard with a circuit breaker; a faulting hook self-disables instead of crashing your app.
- **Test Mode (tester builds)** — shake to run an *assigned test case*: step checklist, per-step masked screenshot, and a real `TestResult` with `runner: 'MOBILE'`. Opt-in, consented per session, never in a shipping build. [Details below](#test-mode-run-assigned-test-cases-from-a-phone).
- **Expo config plugin** — permissions + privacy manifest handled at prebuild, no native edits.

## Native module injection (read this for production builds)

Metro only bundles modules it can see in a **static** `import`/`require`, and Hermes/JSC release bundles don't expose a runtime string-resolving `require`. The SDK therefore cannot reliably "discover" your optional peers on its own in a production build — you import them and hand them over:

```tsx
import * as Sensors from 'expo-sensors';
import * as ViewShot from 'react-native-view-shot';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as ReactNative from 'react-native';

// Either as a provider/client option:
<BugMojoProvider nativeModules={{ sensors: Sensors, viewShot: ViewShot, device: Device, constants: Constants, reactNative: ReactNative }} ... />

// ...or standalone (e.g. at app bootstrap, before createBugMojoClient):
import { registerNativeModules } from '@bugmojo/react-native';
registerNativeModules({ sensors: Sensors, viewShot: ViewShot });
```

Every entry is optional — omit what you didn't install and that feature quietly turns off. A lazy `require` fallback exists for dev/test runtimes, but **do not rely on it in release builds**.

## Masking sensitive views

A screenshot is an opaque image the server can **never** redact after upload, so masking is entirely the client's responsibility.

> **Unsafe-by-default.** Screenshot replay only runs when you set **both** `enableScreenshotReplay` **and** `acknowledgeScreenshotRisk`. This is a deliberate interlock: any sensitive view you forget to wrap would leak its raw pixels. Enable it only after auditing your screens.

Wrap secret UI so it never appears in a frame:

```tsx
import { BugMojoMask } from '@bugmojo/react-native';

<BugMojoMask label="Card number">
  <Text>{card.number}</Text>
</BugMojoMask>
```

For text fields, use `BugMojoInput` (a drop-in `TextInput` replacement). It honors your company's server-side `mask_all_inputs` policy — when that policy is on, every `BugMojoInput` is masked during a capture without per-field wrapping, and fields matching `mask_selector` / `block_selector` (by `testID` / `accessibilityLabel`) are masked too:

```tsx
import { BugMojoInput } from '@bugmojo/react-native';

<BugMojoInput testID="card-number" value={card.number} onChangeText={setCard} />
```

The SDK **cannot** auto-mask arbitrary host `<TextInput>`s it never sees — those must be wrapped in `<BugMojoMask>` or swapped for `BugMojoInput`.

**How masking is proven safe:** during each screenshot the SDK turns masking on, waits for a real paint (chained animation frames) **and** for every mounted mask/input to acknowledge it committed its opaque overlay, then rasterizes. If that commit can't be confirmed in time, the frame is **skipped** (fail-closed) rather than shipped possibly-unmasked. Between captures everything renders normally.

## Screenshot replay

Give the SDK a view to rasterize (typically your root view) plus the `react-native-view-shot` module, and switch on both halves of the interlock:

```tsx
import { useRef } from 'react';
import { View } from 'react-native';
import * as ViewShot from 'react-native-view-shot';
import { BugMojoProvider } from '@bugmojo/react-native';

export default function App() {
  // Pass the RefObject itself — react-native-view-shot unwraps `.current` at capture time.
  const rootRef = useRef<View>(null);

  return (
    <View ref={rootRef} collapsable={false} style={{ flex: 1 }}>
      <BugMojoProvider
        projectId="YOUR_EMBED_TOKEN"
        apiBase="https://www.bugmojo.com"
        nativeModules={{ viewShot: ViewShot }}
        screenshotRef={rootRef}          // what gets rasterized
        enableScreenshotReplay           // opt in to the masked screenshot loop
        acknowledgeScreenshotRisk        // REQUIRED: you accept the pixel-leak risk
      >
        <RootNavigator />
      </BugMojoProvider>
    </View>
  );
}
```

Headless equivalent: `client.setScreenshotRef(rootRef)`.

### Frame cadence, quality and window

The filmstrip defaults to **1 frame/second, 20 frames kept (a 20-second window), JPEG at quality 0.5**. Tune it:

```tsx
<BugMojoProvider
  screenshotIntervalMs={1000}   // 250–60000, default 1000
  screenshotBufferSize={20}     // 1–120 frames, default 20
  screenshotFormat="jpg"        // 'jpg' (default) | 'png'
  screenshotQuality={0.5}       // 0.1–1, default 0.5 (JPEG only)
  ...
/>
```

Values outside those ranges are clamped rather than honoured — `screenshotIntervalMs: 16` would turn the loop into a 60 Hz rasterize-the-whole-tree job. The window in seconds is `screenshotIntervalMs × screenshotBufferSize ÷ 1000`; see [OVERHEAD.md](./OVERHEAD.md) for the memory and upload envelope each setting implies.

## Touch trail

Frames tell you what the screen looked like; the touch trail tells you what the user **did** between them — the tap that hit the wrong row, the swipe that scrolled past the bug, the three impatient taps on a dead button. Touch points are sampled onto the same clock as the frames and drawn as a fading trail over the filmstrip in the dashboard.

It is **on by default** and costs one wrapper `View`:

```tsx
<BugMojoProvider captureTouches touchMoveThrottleMs={60} ...>
```

> **It cannot break your gestures.** The SDK attaches React Native's raw `onTouchStart`/`onTouchMove`/`onTouchEnd`/`onTouchCancel` props, which are bubble-phase *notifications*. It never enters responder negotiation, so it can never take a scroll, tap or swipe away from your app. (A `PanResponder` that declines the responder would also be non-blocking, but it never receives the gesture's release — and the release is exactly where a tap lands.)

The wrapper View is styled `{ flex: 1 }`. If your provider is mounted somewhere that must not stretch, pass `touchCaptureStyle={{ ... }}` or set `captureTouches={false}`.

Only `start` and `end` are always kept; `move` samples are throttled (`touchMoveThrottleMs`, default 60 ms) and require `touchMoveMinDistancePx` (default 6) of travel, so a resting finger produces nothing.

## Crash-linked capture

The highest-value moment in mobile bug capture is the one bug the user can never reproduce on request. Both crash paths are wired:

| Crash | Handled by | Attaches |
| --- | --- | --- |
| Render/lifecycle error in a subtree | `<BugMojoErrorBoundary>` | component stack + rolling buffer |
| Any other uncaught JS error (async callbacks, native module handlers, fatals) | RN `ErrorUtils` global handler, chained by the client | stack + rolling buffer |

Both file a normal report carrying the console, network and masked frames from **before** the failure, tagged `bugmojo_crash: true` so triage can tell an auto-filed crash from a user-written report. Neither takes a *fresh* screenshot: by the time a crash handler runs the UI has already swapped to a fallback, so the last pre-crash frame in the rolling buffer is the evidence you want.

```tsx
<BugMojoProvider captureCrashes maxCrashReports={3} ...>   // both are the defaults
```

Auto-crash reports are **not** subject to sticky sampling — crashes are rare and every one is reported — but the ingest route still re-checks your project's capture ruleset server-side, so a project with capture switched off is hard-denied. Repeat errors are deduped by signature and capped at `maxCrashReports` per session so a throwing render loop can't flood the user's mobile data.

### Error boundary

```tsx
import { BugMojoErrorBoundary } from '@bugmojo/react-native';

<BugMojoErrorBoundary fallback={({ error, reset }) => <Crash onRetry={reset} />}>
  <Screen />
</BugMojoErrorBoundary>
```

A caught crash auto-files a bug with the React component stack. Props: `fallback` (node or render-prop `{ error, reset }`), `title`, `onError(error, componentStack)`.

## Navigation breadcrumbs

"Which screen was this on, and how did they get there?" — folded into the same breadcrumb trail as `track()`. Works with **React Navigation** and **Expo Router**, and imports neither: the SDK reads your navigation container ref structurally, so there is no peer dependency, nothing for Metro to resolve, and nothing that can throw when you don't use a router.

```tsx
import { useNavigationContainerRef } from '@react-navigation/native';  // or from 'expo-router'

function App() {
  const navigationRef = useNavigationContainerRef();
  return (
    <BugMojoProvider navigationRef={navigationRef} ...>
      <NavigationContainer ref={navigationRef}>{/* ... */}</NavigationContainer>
    </BugMojoProvider>
  );
}
```

Don't keep a ref? Spread the state handlers onto `<NavigationContainer>` instead — the screen name is derived from the navigation state itself:

```tsx
import { createNavigationStateHandlers } from '@bugmojo/react-native';

const { report, track } = useBugMojo();
const nav = useMemo(() => createNavigationStateHandlers(track), [track]);

<NavigationContainer {...nav}>{/* ... */}</NavigationContainer>
```

Each transition emits a `navigation` breadcrumb `{ screen, from }`, deduped so param changes and cancelled swipe-backs don't spam the trail, and resolved to the **deepest focused route** so a screen inside a tab inside a stack reports the leaf the user is actually looking at. Omit `navigationRef` and the feature is simply off.

## Headless (no React)

```ts
import { createBugMojoClient } from '@bugmojo/react-native';

const bugmojo = createBugMojoClient({
  projectId: 'YOUR_EMBED_TOKEN',
  apiBase: 'https://www.bugmojo.com',
});
await bugmojo.report({ title: 'Background sync failed' });
// later: bugmojo.destroy()
```

`createBugMojoClient(options, { store })` accepts the same options as the provider (including `nativeModules`) and returns a `BugMojoClient` with `report()`, `identify()`, `setRelease()`, `track()`, `setScreenshotRef()`, and `destroy()`.

## Test Mode: run assigned test cases from a phone

Test Mode turns a **tester build** of your app into a manual-test runner. A tester shakes
the device, picks one of the test cases assigned to them in BugMojo, walks the step
checklist, and submits a result whose evidence is the same shape CI produces — a masked
screenshot per step, the session filmstrip, and the redacted console and network logs.

```tsx
import { BugMojoProvider } from '@bugmojo/react-native';

<BugMojoProvider
  projectId="YOUR_EMBED_TOKEN"
  apiBase="https://www.bugmojo.com"
  // Screenshot evidence needs the same interlock as passive replay.
  acknowledgeScreenshotRisk
  testMode={{
    enabled: __DEV__ || process.env.EXPO_PUBLIC_QA_BUILD === '1',
    testerToken: process.env.EXPO_PUBLIC_BUGMOJO_TESTER_KEY,
    projectKey: 'WEB',
    testerId: 'qa@yourcompany.com',
  }}
  screenshotRef={rootRef}
>
  {children}
</BugMojoProvider>
```

**What happens**

1. Shake → the test-run sheet opens on the tester's assigned cases (`GET /api/v1/assignments`).
2. Pick a case → a **consent screen** explains exactly what will be recorded. Nothing is
   captured until the tester taps *Start and record*.
3. Mark each step PASS / FAIL / BLOCKED / SKIP. Each verdict grabs a fresh masked frame as
   that step's proof.
4. Submit → one `TestResult` (`runner: 'MOBILE'`) plus its evidence rows, through the same
   `/api/v1/runs/results` + `/api/v1/runs/evidence` endpoints the Playwright reporter uses.

**HYBRID cases resume where CI stopped.** When BugMojo hands down a handoff, the sheet
greys out the steps CI already ran, shows the commit, deploy URL and app state it left
behind, and opens the checklist at the step the human owns. Both halves land on one
`TestResult`, so the case carries automated *and* manual evidence.

**Apple guideline 2.5.14 posture.** Test Mode is off unless the host enables it, requires a
tester credential a shipping build never carries, records only after explicit per-session
consent, and stops the moment the sheet is closed or the result submitted. It is never
always-on recording.

**Production wiring.** A BugMojo API key inside an app bundle is a tester-build
affordance. For anything wider, implement `TestModeTransport` against your own backend and
pass it as `testMode.transport`:

```ts
testMode={{ enabled: true, projectKey: 'WEB', transport: myProxyTransport }}
```

Running your own tester UI? Pass `renderTestRunSheet={false}` and drive
`useBugMojo().testMode` (a `TestModeController` with `open()`, `begin()`, `consent()`,
`rule()`, `submit()` and `subscribe()`).

## Privacy & security

- **Redaction runs on-device before upload** — emails, cards (Luhn-gated), SSNs, phones, auth headers, JWTs, and provider secrets (AWS/Stripe/GitHub/Slack/Google/PEM) are scrubbed from console + network data.
- **URLs are scrubbed** — sensitive query params masked, fragments dropped.
- **Fail-closed remote config** — capture only runs when your `CaptureRuleset` says `enabled` **and** the session passes deterministic sticky sampling **and** cohort match. A config outage past 24h disables capture.
- **Network bodies are OFF by default** (opt-in), matching the web SDK.
- **No tracking** — the shipped privacy manifest declares `NSPrivacyTracking = false`; collected data is not linked to identity by default.

## Configuration reference

Options accepted by `<BugMojoProvider>` and `createBugMojoClient`:

| Option | Default | Description |
| --- | --- | --- |
| `projectId` / `embedToken` | — | PUBLIC project token (required). |
| `apiBase` | — | BugMojo origin (required), e.g. `https://www.bugmojo.com`. |
| `env` | — | Environment label forwarded to remote config for gating. |
| `release` | — | Release/version string for release gating + report context. |
| `user` | — | Initial reporter identity (`{ id, email, name, cohort }`). |
| `customData` | — | Arbitrary metadata attached to every submission. |
| `nativeModules` | — | Statically-imported optional modules (`sensors`, `viewShot`, `device`, `constants`, `reactNative`). Strongly recommended in production. |
| `enableShakeToReport` | `true` | Shake gesture opens the report modal. |
| `testMode` | — | Tester-build Test Run mode: `{ enabled, testerToken, projectKey, projectId?, testerId?, transport?, captureFilmstrip?, onSubmit? }`. When enabled, shake opens the test-run sheet instead of the report modal. |
| `renderTestRunSheet` | `true` | Render the built-in test-run sheet. Only ever mounts when `testMode.enabled` is set. |
| `captureConsole` | `true` | Patch `console.*` into the capture buffer. |
| `captureNetwork` | `true` | Patch `fetch` + XHR into the capture buffer. |
| `enableScreenshotReplay` | `false` | Periodic masked screenshots (needs a view-shot ref **and** `acknowledgeScreenshotRisk`). |
| `acknowledgeScreenshotRisk` | `false` | Required with `enableScreenshotReplay` — you accept that any un-wrapped sensitive view can leak pixels. |
| `screenshotIntervalMs` | `1000` | Interval between replay frames. Clamped to 250–60000. |
| `screenshotBufferSize` | `20` | Max frames kept in the rolling replay buffer. Clamped to 1–120. |
| `screenshotFormat` | `'jpg'` | Frame encoding — `'jpg'` or `'png'`. |
| `screenshotQuality` | `0.5` | JPEG quality 0.1–1 (ignored for PNG). |
| `consoleBufferSize` | `500` | Max console entries in the rolling buffer. |
| `networkBufferSize` | `200` | Max network entries in the rolling buffer. |
| `captureTouches` | `true` | Record taps/swipes for the replay touch trail. Never claims the touch responder. |
| `touchBufferSize` | `400` | Max touch points in the rolling buffer. |
| `touchMoveThrottleMs` | `60` | Minimum ms between recorded `move` samples. |
| `touchMoveMinDistancePx` | `6` | Minimum travel before another `move` sample is kept. |
| `captureCrashes` | `true` | Auto-file a report on an uncaught JS error, with the pre-crash buffer attached. |
| `maxCrashReports` | `3` | Cap on auto-filed crash reports per session. |
| `navigationRef` | — | React Navigation / Expo Router container ref for screen breadcrumbs. |
| `shakeThreshold` | `1.8` | Accelerometer magnitude (g) for a shake. |
| `sessionId` | random | Persist your own for cross-launch sticky sampling. |
| `onOpen` / `onClose` / `onSubmit` | — | Lifecycle callbacks (modal opened/closed, report submitted). |

Provider-only props:

| Prop | Default | Description |
| --- | --- | --- |
| `store` | in-memory | KV store for the last-good config cache (pass AsyncStorage). |
| `renderModal` | `true` | Set `false` to supply your own UI and drive it via `useBugMojo()`. |
| `screenshotRef` | — | RefObject of the view rasterized for screenshot replay. |
| `touchCaptureStyle` | `{ flex: 1 }` | Style for the touch-capture wrapper View. |

### `useBugMojo()`

| Member | Description |
| --- | --- |
| `ready` | `true` once remote config resolved and the SDK booted. |
| `capturing` | `true` when this session passed the capture gate (enabled + sampling + cohort). |
| `report(input)` | File a report — `{ title, description?, category?, reporterEmail?, context? }`. Always resolves with `{ ok, number?, pendingModeration?, error? }`. |
| `identify(user)` / `setUser(user)` | Merge reporter identity. |
| `setRelease(release)` | Update the release string used for gating + reports. |
| `track(name, data?)` | Record a breadcrumb (last 50 are attached to reports). |
| `open()` / `close()` | Open/close the built-in report modal. |
| `testMode` | The `TestModeController` when Test Mode is enabled for this build, else `null`. |
| `openTestRun()` / `closeTestRun()` | Open/close the built-in test-run sheet. No-ops when Test Mode is off. |

## Troubleshooting / FAQ

**Shake doesn't open the modal.** In order: (1) install `expo-sensors` and inject it via `nativeModules={{ sensors }}` — in release builds the SDK cannot find it otherwise; (2) make sure the config plugin ran (`npx expo prebuild`) so iOS has `NSMotionUsageDescription`; (3) shake on a **physical device** — most simulators have no accelerometer; (4) check you didn't set `enableShakeToReport={false}`. `useBugMojo().report()` and `open()` always work as a fallback.

**Reports have no screenshots.** Screenshot replay needs all four: `react-native-view-shot` installed **and** injected (`nativeModules.viewShot`), a `screenshotRef` (or `client.setScreenshotRef`), and both `enableScreenshotReplay` + `acknowledgeScreenshotRisk`. Also note frames are deliberately **skipped** when mounted masks can't confirm their overlay committed in time (fail-closed by design).

**Reports have no console/network logs.** Passive capture only installs when the capture gate passes — your project's ruleset must be `enabled`, the session must fall inside `sample_rate`, and the user's `cohort` must match. Check `useBugMojo().capturing`; if `false`, review the capture ruleset in your BugMojo project settings.

**Does the touch capture interfere with my gestures?** No — see [Touch trail](#touch-trail). It uses bubble-phase touch notifications and never enters responder negotiation. If you still want it off: `captureTouches={false}`. If the extra wrapper View changes your layout, pass `touchCaptureStyle` instead of disabling capture.

**Reports have no touch trail.** Touches are buffered only while passive capture is on (`useBugMojo().capturing === true`), since a trail with no filmstrip to annotate is noise. Also check you didn't set `captureTouches={false}`.

**No navigation breadcrumbs.** You must hand the SDK a container ref (`navigationRef`) or spread `createNavigationStateHandlers(track)` onto `<NavigationContainer>` — there is no auto-discovery, because neither React Navigation nor Expo Router exposes a global registry of live containers and reaching into their internals would break on every minor release.

**Does it record video or use rrweb?** No. There is no DOM on native, so "replay" is a rolling buffer of masked screenshots. rrweb is never bundled into this SDK.

**Do I need to eject or write native code?** No. Everything native comes from the optional Expo peer modules plus the config plugin; `expo prebuild` / EAS Build handles the rest. Bare RN apps work too — set the Info.plist key and privacy manifest manually (see the config plugin section).

## Device-lab testing

The pure JS logic (config gating, sticky sampling, redaction reuse, capture buffers, payload builder, shake detector, mask controller, touch recorder, navigation-state resolution) is unit-tested. The native paths — the expo-sensors accelerometer, react-native-view-shot rasterization, raw touch dispatch through the wrapper View, `ErrorUtils` global handler, `AppState` background flush, and the Expo config plugin prebuild — must be validated on physical iOS + Android devices and against a TestFlight / Play Internal build before you rely on them in production. Injecting `nativeModules` (above) removes the largest source of on-device surprise.

## Related packages

| Package | Use it for |
| ------- | ---------- |
| [`@bugmojo/widget`](https://www.npmjs.com/package/@bugmojo/widget) | Framework-agnostic on-site feedback + capture widget core |
| [`@bugmojo/react`](https://www.npmjs.com/package/@bugmojo/react) | React / Next.js SDK — provider, error boundary, hooks |
| [`@bugmojo/cli`](https://www.npmjs.com/package/@bugmojo/cli) | Pull a bug's Playwright repro pack, verify fixes locally |
| [`@bugmojo/mcp-server`](https://www.npmjs.com/package/@bugmojo/mcp-server) | Connect AI coding agents (Claude Code, Cursor) to BugMojo |

## License

MIT © Softech Infra — see [LICENSE](https://github.com/viveksinra/bugmojo-sdk/blob/main/packages/react-native/LICENSE). Docs & issues at [viveksinra/bugmojo-sdk](https://github.com/viveksinra/bugmojo-sdk).
