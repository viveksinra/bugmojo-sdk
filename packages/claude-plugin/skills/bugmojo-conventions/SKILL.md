---
name: bugmojo-conventions
description: How to name, annotate and structure Playwright and Maestro specs so BugMojo maps every result to the right test case and attaches the trace, video and screenshots. Use whenever you create, rename, move or edit a spec under tests/ or e2e/, add a Playwright annotation or tag, touch playwright.config, or need to explain why a recorded run shows results with no test case attached.
paths: ["tests/**", "e2e/**"]
allowed-tools: Read, Grep, Glob
---

# BugMojo spec conventions

A spec that BugMojo cannot map to a test case still records a result — it just records it
as an unlinked one. That result does not count toward the plan version, does not appear in
the coverage ledger, does not satisfy the evidence-gated merge check, and does not reach the
client report. The mapping is one line of code. Get it right.

## The annotation is the mapping

```ts
import { expect, test } from '@playwright/test';

test('applies a coupon above the minimum order value', async ({ page }) => {
  test.info().annotations.push({ type: 'bugmojo', description: 'checkout/coupon-above-minimum' });
  // …
});
```

`description` is the case reference, and it may be any of:

| Form | Where it comes from | Example |
| --- | --- | --- |
| **external key** (preferred) | the `external_key` you passed to `propose_test_cases` | `checkout/coupon-above-minimum` |
| **TestCase id** | `get_test_case` / the propose response | `cm2f8x…` |
| **bug key** | a case created from a bug (a persisted repro) | `WEB-42` |

The server resolves them in that order — raw id, then the `ext:<KEY>` tag, then `bug:<KEY>`.
A key that matches nothing leaves the result unlinked and adds a warning to the ingest
response; read the warnings.

`bugmojo-case` and `bugmojo_case` are accepted as the annotation `type`, as is the
shorthand `type: 'bugmojo:WEB-42'` with no description.

## The other three forms, and why they are weaker

Resolution order, best first:

1. **Annotation** (above) — survives a rename, a move, and a title edit.
2. **Title marker** — `test('[WEB-42] applies a coupon', …)`, or a bare `WEB-42` anywhere in
   the title. Breaks when someone improves the wording. The bracket form only accepts
   `[A-Za-z0-9_-]`, so an external key containing `/` will not work here.
3. **Playwright tag** — `test('applies a coupon', { tag: '@WEB-42' }, …)`.
4. **File name** — `tests/bugmojo/WEB-42.spec.ts`, and `tests/bugmojo/WEB-42-checkout.spec.ts`
   maps to `WEB-42` too (the key is the prefix before the second dash). This is the
   convention the BugMojo verify action writes for repro specs, so it must keep working —
   but for a new spec it is the weakest choice: renaming the file silently unlinks it.

Use the annotation. Use a second form as well if you like — they agree or the first one
wins; they never conflict.

## Where specs live

- Repro specs pulled from a bug: `tests/bugmojo/<BUG-KEY>.spec.ts`. Leave the name alone.
- New specs: follow `testDir` in `playwright.config.*`, and group by area
  (`tests/bugmojo/checkout/…`) rather than by case id. The annotation carries the identity;
  the path is for humans.
- One behaviour per `test()`. A spec that verifies four things reports one status, and a
  case that covers four behaviours cannot be signed off.

## Config: no evidence, no proof

`playwright.config.*` must carry both halves:

```ts
export default defineConfig({
  reporter: [['list'], ['@bugmojo/playwright-reporter']],
  use: {
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
});
```

`npx @bugmojo/cli init` writes exactly this, idempotently, preserving anything already set.

Two ways people accidentally turn recording off:

- **`--reporter=json` on the command line replaces the whole configured list**, BugMojo
  included. Use `--reporter=list,@bugmojo/playwright-reporter` if you need to add one.
- **Missing credentials.** The reporter needs `BUGMOJO_API_KEY` and `BUGMOJO_PROJECT`;
  without them it prints one line on stderr and stays inert, on purpose, so it can be
  committed before the team logs in.

## Writing a spec that will not flake

The three patterns behind most flaky end-to-end tests — and BugMojo records flakiness per
case, so these show up in the coverage ledger with your name on them:

1. **No hard waits.** `page.waitForTimeout(2000)` is never the answer. Web-first
   assertions (`await expect(locator).toBeVisible()`) retry until the timeout; use
   `waitForResponse` when you need a specific network call.
2. **Never index into an unordered collection.** `rows.nth(0)` depends on server ordering.
   Filter by content: `page.getByRole('row').filter({ hasText: 'SAVE10' })`.
3. **Always assert.** A spec that navigates, clicks and ends is green forever and proves
   nothing. Every test ends in at least one `expect`.

Also: no `test.only` in a commit; no cross-spec ordering dependencies; no shared mutable
state between tests; prefer `getByRole` with an accessible name, then `getByTestId`, and
never an XPath or an `nth-child` chain.

Wrap each logical step in `test.step()` — the step index is recorded on evidence rows, so a
screenshot taken inside step 3 lines up with step 3 of the test case in the dashboard.

```ts
await test.step('apply the coupon', async () => {
  await page.getByTestId('coupon-input').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();
});
```

## What happens on the server

- One result per **(spec × Playwright project)** — `chromium` and `webkit` are two results
  for the same case, and both carry their own evidence.
- Retries collapse into one result: the rolled-up status, with the last attempt's timing,
  error and artifacts. A test that passes on retry is recorded **flaky**, not passed.
- A **failing** spec with no case reference creates a PROPOSED case plus a bug, so an
  agent-found regression still lands somewhere a human will see it. Turn it off per run
  with `BUGMOJO_CREATE_MISSING_CASES=false`. A *passing* unmapped spec creates nothing.
- Trace, video, screenshots, console and network logs upload as evidence rows attached to
  the result, with a sha256 per artifact.

## Maestro (React Native)

Same idea, different file. Put the case reference in the flow's `name` or in a `# bugmojo:
<key>` comment at the top, keep one flow per behaviour, and attach it to the case with
`attach_spec({ maestro_flow })`.

## Quick checklist before committing a spec

- [ ] `test.info().annotations.push({ type: 'bugmojo', description: '<case key>' })`
- [ ] The key exists in BugMojo (`get_test_case`, or it is the `external_key` you proposed)
- [ ] At least one `expect`, no `waitForTimeout`, no `nth()` into an unordered list
- [ ] `test.step()` around each logical step
- [ ] The spec has actually run green at least once
- [ ] `attach_spec` called so the case revision carries the script
