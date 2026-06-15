---
name: to-issues
description: Break a plan, spec, or PRD into independently-grabbable issues on the project issue tracker using tracer-bullet vertical slices. Use when user wants to convert a plan into issues, create implementation tickets, or break down work into issues.
---

# To Issues

Break a plan into independently-grabbable issues using vertical slices (tracer bullets).

The issue tracker and triage label vocabulary are recorded in `docs/agents/issue-tracker.md` and `docs/agents/triage-labels.md` — read those if they're not already in your context.

## Process

### 1. Gather context

Work from whatever is already in the conversation context. If the user passes an issue reference (issue number, URL, or path) as an argument, fetch it from the issue tracker and read its full body and comments.

### 2. Explore the codebase (optional)

If you have not already explored the codebase, do so to understand the current state of the code. Issue titles and descriptions should use the project's domain glossary vocabulary, and respect ADRs in the area you're touching.

### 3. Draft vertical slices

Break the plan into **tracer bullet** issues. Each issue is a thin vertical slice that cuts through ALL integration layers end-to-end, NOT a horizontal slice of one layer.

Slices may be 'HITL' or 'AFK'. HITL slices require human interaction, such as an architectural decision or a design review. AFK slices can be implemented and merged without human interaction. Prefer AFK over HITL where possible.

<vertical-slice-rules>
- Each slice delivers a narrow but COMPLETE path through every layer (schema, API, UI, tests)
- A completed slice is demoable or verifiable on its own
- Prefer many thin slices over few thick ones
</vertical-slice-rules>

Once you have a draft set of slices, gauge the size **before** quizzing the user:

- **Small** — 1–2 slices, or slices with no real dependencies between them → proceed; publish them flat and omit the `Parent` section.
- **Large** — roughly 5+ slices with a dependency order between them, AND the source material was NOT already a PRD or parent issue → surface this before publishing:
  > "This breaks into N interdependent slices. Want to capture a PRD parent first (`/to-prd`) so they share one tracked epic and the `Parent` field points somewhere — or publish them flat?"

  It's a suggestion, not a gate. Don't invoke `/to-prd` yourself without the user's go-ahead; if they decline, proceed and omit the `Parent` section.

### 4. Quiz the user

Present the proposed breakdown as a numbered list. For each slice, show:

- **Title**: short descriptive name
- **Type**: HITL / AFK
- **Blocked by**: which other slices (if any) must complete first
- **User stories covered**: which user stories this addresses (if the source material has them)

Ask the user:

- Does the granularity feel right? (too coarse / too fine)
- Are the dependency relationships correct?
- Should any slices be merged or split further?
- Are the correct slices marked as HITL and AFK?

Iterate until the user approves the breakdown.

### 5. Publish the issues to the issue tracker

For each approved slice, publish a new issue to the issue tracker. Use the issue body template below. These issues are considered ready for AFK agents, so publish them with the correct triage label unless instructed otherwise.

Publish issues in dependency order (blockers first) so you can reference real issue identifiers in the "Blocked by" field.

If a parent PRD issue exists (the user created one via `/to-prd`, or passed one as the argument), link each published issue to it as a **native sub-issue** of the parent — not just the textual `## Parent` mention below. See `docs/agents/issue-tracker.md` for the exact command. The structural sub-issue link and the `## Parent` body section are complementary: keep both. If there is no parent, omit the `## Parent` section and publish the issues flat.

A body is implementation-ready when whoever picks it up can *transcribe* it, not *improvise* it — this matters most when a faster, cheaper model implements the slice. The trap is a uniformly-vague (or uniformly-verbose) body: the few load-bearing decisions get the same weight as boilerplate, so they get missed or guessed.

<body-detail-rules>
- **Seams — spell them out.** A seam is any point where two competent devs would choose differently: a parse/format rule and its edge cases, the shape of a value that has no home in the current contract, an error-mapping choice, a tricky invariant. Resolve it *in the body* — inline the exact rule, the schema/type shape, or a small table of cases. This is load-bearing detail, not bloat.
- **Patterns — point, don't transcribe.** When a layer just mirrors existing code, name the exemplar by symbol ("mirror `status` end-to-end", "compose the Combobox like `RepoSelector`") instead of recopying it. A symbol reference survives refactors; a transcribed snippet or `path:line` goes stale and can plant a bug when it drifts.
- **Tests — pin ground truth the code can't redefine.** For a slice that adds a parser/transformer, inline a real captured input + expected output. Otherwise the implementer writes both the code and a fixture that matches its own bug, and the test goes green while being wrong.

Drafting test: for each part ask "would two good devs diverge here?" — yes → detail it; no → point at the pattern. The result is usually *shorter* than a vague body, with the decisions standing out.
</body-detail-rules>

<issue-template>
## Parent

A reference to the parent issue on the issue tracker (if the source was an existing issue, otherwise omit this section).

## What to build

A concise description of this vertical slice. Describe the end-to-end behavior, not layer-by-layer implementation — then apply the `<body-detail-rules>` above: spell out the seams, point at patterns by symbol name, and don't hardcode `path:line` (it goes stale). A snippet earns its place only when it encodes a seam more precisely than prose can (schema/type shape, state machine, parse-case table) — e.g. one a prototype produced. Trim to the decision-rich parts, not a working demo.

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2
- [ ] Criterion 3

## Blocked by

- A reference to the blocking ticket (if any)

Or "None - can start immediately" if no blockers.

</issue-template>

Do NOT close or modify any parent issue.
