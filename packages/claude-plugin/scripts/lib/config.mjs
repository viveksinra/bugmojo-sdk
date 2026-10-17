// ---------------------------------------------------------------------------
// Hook configuration, resolved from the environment. PURE.
// ---------------------------------------------------------------------------
//
// The hooks NEVER read a secret from disk and never take one on argv (argv is
// world-readable in a process list). They read the same variables the rest of
// the BugMojo toolchain already uses, so a repo that is set up for
// `@bugmojo/playwright-reporter` or `npx @bugmojo/cli run` is set up for the
// hooks too, with nothing extra to configure:
//
//   BUGMOJO_API_KEY | BUGMOJO_API_TOKEN   bm_key_… (Settings -> API Keys)
//   BUGMOJO_PROJECT                       project key, e.g. WEB
//   BUGMOJO_API_URL                       base URL (default www.bugmojo.com)
//   BUGMOJO_HOOKS=off                     disable every BugMojo hook
//   BUGMOJO_SESSION_CONTEXT=off           keep SessionStart offline (local
//                                         signals only, no network call)
//   BUGMOJO_PROOF_OF_WORK=block|warn|off  Stop-hook strictness (default warn)
//   BUGMOJO_ALLOW_UNVERIFIED=1            one-shot escape hatch: let THIS
//                                         session end with an unrecorded run,
//                                         whatever BUGMOJO_PROOF_OF_WORK says
//   BUGMOJO_HOOK_TIMEOUT_MS               per-call network deadline (default
//                                         4000, clamped to 500..15000)
//
// The escape hatch is not a courtesy. A blocking hook with no documented way
// out is a hook that gets ripped out of settings.json at the worst possible
// moment, so the block message itself names the variable — see
// `stop-proof-of-work.mjs`.
//
// The plugin's MCP connection authenticates with OAuth, NOT with this key: the
// hosted /api/mcp endpoint has no API-key path yet.
// Hooks are plain processes with no MCP client, so they use the REST API, which
// does take a bm_key_ bearer token. Without a key the hooks still run — they
// just fall back to purely local signals instead of going quiet.

export const DEFAULT_API_URL = 'https://www.bugmojo.com';
export const API_KEY_PREFIX = 'bm_key_';

/** Trim to a non-empty string, or undefined. */
function str(value) {
  const v = typeof value === 'string' ? value.trim() : '';
  // An unsubstituted ${user_config.x} placeholder means "not configured".
  if (!v || v.startsWith('${')) return undefined;
  return v;
}

function flag(value, fallback) {
  const v = (str(value) ?? '').toLowerCase();
  if (!v) return fallback;
  return !['off', 'false', '0', 'no'].includes(v);
}

/** Normalize a base URL: trim, drop trailing slashes. */
export function normalizeApiUrl(raw) {
  const v = str(raw);
  if (!v) return DEFAULT_API_URL;
  return v.replace(/\/+$/, '');
}

/**
 * Resolve everything a hook needs from `env`.
 *
 * `credentialed` is the only gate that matters for a network call: a key that
 * does not start with bm_key_ is a paste error, and calling with it would just
 * earn a 401 on every session start.
 */
export function resolveHookConfig(env = {}) {
  const apiKey = str(env.BUGMOJO_API_KEY) ?? str(env.BUGMOJO_API_TOKEN);
  const project = str(env.BUGMOJO_PROJECT);
  const apiUrl = normalizeApiUrl(env.BUGMOJO_API_URL);
  const keyLooksValid = !!apiKey && apiKey.startsWith(API_KEY_PREFIX);

  const proofRaw = (str(env.BUGMOJO_PROOF_OF_WORK) ?? 'warn').toLowerCase();
  const proofOfWork = ['block', 'warn', 'off'].includes(proofRaw) ? proofRaw : 'warn';

  // The escape hatch. Truthy in the shell sense: `1`, `true`, `yes`, `on`.
  const overrideRaw = (str(env.BUGMOJO_ALLOW_UNVERIFIED) ?? '').toLowerCase();
  const allowUnverified = ['1', 'true', 'yes', 'on'].includes(overrideRaw);

  // Every hook network call is bounded by this. Clamped rather than trusted:
  // `BUGMOJO_HOOK_TIMEOUT_MS=600000` in someone's shell profile would turn a
  // BugMojo outage into a ten-minute stall at the end of every session.
  const timeoutRaw = Number.parseInt(str(env.BUGMOJO_HOOK_TIMEOUT_MS) ?? '', 10);
  const timeoutMs = Number.isFinite(timeoutRaw) ? Math.min(15000, Math.max(500, timeoutRaw)) : 4000;

  return {
    apiKey: keyLooksValid ? apiKey : undefined,
    apiUrl,
    project,
    enabled: flag(env.BUGMOJO_HOOKS, true),
    sessionContext: flag(env.BUGMOJO_SESSION_CONTEXT, true),
    proofOfWork,
    /** `BUGMOJO_ALLOW_UNVERIFIED` — this session may end unproven, on purpose. */
    allowUnverified,
    /** Hard per-call deadline for any hook network request, in ms. */
    timeoutMs,
    /** Enough to talk to /api/v1 for this project. */
    credentialed: keyLooksValid && !!project,
    /** Why we cannot call the API, for the injected context block. */
    credentialHint: keyLooksValid
      ? project
        ? undefined
        : 'BUGMOJO_PROJECT is not set'
      : apiKey
        ? `BUGMOJO_API_KEY does not start with ${API_KEY_PREFIX}`
        : 'BUGMOJO_API_KEY is not set',
  };
}
