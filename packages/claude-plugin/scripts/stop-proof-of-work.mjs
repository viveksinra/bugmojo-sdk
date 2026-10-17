#!/usr/bin/env node
// ---------------------------------------------------------------------------
// Stop — proof of work.
// ---------------------------------------------------------------------------
//
// The complaint this exists for: an agent says "all tests pass", nobody ran
// anything, and the human finds out in production. A session may end having run
// no tests at all — that is fine. What it may not do is end with a test run
// nothing recorded, or with a claim of a green suite and no run behind it.
//
// THE ORDER OF OPERATIONS MATTERS, so it is stated once, here:
//
//   1. `stop_hook_active` — Claude Code's own re-entry flag. Honoured
//      absolutely. Blocking from inside a block is how you build a loop.
//   2. `BUGMOJO_ALLOW_UNVERIFIED=1` — the documented escape hatch. Someone who
//      has said "yes, I know, let me out" is let out, silently.
//   3. LAST-CHANCE RECORD. A run the PostToolUse hook could not record (the
//      JSON report landed late, BugMojo returned a 502) gets one more attempt
//      here, on a short deadline. A run that records itself at this point is
//      not a gap, and the session ends quietly.
//   4. FAIL OPEN. If that attempt failed for a NETWORK reason, the session is
//      never blocked. A BugMojo outage must not be able to wedge someone's
//      session — the gate degrades to a warning that says so.
//   5. Block or warn on what is genuinely unproven.
//
// Default strictness is WARN, not block. The heuristics read English, and a
// plugin that traps people in their own session is a plugin that gets
// uninstalled. Teams that want the gate set BUGMOJO_PROOF_OF_WORK=block;
// BUGMOJO_PROOF_OF_WORK=off silences it entirely.
//
// Two guards against nagging: `stop_hook_active` above, and every run is warned
// about at most once.

import { readStdinJson, readTail, emit, exitQuiet, blockWithReason } from './lib/io.mjs';
import { resolveHookConfig } from './lib/config.mjs';
import { findPassClaim } from './lib/transcript.mjs';
import { readReport } from './lib/artifacts.mjs';
import { buildRunResultsBody, summarize } from './lib/report.mjs';
import { recordRunResults } from './lib/api.mjs';
import {
  pendingRuns,
  readState,
  recordedRuns,
  sessionStatePath,
  writeState,
} from './lib/state.mjs';

/**
 * Wall-clock budget for the whole last-chance pass, however many runs are
 * pending. The hook's registered timeout is 15s; this stays far enough inside it
 * that the hook always gets to WRITE ITS ANSWER rather than being killed
 * mid-fetch, which would look to the user like the plugin hanging.
 */
export const RETRY_BUDGET_MS = 6000;

/** The env var a blocked session is told to set. Named in the message itself. */
const OVERRIDE_VAR = 'BUGMOJO_ALLOW_UNVERIFIED';

/** Mark the runs we are about to mention so the next Stop stays quiet. */
function markWarned(path, state, commands) {
  const set = new Set(commands);
  const runs = (state.runs ?? []).map((run) =>
    set.has(run.command) && (run.status === 'PENDING' || run.status === 'FAILED')
      ? { ...run, warned: true }
      : run,
  );
  writeState(path, { ...state, runs });
}

/** Replace one run entry in place, by command, and persist. */
function updateRun(path, state, command, patch) {
  const runs = (state.runs ?? []).map((run) => (run.command === command ? { ...run, ...patch } : run));
  const next = { ...state, runs };
  writeState(path, next);
  return next;
}

/**
 * One more attempt at recording a run the PostToolUse hook left unrecorded.
 *
 * Only runs that left a Playwright JSON report behind can be retried — without
 * one there is nothing to send, and inventing results would be the exact
 * dishonesty this hook exists to prevent.
 *
 * Returns `{ recorded, degraded }`: `degraded` means a call failed for a reason
 * that is about the NETWORK rather than about the run (a timeout, a 5xx, a
 * connection refused). That distinction is what step 4 above branches on — a
 * 401 is a configuration problem the user should hear about, an ECONNREFUSED is
 * BugMojo's problem and must not cost them their session.
 */
async function lastChanceRecord(config, path, state, runs) {
  let current = state;
  const recorded = [];
  let degraded = false;
  const deadline = Date.now() + RETRY_BUDGET_MS;

  for (const run of runs) {
    if (!config.credentialed || !run.report_path) continue;
    if (Date.now() >= deadline) {
      degraded = true;
      break;
    }

    const report = readReport(run.report_path);
    if (!report) continue;

    const body = buildRunResultsBody(report, {
      project: config.project,
      runner: 'LOCAL',
      externalRunId: run.external_run_id,
      commitSha: process.env.BUGMOJO_COMMIT_SHA,
      deployUrl: process.env.BUGMOJO_DEPLOY_URL ?? process.env.PLAYWRIGHT_BASE_URL,
      environment: process.env.BUGMOJO_ENVIRONMENT,
      planVersionId: process.env.BUGMOJO_PLAN_VERSION,
    });
    if (!body) continue;

    const res = await recordRunResults(config, body, {
      timeoutMs: Math.max(500, Math.min(config.timeoutMs, deadline - Date.now())),
    });

    if (res.ok) {
      current = updateRun(path, current, run.command, {
        status: 'RECORDED',
        via: 'stop-hook-retry',
        run_id: res.data?.run_id,
        url: res.data?.url,
        stats: summarize(body.results),
        error: undefined,
      });
      recorded.push(run.command);
      continue;
    }

    // A 4xx is about THIS request (bad key, unknown project) and is worth
    // saying out loud. A timeout, a 0 or a 5xx is BugMojo being unreachable.
    if (!res.status || res.status >= 500) degraded = true;
    current = updateRun(path, current, run.command, { error: res.error });
  }

  return { state: current, recorded, degraded };
}

function unrecordedReason(runs, options) {
  const list = runs
    .slice(-3)
    .map((r) => `\`${String(r.command ?? '').slice(0, 90)}\``)
    .join(', ');
  const one = runs.length === 1;
  const tail = options.blocking
    ? `If you genuinely cannot record ${one ? 'it' : 'them'} right now, re-run with ${OVERRIDE_VAR}=1 ` +
      'set — and say plainly in your summary that the run is unverified.'
    : `If you cannot record ${one ? 'it' : 'them'}, say plainly in your summary that the run is unverified ` +
      'rather than reporting it as passing.';

  return (
    `BugMojo proof-of-work: ${runs.length} test run${one ? '' : 's'} in this session ` +
    `(${list}) never reached BugMojo, so there is no evidence ${one ? 'it' : 'they'} happened. ` +
    `Before you finish: record ${one ? 'it' : 'them'} with \`npx @bugmojo/cli run\` (or ` +
    '`record_run_results` over MCP). If the suite is meant to record itself, `npx @bugmojo/cli init` ' +
    'wires `@bugmojo/playwright-reporter` with trace, video and screenshots retained on failure. ' +
    tail
  );
}

function unbackedClaimReason(claim, options) {
  const tail = options.blocking
    ? ` If you cannot run them now, correct the statement, or set ${OVERRIDE_VAR}=1 to end the session anyway.`
    : '';
  return (
    `BugMojo proof-of-work: this session states "${claim}" but no test run was recorded in BugMojo. ` +
    'Either run the tests with the BugMojo reporter configured (`npx @bugmojo/cli run`), or correct the ' +
    `statement — an unrecorded pass is a claim, not a result.${tail}`
  );
}

/** The warning shown when BugMojo could not be reached. Never blocks. */
function degradedReason(runs) {
  const one = runs.length === 1;
  return (
    `BugMojo proof-of-work: ${runs.length} test run${one ? '' : 's'} in this session could not be recorded — ` +
    'BugMojo was unreachable, so the gate is not enforcing. Nothing is blocked. Record ' +
    `${one ? 'it' : 'them'} with \`npx @bugmojo/cli run\` once you are back online, and until then treat the ` +
    'suite as unverified.'
  );
}

async function main() {
  const input = await readStdinJson();
  // Claude Code sets this when the session was already continued by a Stop
  // hook. Blocking again from here is how you build an infinite loop.
  if (input.stop_hook_active) return exitQuiet();

  const config = resolveHookConfig(process.env);
  if (!config.enabled || config.proofOfWork === 'off') return exitQuiet();
  // The documented escape hatch, honoured before anything is computed so it
  // also costs nothing: no state read, no network call, no delay.
  if (config.allowUnverified) return exitQuiet();

  const path = sessionStatePath(input.session_id);
  let state = readState(path);
  if (!state) return exitQuiet();

  let pending = pendingRuns(state).filter((run) => !run.warned);
  let degraded = false;

  if (pending.length) {
    const retry = await lastChanceRecord(config, path, state, pending);
    state = retry.state;
    degraded = retry.degraded;
    if (retry.recorded.length) {
      const done = new Set(retry.recorded);
      pending = pending.filter((run) => !done.has(run.command));
    }
  }

  const blocking = config.proofOfWork === 'block' && !degraded;
  let reason;

  if (pending.length) {
    reason = degraded ? degradedReason(pending) : unrecordedReason(pending, { blocking });
    markWarned(path, state, pending.map((r) => r.command));
  } else if (!recordedRuns(state).length && !state.claim_warned) {
    const claim = findPassClaim(await readTail(input.transcript_path));
    if (claim) {
      reason = unbackedClaimReason(claim, { blocking });
      writeState(path, { ...state, claim_warned: true });
    }
  }

  if (!reason) return exitQuiet();

  // `block` feeds the reason back to the model and keeps the turn going, so it
  // can fix the gap itself instead of handing the user a lecture. Exit code 2 is
  // what Claude Code reads; the JSON decision rides along for structured
  // clients (see `blockWithReason`).
  if (blocking) return blockWithReason(reason);
  return emit({ systemMessage: reason });
}

main().catch(() => exitQuiet());
