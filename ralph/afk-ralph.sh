#!/usr/bin/env bash
set -euo pipefail

# afk-ralph.sh -- Run RALPH in autonomous loop until all sub-issues are closed or max iterations.
# Usage: ./ralph/afk-ralph.sh <prd-issue-number> [max-iterations]
#
# Runs inside a Docker sandbox for isolation.

PRD_ISSUE="${1:?Usage: afk-ralph.sh <prd-issue-number> [max-iterations]}"
MAX_ITERATIONS="${2:-20}"
REPO="$(gh repo view --json nameWithOwner --jq '.nameWithOwner')"
REPO_ROOT="$(git rev-parse --show-toplevel)"

cd "$REPO_ROOT"

# Inject credentials into the Docker sandbox.
# - Claude OAuth: macOS Keychain -> .credentials.json (docker/for-mac#7842)
# - GitHub CLI: gh auth token -> GH_TOKEN env var
inject_sandbox_credentials() {
  local creds gh_token

  # Claude OAuth
  creds=$(security find-generic-password -s "Claude Code-credentials" -w 2>/dev/null) || true
  if [[ -n "$creds" ]]; then
    docker sandbox exec "$SANDBOX_NAME" bash -c "cat > /home/agent/.claude/.credentials.json << 'ENDCREDS'
${creds}
ENDCREDS" 2>/dev/null
    echo "Injected Claude OAuth credentials into sandbox"
  fi

  # GitHub CLI
  gh_token=$(gh auth token 2>/dev/null) || true
  if [[ -n "$gh_token" ]]; then
    docker sandbox exec "$SANDBOX_NAME" bash -c \
      "grep -q GH_TOKEN /etc/sandbox-persistent.sh 2>/dev/null || echo 'export GH_TOKEN=${gh_token}' >> /etc/sandbox-persistent.sh" 2>/dev/null
    echo "Injected GitHub token into sandbox"
  fi
}

SANDBOX_NAME="claude-$(basename "$REPO_ROOT")"

echo "Starting AFK RALPH: PRD #${PRD_ISSUE}, $MAX_ITERATIONS max iterations"
echo ""

# Ensure sandbox exists and has OAuth credentials before the loop
if ! docker sandbox ls 2>/dev/null | awk 'NR>1 {print $1}' | grep -q "^${SANDBOX_NAME}$"; then
  echo "Creating sandbox '${SANDBOX_NAME}'..."
  docker sandbox create --name "$SANDBOX_NAME" claude "$REPO_ROOT"
fi
inject_sandbox_credentials

for ((i=1; i<=MAX_ITERATIONS; i++)); do
  echo "=== RALPH iteration $i / $MAX_ITERATIONS ==="

  # Re-fetch issue state each iteration to get current open/closed status
  echo "Fetching PRD issue #${PRD_ISSUE}..."
  prd_body=$(gh issue view "$PRD_ISSUE" --repo "$REPO" --json number,title,state,body \
    --jq '"# PRD: \(.title) (#\(.number))\nState: \(.state)\n\n\(.body)"')

  echo "Finding sub-issues..."
  sub_issue_numbers=$(gh search issues --repo "$REPO" "Parent PRD #${PRD_ISSUE}" \
    --json number --jq '.[].number' | grep -v "^${PRD_ISSUE}$" | sort -n)

  if [[ -z "$sub_issue_numbers" ]]; then
    echo "No sub-issues found. Nothing to do."
    exit 1
  fi

  # Check if all sub-issues are closed before fetching details
  open_count=0
  for num in $sub_issue_numbers; do
    state=$(gh issue view "$num" --repo "$REPO" --json state --jq '.state')
    if [[ "$state" == "OPEN" ]]; then
      open_count=$((open_count + 1))
    fi
  done

  if [[ "$open_count" -eq 0 ]]; then
    echo "=== RALPH: All sub-issues closed after $((i - 1)) iterations ==="
    exit 0
  fi

  echo "$open_count open sub-issue(s) remaining."

  # Ensure OAuth credentials are available in the sandbox
  inject_sandbox_credentials

  # Fetch each sub-issue's full details
  sub_issues=""
  for num in $sub_issue_numbers; do
    detail=$(gh issue view "$num" --repo "$REPO" --json number,title,state,body \
      --jq '"---\n## Sub-issue #\(.number): \(.title)\nState: \(.state)\n\n\(.body)"')
    sub_issues="${sub_issues}\n${detail}"
  done

  result=$(docker sandbox run "$SANDBOX_NAME" -- \
    -p \
    --permission-mode bypassPermissions \
    "@ralph/prompt.md

${prd_body}

# Sub-issues
${sub_issues}

---

Read the PRD and sub-issues above. Then:
1. Identify which sub-issues are OPEN and not blocked by other OPEN issues.
2. Pick ONE open, unblocked sub-issue to work on (prioritize: architecture > integration > spikes > features > polish).
3. Implement that sub-issue. Keep the change small and focused.
4. Run feedback loops: npm run lint, npm run build, npm run test. Fix any failures.
5. Make a git commit with a descriptive message.
6. Close the sub-issue: gh issue close <number> --repo ${REPO} --comment \"Completed in \$(git rev-parse --short HEAD). <brief summary of what was done>\"
7. If ALL sub-issues are now closed, output <promise>COMPLETE</promise>.
ONLY WORK ON A SINGLE SUB-ISSUE PER ITERATION.")

  echo "$result"
  echo ""

  if [[ "$result" == *"<promise>COMPLETE</promise>"* ]]; then
    echo "=== RALPH: All work complete after $i iterations ==="
    exit 0
  fi
done

echo "=== RALPH: Reached max iterations ($MAX_ITERATIONS) without completion ==="
exit 1
