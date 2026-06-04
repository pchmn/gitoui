# IPC: a home-made Effect-Schema registry, not `@effect/rpc` or `electron-trpc`

The renderer talks to the main process through a small **home-made IPC registry** (`makeIpcMethod` / `makeIpcSubscription`) driven by a **schema-only `@gitoui/contracts`** package — Effect `Schema` as the single source of truth for each method's payload / success / error. This buys types-from-schema, **runtime validation at the boundary**, **typed tagged errors**, and Effect handlers — on **stable Effect (v3)**, with no transport library to adopt.

## Considered options

- **`@effect/rpc` over IPC** (option A) — rejected. On stable v3 it is a separate dependency *plus* an IPC transport adapter to build: `@effect/rpc` ships Socket/HTTP/Worker protocols, so over Electron we would hand-write an RPC-protocol-over-`ipcMain`/`ipcRenderer` adapter — more plumbing and magic than the ~50-line `makeIpcMethod`, and we would lose the explicit `Exit → plain data` control (the 3-case envelope, Style-A throw) we designed. Migration stays possible later (e.g. if a remote/server dimension appears) and `contracts` is reused as-is, so this choice does not lock us in.
- **Manual bridge without schema** (option C) — rejected: simpler at first, but no runtime validation, no structured typed errors, no clean subscriptions; undersells the "learn Effect" goal.
- **`electron-trpc`** — rejected: same downside as A (extra dependency + magic).

## How it works (the genuinely net-new part)

t3code — our reference — does **not** run git over its IPC layer; it runs git over a WebSocket RPC server because it has a remote dimension. We have none, so we extend the home-made-IPC idea to cover git + streaming ourselves:

- **Request/response**: `makeIpcMethod` decodes the payload, runs the Effect handler, encodes the success, and `runPromiseExit` turns the `Exit` into a **3-case plain-data envelope** — `Success` / `Failure` (typed tagged error) / `Defect` (unexpected crash, kept *distinct* from business errors). It never throws across the bridge; the preload wrapper re-throws the typed error so it flows into TanStack Query/DB (renderer narrows by `_tag`).
- **Streaming**: `makeIpcSubscription` pipes an Effect `Stream` to `webContents.send`, with teardown on explicit unsubscribe, window `destroyed`, **and** renderer reload (HMR).

## Consequences

- The `Exit → plain data` serialization and the subscription/teardown machinery are **ours to build and test** — they do not exist in t3code's IPC layer (its typed-error serialization lives in the WebSocket `rpc` layer).
