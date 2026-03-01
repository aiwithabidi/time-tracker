import { cli, define, lazy } from 'gunshi'
import { VERSION } from './version'
import { logCommandEvent, parseCommandFromArgv } from '../core/event-logger'

const commandStart = performance.now()
const parsed = parseCommandFromArgv(process.argv)

const mainCommand = define({
  name: 'tt',
  description: 'Time tracking for developers',
  run: (ctx) => {
    ctx.log('Run tt --help to see available commands')
  },
})

const subCommands = new Map()

subCommands.set(
  'start',
  lazy(() => import('./commands/start').then((m) => m.default), {
    name: 'start',
    description: 'Start tracking time on a project',
    args: {
      project: {
        type: 'string',
        short: 'p',
        description: 'Project slug or name',
      },
    },
  })
)

subCommands.set(
  'stop',
  lazy(() => import('./commands/stop').then((m) => m.default), {
    name: 'stop',
    description: 'Stop the current time tracking session',
    args: {
      project: {
        type: 'string',
        short: 'p',
        description: 'Project slug or name',
      },
    },
  })
)

subCommands.set(
  'now',
  lazy(() => import('./commands/now').then((m) => m.default), {
    name: 'now',
    description: 'Show current tracking status',
    args: {
      json: {
        type: 'boolean',
        description: 'Output machine-readable JSON',
      },
    },
  })
)

subCommands.set(
  'note',
  lazy(() => import('./commands/note').then((m) => m.default), {
    name: 'note',
    description: 'Add a note to the current session',
    args: {
      message: {
        type: 'string',
        short: 'm',
        description: 'Note content',
      },
    },
  })
)

subCommands.set(
  'tag',
  lazy(() => import('./commands/tag').then((m) => m.default), {
    name: 'tag',
    description: 'Manage tags on the current session',
    args: {
      add: {
        type: 'string',
        short: 'a',
        description: 'Tag to add',
      },
      remove: {
        type: 'string',
        short: 'r',
        description: 'Tag to remove',
      },
    },
  })
)

subCommands.set(
  'away',
  lazy(() => import('./commands/away').then((m) => m.default), {
    name: 'away',
    description: 'Take a break from the current session',
  })
)

subCommands.set(
  'back',
  lazy(() => import('./commands/back').then((m) => m.default), {
    name: 'back',
    description: 'Resume tracking after a break',
  })
)

subCommands.set(
  'setup',
  lazy(() => import('./commands/setup').then((m) => m.default), {
    name: 'setup',
    description: 'Install hook scripts and print configuration for Claude Code',
  })
)

subCommands.set(
  'pulse',
  lazy(() => import('./commands/pulse').then((m) => m.default), {
    name: 'pulse',
    description: 'Record an activity heartbeat (used by shell hooks)',
    args: {
      source: {
        type: 'string',
        short: 's',
        description: 'Hook source (claude-startup, claude-resume, post-tool-use, stop, manual)',
        required: true,
      },
      cwd: {
        type: 'string',
        short: 'c',
        description: 'Working directory for project inference',
        required: true,
      },
      'session-id': {
        type: 'string',
        description: 'Claude session ID for correlation',
      },
      'terminal-id': {
        type: 'string',
        short: 't',
        description: 'Override TT_TERMINAL_ID env var',
      },
    },
  })
)

subCommands.set(
  'today',
  lazy(() => import('./commands/today').then((m) => m.default), {
    name: 'today',
    description: "Show today's time by project",
  })
)

subCommands.set(
  'week',
  lazy(() => import('./commands/week').then((m) => m.default), {
    name: 'week',
    description: "Show this week's time report",
    args: {
      project: {
        type: 'string',
        short: 'p',
        description: 'Filter by project slug',
      },
      billable: {
        type: 'boolean',
        short: 'b',
        description: 'Show billable amounts',
      },
    },
  })
)

subCommands.set(
  'log',
  lazy(() => import('./commands/log').then((m) => m.default), {
    name: 'log',
    description: 'Show session history',
    args: {
      project: {
        type: 'string',
        short: 'p',
        description: 'Filter by project slug',
      },
      from: {
        type: 'string',
        description: 'Start date (YYYY-MM-DD or shortcut)',
      },
      to: {
        type: 'string',
        description: 'End date (YYYY-MM-DD or shortcut)',
      },
    },
  })
)

subCommands.set(
  'last',
  lazy(() => import('./commands/last').then((m) => m.default), {
    name: 'last',
    description: 'Show the last completed session',
  })
)

subCommands.set(
  'projects',
  lazy(() => import('./commands/projects').then((m) => m.default), {
    name: 'projects',
    description: 'List all projects with this-week totals',
  })
)

subCommands.set(
  'export',
  lazy(() => import('./commands/export').then((m) => m.default), {
    name: 'export',
    description: 'Export time data (usage: tt export csv [flags])',
    args: {
      project: {
        type: 'string',
        short: 'p',
        description: 'Filter by project slug',
      },
      from: {
        type: 'string',
        description: 'Start date (YYYY-MM-DD or keyword)',
      },
      to: {
        type: 'string',
        description: 'End date (YYYY-MM-DD or keyword)',
      },
      'dry-run': {
        type: 'boolean',
        description: 'Preview without outputting CSV',
      },
    },
  })
)

subCommands.set(
  'edit',
  lazy(() => import('./commands/edit').then((m) => m.default), {
    name: 'edit',
    description: 'Edit a past session',
    args: {
      start: {
        type: 'string',
        description: 'New start time (HH:mm or ISO 8601)',
      },
      end: {
        type: 'string',
        description: 'New end time (HH:mm or ISO 8601)',
      },
      project: {
        type: 'string',
        short: 'p',
        description: 'Reassign to project slug',
      },
      note: {
        type: 'string',
        short: 'n',
        description: 'Append a note',
      },
      tag: {
        type: 'string',
        short: 't',
        description: 'Add a tag',
      },
      untag: {
        type: 'string',
        description: 'Remove a tag',
      },
    },
  })
)

subCommands.set(
  'undo',
  lazy(() => import('./commands/undo').then((m) => m.default), {
    name: 'undo',
    description: 'Undo the last state-changing operation',
  })
)

subCommands.set(
  'split',
  lazy(() => import('./commands/split').then((m) => m.default), {
    name: 'split',
    description: 'Split a session at a given time',
    args: {
      yes: {
        type: 'boolean',
        short: 'y',
        description: 'Skip confirmation prompt',
      },
    },
  })
)

subCommands.set(
  'merge',
  lazy(() => import('./commands/merge').then((m) => m.default), {
    name: 'merge',
    description: 'Merge two adjacent sessions',
    args: {
      yes: {
        type: 'boolean',
        short: 'y',
        description: 'Skip confirmation prompt',
      },
      force: {
        type: 'boolean',
        short: 'f',
        description: 'Allow merge with gap > 60 minutes',
      },
    },
  })
)

subCommands.set(
  'alias',
  lazy(() => import('./commands/alias').then((m) => m.default), {
    name: 'alias',
    description: 'Manage project directory aliases (usage: tt alias add|list|remove)',
  })
)

subCommands.set(
  'rate',
  lazy(() => import('./commands/rate').then((m) => m.default), {
    name: 'rate',
    description: 'Manage project hourly rates (usage: tt rate set|show)',
  })
)

subCommands.set(
  'review',
  lazy(() => import('./commands/review').then((m) => m.default), {
    name: 'review',
    description: 'Manage work reviews (usage: tt review gather|list|show|save|delete)',
    args: {
      project: {
        type: 'string',
        short: 'p',
        description: 'Filter by project slug',
      },
      from: {
        type: 'string',
        description: 'Start date (YYYY-MM-DD or keyword)',
      },
      to: {
        type: 'string',
        description: 'End date (YYYY-MM-DD or keyword)',
      },
      spread: {
        type: 'string',
        description: 'Spread work across N weekdays',
      },
      limit: {
        type: 'string',
        short: 'l',
        description: 'Limit number of results',
      },
      title: {
        type: 'string',
        description: 'Review title (for save)',
      },
      audience: {
        type: 'string',
        description: 'Review audience: client|developer|email|custom',
      },
      content: {
        type: 'string',
        description: 'Review content (for save)',
      },
      'period-start': {
        type: 'string',
        description: 'Period start epoch ms (for save)',
      },
      'period-end': {
        type: 'string',
        description: 'Period end epoch ms (for save)',
      },
      'total-ms': {
        type: 'string',
        description: 'Total duration in ms (for save)',
      },
      'raw-data': {
        type: 'string',
        description: 'Raw gathered data JSON (for save)',
      },
    },
  })
)

subCommands.set(
  'version',
  lazy(() => import('./commands/version').then((m) => m.default), {
    name: 'version',
    description: 'Show tt version and update status',
  })
)

subCommands.set(
  'update',
  lazy(() => import('./commands/update').then((m) => m.default), {
    name: 'update',
    description: 'Update tt to the latest version from source',
    args: {
      check: {
        type: 'boolean',
        description: 'Only check for updates, do not install',
      },
      yes: {
        type: 'boolean',
        short: 'y',
        description: 'Skip confirmation prompt',
      },
    },
  })
)

subCommands.set(
  'doctor',
  lazy(() => import('./commands/doctor').then((m) => m.default), {
    name: 'doctor',
    description: 'Check tt installation health and auto-repair issues',
    args: {
      repair: {
        type: 'boolean',
        short: 'r',
        description: 'Auto-repair fixable issues',
      },
    },
  })
)

subCommands.set(
  'config',
  lazy(() => import('./commands/config').then((m) => m.default), {
    name: 'config',
    description: 'Manage tt configuration (usage: tt config list|get|set)',
  })
)

subCommands.set(
  'logs',
  lazy(() => import('./commands/logs').then((m) => m.default), {
    name: 'logs',
    description: 'View command event logs for product analytics',
    args: {
      limit: {
        type: 'string',
        short: 'l',
        description: 'Number of events to show (default: 25)',
      },
      command: {
        type: 'string',
        short: 'c',
        description: 'Filter by command name',
      },
      errors: {
        type: 'boolean',
        short: 'e',
        description: 'Show only errors',
      },
      stats: {
        type: 'boolean',
        short: 's',
        description: 'Show usage statistics summary',
      },
      from: {
        type: 'string',
        description: 'Start date (YYYY-MM-DD)',
      },
      to: {
        type: 'string',
        description: 'End date (YYYY-MM-DD)',
      },
      json: {
        type: 'boolean',
        description: 'Output raw JSON for AI analysis',
      },
    },
  })
)

subCommands.set(
  'dashboard',
  lazy(() => import('./commands/dashboard').then((m) => m.default), {
    name: 'dashboard',
    description: 'Open the time tracking dashboard in your browser',
    args: {
      port: {
        type: 'string',
        short: 'p',
        description: 'Port to run the dashboard on (default: 7777)',
      },
    },
  })
)

subCommands.set(
  'streak',
  lazy(() => import('./commands/streak').then((m) => m.default), {
    name: 'streak',
    description: 'Show your tracking streak and 28-day heatmap',
  })
)

subCommands.set(
  'goal',
  lazy(() => import('./commands/goal').then((m) => m.default), {
    name: 'goal',
    description: 'Manage daily time goal (usage: tt goal set|show|clear)',
  })
)

// Skip event logging for pulse commands (high-frequency, called by hooks)
const skipLogging = parsed.command === 'pulse'

try {
  await cli(process.argv.slice(2), mainCommand, {
    name: 'tt',
    description: 'Time tracking for developers',
    version: VERSION,
    subCommands,
  })

  if (!skipLogging) {
    logCommandEvent({
      command: parsed.command,
      subcommand: parsed.subcommand,
      args: parsed.args,
      durationMs: Math.round(performance.now() - commandStart),
      success: process.exitCode === undefined || process.exitCode === 0,
      errorMessage: undefined,
      cwd: process.cwd(),
    })
  }
} catch (error) {
  if (!skipLogging) {
    logCommandEvent({
      command: parsed.command,
      subcommand: parsed.subcommand,
      args: parsed.args,
      durationMs: Math.round(performance.now() - commandStart),
      success: false,
      errorMessage: error instanceof Error ? error.message : String(error),
      errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      cwd: process.cwd(),
    })
  }
  throw error
}
