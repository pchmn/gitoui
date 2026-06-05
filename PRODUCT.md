# Product

## Register

product

## Users

Developers managing git on the desktop, sitting between two profiles that gitoui serves
at once:

- **Power users** coming from GitKraken / Tower / Fork who need to read complex histories
  (many branches, merges, remotes) at a glance.
- **Developers wary of the git CLI** who want a clear UI with safe defaults and no jargon.

What unites both: they want a **simple, minimalist interface**. Their context is everyday
version control on their own machine — staging changes (down to the hunk), committing,
branching, reading history, and syncing with remotes. They are in a task, not browsing;
the tool should disappear into the work.

## Product Purpose

gitoui is a desktop git client (GitKraken-style) that makes git **visual, fast, and calm**
without the bloat. The commit **graph** is the centerpiece: the colored history of branches
and merges, readable in one look. Around it sit the repository/branch navigation, a precise
staging panel, and the sync actions (Fetch / Pull / Push).

Success looks like: a developer opens a Repository and instantly understands its state —
where HEAD is, what's ahead/behind, what's Staged vs Unstaged — then commits and syncs
without friction, without waiting, and without visual overload.

## Brand Personality

**Minimal · clear · frictionless.**

Voice is quiet and precise. It speaks the product's own domain vocabulary (Working tree,
Staged, Change, Ref — see `CONTEXT.md`), never CLI jargon for its own sake and never
marketing fluff. The emotional goal is **calm focus and quiet confidence**: the interface
reassures by being legible and predictable, never by shouting. Personality is carried by
craft and restraint, not by decoration. The one expressive flourish — the runtime
source-color theme that re-tints the whole app — is a personal touch the user owns, not a
brand statement gitoui imposes.

## Anti-references

- **GitKraken's saturated cockpit.** Too many panels, gradients, heavy chrome, and visual
  overload competing for attention. gitoui is the calm opposite: fewer surfaces, each earned.
- **Generic SaaS.** Rounded generic card grids, all-caps tracked eyebrows above every
  section, purple gradients, hero-metric templates, gradient text. None of it.
- General slop to avoid: over-decorated buttons (1px border *and* a wide soft shadow),
  over-rounded cards (radius stays 8–12px, not 24px+), decorative glassmorphism, and any
  motion that doesn't convey state.

## Design Principles

1. **The graph is the protagonist.** History readability is the product. Everything else —
   chrome, panels, labels — recedes so the commit graph reads in one glance. When a choice
   trades graph clarity for decoration, graph clarity wins.
2. **Calm over cockpit.** Low visual noise is a feature. Earn every panel, divider, and
   pixel; achieve density through hierarchy and spacing, not through more chrome. The screen
   should feel quiet even when it's information-rich.
3. **Speed you can feel.** Instant and native is part of the identity. Skeletons over
   spinners, optimistic feedback, transitions in the 150–250ms band. The UI never makes the
   user wait to think.
4. **Precision without ceremony.** Offer fine-grained control (hunk-level staging, branch
   operations) while keeping it approachable, with safe defaults and guard-rails for the
   CLI-shy. Power and simplicity are not a trade-off here.
5. **Earned familiarity, honored vocabulary.** Use standard, trustworthy affordances
   (top bar + side nav, tabs, lists, tree); don't reinvent controls for flavor. Name things
   with the project glossary, consistently, screen to screen.

## Accessibility & Inclusion

- **Light and dark are equal citizens** (stated priority). Both themes get the same level of
  craft — no bolted-on dark mode — across every component and state, and across all 14 source
  palettes plus custom.
- **Baseline craft (always applied), even though not selected as hard requirements:** body
  text ≥ 4.5:1 contrast (large/bold ≥ 3:1) in both themes; every animation has a
  `prefers-reduced-motion` alternative.
- **Graph legibility beyond hue (craft goal).** Because the commit graph is multi-color, lean
  on position, lane, and labels — not color alone — so it stays readable for color-blind users.
