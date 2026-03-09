import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { define } from 'gunshi'
import { VERSION } from '../version'
import { output } from '../format'
import { loadConfig, saveConfig } from '../../config/config-loader'

const SESSION_START_SCRIPT = `#!/bin/bash
INPUT=$(cat)
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' | tr -cd 'a-zA-Z0-9_-')
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
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' | tr -cd 'a-zA-Z0-9_-')
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
SESSION_ID=$(echo "$INPUT" | jq -r '.session_id // ""' | tr -cd 'a-zA-Z0-9_-')
CWD=$(echo "$INPUT" | jq -r '.cwd // "."')
TERMINAL_ID=$(cat ~/.tt/terminals/"$SESSION_ID" 2>/dev/null || echo "\${TT_TERMINAL_ID:-unknown-\${SESSION_ID:0:12}}")
exec ~/.tt/bin/tt pulse \\
  --source "stop" \\
  --session-id "$SESSION_ID" \\
  --terminal-id "$TERMINAL_ID" \\
  --cwd "$CWD" \\
  2>/dev/null || true
`

// Background update check hook - follows GSD's exact pattern:
// Spawns a detached child process that checks git remote and writes cache JSON
const CHECK_UPDATE_SCRIPT = `#!/usr/bin/env node
// Check for tt updates in background, write result to cache
// Called by SessionStart hook - non-blocking via detached child

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');

const homeDir = os.homedir();
const ttDir = path.join(homeDir, '.tt');
const cacheDir = path.join(ttDir, 'cache');
const cacheFile = path.join(cacheDir, 'update-check.json');
const configFile = path.join(ttDir, 'config.json');
const versionFile = path.join(ttDir, 'VERSION');

// Throttle: skip if checked < 1 hour ago
if (fs.existsSync(cacheFile)) {
  try {
    const cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8'));
    if (cache.checked && (Math.floor(Date.now() / 1000) - cache.checked) < 3600) {
      process.exit(0);
    }
  } catch (e) {}
}

// Ensure cache directory exists
if (!fs.existsSync(cacheDir)) {
  fs.mkdirSync(cacheDir, { recursive: true });
}

// Run check in background (detached child - non-blocking)
const child = spawn(process.execPath, ['-e', \`
  const fs = require('fs');
  const { execSync } = require('child_process');

  const cacheFile = \${JSON.stringify(cacheFile)};
  const configFile = \${JSON.stringify(configFile)};
  const versionFile = \${JSON.stringify(versionFile)};

  // Read installed version
  let installed = '0.0.0';
  try {
    if (fs.existsSync(versionFile)) {
      installed = fs.readFileSync(versionFile, 'utf8').trim();
    }
  } catch (e) {}

  // Read sourceRepo from config
  let sourceRepo = null;
  try {
    const config = JSON.parse(fs.readFileSync(configFile, 'utf8'));
    sourceRepo = config.sourceRepo;
  } catch (e) {}

  if (!sourceRepo || !fs.existsSync(sourceRepo)) {
    fs.writeFileSync(cacheFile, JSON.stringify({
      update_available: false,
      installed,
      latest: 'unknown',
      checked: Math.floor(Date.now() / 1000)
    }));
    process.exit(0);
  }

  // Compare local HEAD with remote
  let localHead = null;
  let remoteHead = null;
  try {
    localHead = execSync('git rev-parse HEAD', { cwd: sourceRepo, encoding: 'utf8', timeout: 10000 }).trim();
    remoteHead = execSync('git ls-remote --heads origin main', { cwd: sourceRepo, encoding: 'utf8', timeout: 10000 }).trim().split('\\\\t')[0];
  } catch (e) {}

  // Read latest version from remote VERSION constant (if available)
  let latest = installed;
  if (localHead && remoteHead && localHead !== remoteHead) {
    try {
      const versionContent = execSync('git show origin/main:src/cli/version.ts', { cwd: sourceRepo, encoding: 'utf8', timeout: 5000 });
      const match = versionContent.match(/VERSION\\\\s*=\\\\s*'([^']+)'/);
      if (match) latest = match[1];
    } catch (e) {
      latest = 'newer';
    }
  }

  const result = {
    update_available: !!(localHead && remoteHead && localHead !== remoteHead),
    installed,
    latest,
    checked: Math.floor(Date.now() / 1000)
  };

  fs.writeFileSync(cacheFile, JSON.stringify(result));
\`], {
  stdio: 'ignore',
  detached: true
});

child.unref();
`

function getHomeTtDir(): string {
  return path.join(os.homedir(), '.tt')
}

function getSourceRepoDir(): string {
  // When running from source (bun run dev), use cwd
  // When running from compiled binary, try to detect source repo
  const cwd = process.cwd()
  const packageJson = path.join(cwd, 'package.json')
  if (fs.existsSync(packageJson)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(packageJson, 'utf-8'))
      if (pkg.name === 'time-tracker') {
        return cwd
      }
    } catch {
      // Fall through
    }
  }
  return cwd
}

function installSkills(sourceRepo: string): number {
  const skillsSourceDir = path.join(sourceRepo, 'skills')
  const targetDir = path.join(os.homedir(), '.claude', 'skills')

  if (!fs.existsSync(skillsSourceDir)) {
    return 0
  }

  let count = 0
  const entries = fs.readdirSync(skillsSourceDir).filter((d) =>
    fs.statSync(path.join(skillsSourceDir, d)).isDirectory(),
  )

  for (const dir of entries) {
    const src = path.join(skillsSourceDir, dir, 'SKILL.md')
    if (fs.existsSync(src)) {
      const dest = path.join(targetDir, dir)
      fs.mkdirSync(dest, { recursive: true })
      fs.copyFileSync(src, path.join(dest, 'SKILL.md'))
      count += 1
    }
  }

  return count
}

function patchSettingsJson(ttDir: string): boolean {
  const settingsPath = path.join(os.homedir(), '.claude', 'settings.json')

  let settings: Record<string, unknown> = {}
  if (fs.existsSync(settingsPath)) {
    try {
      settings = JSON.parse(fs.readFileSync(settingsPath, 'utf-8'))
    } catch {
      return false
    }
  }

  const hooks = (settings['hooks'] ?? {}) as Record<string, unknown[]>
  let changed = false

  // Ensure SessionStart has tt hooks
  const sessionStartHooks = (hooks['SessionStart'] ?? []) as Array<Record<string, unknown>>
  const ttSessionStartCommand = '~/.tt/hooks/session-start.sh'
  const ttCheckUpdateCommand = `node "${path.join(ttDir, 'hooks', 'check-update.js')}"`

  const hasTtSessionStart = sessionStartHooks.some((entry) => {
    const entryHooks = (entry['hooks'] ?? []) as Array<Record<string, unknown>>
    return entryHooks.some((h) => String(h['command'] ?? '').includes('session-start.sh'))
  })

  const hasTtCheckUpdate = sessionStartHooks.some((entry) => {
    const entryHooks = (entry['hooks'] ?? []) as Array<Record<string, unknown>>
    return entryHooks.some((h) => String(h['command'] ?? '').includes('check-update.js'))
  })

  if (!hasTtSessionStart) {
    sessionStartHooks.push({
      hooks: [{ type: 'command', command: ttSessionStartCommand, async: true }],
    })
    changed = true
  }

  if (!hasTtCheckUpdate) {
    sessionStartHooks.push({
      hooks: [{ type: 'command', command: ttCheckUpdateCommand }],
    })
    changed = true
  }

  if (changed) {
    hooks['SessionStart'] = sessionStartHooks
  }

  // Ensure PostToolUse has tt hook
  const postToolUseHooks = (hooks['PostToolUse'] ?? []) as Array<Record<string, unknown>>
  const hasTtPostToolUse = postToolUseHooks.some((entry) => {
    const entryHooks = (entry['hooks'] ?? []) as Array<Record<string, unknown>>
    return entryHooks.some((h) => String(h['command'] ?? '').includes('post-tool-use.sh'))
  })

  if (!hasTtPostToolUse) {
    postToolUseHooks.push({
      matcher: 'tool != "AskUserQuestion" && tool != "ExitPlanMode"',
      hooks: [{ type: 'command', command: '~/.tt/hooks/post-tool-use.sh', async: true }],
    })
    hooks['PostToolUse'] = postToolUseHooks
    changed = true
  }

  // Ensure Stop has tt hook
  const stopHooks = (hooks['Stop'] ?? []) as Array<Record<string, unknown>>
  const hasTtStop = stopHooks.some((entry) => {
    const entryHooks = (entry['hooks'] ?? []) as Array<Record<string, unknown>>
    return entryHooks.some((h) => String(h['command'] ?? '').includes('stop.sh'))
  })

  if (!hasTtStop) {
    stopHooks.push({
      hooks: [{ type: 'command', command: '~/.tt/hooks/stop.sh', async: true }],
    })
    hooks['Stop'] = stopHooks
    changed = true
  }

  if (changed) {
    settings['hooks'] = hooks
    // Backup before writing
    if (fs.existsSync(settingsPath)) {
      fs.copyFileSync(settingsPath, settingsPath + '.bak')
    }
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n', 'utf-8')
  }

  return changed
}

const setupCommand = define({
  name: 'setup',
  description: 'Install hooks, skills, and configure Claude Code integration',
  args: {},
  run: () => {
    const ttDir = getHomeTtDir()
    const hooksDir = path.join(ttDir, 'hooks')
    const terminalsDir = path.join(ttDir, 'terminals')
    const binDir = path.join(ttDir, 'bin')
    const cacheDir = path.join(ttDir, 'cache')
    const sourceRepo = getSourceRepoDir()

    // Create directories with restricted permissions
    for (const dir of [hooksDir, terminalsDir, binDir, cacheDir]) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.chmodSync(ttDir, 0o700)
    for (const dir of [hooksDir, terminalsDir, binDir, cacheDir]) {
      fs.chmodSync(dir, 0o700)
    }

    // Write hook scripts (bash + node)
    const scripts: ReadonlyArray<readonly [string, string]> = [
      [path.join(hooksDir, 'session-start.sh'), SESSION_START_SCRIPT],
      [path.join(hooksDir, 'post-tool-use.sh'), POST_TOOL_USE_SCRIPT],
      [path.join(hooksDir, 'stop.sh'), STOP_SCRIPT],
      [path.join(hooksDir, 'check-update.js'), CHECK_UPDATE_SCRIPT],
    ]

    for (const [filePath, content] of scripts) {
      fs.writeFileSync(filePath, content, 'utf-8')
      fs.chmodSync(filePath, 0o755)
    }
    output('info', `Hook scripts installed to ${hooksDir}/`)

    // Symlink binary
    const currentBinary = process.argv[0]
    const binTarget = path.join(binDir, 'tt')

    if (currentBinary) {
      try {
        try { fs.unlinkSync(binTarget) } catch { /* may not exist */ }
        const resolvedBinary = fs.realpathSync(currentBinary)
        fs.symlinkSync(resolvedBinary, binTarget)
        output('info', `Binary symlinked: ${binTarget} -> ${resolvedBinary}`)
      } catch {
        output('info', `Could not symlink binary. Copy your tt binary to ${binTarget}`)
      }
    }

    // Write VERSION file
    const versionFile = path.join(ttDir, 'VERSION')
    fs.writeFileSync(versionFile, VERSION, 'utf-8')
    output('info', `VERSION file written (v${VERSION})`)

    // Record sourceRepo in config
    const config = loadConfig()
    const updatedConfig = { ...config, sourceRepo }
    saveConfig(updatedConfig)
    output('info', `Source repo recorded: ${sourceRepo}`)

    // Install skills globally
    const skillCount = installSkills(sourceRepo)
    if (skillCount > 0) {
      output('info', `${skillCount} skills installed to ~/.claude/skills/`)
    }

    // Auto-patch settings.json
    const patched = patchSettingsJson(ttDir)
    if (patched) {
      output('started', 'settings.json patched with tt hooks (backup at settings.json.bak)')
    } else {
      output('info', 'settings.json already has tt hooks configured')
    }

    output('started', 'Setup complete! Restart Claude Code to activate hooks.')
  },
})

export default setupCommand
