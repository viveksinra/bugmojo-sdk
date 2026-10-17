// ---------------------------------------------------------------------------
// The block SessionStart injects. PURE — string in, string out.
// ---------------------------------------------------------------------------
//
// The idea: an agent uses what is
// already in front of it. It is also paid for on EVERY session, so the budget is
// about twenty lines. Rules of thumb applied here:
//
//   * Facts first, instructions second. Counts and names the agent cannot get
//     for free, then the one tool call that gets the rest.
//   * Never fabricate. Anything we could not fetch is simply absent — there is
//     no "0 open bugs" line when the API was unreachable.
//   * Point at the next action, not at the product.

/** Cap: a project with 300 open bugs still gets three lines here. */
const MAX_BUGS_LISTED = 3;

function bugLine(bug) {
  const key = bug.key ?? bug.id;
  const title = String(bug.title ?? '').trim();
  const short = title.length > 60 ? `${title.slice(0, 59)}…` : title;
  const priority = bug.priority ? ` [${bug.priority}]` : '';
  return `${key}${priority} ${short}`.trim();
}

/**
 * @param {object} input
 * @param {string} [input.project]        BUGMOJO_PROJECT, e.g. "WEB"
 * @param {string} [input.credentialHint] why the API was not called
 * @param {object} [input.repo]           inspectRepo() output
 * @param {object} [input.bugs]           { total, items[], byPriority }
 * @param {object[]} [input.pending]      unrecorded runs from this repo
 * @param {string} [input.apiError]       the API call failed, in one phrase
 */
export function renderSessionContext(input = {}) {
  const { project, credentialHint, repo, bugs, pending = [], apiError } = input;
  const lines = [];

  lines.push('## BugMojo — the test plan and the proof');
  lines.push('');
  lines.push(
    'This repo is wired to BugMojo (MCP server `bugmojo`). Before any testing work — writing tests, ' +
      'running them, judging whether something is covered — call `get_project_test_context` first: it ' +
      'returns this project’s conventions, selector hints, known flaky patterns, plan versions and recent failures.',
  );
  lines.push('');

  // ── Facts ────────────────────────────────────────────────────────────────
  const facts = [];
  if (project) facts.push(`Project key: \`${project}\`.`);
  if (bugs && typeof bugs.total === 'number') {
    const detail = bugs.items?.length
      ? ` Top: ${bugs.items.slice(0, MAX_BUGS_LISTED).map(bugLine).join('; ')}.`
      : '';
    facts.push(
      `${bugs.total} OPEN bug${bugs.total === 1 ? '' : 's'} visible to this API key ` +
        `(workspace-wide unless the key is project-scoped).${detail} ` +
        'Use `list_bugs` / `my_assigned_bugs` over MCP for the full, correctly scoped picture.',
    );
  }
  if (repo) {
    if (repo.playwrightConfig) {
      facts.push(
        repo.reporterConfigured
          ? `\`@bugmojo/playwright-reporter\` is configured in \`${repo.playwrightConfig}\` — a \`npx playwright test\` run records itself, with trace/video evidence.`
          : `\`${repo.playwrightConfig}\` exists but does NOT list \`@bugmojo/playwright-reporter\`, so test runs leave no evidence in BugMojo. Fix with \`npx @bugmojo/cli init\`.`,
      );
    }
    if (repo.specs?.total) {
      facts.push(
        `${repo.specs.total} spec file${repo.specs.total === 1 ? '' : 's'} under ${repo.specs.dirs.join(', ') || 'the test dirs'}; ` +
          `${repo.specs.mapped} carry a BugMojo case reference. Unmapped specs record as unlinked results.`,
      );
    }
  }
  if (pending.length) {
    const last = pending[pending.length - 1];
    facts.push(
      `UNRECORDED RUN: \`${String(last.command ?? 'playwright test').slice(0, 80)}\` ran in this repo and its results never reached BugMojo. ` +
        'Record it (`npx @bugmojo/cli run`) or re-run with the reporter configured before claiming anything passes.',
    );
  }
  if (apiError) {
    facts.push(`BugMojo API not reachable from the session hook (${apiError}) — the MCP tools are unaffected.`);
  } else if (credentialHint && !project) {
    facts.push(
      `No local BugMojo credentials (${credentialHint}), so this block shows repo signals only. ` +
        'The MCP tools still work over OAuth; set `BUGMOJO_API_KEY` + `BUGMOJO_PROJECT` to record runs from the CLI or the reporter.',
    );
  }

  for (const fact of facts) lines.push(`- ${fact}`);

  // ── Rules ────────────────────────────────────────────────────────────────
  lines.push('');
  lines.push('Rules that apply for the whole session:');
  lines.push(
    '1. Never claim tests pass without a RECORDED run. "I ran it and it was green" is not evidence; a BugMojo run with results is.',
  );
  lines.push(
    '2. New test cases are PROPOSED, not accepted — `propose_test_cases` puts them in the human review queue. Classify honestly: OTP/2FA, CAPTCHA, real payments, email/SMS delivery, visual judgment and hardware stay MANUAL with a reason code.',
  );
  lines.push(
    '3. Map specs to cases with `test.info().annotations.push({ type: "bugmojo", description: "WEB-42" })` — it survives a file rename; the file-name convention does not.',
  );
  lines.push('');
  lines.push(
    'Skills: `/bugmojo:plan-tests` (interview → plan version), `/bugmojo:generate-tests` (cases + specs), ' +
      '`/bugmojo:run` (run + record), `/bugmojo:assign`, `/bugmojo:report`, `/bugmojo:fix-bug <KEY>`, `/bugmojo:triage-bugs`.',
  );

  return lines.join('\n');
}

/** Shape the /api/v1/bugs payload into what the block needs. Pure. */
export function summarizeBugs(payload) {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.issues)
      ? payload.issues
      : Array.isArray(payload)
        ? payload
        : [];
  const items = rows
    .map((row) => ({
      key: row?.key ?? (row?.project?.key && row?.number ? `${row.project.key}-${row.number}` : row?.id),
      title: row?.title,
      priority: row?.priority,
      status: row?.status,
    }))
    .filter((row) => row.key);
  const order = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  items.sort((a, b) => (order[a.priority] ?? 9) - (order[b.priority] ?? 9));
  const total =
    typeof payload?.pagination?.total === 'number'
      ? payload.pagination.total
      : typeof payload?.total === 'number'
        ? payload.total
        : items.length;
  return { total, items };
}
