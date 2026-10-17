#!/usr/bin/env node
// ---------------------------------------------------------------------------
// PostToolUse(Bash) — a test run that nobody recorded did not happen.
// ---------------------------------------------------------------------------
//
// Fires after every Bash call; does nothing unless that call ran tests. When it
// did, one of four things is true, and the hook says which:
//
//   1. `@bugmojo/playwright-reporter` is configured AND credentialed — the run
//      recorded itself, with trace/video evidence. Nothing to do; remember it.
//   2. The BugMojo CLI ran it (`bugmojo run`) — same.
//   3. No reporter, but Playwright left a JSON report behind — POST it to
//      /api/v1/runs/results so the statuses at least exist, and tell the agent
//      how to get real evidence next time.
//   4. Nothing recordable — mark the run PENDING so the Stop hook can object
//      if the session goes on to claim a pass.
//
// Cases 3 and 4 both remember the report path and the run id they would have
// used, because the Stop hook retries them once on a short deadline before it
// objects: a run that failed on a transient 502 here should not cost the user a
// blocked session at the end.
//
// It never blocks the tool call and never fails the session.

import { readStdinJson, emit, exitQuiet } from './lib/io.mjs';
import { resolveHookConfig } from './lib/config.mjs';
import { classifyCommand, jsonReportFromCommand } from './lib/detect.mjs';
import { findPlaywrightConfig } from './lib/repo.mjs';
import { pickFreshest, readPackageScripts, readReport, reportCandidates } from './lib/artifacts.mjs';
import { buildRunResultsBody, summarize } from './lib/report.mjs';
import { recordRunResults } from './lib/api.mjs';
import { addRun, readState, repoStatePath, sessionStatePath, writeState } from './lib/state.mjs';

/** Remember one run in both the session ledger and the repo ledger. */
function remember(sessionId, cwd, run) {
  for (const path of [sessionStatePath(sessionId), repoStatePath(cwd)]) {
    const next = addRun(readState(path) ?? { session_id: sessionId, cwd, runs: [] }, run);
    writeState(path, next);
  }
}

function runIdentity(input, command) {
  const stamp = new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
  const session = String(input.session_id ?? 'session').slice(0, 24);
  return `claude-${session}-${stamp}-${command.length}`;
}

async function main() {
  const input = await readStdinJson();
  const config = resolveHookConfig(process.env);
  if (!config.enabled) return exitQuiet();
  if (input.tool_name && input.tool_name !== 'Bash') return exitQuiet();

  const command = String(input.tool_input?.command ?? '');
  if (!command) return exitQuiet();

  const cwd = input.cwd || process.cwd();
  const verdict = classifyCommand(command, readPackageScripts(cwd));
  if (!verdict.ranPlaywright && !verdict.selfRecording) return exitQuiet();

  const sessionId = input.session_id;

  // ── 2. The CLI already recorded it ────────────────────────────────────────
  if (verdict.selfRecording && !verdict.ranPlaywright) {
    remember(sessionId, cwd, { command, status: 'SELF_RECORDING', via: 'bugmojo-cli' });
    return exitQuiet();
  }

  const pw = findPlaywrightConfig(cwd);
  const reporterActive = !!pw?.reporter && !verdict.reporterOverridden;

  // ── 1. The reporter recorded it ───────────────────────────────────────────
  if (reporterActive && config.credentialed) {
    remember(sessionId, cwd, { command, status: 'SELF_RECORDING', via: 'playwright-reporter' });
    return exitQuiet();
  }

  // ── 3. Auto-record from the JSON report ───────────────────────────────────
  const candidates = reportCandidates({
    configured: pw?.jsonOutputFile,
    fromCommand: jsonReportFromCommand(command),
    fromEnv: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME,
  });
  const freshest = pickFreshest(candidates, { cwd });
  const report = freshest ? readReport(freshest.path) : undefined;

  // Remembered on every outcome below, so the Stop hook's last-chance retry
  // can re-send THIS report under THIS run id — a retry that minted a
  // fresh id would land as a second run rather than completing the first.
  const externalRunId = runIdentity(input, command);
  const reportPath = freshest?.path;

  if (report && config.credentialed) {
    const body = buildRunResultsBody(report, {
      project: config.project,
      runner: 'LOCAL',
      externalRunId,
      commitSha: process.env.BUGMOJO_COMMIT_SHA,
      deployUrl: process.env.BUGMOJO_DEPLOY_URL ?? process.env.PLAYWRIGHT_BASE_URL,
      environment: process.env.BUGMOJO_ENVIRONMENT,
      planVersionId: process.env.BUGMOJO_PLAN_VERSION,
    });
    if (body) {
      const res = await recordRunResults(config, body);
      const stats = summarize(body.results);
      if (res.ok) {
        const url = res.data?.url;
        remember(sessionId, cwd, {
          command,
          status: 'RECORDED',
          via: 'post-tool-use-hook',
          run_id: res.data?.run_id,
          external_run_id: externalRunId,
          report_path: reportPath,
          url,
          stats,
        });
        return emit({
          hookSpecificOutput: {
            hookEventName: 'PostToolUse',
            additionalContext:
              `BugMojo recorded this run from the Playwright JSON report: ${stats.passed} passed, ` +
              `${stats.failed} failed, ${stats.skipped} skipped${url ? ` — ${url}` : ''}. ` +
              'Statuses only: no trace, video or screenshot was uploaded, because ' +
              '`@bugmojo/playwright-reporter` is not configured in this repo. Run `npx @bugmojo/cli init` ' +
              'to wire it, then re-run to attach real evidence. For each FAIL, call `create_bug_from_result` ' +
              'rather than opening a bug by hand — it copies the evidence and compiles a repro.',
          },
        });
      }
      remember(sessionId, cwd, {
        command,
        status: 'FAILED',
        via: 'post-tool-use-hook',
        external_run_id: externalRunId,
        report_path: reportPath,
        error: res.error,
        stats,
      });
      return emit({
        hookSpecificOutput: {
          hookEventName: 'PostToolUse',
          additionalContext:
            `BugMojo could not record this run (${res.error}). The results are NOT in BugMojo. ` +
            'Do not report the suite as verified until they are — retry with `npx @bugmojo/cli run`, ' +
            'or record them over MCP with `record_run_results`.',
        },
      });
    }
  }

  // ── 4. Nothing recordable ─────────────────────────────────────────────────
  // `report_path` is remembered even here: a report that appears late (or
  // credentials that arrive mid-session) makes this run retryable at Stop.
  remember(sessionId, cwd, {
    command,
    status: 'PENDING',
    via: 'none',
    external_run_id: externalRunId,
    report_path: reportPath,
  });

  const reasons = [];
  if (!pw) reasons.push('no playwright.config.* was found in the working directory');
  else if (!pw.reporter) reasons.push('`@bugmojo/playwright-reporter` is not in the `reporter` list');
  else if (verdict.reporterOverridden) reasons.push('`--reporter=` on the command line replaced the configured reporters');
  if (!config.credentialed) reasons.push(`the hook has no BugMojo credentials (${config.credentialHint})`);
  if (!report) reasons.push('no fresh Playwright JSON report was found to fall back on');

  return emit({
    hookSpecificOutput: {
      hookEventName: 'PostToolUse',
      additionalContext:
        'This test run was NOT recorded in BugMojo, so it is not evidence of anything: ' +
        `${reasons.join('; ')}. Fix it before reporting a result — \`npx @bugmojo/cli init\` wires ` +
        '`@bugmojo/playwright-reporter` (trace, video and screenshots retained on failure) and ' +
        '`npx @bugmojo/cli run` records a run in one command. If you cannot record it, say plainly ' +
        'that the run is unverified rather than reporting it as passing.',
    },
  });
}

main().catch(() => exitQuiet());
