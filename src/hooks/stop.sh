#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
TERMINAL_ID=$(cat ~/.tt/terminals/"$SESSION_ID" 2>/dev/null || echo "${TT_TERMINAL_ID:-unknown-${SESSION_ID:0:12}}")
exec ~/.tt/bin/tt pulse \
  --source "stop" \
  --session-id "$SESSION_ID" \
  --terminal-id "$TERMINAL_ID" \
  --cwd "$CWD" \
  2>/dev/null || true
