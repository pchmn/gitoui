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
