import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { define } from 'gunshi'

const SESSION_START_SCRIPT = `#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
SOURCE=$(echo "$INPUT" | jq -r '.source // "startup"')
TERMINAL_ID="\${TT_TERMINAL_ID:-tt-$(echo "$SESSION_ID" | head -c 12)}"
mkdir -p ~/.tt/terminals
echo "$TERMINAL_ID" > ~/.tt/terminals/"$SESSION_ID"
~/.tt/bin/tt pulse \\
  --source "claude-\${SOURCE}" \\
  --session-id "$SESSION_ID" \\
  --terminal-id "$TERMINAL_ID" \\
  --cwd "$CWD" \\
  2>/dev/null
exit 0
`

const POST_TOOL_USE_SCRIPT = `#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
TERMINAL_ID=$(cat ~/.tt/terminals/"$SESSION_ID" 2>/dev/null || echo "\${TT_TERMINAL_ID:-unknown-\${SESSION_ID:0:12}}")
exec ~/.tt/bin/tt pulse \\
  --source "post-tool-use" \\
  --session-id "$SESSION_ID" \\
  --terminal-id "$TERMINAL_ID" \\
  --cwd "$CWD" \\
  2>/dev/null || true
`

const STOP_SCRIPT = `#!/bin/bash
INPUT=$(cat)
if [ "$(echo "$INPUT" | jq -r '.stop_hook_active')" = "true" ]; then
  exit 0
fi
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
TERMINAL_ID=$(cat ~/.tt/terminals/"$SESSION_ID" 2>/dev/null || echo "\${TT_TERMINAL_ID:-unknown-\${SESSION_ID:0:12}}")
exec ~/.tt/bin/tt pulse \\
  --source "stop" \\
  --session-id "$SESSION_ID" \\
  --terminal-id "$TERMINAL_ID" \\
  --cwd "$CWD" \\
  2>/dev/null || true
`

const HOOKS_CONFIG = {
  hooks: {
    SessionStart: [
      {
        type: 'command',
        command: '~/.tt/hooks/session-start.sh',
      },
    ],
    PostToolUse: [
      {
        type: 'command',
        command: '~/.tt/hooks/post-tool-use.sh',
        async: true,
      },
    ],
    Stop: [
      {
        type: 'command',
        command: '~/.tt/hooks/stop.sh',
        async: true,
      },
    ],
  },
}

function getHomeTtDir(): string {
  return path.join(os.homedir(), '.tt')
}

const setupCommand = define({
  name: 'setup',
  description: 'Install hook scripts and print configuration for Claude Code',
  args: {},
  run: () => {
    const ttDir = getHomeTtDir()
    const hooksDir = path.join(ttDir, 'hooks')
    const terminalsDir = path.join(ttDir, 'terminals')
    const binDir = path.join(ttDir, 'bin')

    // Create directories
    fs.mkdirSync(hooksDir, { recursive: true })
    fs.mkdirSync(terminalsDir, { recursive: true })
    fs.mkdirSync(binDir, { recursive: true })

    // Write hook scripts
    const scripts: ReadonlyArray<readonly [string, string]> = [
      [path.join(hooksDir, 'session-start.sh'), SESSION_START_SCRIPT],
      [path.join(hooksDir, 'post-tool-use.sh'), POST_TOOL_USE_SCRIPT],
      [path.join(hooksDir, 'stop.sh'), STOP_SCRIPT],
    ]

    for (const [filePath, content] of scripts) {
      fs.writeFileSync(filePath, content, 'utf-8')
      fs.chmodSync(filePath, 0o755)
    }

    // Check for existing binary and create symlink
    const currentBinary = process.argv[0]
    const binTarget = path.join(binDir, 'tt')

    if (currentBinary) {
      try {
        // Remove existing symlink if present
        try {
          fs.unlinkSync(binTarget)
        } catch {
          // File may not exist
        }

        const resolvedBinary = fs.realpathSync(currentBinary)
        fs.symlinkSync(resolvedBinary, binTarget)
        process.stdout.write(`Binary symlinked: ${binTarget} -> ${resolvedBinary}\n`)
      } catch {
        process.stdout.write(
          `Could not symlink binary. Copy your tt binary to ${binTarget}\n`,
        )
      }
    }

    process.stdout.write(`\nHook scripts installed to ${hooksDir}/\n\n`)
    process.stdout.write(
      'Add the following to your ~/.claude/settings.json "hooks" section:\n\n',
    )
    process.stdout.write(JSON.stringify(HOOKS_CONFIG, null, 2))
    process.stdout.write('\n\nThen restart Claude Code to activate hooks.\n')
  },
})

export default setupCommand
