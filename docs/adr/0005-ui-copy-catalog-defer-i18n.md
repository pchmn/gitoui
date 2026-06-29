# UI copy lives in a typed catalog; multilingual is deliberately deferred

All renderer user-facing copy is extracted out of JSX into a single typed catalog
(`apps/desktop/src/renderer/src/shared/messages/messages.ts`) — **English-only, no i18n
library**. The app is *not* multilingual, and we are not adding one "just in case".

The reasoning is product-specific, not laziness. gitoui's audience (per `PRODUCT.md`) is
**developers**, who operate in English by trade — their tools, docs, and git itself are English.
More pointedly, git's vocabulary is English **terms-of-art**: our own `CONTEXT.md` glossary fixes
*Staged*, *Working tree*, *Detached HEAD*, *Ref*, and `PRODUCT.md` principle 5 ("honored
vocabulary") commits us to using them verbatim. Translating those would *violate* that principle and
confuse more than it helps. The git-GUI field agrees — GitKraken, Fork, Tower, Sourcetree, and
GitHub Desktop are all English-only. So the ROI of full localization for this tool is low.

We still extract, because the expensive part of i18n is never the library (an afternoon) — it is
**finding every string, giving it a stable key, and handling interpolation/counts**. The catalog
does that work once, so call sites reference keys (`messages.branchSelector.newBranchFrom(name)`)
rather than inline literals. The door to multilingual stays open at near-mechanical cost without
paying for runtime machinery today. Centralizing also gives one place to keep the "quiet and
precise" voice and the glossary consistent.

Shape: central, namespaced **by feature**, `as const` (zero-dependency, zero-runtime). Static text
is a string; interpolation is a **typed function**; counts pass the `number` (not a pre-formatted
string) so they stay plural-ready. Error copy is **hybrid** — shared `byTag` defaults plus
per-feature-action overrides — resolved in the existing `matchError` arms, so no resolver and no new
runtime. It lives in `shared/` (not the renderer's `core/`) because both the app-shell and the
feature modules consume it: a thing used by both must sit *below* both, and it neighbors
`shared/git/errors.ts`, the typed errors it maps onto.

## Considered options

- **i18next / react-i18next now** — rejected. The largest ecosystem, but the heaviest runtime and
  the least type-safe (stringly-typed keys, runtime resolution) — against this repo's compile-time,
  type-safe grain (Schema as SSOT, `verbatimModuleSyntax`). Premature for unproven demand.
- **Paraglide JS or Lingui in mono-locale now** — rejected (for now). Compile-time, typed, and
  tree-shakeable, so adding a second locale would be near-zero migration. But it still means a
  dependency + build plugin for a multilingual capability we do not need. Revisit if demand appears.
- **Per-feature co-located `copy.ts`** — rejected. Matches feature-first locality, but scatters copy
  (no global voice/glossary review) and a future library would have to aggregate the files. The
  central catalog maps 1:1 onto the single message source a library would want.

## Consequences / accepted trade-offs

- A future contributor may see a hand-rolled catalog and reach for react-i18next — this ADR is the
  answer to "why isn't this a real i18n lib?".
- Going multilingual later is **mechanical but not free**: call sites barely move, but the catalog
  file must be rewritten into the library's format, and real CLDR plural rules arrive only with the
  library. Accepted.
- `packages/ui` strings (e.g. the toast `"Close"` aria-label) are **out of scope** — they are
  design-system defaults, overridable by prop, not application copy.
- **Trigger to revisit:** a real demand for a locale, or a translator contributor showing up
  (the lazygit pattern). At that point, prefer a compile-time/typed library over i18next.
