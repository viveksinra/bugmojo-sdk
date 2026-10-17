// ---------------------------------------------------------------------------
// What this session has run, and whether BugMojo heard about it.
// ---------------------------------------------------------------------------
//
// The Stop hook can only ask "did you prove it?" if something remembered the
// run. That memory lives in the OS temp directory, keyed by session id — NEVER
// in the user's repository. A plugin that drops state files into a customer's
// working tree is a plugin that shows up in their next `git status`, and this
// one records test runs for a living.
//
// The pure half (empty/add/pending) is unit tested; the I/O half is three lines
// of fs with every failure swallowed, because a hook that throws is a hook that
// interrupts someone's session.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export const STATE_VERSION = 1;
/** A session that ran 50 test commands does not need the first 30 remembered. */
export const MAX_RUNS = 20;

/** Recording states a run can be in, most to least proven. */
export const RUN_STATES = ['RECORDED', 'SELF_RECORDING', 'PENDING', 'FAILED'];

/**
 * One remembered test run.
 *
 * @typedef {object} RunEntry
 * @property {string} [at]        ISO timestamp, stamped on append
 * @property {string} [command]   the Bash command that ran it
 * @property {string} [status]    one of RUN_STATES
 * @property {string} [via]       what recorded it (reporter / cli / hook / none)
 * @property {string} [run_id]
 * @property {string} [external_run_id] idempotency key, so a Stop-hook retry
 *   completes THIS run instead of creating a second one
 * @property {string} [report_path]     the Playwright JSON report to re-send
 * @property {string} [url]
 * @property {object} [stats]
 * @property {string} [error]
 * @property {boolean} [warned]   the Stop hook already mentioned it
 */

/**
 * @typedef {object} HookState
 * @property {number} [version]
 * @property {string|null} [session_id]
 * @property {string|null} [cwd]
 * @property {RunEntry[]} runs
 * @property {string} [updated_at]
 * @property {boolean} [claim_warned]
 */

export function stateDir() {
  return join(tmpdir(), 'bugmojo-claude-plugin');
}

/** Session-scoped: what Stop asks about. */
export function sessionStatePath(sessionId) {
  const id = String(sessionId ?? 'unknown').replace(/[^A-Za-z0-9_-]/g, '');
  return join(stateDir(), `session-${id || 'unknown'}.json`);
}

/** Repo-scoped: what SessionStart reads to say "since your last run". */
export function repoStatePath(cwd) {
  const hash = createHash('sha256').update(String(cwd ?? '')).digest('hex').slice(0, 16);
  return join(stateDir(), `repo-${hash}.json`);
}

/** @returns {HookState} */
export function emptyState(sessionId, cwd) {
  return { version: STATE_VERSION, session_id: sessionId ?? null, cwd: cwd ?? null, runs: [] };
}

/**
 * Append a run, newest last, capped. Returns a NEW state (no mutation).
 * @param {HookState|undefined} state
 * @param {RunEntry} run
 * @returns {HookState}
 */
export function addRun(state, run) {
  const base = state && Array.isArray(state.runs) ? state : emptyState(state?.session_id, state?.cwd);
  const runs = [...base.runs, { at: new Date().toISOString(), ...run }].slice(-MAX_RUNS);
  return { ...base, version: STATE_VERSION, runs, updated_at: new Date().toISOString() };
}

/**
 * Runs that executed tests but were never recorded anywhere.
 * @returns {RunEntry[]}
 */
export function pendingRuns(state) {
  /** @type {RunEntry[]} */
  const runs = state && Array.isArray(state.runs) ? state.runs : [];
  return runs.filter((r) => r && (r.status === 'PENDING' || r.status === 'FAILED'));
}

/**
 * The most recent run of any kind.
 * @returns {RunEntry|undefined}
 */
export function lastRun(state) {
  /** @type {RunEntry[]} */
  const runs = state && Array.isArray(state.runs) ? state.runs : [];
  return runs.length ? runs[runs.length - 1] : undefined;
}

/**
 * Runs BugMojo has a record of, for the "since your last run" line.
 * @returns {RunEntry[]}
 */
export function recordedRuns(state) {
  /** @type {RunEntry[]} */
  const runs = state && Array.isArray(state.runs) ? state.runs : [];
  return runs.filter((r) => r && (r.status === 'RECORDED' || r.status === 'SELF_RECORDING'));
}

// ── I/O (never throws) ──────────────────────────────────────────────────────

/** @returns {HookState|undefined} */
export function readState(path) {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return parsed && typeof parsed === 'object' ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function writeState(path, state) {
  try {
    mkdirSync(stateDir(), { recursive: true });
    writeFileSync(path, `${JSON.stringify(state, null, 2)}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}
