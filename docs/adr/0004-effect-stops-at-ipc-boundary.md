# Effect stops at the IPC boundary: hybrid Effect + TanStack, not full-Effect

Effect lives in `core` and `main` (the typed git engine + IPC handlers); the renderer is **100% React + TanStack Router/Query/DB** and receives only plain data. We deliberately do **not** go full-Effect on the renderer (`@effect-atom/atom-react`).

Rationale: a git UI's data — normalized entities with many derived/joined/filtered views and large virtualized lists — is *made* for TanStack DB's collections + incremental live queries. An atom system is reactive cells, **not** a relational store, so full-Effect would mean hand-rolling the UI data layer and dropping TanStack DB. Learning **both**, each where it is the best tool, is an explicit goal of the project.

## Considered options

- **Full-Effect renderer / `@effect-atom/atom-react`** (the t3code approach) — rejected. Single-paradigm and a better pure-Effect exercise, but it drops TanStack DB and hand-rolls the UI data layer. t3code goes full-Effect because it shares a `client-runtime` across web + mobile + desktop streamed from a remote server — a pressure gitoui (a single local app) does not have.

## Consequences / accepted trade-offs

- The renderer loses Effect's *compiler-tracked* error channel. Mitigated by a **contract-derived typed query helper** (`useGitQuery`) + a **`matchError`** helper keyed by `_tag`: errors stay typed (asserted, not tracked — an accepted papercut), with exhaustive handling.
- Feeding a TanStack DB collection from a live stream needs a bit of glue — a handful of subscriptions writing snapshots into manually-driven collections (watched entities), while on-demand entities stay query-backed.
- We would flip to full-Effect if a shared remote/web/mobile dimension appears, or if the goal shifts to "Effect as deep as possible, TanStack secondary".
