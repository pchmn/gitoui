import { Schema } from 'effect';
import { defineMethod } from './define.ts';

// --- Contracts (window.desktop.*) — shell/app capabilities, backed by Electron APIs in `main`,
//     never by `@gitoui/core`. ---

/** Open the OS folder picker; resolves to the chosen Repository path, or null if cancelled. */
export const pickRepository = defineMethod({
  payload: Schema.Void,
  success: Schema.NullOr(Schema.String),
  error: Schema.Never,
});
