# RALPH -- Repeated Autonomous Loop for PRD Handling

RALPH runs Claude Code in a loop to implement a PRD incrementally.
Each iteration: read PRD, check progress, pick one task, implement, commit, update progress.

## Quick Start

### 1. Write a PRD
Copy `ralph/prd-template.md` and fill it in:
```bash
cp ralph/prd-template.md my-feature-prd.md
```

### 2. Single iteration (human-in-the-loop)
```bash
./ralph/ralph-once.sh my-feature-prd.md
```
Review the changes, then run again for the next task.

### 3. Autonomous (AFK mode)
```bash
./ralph/afk-ralph.sh my-feature-prd.md 20
```
Runs up to 20 iterations in a Docker sandbox. Stops early when all PRD tasks are done.

## Files
| File | Purpose |
|------|---------|
| `ralph-once.sh` | Single HITL iteration |
| `afk-ralph.sh` | Autonomous loop with Docker sandbox |
| `prompt.md` | System prompt for each iteration |
| `prd-template.md` | Template for writing RALPH-compatible PRDs |
| `progress-template.md` | Template for progress tracking |

## How it works
1. Scripts pass `prompt.md`, the PRD, and `progress.txt` to Claude via `@file` syntax
2. Claude reads all three, picks the next unfinished task, implements it
3. Feedback loops (lint, build, test) gate every commit
4. Progress is appended to `progress.txt` after each commit
5. `<promise>COMPLETE</promise>` signals all PRD tasks are done

## Tips
- **Start HITL, go AFK later** -- use `ralph-once.sh` to refine your PRD, then switch to `afk-ralph.sh`
- **Keep PRD tasks small** -- one logical change per task prevents context rot
- **Prioritize risky work first** -- architecture and integration before features and polish
- **Custom progress file** -- pass a second arg: `./ralph/ralph-once.sh prd.md my-progress.txt`
