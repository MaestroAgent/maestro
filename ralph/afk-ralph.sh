#!/usr/bin/env bash
set -euo pipefail

# afk-ralph.sh -- Run RALPH in autonomous loop until completion or max iterations.
# Usage: ./ralph/afk-ralph.sh <prd-file> [max-iterations] [progress-file]
#
# Runs inside a Docker sandbox for isolation.

PRD_FILE="${1:?Usage: afk-ralph.sh <prd-file> [max-iterations] [progress-file]}"
MAX_ITERATIONS="${2:-20}"
PROGRESS_FILE="${3:-ralph/progress.txt}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

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

echo "Starting AFK RALPH: $MAX_ITERATIONS max iterations"
echo "PRD: $PRD_FILE"
echo "Progress: $PROGRESS_FILE"
echo ""

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo "=== RALPH iteration $i / $MAX_ITERATIONS ==="

  result=$(docker sandbox run claude "$REPO_ROOT" -- \
    -p \
    --permission-mode bypassPermissions \
    "@ralph/prompt.md @${PRD_FILE} @${PROGRESS_FILE}

Read the PRD and progress file above. Then:
1. Decide which task to work on next (prioritize: architecture > integration > spikes > features > polish).
2. Implement ONE task only. Keep the change small and focused.
3. Run feedback loops: npm run lint, npm run build, npm run test. Fix any failures before committing.
4. Make a git commit with a descriptive message.
5. Update ${PROGRESS_FILE} with what you did, decisions made, and files changed.
6. If ALL work in the PRD is complete, output <promise>COMPLETE</promise>.
ONLY WORK ON A SINGLE FEATURE PER ITERATION.")

  echo "$result"
  echo ""

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "=== RALPH: All work complete after $i iterations ==="
    exit 0
  fi
done

echo "=== RALPH: Reached max iterations ($MAX_ITERATIONS) without completion ==="
exit 1
