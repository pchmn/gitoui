# Review handshake over localhost HTTP

A **Review** (see `CONTEXT.md`) is requested from *outside* gitoui — typically by a skill running
in an agent session that wants a human to inspect the agent's changes and get Annotations back.
gitoui has no external entry point today (no CLI, no protocol handler, no single-instance lock),
so the handshake needed a transport built from scratch. We decided the **main process runs a
localhost HTTP server**: the skill `POST`s a review request (`repoPath` + an explicit `base`
commit-ish it computed itself), receives a review id, and polls `GET` until the Review resolves to
`submitted` (Verdict + Annotations) or `dismissed`. The server binds `127.0.0.1` only; its port and
a bearer token live in a `0600` discovery file under the app's data directory, which is also how a
client knows gitoui is running.

## Considered options

- **Handoff files in `/tmp`** (the initial sketch) — the skill drops a request file, gitoui watches
  the directory and writes a result file back. Rejected: no acknowledgement that gitoui saw the
  request, orphan-file cleanup, atomic-write races, and `/tmp` is world-readable and periodically
  purged on macOS. The polling loop survives in the HTTP design, but against an endpoint that can
  say "no such review" instead of silence.
- **A `gitoui` CLI + unix socket** (`gitoui review --base <sha> --wait` printing the result on
  stdout) — the nicest caller DX, rejected for v1: it adds a CLI binary, PATH installation, and a
  socket protocol on top of the same server-side state. The HTTP server does not preclude adding
  this later as a thin client.
- **An embedded MCP server** — the most agent-native, rejected for v1: it forces MCP configuration
  onto every calling session for what is one request/response pair. An MCP facade can be layered
  over the same HTTP server later without changing the review state machine.

## Consequences

- gitoui's main process owns network surface for the first time. Mitigations: loopback-only bind,
  token auth from the discovery file, and the server exposes only the review endpoints.
- The request/response schemas belong in `@gitoui/contracts` like every other boundary — the HTTP
  envelope follows the same schema-SSOT discipline as the IPC registry (ADR-0003).
- Reviews are ephemeral and single-flight: one active Review at a time, a second request is
  refused; `pending → submitted | dismissed`, nothing persisted. Dismiss is explicit (closing
  Review mode or quitting the app dismisses); callers keep their own timeout for the crash case.
- The caller owns the base: gitoui resolves and validates the commit-ish but never guesses where
  the agent's work started.
