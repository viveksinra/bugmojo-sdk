---
name: plan-tests
description: Build a versioned BugMojo test plan for this codebase — interview the user about depth, areas, environments and who runs manual cases, map the routes/APIs/flows actually in the repo, propose the cases into the review queue with an automatable-vs-manual verdict, and pin them into a DRAFT plan version. Use when the user asks for a test plan, test strategy, test coverage for a repo or feature, or says there are no tests yet.
argument-hint: [scope — a feature, a route, an area, or nothing for the whole app]
disable-model-invocation: true
---

# Plan the tests

Scope (optional): **$ARGUMENTS**

The output of this skill is a **DRAFT `TestPlanVersion`** in BugMojo with proposed cases
pinned to it, each classified AUTOMATED / MANUAL / HYBRID with reasons, plus the interview
answers stored on the version so v2 can reuse them instead of re-asking.

It is not a document you write. Every case must exist in BugMojo when you finish, or the
work did not happen.

## 0. Context first — always

Call **`get_project_test_context`** with the project key before anything else. It is cheap
(~2k tokens) and it changes what you do next:

- `conventions` / `generation_guidance` — how this project writes cases. Follow it over
  your own habits.
- `selector_hints` — selectors known to work here. Prefer them.
- `known_flaky_patterns` — what has flaked before. Do not propose a case that repeats it.
- `plans` — **if a plan already exists, you are building v2, not v1.** Read the current
  version with `get_test_plan_version` (`?mode=qa` on the MCP URL), reuse its interview
  block, and use `from_version_id` so the new draft starts from it.
- `recent_failures` / coverage counts — where the risk is right now.

If the project key is unknown, `list_projects`. If nothing is set up at all, stop and send
the user to `/bugmojo:setup` first.

## 1. Interview the user — do not skip this

A generated plan nobody agreed to is a generated plan nobody runs. Ask these six, in one
message, with your own recommendation next to each so the user can just say "yes". Use what
you already know from the repo to make the recommendations concrete.

1. **Depth.** `SMOKE` (happy paths only, minutes to run), `CORE` (happy paths + the
   important error and permission paths), or `FULL` (edge cases, boundaries, roles,
   negative paths). This becomes each case's `tier`.
2. **Target count per area.** "About 6–10 per area" is a good default; it keeps v1
   reviewable. A plan of 300 proposals nobody reviews is worth less than 30 that get
   accepted.
3. **Which areas or routes.** Offer the map from step 2 below — let them tick areas off,
   or say "everything". Honour `$ARGUMENTS` if it named a scope.
4. **Environments.** Name, base URL, and — critically — **which ones allow destructive
   tests**. Ask where tests run: local dev, a preview deploy, staging.
5. **Who executes the manual cases.** Names or emails. Some cases cannot be automated (see
   step 4), and a manual case with no owner is a case that never runs. If they do not know
   yet, record "unassigned" and say `/bugmojo:assign` can balance them later.
6. **Specs now, or after review?** "After review" is the honest default: a spec written for
   a case a human then rewrites is wasted work. "Now" is right when the user wants to see
   runnable output in this session.

Also worth asking when the answer is not obvious from the repo: what is explicitly **out of
scope**, which flows are **highest risk** (money, auth, data loss), and whether there are
test accounts / seed data / an OTP bypass available (that answer directly flips cases from
MANUAL to AUTOMATED).

Wait for the answers. Do not proceed on assumptions and then present a plan built on them.

## 2. Map the codebase

Now read the repo. The map is what makes the cases specific to *this* product instead of
generic QA boilerplate. Work from routes inward and keep a note of the file path for every
finding — those become `source_refs`, which is how BugMojo later knows which cases a diff
put at risk.

### Start with `bugmojo map` — do not hand-roll the inventory

```bash
npx -y @bugmojo/cli map                      # human summary of routes / APIs / flows
npx -y @bugmojo/cli map --json               # the full code_summary.json
npx -y @bugmojo/cli map --features --project WEB   # ready-made upsert_features arguments
```

It is a deterministic static mapper (no LLM, no network, nothing leaves the machine) and it
already knows the things that are easy to get wrong by hand: route groups `(dashboard)`
vanish from the URL, `[[...slug]]` is an optional catch-all, `@modal` adds no segment,
`_private` folders are not routes, Expo's `_layout`/`+not-found` are not screens, and a
tRPC procedure's PUBLIC namespace comes from the app router's mounts, not from its file
name. It also reports, per route, **whether it sits behind a session** and **which
`data-testid`s it renders** — both of which change what you propose.

Read its output first, then use Read/Grep only for the parts it cannot see (business rules,
validation messages, role matrices). If the repo has no `@bugmojo/cli` and the user does not
want `npx`, fall back to the manual sweep below.

**Push the map into the feature ledger before you propose cases.** Take each batch from
`--features` and call `upsert_features({ project, features })` (`?mode=qa`) in order — it is
idempotent by `key`, so re-running the scan on a later commit is a no-op for anything that
did not change, and it gives every case you propose next a real `feature_key` to anchor to.
Do not invent feature keys by hand; the mapper's keys are the ones the decay detector and
the coverage ledger will match against.

**Next.js App Router** — `app/**/page.tsx` (a route), `app/**/layout.tsx`,
`app/**/route.ts` (an API endpoint), `middleware.ts` (auth and redirects — a rich source of
permission cases), route groups `(...)`, dynamic segments `[id]`, parallel/intercepted
routes.

**Next.js Pages Router** — `pages/**/*.tsx` minus `_app`/`_document`, `pages/api/**`.

**Expo / React Native** — `app/**` (Expo Router) or the navigator tree; screens, deep links.

**Other stacks** — Vite/CRA: the router config (`createBrowserRouter`, `<Route>`); Remix:
`app/routes/**`; SvelteKit: `src/routes/**`; Rails/Django/Laravel: the routes file.

**Server surface** — tRPC routers (`server/routers/*.ts` — each procedure is a behaviour
worth a case), REST handlers, GraphQL resolvers, webhooks, cron entry points.

**Forms and interactions** — search for `onSubmit`, `<form`, `react-hook-form`, zod
schemas used for validation. Every validation rule is a negative test case.

**Selectors** — `data-testid`, `aria-label`, `role=`, stable text. Note what exists; a
route with no stable selectors is a route whose cases will be flaky, which matters in
step 4 (`UNSTABLE_UI`).

**Auth and roles** — where the session is read, what roles exist, what each gates. Roles
multiply cases: "admin can X" and "viewer cannot X" are two cases, and the second one is
the one that catches real bugs.

**Existing tests** — read `tests/`, `e2e/`, `*.spec.ts` **before proposing anything**.
Never propose a case that already exists as a spec; instead note the spec as a
`source_ref` so it can be linked later.

Useful commands (adapt to the repo):

```bash
git ls-files 'app/**/page.tsx' 'app/**/route.ts' 'pages/**' 'src/routes/**' | head -200
git ls-files '*.spec.ts' '*.test.ts' 'tests/**' 'e2e/**' | head -100
```

For a large repo, hand the mapping to the **test-planner** subagent (it has Read/Grep/Glob
and the BugMojo tools and nothing else) so the main context stays clear.

Show the user the map — areas, routes per area, existing coverage — and get a nod before
writing anything to BugMojo.

## 3. Write the cases

One case = one behaviour a human could verify, with a clear expected result. Rules that
make the difference between a plan that gets accepted and one that gets rejected:

- **Title states the behaviour**, not the click path: "Coupon code below the minimum order
  value is rejected with a message", not "Test coupon field".
- **`external_key` is stable and meaningful** — `checkout/coupon-below-minimum`. It is the
  idempotency key: re-running this skill with the same keys updates nothing and creates
  nothing twice. Never use a random id or a number.
- **Steps are executable by a human who has not read the code.** Each step gets `step`,
  optionally `expected` and `data`. Precondition goes in `preconditions`, not step 1.
- **`expected_result` is a single verifiable outcome.** "It works" is not a test case.
- **`source_refs`** for every case: `{ kind: "route", ref: "/checkout" }`,
  `{ kind: "file", ref: "components/CheckoutForm.tsx" }`,
  `{ kind: "component", ref: "CheckoutForm" }`, `{ kind: "api", ref: "POST /api/orders" }`.
  This is what the decay detector uses to flag cases when that file changes.
- **`tier`** from the interview's depth (`SMOKE` / `CORE` / `FULL`), **`priority`** from
  business impact (`CRITICAL` for money, auth, data loss).
- **`folder`** groups cases into sections — one per area ("Checkout", "Auth", "Admin").
- **`feature_key`** anchors coverage when the project already has `Feature` rows (the
  ledger from `get_coverage_ledger` lists them). An unknown key comes back as a warning
  and the case is created without the anchor — read the warnings.

Cover, per area: the happy path; the important error paths (validation, permission,
not-found, network failure); state that persists (reload, back button); and roles.

## 4. Be honest about what cannot be automated

BugMojo classifies every proposal with a deterministic rubric, so you do not have to guess
— but you *do* have to describe the case accurately enough for the rubric to see the truth.
These stay MANUAL (or HYBRID: automate up to the gate, human step after) unless the project
has a registered bypass, and each gets a reason code:

`OTP_2FA`, `CAPTCHA`, `REAL_PAYMENT`, `EMAIL_SMS_DELIVERY`, `VISUAL_JUDGMENT`,
`ACCESSIBILITY_JUDGMENT`, `HARDWARE`, `THIRD_PARTY_NO_SANDBOX`, `NON_DETERMINISTIC_AI`,
`LEGAL_SIGNOFF`, `ONE_OFF`, `UNSTABLE_UI`, `DATA_SETUP_INFEASIBLE`, `EXPLORATORY`.

If the interview turned up a test-mode PSP key, an OTP bypass or a seeded account, say so
in `preconditions` — the classifier reads fixtures and will flip the case to AUTOMATED.
Padding the automated count by pretending a payment test is automatable produces a spec
that fails on day one and a customer who stops trusting the tool.

## 5. Propose the cases

```text
propose_test_cases({
  project: "WEB",
  suite_name: "Checkout",          // or one suite per area; created on first use
  client: "CLAUDE_CODE",
  source: "CODEBASE",              // PRD / DIFF / CAPTURE / HELP_DOCS when that is the truth
  scope: "Checkout + auth, CORE depth, 8 per area",
  cases: [ … ]                     // max 100 per call; batch by area
})
```

It returns, per case, the id, the `execution_mode`, `automation_readiness` (0–100) and the
`manual_reasons` that fired, plus a `generation_session_id`. Keep that session id — it ties
the proposals, the plan version and the acceptance stats together.

Cases land as **PROPOSED**: in the human review queue, not in anyone's suite. That is the
point. Never tell the user "the test plan is done" at this step; the accurate sentence is
"32 cases are proposed and waiting for your review".

## 6. Pin them into a DRAFT version

There is no MCP tool that appends a case to an existing draft, so the version is created
*after* the proposals, with the full case list:

```text
create_test_plan_version({
  project: "WEB",
  plan_name: "Release regression",   // resolved by name; created the first time
  label: "v1 — checkout + auth, CORE",
  scope_md: "…",                     // see below
  entry_criteria_md: "…",            // when this plan may start (build deployed, seed data loaded)
  exit_criteria_md: "…",             // when it is done (all CRITICAL cases pass with evidence, zero open CRITICAL bugs)
  environments: [{ name: "staging", base_url: "https://staging.example.com", allows_destructive: true }],
  risks: [{ title: "Coupon engine rewritten last sprint", severity: "HIGH", mitigation: "Full checkout depth" }],
  cases: [{ test_case_id: "…", section: "Checkout", order: 1 }, …],
  generation_session_id: "…",
  publish: false                     // ALWAYS false here — see step 8
})
```

DRAFT version numbers are provisional; publishing renumbers to the next published number.
Say that rather than promising "v1".

### Store the interview on the version

`TestPlanVersion` has no metadata column, so the interview lives in `scope_md` — human
prose first, then a fenced JSON block a later run can parse verbatim. Write it exactly like
this, and when building v2 read it back with `get_test_plan_version` and re-ask only what
has changed:

`````markdown
## Scope

Checkout and authentication, CORE depth, on staging. Out of scope: the admin console.

## Interview (machine-readable — reused by the next version)

```json
{
  "depth": "CORE",
  "target_per_area": 8,
  "areas": ["checkout", "auth"],
  "out_of_scope": ["admin console"],
  "environments": [{ "name": "staging", "base_url": "https://staging.example.com", "allows_destructive": true }],
  "manual_executors": ["priya@acme.com", "sam@acme.com"],
  "generate_specs": "after_review",
  "fixtures": { "otp_bypass": true, "psp": "stripe-test-mode" },
  "interviewed_at": "2026-09-18",
  "interviewed_by": "claude-code"
}
```
`````

## 7. Report honestly

Tell the user:

- The plan name, the draft version id, and the case count **by execution mode** —
  "32 proposed: 21 AUTOMATED, 8 MANUAL, 3 HYBRID".
- The manual reasons, grouped: "3 blocked on OTP, 2 are visual judgment". This is the list
  that justifies hiring a human tester, and it is the most useful paragraph in the report.
- The areas with **no** coverage and why (out of scope, or not reached yet).
- Where to review: the dashboard's review queue, or `list_review_queue` +
  `review_test_case` right here (both need `?mode=qa` on the MCP URL).
- What comes next: `/bugmojo:generate-tests` for the specs, `/bugmojo:assign` for the
  manual cases.

## 8. Publishing is the human's decision

Never pass `publish: true` without the user explicitly saying so in this conversation.
Publishing freezes the version, computes its content hash and makes it the thing a client
report is built against. Before publishing:

1. Get the proposals reviewed (`review_test_case` — ACCEPT / EDIT / REJECT). REJECT needs a
   reason, and that reason is what tunes the next generation, so pass a real one.
2. Re-pin with `create_test_plan_version({ from_version_id: <draft>, cases: [accepted only] })`
   so rejected cases never enter a published version.
3. Then publish, and hand the user the version number and content hash.

## Guardrails

- Every case exists in BugMojo or it does not exist. Do not present a markdown table of
  cases as the deliverable.
- Never invent a route, a component or a behaviour you did not read in the repo.
- Never mark a case AUTOMATED to make the numbers look better.
- Re-running this skill is safe: `external_key` makes `propose_test_cases` idempotent. If
  the user asks for "more cases for checkout", propose only the new keys.
- `get_test_plan_version`, `diff_plan_versions`, `list_review_queue`, `review_test_case`,
  `upsert_features` and `get_coverage_ledger` need `?mode=qa` on the MCP URL. If they are missing from the
  tool list, say so and tell the user how to add it — do not pretend the data is
  unavailable.
