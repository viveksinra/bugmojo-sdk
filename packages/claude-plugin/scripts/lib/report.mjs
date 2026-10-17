// ---------------------------------------------------------------------------
// Playwright JSON report -> the /api/v1/runs/results wire body. PURE.
// ---------------------------------------------------------------------------
//
// This is the FALLBACK path. When `@bugmojo/playwright-reporter` is configured
// the reporter posts richer data (evidence bytes included) and this file never
// runs. It exists for the repo that has not wired the reporter yet: the agent
// runs `npx playwright test`, Playwright leaves a JSON report behind, and the
// PostToolUse hook turns it into a recorded run so the session still ends with
// proof.
//
// It records STATUSES ONLY. Attachment bytes are not uploaded here — that needs
// the presigned-slot round trip the reporter owns — but the attachment manifest
// is sent so the run shows which artifacts exist on disk, and the hook tells the
// agent how to get real evidence in (wire the reporter, re-run).
//
// Playwright's JSON shape: suites -> (suites) -> specs -> tests -> results.
// `test.status` is the ROLLED-UP verdict ('expected' | 'unexpected' | 'flaky' |
// 'skipped'); `results[]` is one entry per ATTEMPT. We report the rollup and
// take timing, errors and attachments from the LAST attempt.

/** BugMojo RUN_RESULT_STATUSES, mirrored by name (no workspace import). */
export const WIRE_STATUSES = ['PASS', 'FAIL', 'BLOCKED', 'SKIPPED'];

/**
 * One row of `results[]` in the POST /api/v1/runs/results body. Mirrors the
 * server's `resultSchema` by name — the server validates; this is a map, not a
 * second source of truth.
 *
 * @typedef {object} WireResult
 * @property {string} title
 * @property {string} file
 * @property {string} status
 * @property {number} [line]
 * @property {string} [project]
 * @property {boolean} [flaky]
 * @property {number} [duration_ms]
 * @property {number} [retries]
 * @property {string} [error]
 * @property {{ type: string, description?: string }[]} [annotations]
 * @property {{ name?: string, path?: string, content_type?: string }[]} [attachments]
 */

/**
 * @typedef {object} WireBody
 * @property {string} [project_key]
 * @property {string} runner
 * @property {string} client
 * @property {WireResult[]} results
 * @property {string} [external_run_id]
 * @property {string} [suite_name]
 * @property {string} [commit_sha]
 * @property {string} [deploy_url]
 * @property {string} [environment]
 * @property {string} [plan_version_id]
 * @property {string} [playwright_version]
 * @property {string} [started_at]
 * @property {number} [duration_ms]
 * @property {boolean} [create_missing_cases]
 */

const MAX_ERROR_CHARS = 5000;
const MAX_RESULTS = 500;

/** ANSI colour codes, so a stored error is readable in the dashboard. */
const ANSI = new RegExp(String.fromCharCode(27) + '\\[[0-9;]*m', 'g');

function lastAttempt(test) {
  const results = Array.isArray(test?.results) ? test.results : [];
  return results.length ? results[results.length - 1] : undefined;
}

/** Playwright's rolled-up test status -> a BugMojo result status. */
export function wireStatus(test) {
  const status = test?.status;
  if (status === 'skipped') return 'SKIPPED';
  if (status === 'expected' || status === 'flaky') return 'PASS';
  if (status === 'unexpected') {
    // An interrupted attempt is not a failing assertion — the run was cut off,
    // which is BLOCKED, not a defect signal.
    return lastAttempt(test)?.status === 'interrupted' ? 'BLOCKED' : 'FAIL';
  }
  return 'BLOCKED';
}

function cleanText(value, max = MAX_ERROR_CHARS) {
  if (typeof value !== 'string') return undefined;
  const text = value.replace(ANSI, '').trim();
  if (!text) return undefined;
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function errorFrom(test) {
  const last = lastAttempt(test);
  const errors = Array.isArray(last?.errors) ? last.errors : [];
  const first = errors.find((e) => e && (e.message || e.value));
  return cleanText(first?.message ?? first?.value ?? last?.error?.message);
}

function attachmentsFrom(test) {
  const last = lastAttempt(test);
  const list = Array.isArray(last?.attachments) ? last.attachments : [];
  /** @type {NonNullable<WireResult['attachments']>} */
  const out = [];
  for (const a of list) {
    if (!a || (!a.path && !a.name)) continue;
    const entry = {};
    if (typeof a.name === 'string') entry.name = a.name.slice(0, 500);
    if (typeof a.path === 'string') entry.path = a.path.slice(0, 2000);
    if (typeof a.contentType === 'string') entry.content_type = a.contentType.slice(0, 200);
    out.push(entry);
    if (out.length >= 100) break;
  }
  return out;
}

function annotationsFrom(test, spec) {
  const raw = [
    ...(Array.isArray(test?.annotations) ? test.annotations : []),
    ...(Array.isArray(spec?.annotations) ? spec.annotations : []),
  ];
  const seen = new Set();
  /** @type {NonNullable<WireResult['annotations']>} */
  const out = [];
  for (const a of raw) {
    if (!a || typeof a.type !== 'string' || !a.type) continue;
    const key = `${a.type}::${a.description ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = { type: a.type.slice(0, 200) };
    if (typeof a.description === 'string') entry.description = a.description.slice(0, 2000);
    out.push(entry);
    if (out.length >= 50) break;
  }
  return out;
}

/**
 * Depth-first walk of the suite tree, yielding every spec with the describe
 * titles above it. The top suite of a file is titled with the file path, so it
 * contributes nothing to the test title — only nested describes do.
 */
export function flattenSpecs(suites, trail = []) {
  /** @type {{ spec: any, suite: any, trail: string[] }[]} */
  const out = [];
  for (const suite of Array.isArray(suites) ? suites : []) {
    if (!suite) continue;
    const isFileSuite = typeof suite.file === 'string' && suite.title === suite.file;
    const nextTrail = isFileSuite || !suite.title ? trail : [...trail, suite.title];
    for (const spec of Array.isArray(suite.specs) ? suite.specs : []) {
      if (spec) out.push({ spec, suite, trail: nextTrail });
    }
    out.push(...flattenSpecs(suite.suites, nextTrail));
  }
  return out;
}

/**
 * One wire result per (spec x project). Playwright emits one `test` per project
 * a spec ran in; BugMojo keys a result on the case, so the project name rides
 * along in `project` and stays out of the title.
 */
export function toWireResults(report) {
  /** @type {WireResult[]} */
  const out = [];
  for (const { spec, suite, trail } of flattenSpecs(report?.suites)) {
    const rawFile =
      typeof spec.file === 'string' ? spec.file : typeof suite.file === 'string' ? suite.file : '';
    const title = [...trail, spec.title].filter(Boolean).join(' > ');
    if (!rawFile || !title) continue;
    const file = rawFile.split(String.fromCharCode(92)).join('/').slice(0, 2000);
    for (const test of Array.isArray(spec.tests) ? spec.tests : []) {
      if (!test) continue;
      const last = lastAttempt(test);
      const attempts = Array.isArray(test.results) ? test.results.length : 0;
      /** @type {WireResult} */
      const result = { title: title.slice(0, 500), file, status: wireStatus(test) };
      if (typeof spec.line === 'number' && spec.line > 0) result.line = spec.line;
      if (typeof test.projectName === 'string' && test.projectName) {
        result.project = test.projectName.slice(0, 200);
      }
      if (test.status === 'flaky') result.flaky = true;
      if (typeof last?.duration === 'number' && last.duration >= 0) result.duration_ms = last.duration;
      if (attempts > 1) result.retries = attempts - 1;
      const error = errorFrom(test);
      if (error) result.error = error;
      const annotations = annotationsFrom(test, spec);
      if (annotations.length) result.annotations = annotations;
      const attachments = attachmentsFrom(test);
      if (attachments.length) result.attachments = attachments;
      out.push(result);
      if (out.length >= MAX_RESULTS) return out;
    }
  }
  return out;
}

/** Pass/fail tallies for the line the hook shows the agent. */
export function summarize(results) {
  const stats = { total: 0, passed: 0, failed: 0, blocked: 0, skipped: 0, flaky: 0 };
  for (const r of Array.isArray(results) ? results : []) {
    stats.total += 1;
    if (r.status === 'PASS') stats.passed += 1;
    else if (r.status === 'FAIL') stats.failed += 1;
    else if (r.status === 'BLOCKED') stats.blocked += 1;
    else if (r.status === 'SKIPPED') stats.skipped += 1;
    if (r.flaky) stats.flaky += 1;
  }
  return stats;
}

/**
 * The full POST body, or undefined when the report held no tests.
 *
 * `external_run_id` is the idempotency key: the same report posted twice (a hook
 * retry, or the agent re-running the recorder) updates ONE run.
 */
export function buildRunResultsBody(report, options = {}) {
  const results = toWireResults(report);
  if (!results.length) return undefined;
  /** @type {WireBody} */
  const body = {
    project_key: options.project,
    runner: options.runner ?? 'LOCAL',
    client: 'CLAUDE_CODE',
    results,
  };
  if (options.externalRunId) body.external_run_id = String(options.externalRunId).slice(0, 200);
  if (options.suiteName) body.suite_name = String(options.suiteName).slice(0, 200);
  if (options.commitSha) body.commit_sha = String(options.commitSha).slice(0, 100);
  if (options.deployUrl) body.deploy_url = String(options.deployUrl).slice(0, 2000);
  if (options.environment) body.environment = String(options.environment).slice(0, 100);
  if (options.planVersionId) body.plan_version_id = String(options.planVersionId).slice(0, 64);
  const version = report?.config?.version;
  if (typeof version === 'string' && version) body.playwright_version = version.slice(0, 50);
  const startTime = report?.stats?.startTime;
  if (typeof startTime === 'string' && startTime) body.started_at = startTime;
  const duration = report?.stats?.duration;
  if (typeof duration === 'number' && duration >= 0) body.duration_ms = duration;
  // A spec with no BugMojo case must NOT silently mint one from a hook: the
  // review queue is a human surface. The reporter — which the user opted into
  // by editing playwright.config — is the path allowed to create cases.
  body.create_missing_cases = options.createMissingCases === true;
  return body;
}
