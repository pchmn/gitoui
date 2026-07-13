/**
 * @vitest-environment happy-dom
 */

import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthorAvatar, githubAvatarUrl } from './AuthorAvatar';

afterEach(cleanup);

describe('githubAvatarUrl', () => {
  it('resolves the id-based URL from a modern noreply address (id survives renames)', () => {
    expect(
      githubAvatarUrl({ name: 'Octo Cat', email: '12345+octocat@users.noreply.github.com' }),
    ).toBe('https://avatars.githubusercontent.com/u/12345?s=40');
  });

  it('resolves the username-based URL from a legacy noreply address', () => {
    expect(githubAvatarUrl({ name: 'Octo Cat', email: 'octocat@users.noreply.github.com' })).toBe(
      'https://avatars.githubusercontent.com/octocat?s=40',
    );
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(
      githubAvatarUrl({ name: 'Octo Cat', email: '  Octo-Cat@Users.Noreply.GitHub.com ' }),
    ).toBe('https://avatars.githubusercontent.com/Octo-Cat?s=40');
  });

  it('prefers the noreply email over the name when both could resolve', () => {
    expect(
      githubAvatarUrl({ name: 'octocat', email: '12345+hubot@users.noreply.github.com' }),
    ).toBe('https://avatars.githubusercontent.com/u/12345?s=40');
  });

  it('guesses a username-shaped author name when the email reveals nothing', () => {
    expect(githubAvatarUrl({ name: 'pchmn', email: 'pchmn.dev@gmail.com' })).toBe(
      'https://avatars.githubusercontent.com/pchmn?s=40',
    );
    expect(githubAvatarUrl({ name: ' octo-cat ', email: 'x@example.com' })).toBe(
      'https://avatars.githubusercontent.com/octo-cat?s=40',
    );
  });

  it('never guesses from a name that is not shaped like a GitHub username', () => {
    expect(githubAvatarUrl({ name: 'Ada Lovelace', email: 'ada@example.com' })).toBeNull();
    expect(githubAvatarUrl({ name: 'paul.chemin', email: 'x@example.com' })).toBeNull();
    expect(githubAvatarUrl({ name: '-octocat', email: 'x@example.com' })).toBeNull();
    expect(githubAvatarUrl({ name: 'octo--cat', email: 'x@example.com' })).toBeNull();
    expect(githubAvatarUrl({ name: '', email: 'x@example.com' })).toBeNull();
  });

  it('never resolves from a lookalike domain', () => {
    expect(
      githubAvatarUrl({ name: 'Ada Lovelace', email: 'octocat@users.noreply.github.com.evil.com' }),
    ).toBeNull();
  });
});

describe('AuthorAvatar', () => {
  it('layers the GitHub photo over the initials for a noreply author', () => {
    const { container } = render(
      <AuthorAvatar name='Octo Cat' email='12345+octocat@users.noreply.github.com' />,
    );
    const img = container.querySelector('img');
    expect(img?.getAttribute('src')).toBe('https://avatars.githubusercontent.com/u/12345?s=40');
    // The initials render underneath regardless — the photo paints over when it arrives.
    expect(container.querySelector('[data-slot="identity-avatar"]')).not.toBeNull();
  });

  it('renders only the initials when nothing publicly implies a GitHub account', () => {
    const { container } = render(<AuthorAvatar name='Ada Lovelace' email='ada@example.com' />);
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('[data-slot="identity-avatar"]')?.textContent).toBe('A');
  });
});
