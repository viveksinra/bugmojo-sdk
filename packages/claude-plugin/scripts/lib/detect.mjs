// ---------------------------------------------------------------------------
// "Did this Bash call run Playwright, and will BugMojo hear about it?" PURE.
// ---------------------------------------------------------------------------
//
// The PostToolUse hook sees one string: the command the agent ran. Everything
// downstream (auto-record, the Stop-hook proof-of-work check) hangs off reading
// that string correctly, so the parsing lives here, away from I/O, and is unit
// tested against the shapes agents actually type.
//
// Deliberately NOT matched: `playwright install`, `show-report`, `codegen`,
// `--list` and `--help` (nothing was executed), and `playwright-core`. A false
// positive is worse than a miss — it makes the Stop hook nag about a run that
// never happened.

/** Split a shell line into the segments that could each be a command. */
export function splitCommandSegments(command) {
  const text = typeof command === 'string' ? command : '';
  const segments = [];
  let current = '';
  let quote = null;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quote) {
      current += ch;
      if (ch === quote && text.charCodeAt(i - 1) !== 92) quote = null;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }
    const two = text.slice(i, i + 2);
    if (two === '&&' || two === '||') {
      segments.push(current);
      current = '';
      i += 1;
      continue;
    }
    if (ch === ';' || ch === '\n' || ch === '|' || ch === '&') {
      segments.push(current);
      current = '';
      continue;
    }
    current += ch;
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter(Boolean);
}

const NON_RUN_SUBCOMMANDS = ['install', 'install-deps', 'show-report', 'codegen', 'open', 'merge-reports', 'init-agents', 'clear-cache'];

/** Does ONE segment invoke `playwright test`? */
export function isPlaywrightTestSegment(segment) {
  const s = (segment ?? '').trim();
  if (!s) return false;
  // `playwright` as a word, optionally scoped (@playwright/test) or via a runner.
  if (!/(^|[\s/"'=])(npx\s+|pnpm\s+(exec\s+|dlx\s+|run\s+)?|yarn\s+(dlx\s+|run\s+)?|bunx\s+|npm\s+exec\s+--\s+)?(@playwright\/test|playwright)(\s|$)/.test(s)) {
    return false;
  }
  if (/playwright-core/.test(s)) return false;
  if (/(^|\s)--(help|list|version)(\s|=|$)/.test(s)) return false;
  if (/(^|\s)-(h|V)(\s|$)/.test(s)) return false;
  const after = s.split(/(?:@playwright\/test|playwright)\s+/).slice(1).join(' ');
  if (!after) return false;
  const sub = after.trim().split(/\s+/)[0];
  if (NON_RUN_SUBCOMMANDS.includes(sub)) return false;
  return sub === 'test' || sub.startsWith('-');
}

/** Does ONE segment invoke the BugMojo CLI's self-recording run? */
export function isBugmojoRunSegment(segment) {
  const s = (segment ?? '').trim();
  if (!/(^|[\s/"'])(npx\s+(-y\s+)?|pnpm\s+(exec\s+|dlx\s+)?|yarn\s+dlx\s+|bunx\s+)?(@bugmojo\/cli|bugmojo)(\s|$)/.test(s)) {
    return false;
  }
  const after = s.split(/(?:@bugmojo\/cli|bugmojo)\s+/).slice(1).join(' ');
  const sub = after.trim().split(/\s+/)[0];
  return sub === 'run';
}

/**
 * `npm run test:e2e` -> the script body from package.json.
 *
 * Most repos never type `npx playwright test`; they type the script that wraps
 * it. Without this the hook would miss the majority of real runs — and a missed
 * run is a session that ends with an unproven "tests pass".
 */
export function expandScriptCommands(segment, scripts = {}) {
  const s = (segment ?? '').trim();
  const match = s.match(
    /(?:^|\s)(?:npm|pnpm|yarn|bun)\s+(?:run\s+|run-script\s+)?([A-Za-z0-9:_@./-]+)(?:\s|$)/,
  );
  if (!match) return [];
  const name = match[1];
  if (['run', 'exec', 'dlx', 'install', 'add', 'test'].includes(name) && !scripts[name]) return [];
  const body = scripts[name];
  if (typeof body !== 'string' || !body.trim()) return [];
  // One level only: a script that calls another script is rare, and recursion
  // here would be an easy way to hang a hook on a cyclic package.json.
  return splitCommandSegments(body);
}

/**
 * Classify a Bash command for the PostToolUse hook.
 *
 * `selfRecording` means the command already posts its own results, so the hook
 * must not double-record and the Stop hook must not nag.
 *
 * Pass `scripts` (package.json "scripts") to see through `npm run <name>`.
 */
export function classifyCommand(command, scripts) {
  const direct = splitCommandSegments(command);
  const expanded = scripts
    ? direct.flatMap((s) => expandScriptCommands(s, scripts))
    : [];
  const segments = [...direct, ...expanded];
  const playwright = segments.filter(isPlaywrightTestSegment);
  const bugmojo = segments.filter(isBugmojoRunSegment);
  return {
    segments,
    ranPlaywright: playwright.length > 0,
    selfRecording: bugmojo.length > 0,
    matched: [...playwright, ...bugmojo],
    /** `--reporter=json` style overrides suppress a configured reporter list. */
    reporterOverridden: playwright.some((s) => /(^|\s)--reporter[= ]/.test(s)),
  };
}

/** Is `@bugmojo/playwright-reporter` wired into this playwright.config source? */
export function reporterConfigured(source) {
  const text = typeof source === 'string' ? source : '';
  if (!text) return false;
  // Ignore the line only if it is commented out on its own line.
  return text
    .split(/\r?\n/)
    .filter((line) => !/^\s*(\/\/|\*|#)/.test(line))
    .some((line) => line.includes('@bugmojo/playwright-reporter'));
}

/**
 * Where a JSON report would land, if the config asks for one:
 * `['json', { outputFile: 'test-results/report.json' }]`.
 */
export function jsonReportOutputFile(source) {
  const text = typeof source === 'string' ? source : '';
  const match = text.match(/outputFile\s*:\s*['"`]([^'"`]+)['"`]/);
  return match ? match[1] : undefined;
}

/** `PLAYWRIGHT_JSON_OUTPUT_NAME=x npx playwright test --reporter=json` */
export function jsonReportFromCommand(command) {
  const segments = splitCommandSegments(command);
  for (const segment of segments) {
    if (!isPlaywrightTestSegment(segment)) continue;
    const env = segment.match(/PLAYWRIGHT_JSON_OUTPUT_NAME=(?:['"])?([^\s'"]+)/);
    if (env) return env[1];
    const flag = segment.match(/--output[= ](?:['"])?([^\s'"]+)/);
    if (flag && /--reporter[= ]['"]?json/.test(segment)) return flag[1];
  }
  return undefined;
}
