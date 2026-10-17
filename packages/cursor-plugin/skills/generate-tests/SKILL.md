---
name: generate-tests
description: Turn a scope into BugMojo test cases and runnable Playwright specs — propose the cases, classify AUTOMATED / MANUAL / HYBRID with reasons, verify every selector against the running app before writing a line, save specs into tests/bugmojo/ with the annotation the reporter maps, and attach each spec to its case revision. Use when the user asks to generate, write or scaffold tests / e2e specs for a feature, a diff, or the whole app.
argument-hint: [feature name | diff | all]
disable-model-invocation: true
---

# Generate the tests

Scope: **$ARGUMENTS** — a feature or area name, `diff` (what changed on this branch), or
`all`.

The rule that separates this from every "AI test generator" that shipped and died: **a spec
whose selectors were never verified against the running app is not a test, it is a guess.**
Nothing gets attached to a case until it has run green at least once.

## 0. Context first

Call `get_project_test_context` with the project key. Use its `conventions`,
`selector_hints`, `known_flaky_patterns` and `generation_guidance` — they are the accumulated
memory of what works in *this* repo, and ignoring them is how you get proposals rejected
twice for the same reason.

Note whether a plan already exists. If the user has no plan at all, `/bugmojo:plan-tests`
first is the better order — this skill fills in specs and gaps, it does not interview.

## 1. Resolve the scope

**A feature or area** (`checkout`, `auth`, `admin console`) — find its routes, components
and API handlers in the repo, and list the existing cases for it:
`list_test_cases({ suite_id })` per suite, or `list_review_queue` (`?mode=qa`) for what is
already proposed. Never propose a case that exists; extend or attach a spec to it instead.

**`diff`** — what this branch changed:

```bash
git diff --name-only origin/main...HEAD
git diff --stat origin/main...HEAD
```

Map the changed files to cases through `source_refs`: read the cases for the affected
areas (`get_test_case` returns `source_refs`) and select the ones whose refs intersect the
diff. Those need re-verification; the parts of the diff no case covers are the gaps to
propose for. (`suggest_tests_for_diff` does this mapping for you when the connection carries
`?mode=qa`; without it, do the mapping yourself and say that is what you did.)

**`all`** — work area by area, smallest first, and report after each. Do not fire one
200-case batch and hope.

## 2. Propose the cases

Same rules as `/bugmojo:plan-tests` step 3: behaviour-shaped titles, stable meaningful
`external_key`s, human-executable steps, one verifiable `expected_result`, `source_refs`
on every case, honest classification.

```text
propose_test_cases({
  project: "WEB",
  suite_name: "Checkout",
  client: "CLAUDE_CODE",
  source: "CODEBASE",        // or "DIFF" when the scope was a diff — it is recorded on the session
  scope: "$ARGUMENTS",
  cases: [ … ]               // ≤ 100 per call
})
```

Read the response per case: `execution_mode`, `automation_readiness`, `manual_reasons`.
That is the rubric's verdict, and it decides what happens in the rest of this skill.

## 3. Re-classify when you learn something new

`classify_test_case` (`?mode=qa`) re-runs the rubric on one case and returns the mode,
readiness 0–100, the reasons with the evidence that triggered each, and a justification.
Use it when you discover a fixture the first pass did not know about — a seeded account, a
test-mode PSP key, an OTP bypass — and pass `environment_id` so only fixtures bound to that
environment count. `persist: false` previews without writing a revision.

MANUAL is not a failure state. A case that is MANUAL because it verifies an SMS actually
arrived is correctly classified, and the reason code is what a client report uses to explain
why a human is in the loop.

## 4. Ground every selector before writing a spec — the grounding lane

Only AUTOMATED (and the automated half of HYBRID) cases get specs, and only after the
selectors are verified against the **running app**. In order of preference:

**A. Playwright MCP / the `playwright-test` server.** If `mcp__…playwright…` tools are in
your tool list (Playwright's own MCP, or what `npx playwright init-agents` configured),
drive the app with them: navigate to the route, snapshot the accessibility tree, and read
the real roles, labels and test ids. This is the strongest grounding available — you are
reading the DOM, not the JSX.

**B. Probe with Playwright itself.** No MCP? Write the spec, run it, and fix it:

```bash
npx playwright test tests/bugmojo/checkout-coupon.spec.ts --reporter=line
```

Iterate until it passes against a real dev/preview server. This is slower but it proves the
same thing, and it is the path most repos will actually take.

**C. `npx playwright codegen <url>`** to discover selectors interactively when the user is
at the keyboard.

**If the app will not run** (no dev server, no credentials, no seeded data), do NOT write
specs from the source. Say so, and either propose those cases as MANUAL with
`UNSTABLE_UI` / `DATA_SETUP_INFEASIBLE`, or leave them AUTOMATED but unspec'd and tell the
user what you need to finish. An unverified spec that fails on day one costs more trust
than a missing spec.

Record what you learned: selectors that worked are exactly what `ProjectTestMemory`'s
selector hints are for, and they come back to you in `get_project_test_context` next time.

## 5. Write the spec

**Location** — `tests/bugmojo/<slug>.spec.ts` by default, or wherever the repo already
keeps e2e specs (follow the repo; `testDir` in `playwright.config.*` is the truth).

**Mapping the spec back to the case — get this right or the run records nothing useful.**
The annotation is primary because it survives a file rename:

```ts
import { expect, test } from '@playwright/test';

test('applies a coupon above the minimum order value', async ({ page }) => {
  test.info().annotations.push({ type: 'bugmojo', description: 'checkout/coupon-above-minimum' });

  await page.goto('/checkout');
  await page.getByTestId('coupon-input').fill('SAVE10');
  await page.getByRole('button', { name: 'Apply' }).click();

  await expect(page.getByTestId('order-total')).toHaveText('$45.00');
});
```

`description` is the case's **`external_key`** (what you passed to `propose_test_cases`) or
its raw TestCase id. A `WEB-42`-shaped key only resolves for cases created from a bug. The
file-name convention `tests/bugmojo/WEB-42.spec.ts` also works, and `[WEB-42]` in the title
works, but both are weaker: a rename silently unlinks the spec.

**Selectors, best first:** `getByRole` with an accessible name → `getByTestId` →
`getByLabel` / `getByText` → CSS. Never an XPath, never an nth-child chain.

**Flakiness lint — the three patterns that account for most flaky e2e tests.** Check your
own spec before attaching it:

1. **Hard waits.** No `page.waitForTimeout(…)`. Use web-first assertions (`await
   expect(locator).toBeVisible()`), which retry, or `waitForResponse` for a specific call.
2. **Unordered collections.** Never assert on `.nth(0)` of a list whose order the server
   decides. Filter by content (`getByRole('row').filter({ hasText: 'SAVE10' })`).
3. **Missing assertions.** A spec that navigates and clicks and asserts nothing passes
   forever and proves nothing. Every spec ends in at least one `expect`.

Also: no `test.only`, no sleeps in a loop, no dependence on another spec having run first,
no shared mutable fixture state, and `test.step()` around each logical step so the trace
and the evidence timeline line up with the case's steps.

## 6. Attach the spec to the case

Only after it has passed:

```text
attach_spec({
  test_case_id: "…",
  playwright_script: "<the full source>",
  source_refs: [{ kind: "file", ref: "tests/bugmojo/checkout-coupon.spec.ts" }],
  execution_mode: "AUTOMATED",       // only when the spec changes the mode
  note: "Spec verified against the staging build; selectors from the live DOM."
})
```

The canonical file stays in the repo — BugMojo keeps a copy on the revision so a pinned plan
version can always show exactly what was run. `attach_spec` writes revision N+1; DRAFT plan
versions follow the new revision, published ones stay frozen. The response says which did
which — report it, do not guess.

For Maestro / React Native flows, pass `maestro_flow` instead.

## 7. Run them, then report

Hand off to `/bugmojo:run` (or run directly) so the specs execute with the BugMojo reporter
and the results land with evidence. Then report:

- Cases proposed, by mode, with the manual reasons grouped.
- Specs written and **verified** (say how they were verified — MCP grounding or a green
  local run). Specs written but not verified are reported separately, as unfinished.
- Cases left without a spec, and the concrete reason for each.
- Where to review: the review queue (dashboard, or `list_review_queue` / `review_test_case`
  with `?mode=qa`).

## Guardrails

- Never attach a spec that has not run green at least once.
- Never invent a `data-testid` that is not in the codebase. If a route needs one to be
  testable, propose the *code change* to the user — adding a test id is a real, good
  contribution — rather than writing a spec against a selector that does not exist.
- Never weaken an assertion to make a spec pass. A spec that fails because the app is wrong
  is the product working.
- Do not create cases outside the review queue. `propose_test_cases` is the door.
- Re-running is safe — `external_key` is the idempotency key.
