#!/usr/bin/env node
// ---------------------------------------------------------------------------
// SessionStart — put BugMojo in front of the agent before it needs asking.
// ---------------------------------------------------------------------------
//
// Prints one JSON object on stdout:
//   {"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"…"}}
//
// Contract with the rest of the plugin:
//   * It NEVER fails a session. Every path ends in exit 0, and a thrown error
//     prints nothing at all rather than a stack trace into someone's context.
//   * It is fast. One optional HTTP call with a 4s deadline, a bounded spec
//     scan, and nothing else.
//   * It never invents a number. A count appears only if we actually read it.
//
// Turn it off with BUGMOJO_HOOKS=off; keep it offline with
// BUGMOJO_SESSION_CONTEXT=off (local repo signals only, no network).

import { readStdinJson, emit, exitQuiet } from './lib/io.mjs';
import { resolveHookConfig } from './lib/config.mjs';
import { inspectRepo } from './lib/repo.mjs';
import { listBugs } from './lib/api.mjs';
import { renderSessionContext, summarizeBugs } from './lib/context.mjs';
import { pendingRuns, readState, repoStatePath } from './lib/state.mjs';

async function main() {
  const input = await readStdinJson();
  const config = resolveHookConfig(process.env);
  if (!config.enabled) return exitQuiet();

  const cwd = input.cwd || process.cwd();
  const repo = inspectRepo(cwd);
  const pending = pendingRuns(readState(repoStatePath(cwd)));

  let bugs;
  let apiError;
  if (config.credentialed && config.sessionContext) {
    const res = await listBugs(config, { status: 'OPEN', limit: 5 });
    if (res.ok) bugs = summarizeBugs(res.data);
    else apiError = res.error;
  }

  // Nothing local, nothing remote, nothing pending: still worth the four lines
  // that tell the agent which tool to call first — that IS the point of the hook.
  const additionalContext = renderSessionContext({
    project: config.project,
    credentialHint: config.credentialHint,
    repo,
    bugs,
    pending,
    apiError,
  });

  emit({
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext,
    },
  });
}

main().catch(() => exitQuiet());
