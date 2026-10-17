# @bugmojo/codemap

Deterministic, framework-aware codebase mapper. It turns a repository into the two artefacts
the BugMojo agentic-testing loop needs before anyone writes a test case:

- **`code_summary.json`** — a stable, hashable inventory of routes, APIs, components, forms
  and auth gates (plus the specs that already exist), meant to be committed and diffed.
- **A `Feature` upsert payload** — the rows that anchor coverage, defect attribution and
  risk in BugMojo, ready for `upsert_features` (MCP) or `feature.featureUpsertMany` (tRPC).

**No LLM. No network. No database.** Same tree in, byte-identical JSON out. The source never
leaves the machine; only the derived facts travel.

```bash
npx -y @bugmojo/cli map                              # human summary
npx -y @bugmojo/cli map --json                       # code_summary.json
npx -y @bugmojo/cli map --features --project WEB     # upsert_features arguments
npx -y @bugmojo/cli map --out bugmojo/code-summary.json
```

```ts
import { mapCodebase, toCodeSummary, toFeatureUpserts, chunkFeatureUpserts } from '@bugmojo/codemap';

const map = mapCodebase(process.cwd());
const summary = toCodeSummary(map, { rootLabel: '.' });
for (const batch of chunkFeatureUpserts(toFeatureUpserts(map))) {
  await upsertFeatures({ project: 'WEB', features: batch });
}
```

## What it finds

| Kind | Source |
|---|---|
| `ROUTE` | Next.js App Router (`app/**/page.tsx`), Next.js Pages Router (`pages/**`), Expo Router (`app/**`) — with the URL path, dynamic params, route groups, parallel slots, intercepting routes, whether the route sits behind a session, and the `data-testid` / `testID` values it renders |
| `API` | App Router route handlers (one feature per exported `GET`/`POST`/…), tRPC procedures with their **public** namespace, `query`/`mutation`, procedure base and `requirePermission` permission, and express/fastify/hono routes |
| `COMPONENT` | Exported React components with their prop names (destructured params or the members of their props type) and their test ids |
| `FLOW` | Forms (`<form>`, `react-hook-form`, `formik`) with the tRPC procedure / HTTP endpoint / server action they submit to, and each auth-gated area with the reason it gates |

It also reads existing `*.spec.*` / `*.test.*` files as **coverage** (their titles and any
`{ type: 'bugmojo', description: 'WEB-42' }` annotations) so a planner never proposes a case
that already has a spec.

## Design notes

**Why a hand-written scanner and not the TypeScript compiler API.** `bugmojo map` runs
inside a customer's repo via `npx`: it may be plain JS, it may have no tsconfig, and pulling
~25 MB of `typescript` into a published CLI to answer "which files export a component" is a
bad trade. Everything extracted here is syntactic — exported names, JSX attributes,
`publicProcedure` chains — so no type checker is involved either way. One code path also
makes byte-for-byte determinism easy to hold.

`lexer.ts` is what makes regex scanning safe: `maskSource()` returns a string of the **same
length** as the input with comment bodies, string bodies and regex bodies blanked to spaces.
Scan the mask, slice the original — a `data-testid` inside a comment or a string can never
be mistaken for one that renders.

**Feature keys are stable, and that is the whole contract.** A key is the `Feature` identity
in the ledger (`@@unique([project_id, key])`), so a key that moves re-creates the row and
orphans everything attached to it. The app id comes from the nearest `package.json` **name**
(`@acme/web` → `web`), never from the scan root, and file paths in keys are relative to the
package. Running `bugmojo map` from a monorepo root and from `apps/web` therefore produces
the *same* keys for the same code.

```text
route:web:/board/[slug]
api:web:GET /api/v1/bugs
api:web:trpc.issue.create
component:web:src/components/ui/button.tsx#Button
flow:web:form:src/app/auth/login/page.tsx#LoginPage
flow:web:auth:src/app/(dashboard)/[companySlug]/layout.tsx
```

**There is no timestamp in `code_summary.json`.** A summary that embeds `generated_at`
differs on every run, so it cannot be committed, diffed, or used as a cache key. It carries
a `content_hash` over its own canonical JSON instead — "did the surface move?" is one string
comparison.

**Auth inheritance follows the DIRECTORY, not the URL.** Route groups make URL-prefix
inheritance wrong: `(marketing)/layout.tsx` and `(dashboard)/layout.tsx` both sit at `/`, and
only one of them gates.

**Components are filtered by default.** `toFeatureUpserts` emits COMPONENT features only for
components a test case can target — a route's page component, one rendering a `data-testid`,
or one owning a form. A coverage ledger with 800 button rows is a ledger nobody reads. Pass
`includeComponents: 'all'` when you genuinely want the rest.

**Nothing throws.** An unreadable file, a cap being hit, a duplicate key: every one of them
is a `warnings[]` entry and the rest of the map still lands.

## Limits worth knowing

- Route paths are the **file-system** routes. A middleware rewrite (BugMojo's own `/login` →
  `/auth/login`) is not invented here; the mapper reports `/auth/login`.
- Props resolve within one file. A props interface imported from another module yields no
  prop names rather than a guess.
- Submit targets are only recorded when the code names them literally. A `fetch(someUrl)`
  produces no target — a guessed endpoint on a feature row is worse than none.
- `maxFiles` defaults to 20 000 and files over 512 KiB are skipped, both with a warning.

## License

MIT
