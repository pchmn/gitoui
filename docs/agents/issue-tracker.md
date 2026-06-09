# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

### Sub-issues (parent / child hierarchy)

When issues belong under a parent (e.g. a PRD and the slices that implement it), link them as **native GitHub sub-issues** so the parent shows a progress bar and the children nest in the UI — not just a textual `Parent: #N` line in the body.

`gh issue create` has no `--parent` flag at this version, so use the REST API. The body parameter is the child's **database id** (an internal integer), *not* its issue number:

```bash
# 1. create the child issue; capture its number from the returned URL
url=$(gh issue create --title "..." --body "..." --label "ready-for-agent")
num=${url##*/}

# 2. resolve the child's database id (≠ the issue number)
id=$(gh api repos/pchmn/gitoui/issues/$num --jq .id)

# 3. attach it under the parent (<PARENT> = the parent issue number)
gh api -X POST repos/pchmn/gitoui/issues/<PARENT>/sub_issues -F sub_issue_id=$id
```

List a parent's children with `gh api repos/pchmn/gitoui/issues/<PARENT>/sub_issues`.

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone (here, `pchmn/gitoui`).

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
