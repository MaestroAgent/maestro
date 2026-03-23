# RALPH -- Repeated Autonomous Loop for PRD Handling

RALPH runs Claude Code in a loop to implement a PRD stored as a GitHub issue.
Each iteration: fetch PRD + sub-issues, pick one open unblocked sub-issue, implement, commit, close it on GitHub.

## Quick Start

### 1. Create a PRD as a GitHub issue

Write your PRD as a GitHub issue. Then break it into sub-issues, each containing `## Parent PRD` followed by `#<prd-issue-number>` in the body. Sub-issues can declare dependencies with a `## Blocked by` section.

### 2. Single iteration (human-in-the-loop)
```bash
./ralph/ralph-once.sh 10
```
Fetches PRD issue #10 and its sub-issues, implements one, closes it on GitHub. Review the changes, then run again for the next sub-issue.

### 3. Autonomous (AFK mode)
```bash
./ralph/afk-ralph.sh 10 20
```
Runs up to 20 iterations in a Docker sandbox. Stops early when all sub-issues are closed.

## Files
| File | Purpose |
|------|---------|
| `ralph-once.sh` | Single HITL iteration |
| `afk-ralph.sh` | Autonomous loop with Docker sandbox |
| `prompt.md` | System prompt for each iteration |

## How it works
1. Scripts fetch the PRD issue body and all sub-issues via `gh` CLI
2. Sub-issues are identified by searching for `Parent PRD #<number>` in their body
3. Open/closed state and `## Blocked by` sections determine which sub-issue to pick
4. Claude reads all context, picks the next open unblocked sub-issue, implements it
5. Feedback loops (lint, build, test) gate every commit
6. After committing, Claude closes the sub-issue on GitHub with a comment
7. `<promise>COMPLETE</promise>` signals all sub-issues are closed

## Sub-issue format

Sub-issues should include these sections:

```markdown
## Parent PRD

#10

## What to build

Description of the work...

## Acceptance criteria

- [ ] Criterion 1
- [ ] Criterion 2

## Blocked by

- #19
```

## Tips
- **Start HITL, go AFK later** — use `ralph-once.sh` to validate the first iteration, then switch to `afk-ralph.sh`
- **Keep sub-issues small** — one logical change per sub-issue prevents context rot
- **Prioritize risky work first** — architecture and integration before features and polish
- **Use blocked-by** — declare dependencies so RALPH works in the right order
