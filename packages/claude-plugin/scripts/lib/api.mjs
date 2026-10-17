// ---------------------------------------------------------------------------
// The thinnest possible BugMojo REST client for hooks. NEVER THROWS.
// ---------------------------------------------------------------------------
//
// Hooks run on someone's session start and after their test command. They get a
// short timeout and they swallow everything: no BugMojo outage, expired key or
// offline laptop may ever stall or break a session. Every call returns a plain
// { ok, status, data, error } — callers branch on `ok`, never on a throw.
//
// Why REST and not MCP: the plugin's MCP connection is OAuth (browser login) and
// belongs to the agent, not to a detached hook process. /api/v1 takes the same
// bm_key_ bearer token the reporter and CLI already use. When the hosted MCP
// grows an API-key path this can move over.

export const DEFAULT_TIMEOUT_MS = 4000;

/** `fetch` with a hard deadline and no unhandled rejection, ever. */
export async function apiFetch(url, options = {}) {
  const { apiKey, method = 'GET', body, timeoutMs = DEFAULT_TIMEOUT_MS, fetchImpl } = options;
  const doFetch = fetchImpl ?? globalThis.fetch;
  if (typeof doFetch !== 'function') {
    return { ok: false, status: 0, error: 'fetch is unavailable in this Node runtime' };
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const headers = { Accept: 'application/json' };
    if (apiKey) headers.Authorization = `Bearer ${apiKey}`;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await doFetch(url, {
      method,
      headers,
      signal: controller.signal,
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    let data;
    try {
      data = await res.json();
    } catch {
      data = undefined;
    }
    if (!res.ok) {
      const message =
        (data && (data.error?.message ?? data.error ?? data.message)) ?? `HTTP ${res.status}`;
      return { ok: false, status: res.status, data, error: String(message).slice(0, 300) };
    }
    return { ok: true, status: res.status, data };
  } catch (err) {
    const aborted = err && (err.name === 'AbortError' || err.name === 'TimeoutError');
    return {
      ok: false,
      status: 0,
      error: aborted ? `timed out after ${timeoutMs}ms` : String(err?.message ?? err).slice(0, 300),
    };
  } finally {
    clearTimeout(timer);
  }
}

/** GET /api/v1/bugs — open work for the injected context block. */
export async function listBugs(config, params = {}, options = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') query.set(key, String(value));
  }
  const url = `${config.apiUrl}/api/v1/bugs${query.size ? `?${query.toString()}` : ''}`;
  return apiFetch(url, { apiKey: config.apiKey, ...options });
}

/** POST /api/v1/runs/results — the PostToolUse auto-record. */
export async function recordRunResults(config, body, options = {}) {
  return apiFetch(`${config.apiUrl}/api/v1/runs/results`, {
    apiKey: config.apiKey,
    method: 'POST',
    body,
    timeoutMs: options.timeoutMs ?? 15000,
    ...options,
  });
}
