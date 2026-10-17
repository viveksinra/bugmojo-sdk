// ---------------------------------------------------------------------------
// Local signals: what does THIS repository already have wired to BugMojo?
// ---------------------------------------------------------------------------
//
// Everything here is cheap, offline and best-effort. It answers the three
// questions the injected context block is actually useful for:
//
//   1. Is `@bugmojo/playwright-reporter` configured? (If not, a run proves
//      nothing and the agent should say so before it claims a pass.)
//   2. Where do specs live, and how many carry a BugMojo case reference?
//   3. What did the last `npx playwright test` in this repo do?
//
// The scan is bounded (one directory level of config candidates, a capped spec
// walk) because it runs on every session start.

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { jsonReportOutputFile, reporterConfigured } from './detect.mjs';

export const PLAYWRIGHT_CONFIG_CANDIDATES = [
  'playwright.config.ts',
  'playwright.config.mts',
  'playwright.config.cts',
  'playwright.config.js',
  'playwright.config.mjs',
  'playwright.config.cjs',
];

export const SPEC_DIR_CANDIDATES = ['tests/bugmojo', 'tests', 'e2e', 'tests/e2e', 'playwright'];

/** Cap the walk: a monorepo with 4k specs must not slow down session start. */
const MAX_SPEC_FILES = 400;
const MAX_WALK_DEPTH = 4;
const SPEC_FILE = /\.(spec|test)\.[cm]?[jt]sx?$/i;

function readTextSafe(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return undefined;
  }
}

/** The first playwright.config.* that exists, with its source. */
export function findPlaywrightConfig(cwd) {
  for (const name of PLAYWRIGHT_CONFIG_CANDIDATES) {
    const path = join(cwd, name);
    if (!existsSync(path)) continue;
    const source = readTextSafe(path);
    if (source === undefined) continue;
    return {
      file: name,
      path,
      source,
      reporter: reporterConfigured(source),
      jsonOutputFile: jsonReportOutputFile(source),
    };
  }
  return undefined;
}

function walkSpecs(dir, depth, acc) {
  if (acc.length >= MAX_SPEC_FILES || depth > MAX_WALK_DEPTH) return acc;
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const entry of entries) {
    if (acc.length >= MAX_SPEC_FILES) break;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walkSpecs(full, depth + 1, acc);
    else if (SPEC_FILE.test(entry.name)) acc.push(full);
  }
  return acc;
}

/** `WEB-42` — a project key, a dash, a number (the reporter's CASE_KEY_PATTERN). */
const CASE_KEY = /[A-Z][A-Z0-9]{0,19}-\d+/;
const ANNOTATION = /annotations\s*\.\s*push\s*\(|type:\s*['"`]bugmojo/;

/**
 * Count the specs that a BugMojo run could map to a case: a `bugmojo`
 * annotation, a `[WEB-42]` title marker, or the `tests/bugmojo/WEB-42.spec.ts`
 * file-name convention.
 */
export function scanSpecs(cwd) {
  const dirs = SPEC_DIR_CANDIDATES.map((d) => join(cwd, d)).filter((d) => {
    try {
      return statSync(d).isDirectory();
    } catch {
      return false;
    }
  });
  const seen = new Set();
  const files = [];
  for (const dir of dirs) {
    for (const file of walkSpecs(dir, 0, [])) {
      if (seen.has(file)) continue;
      seen.add(file);
      files.push(file);
    }
  }
  let mapped = 0;
  for (const file of files) {
    const rel = relative(cwd, file).split(String.fromCharCode(92)).join('/');
    const base = rel.split('/').pop() ?? '';
    if (CASE_KEY.test(base)) {
      mapped += 1;
      continue;
    }
    const source = readTextSafe(file);
    if (!source) continue;
    if (ANNOTATION.test(source) || /\[[A-Z][A-Z0-9]{0,19}-\d+\]/.test(source)) mapped += 1;
  }
  return {
    dirs: dirs.map((d) => relative(cwd, d).split(String.fromCharCode(92)).join('/')),
    total: files.length,
    mapped,
    truncated: files.length >= MAX_SPEC_FILES,
  };
}

/** Everything the SessionStart block needs from disk, in one call. */
export function inspectRepo(cwd) {
  const config = findPlaywrightConfig(cwd);
  return {
    playwrightConfig: config?.file,
    reporterConfigured: config?.reporter ?? false,
    jsonOutputFile: config?.jsonOutputFile,
    specs: scanSpecs(cwd),
  };
}
