// ---------------------------------------------------------------------------
// stdin / stdout plumbing shared by the three hooks.
// ---------------------------------------------------------------------------
//
// Claude Code hands a hook one JSON object on stdin and reads at most one JSON
// object back on stdout. Anything else it sees (a stack trace, a stray log line)
// is noise in the user's session, so every helper here fails into silence.

/** Read and parse the hook payload. Returns {} on anything unexpected. */
export async function readStdinJson(timeoutMs = 2000) {
  try {
    const chunks = [];
    const stdin = process.stdin;
    if (stdin.isTTY) return {};
    const timer = setTimeout(() => stdin.destroy(), timeoutMs);
    try {
      for await (const chunk of stdin) chunks.push(chunk);
    } finally {
      clearTimeout(timer);
    }
    const text = Buffer.concat(chunks).toString('utf8').trim();
    if (!text) return {};
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

/** Write the single JSON response and exit 0. */
export function emit(payload) {
  try {
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } catch {
    /* a closed stdout is not our problem to report */
  }
  process.exitCode = 0;
}

/** Say nothing, change nothing, succeed. */
export function exitQuiet() {
  process.exitCode = 0;
}

/**
 * Block the event and tell the model why.
 *
 * Claude Code has two ways to say "no" from a hook, and they are not equal:
 *
 *   • exit code 2 — the documented blocking exit. STDERR is fed back to the
 *     model automatically, whatever the client's JSON support looks like.
 *   • `{"decision":"block","reason":…}` on stdout with exit 0 — the structured
 *     form, which a client has to parse.
 *
 * We do BOTH, deliberately. The exit code is what actually blocks (and is the
 * only thing older clients honour); the JSON is emitted alongside so a client
 * that reads structured output shows the SAME reason rather than a bare
 * "hook failed". The reason text is written once and used for both, so the two
 * channels can never disagree.
 */
export function blockWithReason(reason, payload = {}) {
  try {
    process.stdout.write(`${JSON.stringify({ decision: 'block', reason, ...payload })}\n`);
  } catch {
    /* a closed stdout is not our problem to report */
  }
  try {
    process.stderr.write(`${reason}\n`);
  } catch {
    /* nor a closed stderr */
  }
  process.exitCode = 2;
}

/**
 * The last `bytes` of a file, split into whole lines.
 *
 * A long session's transcript is megabytes of JSONL; the Stop hook only cares
 * about what was said recently, and reading the tail keeps it O(1). The first
 * line of the window is dropped because it is almost certainly a fragment.
 */
export async function readTail(path, bytes = 256 * 1024) {
  if (!path) return [];
  try {
    const { open, stat } = await import('node:fs/promises');
    const info = await stat(path);
    const start = Math.max(0, info.size - bytes);
    const handle = await open(path, 'r');
    try {
      const length = info.size - start;
      if (length <= 0) return [];
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      const lines = buffer.toString('utf8').split('\n');
      if (start > 0) lines.shift();
      return lines.filter((line) => line.trim());
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

/** Context the agent should see, without a decision attached. */
export function emitContext(hookEventName, additionalContext) {
  if (!additionalContext) return exitQuiet();
  return emit({ hookSpecificOutput: { hookEventName, additionalContext } });
}
