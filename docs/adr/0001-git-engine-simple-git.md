# Git engine: shell out to the system `git` via `simple-git`

`@gitoui/core` executes git by spawning the user's **system `git` binary** through `simple-git`, rather than reimplementing git in-process. This inherits the user's entire environment for free — `~/.gitconfig`, credential helpers (macOS Keychain…), SSH remotes, GPG/SSH commit signing, hooks, aliases — which is the whole point of a GitKraken-style client: operate on the user's real repos exactly as their CLI would.

## Considered options

- **`isomorphic-git`** (pure JS) — rejected. HTTP-only (no SSH remotes), no credential-helper/Keychain integration, no commit signing, doesn't run hooks, partial feature set, slower on large repos (pure-JS pack decompression). It would also force rebuilding auth/SSH/signing by hand — for a *less* capable client. (Notably, it does not even improve cancellation: killing a child process is a cleaner interrupt than a cooperative pure-JS abort.)
- **`nodegit`** (libgit2 bindings) — rejected. Painful native compilation, and still would not transparently reuse the system git config / credential helpers the way invoking real `git` does.

## Consequences

- Depends on a `git` binary being installed — acceptable, the target users are developers.
- Long operations (clone/fetch/pull/push) are made interruptible via a signal-aware `runGit` primitive that maps Effect fiber interruption to `simple-git`'s `AbortSignal`, killing the child process.
