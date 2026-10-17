#!/usr/bin/env node
/**
 * SessionStart hook — inject the BugMojo working agreement into the agent's
 * context, once, at zero token cost to every later turn.
 *
 * It deliberately makes NO network call and reads NO credentials: a hook that
 * can fail is a hook that breaks a customer's first session. It prints a short
 * block on stdout (every host that supports command hooks appends stdout to the
 * session context) and always exits 0.
 *
 * The two lines that matter are the annotation convention (survives a file
 * rename, unlike the file-name convention) and "call get_project_test_context
 * first" (it returns the project's conventions + selector hints, so the agent
 * does not invent a house style).
 */
const CONTEXT = `<bugmojo-session-context>
BugMojo MCP is connected as \`bugmojo\`. It is the system of record for bugs, test
plans and test runs in this workspace.

- Before proposing or writing ANY test, call \`get_project_test_context\` once. It
  returns the project's conventions, selector hints and open coverage gaps.
- A bug key looks like \`WEB-42\`. Pass it straight to \`get_bug\`; call
  \`get_repro_pack\` before you start reading source — it compiles the recorded
  session into a runnable spec.
- Link a Playwright test to a BugMojo case with an annotation, not a filename:
  \`test.info().annotations.push({ type: 'bugmojo', description: 'WEB-42' })\`
- Results and evidence are recorded by \`@bugmojo/playwright-reporter\`, or over
  MCP with \`record_run_results\` + \`upload_evidence\`. Never hand-write a pass.
- If a \`bugmojo\` tool returns \`needs_auth\`, tell the user to re-authenticate.
  Never fabricate bug, run or coverage data.
</bugmojo-session-context>`;

process.stdout.write(CONTEXT + '\n');
process.exit(0);
