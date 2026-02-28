import { cli, define, lazy } from 'gunshi'

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

await cli(process.argv.slice(2), mainCommand, {
  name: 'tt',
  description: 'Time tracking for developers',
  version: '0.1.0',
  subCommands,
})
