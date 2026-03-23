#!/usr/bin/env bash
set -euo pipefail

# ralph-once.sh -- Run one RALPH iteration, then stop for human review.
# Usage: ./ralph/ralph-once.sh <prd-file> [progress-file]

PRD_FILE="${1:?Usage: ralph-once.sh <prd-file> [progress-file]}"
PROGRESS_FILE="${2:-ralph/progress.txt}"

cd "$(git rev-parse --show-toplevel)"

# Validate PRD exists
if [[ ! -f "$PRD_FILE" ]]; then
  echo "Error: PRD file not found: $PRD_FILE"
  exit 1
fi

# Ensure progress file exists
if [[ ! -f "$PROGRESS_FILE" ]]; then
  cp ralph/progress-template.md "$PROGRESS_FILE"
  echo "Created $PROGRESS_FILE from template."
fi

claude -p \
  --permission-mode acceptEdits \
  "@ralph/prompt.md @${PRD_FILE} @${PROGRESS_FILE}

Read the PRD and progress file above. Then:
1. Decide which task to work on next (prioritize: architecture > integration > spikes > features > polish).
2. Implement ONE task only. Keep the change small and focused.
3. Run feedback loops: npm run lint, npm run build, npm run test. Fix any failures.
4. Make a git commit with a descriptive message.
5. Update ${PROGRESS_FILE} with what you did, decisions made, and files changed.
6. If ALL work in the PRD is complete, output <promise>COMPLETE</promise>.
ONLY WORK ON A SINGLE FEATURE PER ITERATION."

echo ""
echo "--- RALPH iteration complete. Review changes before running again. ---"
