---
name: implement
description: Implement a ready ticket or an approved plan via the implement subagent (isolated context, returns a summary). Use for "/implement", "implement issue N", or executing a settled plan in code. Not for design or planning.
context: fork
agent: implement
disable-model-invocation: true
---

# Implement

$ARGUMENTS

If that names an issue (number or URL), fetch it first with `gh api repos/pchmn/gitoui/issues/<n>` and implement its acceptance criteria exactly. Follow the ticket's resolved decisions literally; mirror any patterns it points to. Leave changes in the working tree — do not commit or push.
