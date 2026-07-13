# Author avatars resolve from public GitHub identifiers only — author emails never leave the machine

The Commit graph shows the author's **real GitHub profile photo** when the commit *publicly*
implies one, in two tiers:

1. **Noreply email** — `12345+octocat@users.noreply.github.com` (or the legacy
   `octocat@users.noreply.github.com`) carries the **public username** (and usually the account
   id, preferred since it survives renames). A certain match.
2. **Author name as username** — when the email reveals nothing but the author *name* has the
   exact shape of a GitHub username (strict: alphanumeric + single hyphens, 1–39 chars — an
   ordinary display name like "Ada Lovelace" never matches), try
   `avatars.githubusercontent.com/<name>`: git `user.name` and the GitHub login are the same
   string for many developers, and a miss 404s back to the initials. A **guess** — a name that
   collides with someone else's login shows the wrong photo; accepted, since the alternative
   (an email-based lookup) is the thing this ADR forbids.

Either way, only strings **already public in the rendered graph** (username, author name) reach
the network. Every other author keeps the initials `IdentityAvatar`. A commit author's real
email address — or any hash of it — is **never sent to any third party**.

## Considered options

- **Gravatar fallback for non-noreply emails** (the GitKraken/Tower combo) — rejected: it sends
  a hash of *every author's* email in *every opened repository* to a third party, without those
  authors' consent, for low coverage among developers. The privacy cost is per-author, not
  per-user, so a user-facing opt-in doesn't cure it.
- **GitHub API lookup for regular emails** (commit-search → account) — rejected: needs an
  authenticated token, is rate-limited, and sends the email to GitHub for authors who chose NOT
  to expose their account in their commits.
- **Initials only (status quo)** — rejected as the sole rendering: the photo is
  GitKraken-familiar, answers "who" faster than a colored initial, and the noreply case covers
  most GitHub-centric repos at zero privacy cost.

## Consequences

- A graph mixes photos and initials (not every author resolves). Accepted — standard in the
  category, and the initials circle stays the universal fallback (offline, deleted account,
  non-GitHub forges).
- The initials render underneath and the photo paints over on load, so rows never flash an
  empty circle; failed URLs are remembered per session so virtualized remounts don't re-fire
  dead requests.
- A future forge **integration** (authenticated GitHub/GitLab account) may supply avatars for
  regular emails through its own API; that supersedes this ADR's scope, not its principle:
  resolving an avatar must never leak an email the author didn't already publish.
