# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

This is a **single-context** repo: one `CONTEXT.md` and one `docs/adr/` at the repo root.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the domain glossary and project language.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

## File structure

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-git-engine-simple-git.md
│   ├── 0002-electron-over-tauri.md
│   ├── 0003-home-made-ipc-registry.md
│   └── 0004-effect-stops-at-ipc-boundary.md
└── (apps/ · packages/)
```

> If this repo ever splits into multiple bounded contexts (e.g. per-package domains), introduce a
> `CONTEXT-MAP.md` at the root pointing at one `CONTEXT.md` per context, with optional
> context-scoped `src/<context>/docs/adr/` directories — and update this file to match.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids (e.g. it's "Working tree", never "working directory").

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0004 (Effect stops at the IPC boundary) — but worth reopening because…_
