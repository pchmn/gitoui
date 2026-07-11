import type { ChangeKind } from '@gitoui/contracts/git';
import {
  ArrowRightIcon,
  type Icon,
  MinusIcon,
  PencilSimpleIcon,
  PlusIcon,
} from '@phosphor-icons/react';

/**
 * Per-`ChangeKind` glyph + tone (issue #66 polish), shared by the Inspector's Changes rows and the
 * Commit graph's WIP-row summary so a change type reads the same everywhere.
 *
 * Icons over letters — GitKraken-familiar for this audience, and a shape scans faster than a letter
 * at a glance. Rendered `duotone` so they stay light against the text. Color is spent only on the
 * whole-file exceptions (added / deleted → success / destructive); modified / renamed stay quiet
 * Muted Ink, so a panel full of edits doesn't turn into a rainbow (the Spent Color Rule).
 *
 * One map, two call sites: a future Settings toggle can swap it for `M`/`A`/`D` letters without
 * touching either component.
 */
export const CHANGE_ICON: Record<ChangeKind, Icon> = {
  modified: PencilSimpleIcon,
  renamed: ArrowRightIcon,
  added: PlusIcon,
  untracked: PlusIcon,
  deleted: MinusIcon,
};

/** Glyph tint per kind — success/destructive spent only on added/deleted; the rest stay Muted Ink. */
export const CHANGE_TONE: Record<ChangeKind, string> = {
  modified: 'text-muted-foreground',
  renamed: 'text-muted-foreground',
  added: 'text-success',
  untracked: 'text-success',
  deleted: 'text-destructive',
};

/**
 * Single-letter status marker per kind (`A`/`M`/`D`/`R`/`U`), git-familiar and VSCode-familiar.
 * Used by the Changes rows' trailing status column. Untracked is `U`, not `A`: a not-yet-tracked
 * file, distinct from a staged addition.
 */
export const CHANGE_LETTER: Record<ChangeKind, string> = {
  modified: 'M',
  renamed: 'R',
  added: 'A',
  untracked: 'U',
  deleted: 'D',
};

/**
 * Tint for the Changes-panel status letters, matching **Pierre's** soft git-status palette: **blue**
 * for modified, **green** for add / untracked, **gold** for renamed, **red** for delete — the pastel
 * `--git-*` tokens (kept separate from the saturated app-wide `--success`/`--destructive`, which stay
 * loud for danger and diff tints). Distinct from `CHANGE_TONE` (which keeps modified quiet in the
 * graph's WIP-row summary): the Changes panel is a dense staging surface where a per-kind hue helps
 * scanning — a deliberate, scoped exception to the graph's quieter policy.
 */
export const CHANGE_LETTER_TONE: Record<ChangeKind, string> = {
  modified: 'text-git-modified',
  renamed: 'text-git-renamed',
  added: 'text-git-added',
  untracked: 'text-git-added',
  deleted: 'text-git-deleted',
};
