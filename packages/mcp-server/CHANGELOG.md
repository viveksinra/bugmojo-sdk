# Changelog

All notable changes to `@bugmojo/mcp-server` are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.2.1] - 2026-07-24

### Changed

- Repository, issues, license, and documentation links now point to the public
  SDK docs repo (https://github.com/viveksinra/bugmojo-sdk). No code changes.

## [0.2.0] - 2026-07-24

### Changed

- Trimmed the tool surface to the six tools backed by real `/api/v1/bugs` REST
  endpoints: `list_bugs`, `get_bug`, `search_bugs`, `create_bug`, `update_bug`,
  and `add_comment`. Regression-suite and agent-task tools were removed because
  their REST endpoints do not exist (every call returned 404). That
  functionality lives on the hosted OAuth MCP endpoint at
  `https://www.bugmojo.com/api/mcp`.
- Request/response field names now match the real `/api/v1` contract
  (camelCase query/body params, `q` for search, `{ data, pagination }` list
  envelope).
- `BUGMOJO_API_URL` now defaults to `https://www.bugmojo.com`
  (was `http://localhost:3000`). Only set it for self-hosted or local
  instances.

### Fixed

- The `bugmojo-mcp` bin now uses a dedicated `dist/cli.js` entry that starts
  the server unconditionally. Previously the entry guarded startup behind a
  `process.argv[1]` path check that never matched the symlinked
  `node_modules/.bin` shim npm creates on macOS/Linux, so `npx
  @bugmojo/mcp-server` exited silently there.

## [0.1.0] (internal — never published to npm)

### Added

- Initial release: stdio MCP server that connects AI coding agents to BugMojo
  bug tracking via an API key (`bm_key_` prefix), exposing bug read/write
  tools over the BugMojo REST API.
