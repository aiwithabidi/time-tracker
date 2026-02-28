#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')
TERMINAL_ID="${TT_TERMINAL_ID:-tt-$(echo "$SESSION_ID" | head -c 12)}"
mkdir -p ~/.tt/terminals
echo "$TERMINAL_ID" > ~/.tt/terminals/"$SESSION_ID"
~/.tt/bin/tt pulse \
  --source "claude-${SOURCE}" \
  --session-id "$SESSION_ID" \
  --terminal-id "$TERMINAL_ID" \
  --cwd "$CWD" \
  2>/dev/null
exit 0
