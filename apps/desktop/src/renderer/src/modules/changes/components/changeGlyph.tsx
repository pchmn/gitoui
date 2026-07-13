import type { ChangeKind } from '@gitoui/contracts/git';
import {
  ArrowRightIcon,
  type Icon,
  MinusIcon,
  PencilSimpleIcon,
  PlusIcon,
} from '@phosphor-icons/react';

/**
 * Per-`ChangeKind` glyph (issue #66 polish), shared by the Inspector's Changes rows and the
 * Commit graph's WIP-row summary so a change type reads the same everywhere.
 *
 * Icons over letters — GitKraken-familiar for this audience, and a shape scans faster than a letter
 * at a glance. Rendered `duotone` so they stay light against the text.
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
 * Tint per kind, matching **Pierre's** soft git-status palette: **blue** for modified, **green**
 * for add / untracked, **gold** for renamed, **red** for delete — the pastel `--git-*` tokens
 * (kept separate from the saturated app-wide `--success`/`--destructive`, which stay loud for
 * danger and diff tints). Worn by the Changes-panel status letters AND the graph's WIP-row summary
 * chips, so a change kind reads the same soft hue everywhere it's counted.
 */
export const CHANGE_LETTER_TONE: Record<ChangeKind, string> = {
  modified: 'text-git-modified',
  renamed: 'text-git-renamed',
  added: 'text-git-added',
  untracked: 'text-git-added',
  deleted: 'text-git-deleted',
};
