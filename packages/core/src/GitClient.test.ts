import { it } from '@effect/vitest';
import { Effect } from 'effect';
import { expect } from 'vitest';
import { GitClient } from './GitClient.ts';

it.effect('GitClient exposes a status method', () =>
  Effect.gen(function* () {
    const git = yield* GitClient;
    expect(typeof git.status).toBe('function');
  }).pipe(Effect.provide(GitClient.Default)),
);
