---
name: setup
description: Connect this repository to BugMojo end to end — log in over MCP, pick or create the project, run `bugmojo init` so every agent in the repo learns the conventions, wire `@bugmojo/playwright-reporter` so runs carry evidence, and prove the tools actually respond. Use when BugMojo is new to this repo, when a BugMojo tool returns needs_auth, or when the user asks to set up, connect, configure or install BugMojo.
argument-hint: [workspace-slug or project-key]
disable-model-invocation: true
---

# Set up BugMojo in this repository

Target (optional): **$ARGUMENTS** — a workspace slug, a project key, or nothing at all.

Setup is finished when **four** things are true. Work through them in order and report
each one; do not declare success on the strength of a plausible-looking config file.

| # | Connection | Who uses it | Proof it works |
| --- | --- | --- | --- |
| 1 | MCP server `bugmojo` (OAuth) | this Claude Code session | `whoami` returns a user and a workspace |
| 2 | `BUGMOJO_API_KEY` + `BUGMOJO_PROJECT` | the Playwright reporter, the CLI, this plugin's hooks | a recorded run appears in BugMojo |
| 3 | Repo instruction blocks | every *other* agent that opens this repo | the managed block exists in `AGENTS.md` / `CLAUDE.md` |
| 4 | `@bugmojo/playwright-reporter` in `playwright.config.*` | CI and local runs | trace/video/screenshot land on a result |

## 1. Prove the MCP connection

Call `whoami` first. Nothing else in this skill works until it answers.

- **It returns a user + workspace.** Note the workspace name, your role, and the
  permissions listed. Writing test cases needs `manage_tests` (OWNER / ADMIN / DEVELOPER /
  QA). A VIEWER will not even see the write tools — say so plainly rather than
  hunting for a tool that was never registered.
- **`needs_auth` / a 401.** Tell the user to run `/mcp`, pick **bugmojo**, and complete the
  browser login, then retry. Do not invent data in the meantime and do not try to work
  around it with the REST API.
- **"authenticated but no active workspace".** The account exists with no workspace. The
  user creates one in the dashboard (`https://www.bugmojo.com`); then retry.
- **Wrong workspace.** The MCP URL takes `?workspace=<slug>`. Tell the user to update the
  plugin's **BugMojo MCP URL** setting (`/plugin` → bugmojo → configure) rather than
  guessing at another workspace's data.

If the user asked for a specific workspace in `$ARGUMENTS` and `whoami` shows a different
one, stop and fix that before writing anything.

## 2. Pick — or create — the project

Call `list_projects`. Match `$ARGUMENTS` against key and name.

- **One obvious project.** Use it. Show the user the key you chose.
- **Several.** Ask. Do not guess from the repo's folder name.
- **None.** A project must exist before any test case can. `create_project` lives in the
  admin wing of the MCP surface, so it is only available when the MCP URL carries
  `?mode=admin`. Prefer asking the user to create the project in the dashboard (ten
  seconds, and it sets up the board and members too); offer the `?mode=admin` route only
  if they would rather not leave the terminal.

Remember the **project key** (e.g. `WEB`). Everything downstream is keyed on it: the
reporter's `BUGMOJO_PROJECT`, the plan, the case keys `WEB-42`, the hooks.

## 3. Load the project's existing testing context

Call `get_project_test_context` with the project key. This is the tool every BugMojo
skill calls first, and running it now tells you what kind of setup this is:

- **Empty memory, no plans, no cases** → a greenfield setup. After this skill, send the
  user to `/bugmojo:plan-tests`.
- **Plans and cases already exist** → someone has been here. Do *not* start a second plan.
  Report what exists (plan names, latest version, accepted case counts, open failures) and
  point at `/bugmojo:generate-tests` for the gaps instead.

Read the `conventions`, `selector_hints` and `known_flaky_patterns` it returns — they are
project memory, and they constrain everything the generator does later.

## 4. Get an API key for the machine paths

The MCP connection is *yours*, in this session, over OAuth. The reporter, the CLI and this
plugin's hooks are separate processes with no browser: they need a `bm_key_…` API key.

Tell the user, in these words:

1. Dashboard → **Settings → API Keys** → create a key with **write** permission, scoped to
   this project if they want the blast radius small.
2. Export it where their shell and their CI can both see it:
   ```bash
   export BUGMOJO_API_KEY=bm_key_...      # the reporter, the hooks
   export BUGMOJO_PROJECT=WEB             # the project key from step 2
   ```
   CI wants the same two as secrets/variables.

Never ask the user to paste the key into the chat, never write it into a file in the repo,
and never echo it back. If they have already exported it, `printenv BUGMOJO_PROJECT` is a
safe way to confirm the project half without touching the key.

An unset key is not a blocker for the rest of setup — the reporter prints one stderr line
and stays inert, and the hooks fall back to local signals. Say that instead of stalling.

## 5. Run `bugmojo init`

This writes the managed BugMojo block into every agent instruction file in the repo and
patches the Playwright config. It needs no token and never touches the network.

```bash
npx @bugmojo/cli init --project WEB          # add --workspace <slug> to pin the workspace
```

Run it with `--dry-run` first if the repo has heavily customised instruction files, show
the user the diff, then run it for real. What it does:

- Upserts a marker-delimited block (`<!-- bugmojo:start -->` … `<!-- bugmojo:end -->`) into
  `AGENTS.md`, `CLAUDE.md`, `.github/copilot-instructions.md`, `.cursor/rules/bugmojo.mdc`
  and `GEMINI.md`. Content outside the markers is preserved byte for byte, and re-running
  is a no-op until the block template itself changes.
- Adds `['@bugmojo/playwright-reporter']` to `reporter` and `trace: 'retain-on-failure'`,
  `video: 'retain-on-failure'`, `screenshot: 'only-on-failure'` to `use` in
  `playwright.config.*`. Anything already set is left alone. If the config is too dynamic
  to patch safely (a ternary on `process.env.CI`, say), it tells you and you patch it by
  hand.
- Creates a `playwright.config.ts` only if you pass `--playwright` and there is none.

Then install the reporter package itself, with the repo's own package manager:

```bash
pnpm add -D @bugmojo/playwright-reporter     # or npm i -D / yarn add -D
```

Confirm the result by reading `playwright.config.*` back. The reporter must be in the
`reporter` array *and* the three `use` settings must be present — without them a failure
records a status and no evidence, which is the failure mode this whole product exists to
prevent.

## 6. Optional: Playwright's own agents

If the repo uses Playwright ≥ 1.56 and the user wants Playwright's Planner/Generator/Healer
loop alongside BugMojo's:

```bash
npx playwright init-agents --loop=claude
```

This writes Playwright's agent definitions and the `playwright-test` MCP server config into
the repo. It is complementary, not a competitor: Playwright's agents drive the browser;
BugMojo keeps the versioned plan, the review queue, the evidence and the report. The
`/bugmojo:generate-tests` skill uses that MCP server for live selector grounding when it is
present. Ask before running it — it writes files.

## 7. Prove it, end to end

Do not tell the user "setup complete" off the back of a config file. Prove each connection:

1. `whoami` → user + workspace (already done in step 1).
2. `get_project_test_context` with the project key → returns without error.
3. `list_test_cases` or `list_bugs` → the tools an agent will actually use answer.
4. If there is any spec at all, run the smallest one and check the run lands:
   ```bash
   npx playwright test --grep @smoke --reporter=list
   ```
   With the reporter configured and the key exported, a run appears in BugMojo and the
   plugin's PostToolUse hook stays quiet. Without them, the hook tells you exactly what is
   missing — read its message; it is the checklist.

## 8. Hand off

Close with a short report:

- Workspace, role, project key.
- Which of the four connections are live, and what is still missing (be specific: "no API
  key exported yet", not "mostly set up").
- The next skill: `/bugmojo:plan-tests` for a repo with no plan, `/bugmojo:generate-tests`
  for one that has a plan but gaps, `/bugmojo:fix-bug <KEY>` if they came here with a bug.

## Guardrails

- Never write a secret to a file in the repo, and never print one back.
- Never claim a connection works without the call that proves it.
- `npx @bugmojo/cli init` is idempotent — if the user is unsure whether it ran, run it
  again rather than hand-editing a managed block.
- If a tool returns a typed error (`needs_auth`, `paywall`, `not_in_plan`, `forbidden`),
  branch on the **code**, never on the message text, and surface paywall/permission errors
  to the user instead of retrying.
