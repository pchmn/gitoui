import { IdentityAvatar } from '@gitoui/ui/identity-avatar';
import { useState } from 'react';

/**
 * GitHub noreply author emails, both formats (ADR 0014):
 *
 *   - `12345+octocat@users.noreply.github.com` — id + username (the format GitHub mints today)
 *   - `octocat@users.noreply.github.com`       — legacy, username only
 *
 * Username rules per GitHub: alphanumeric + hyphens, no leading/trailing/double hyphen isn't
 * worth policing here — the CDN 404s on anything invalid and the component falls back.
 * Anchored on the exact domain so a lookalike (`…github.com.evil.com`) never matches.
 */
const GITHUB_NOREPLY = /^(?:(\d+)\+)?([a-z\d-]{1,39})@users\.noreply\.github\.com$/i;

/**
 * A *strict* GitHub username shape, for the name-as-username guess: 1–39 chars, alphanumeric +
 * hyphens, no leading/trailing/double hyphen. Strict here (unlike the noreply regex, whose match
 * is already certain) so an ordinary display name ("Ada Lovelace", "paul.chemin") is never
 * mistaken for a username and fired at the CDN.
 */
const GITHUB_USERNAME = /^[a-z\d](?:-?[a-z\d]){0,38}$/i;

/** Rendered at `size-5` (20px); fetch 2× for Retina — GitHub's CDN scales to any `s`. */
const AVATAR_SIZE_PX = 40;

/**
 * The GitHub avatar URL an author *publicly* implies, or `null` (ADR 0014). Two tiers:
 *
 * 1. **Noreply email** — `…@users.noreply.github.com` carries the public username (and usually
 *    the account id — preferred, it survives renames). A certain match.
 * 2. **Author name as username** — when the email reveals nothing but the author *name* has the
 *    exact shape of a GitHub username (git `user.name` and the GitHub login are the same string
 *    for many developers), try it: a miss 404s back to the initials. A guess — a name that
 *    happens to collide with someone else's login shows the wrong photo, accepted as the cost
 *    of covering real-email authors without ever sending the email anywhere.
 *
 * Either way, only strings already public in the graph (username, author name) reach the
 * network. A real email address never leaves the machine in any form — no Gravatar-style hash
 * lookup; unresolved authors keep the initials `IdentityAvatar`.
 */
export function githubAvatarUrl(author: { name: string; email: string }): string | null {
  const noreply = GITHUB_NOREPLY.exec(author.email.trim());
  if (noreply !== null) {
    const [, id, login] = noreply;
    return id !== undefined
      ? `https://avatars.githubusercontent.com/u/${id}?s=${AVATAR_SIZE_PX}`
      : `https://avatars.githubusercontent.com/${login}?s=${AVATAR_SIZE_PX}`;
  }
  const name = author.name.trim();
  if (GITHUB_USERNAME.test(name)) {
    return `https://avatars.githubusercontent.com/${name}?s=${AVATAR_SIZE_PX}`;
  }
  return null;
}

/**
 * Avatar URLs that already 404'd or failed this session: virtualized rows remount constantly, and
 * without this every remount would re-fire the failing request (worst offline — one per visible
 * row per scroll). A failed URL falls back to initials instantly on remount; successes need no
 * bookkeeping, the browser's HTTP cache makes them free.
 */
const failedUrls = new Set<string>();

/**
 * A Commit author's avatar: the real GitHub profile photo when the author publicly implies one
 * (noreply email, or a name shaped like a username — see `githubAvatarUrl`), the initials
 * `IdentityAvatar` otherwise. The initials render first and the photo paints over them when it
 * arrives, so a row never shows an empty circle while the image loads — and an error (offline,
 * no such username, deleted account) simply leaves them showing.
 */
export function AuthorAvatar({ name, email }: { name: string; email: string }) {
  const url = githubAvatarUrl({ name, email });
  const [errored, setErrored] = useState(false);

  const showPhoto = url !== null && !errored && !failedUrls.has(url);

  return (
    <span className='relative size-5 shrink-0' data-slot='author-avatar'>
      <IdentityAvatar name={name} seed={email} shape='circle' />
      {showPhoto && (
        <img
          src={url}
          alt=''
          aria-hidden='true'
          loading='lazy'
          draggable={false}
          className='absolute inset-0 size-5 rounded-full select-none'
          onError={() => {
            failedUrls.add(url);
            setErrored(true);
          }}
        />
      )}
    </span>
  );
}
