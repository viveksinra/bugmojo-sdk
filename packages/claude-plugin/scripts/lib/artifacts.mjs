// ---------------------------------------------------------------------------
// Finding the JSON report Playwright just wrote.
// ---------------------------------------------------------------------------
//
// The auto-record fallback needs a machine-readable report. Playwright writes
// one only when a `json` reporter is configured (or `--reporter=json` was
// passed), and where it lands is configurable, so we look in the places it can
// be, newest first, and only accept a file that was written during THIS run.
//
// The freshness window is the whole safety story: without it, a repo with a
// stale `test-results/results.json` from last Tuesday would get re-recorded on
// every `npx playwright test` that fails to produce one.

import { existsSync, readFileSync, statSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';

/** Conventional locations, in the order Playwright's own docs use them. */
export const DEFAULT_REPORT_CANDIDATES = [
  'test-results/results.json',
  'test-results.json',
  'playwright-report/results.json',
  'playwright-report.json',
  'results.json',
];

/** Everything worth stat-ing, most specific first, de-duplicated. PURE. */
export function reportCandidates({ configured, fromCommand, fromEnv } = {}) {
  const ordered = [fromCommand, fromEnv, configured, ...DEFAULT_REPORT_CANDIDATES];
  const seen = new Set();
  const out = [];
  for (const candidate of ordered) {
    if (typeof candidate !== 'string' || !candidate.trim()) continue;
    const value = candidate.trim();
    if (seen.has(value)) continue;
    seen.add(value);
    out.push(value);
  }
  return out;
}

/**
 * The newest candidate modified within `maxAgeMs`, or undefined.
 * `now` and `stat` are injectable so the choice is unit testable without a clock.
 */
export function pickFreshest(candidates, options = {}) {
  const { cwd = process.cwd(), maxAgeMs = 15 * 60 * 1000, now = Date.now(), stat } = options;
  const statFn =
    stat ??
    ((path) => {
      try {
        return statSync(path).mtimeMs;
      } catch {
        return undefined;
      }
    });
  let best;
  for (const candidate of candidates) {
    const path = isAbsolute(candidate) ? candidate : join(cwd, candidate);
    const mtime = statFn(path);
    if (typeof mtime !== 'number') continue;
    if (now - mtime > maxAgeMs) continue;
    if (!best || mtime > best.mtime) best = { path, mtime };
  }
  return best;
}

/** Parse a report file. Returns undefined for anything that is not one. */
export function readReport(path) {
  try {
    if (!existsSync(path)) return undefined;
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (!parsed || typeof parsed !== 'object') return undefined;
    // A Playwright JSON report always has `suites`; a coverage or tsconfig file
    // that happens to sit at results.json does not.
    return Array.isArray(parsed.suites) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** package.json "scripts", so the detector can see through `npm run e2e`. */
export function readPackageScripts(cwd) {
  try {
    const parsed = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8'));
    const scripts = parsed?.scripts;
    return scripts && typeof scripts === 'object' ? scripts : {};
  } catch {
    return {};
  }
}
