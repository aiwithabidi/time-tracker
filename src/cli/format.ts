import chalk from 'chalk'

export const symbols = {
  started: '\u25B6',
  stopped: '\u25A0',
  idle: '\u25CB',
  paused: '\u25CE',
  error: '\u2717',
  info: '\u25CF',
} as const

const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000

export function formatDuration(ms: number): string {
  if (ms < MS_PER_MINUTE) {
    return '< 1m'
  }

  const hours = Math.floor(ms / MS_PER_HOUR)
  const minutes = Math.floor((ms % MS_PER_HOUR) / MS_PER_MINUTE)

  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }

  return parts.join(' ')
}

function isColorEnabled(): boolean {
  if (process.env['NO_COLOR'] !== undefined) {
    return false
  }
  return process.stdout.isTTY ?? false
}

export function output(symbol: keyof typeof symbols, message: string): void {
  const icon = symbols[symbol]
  if (isColorEnabled()) {
    const coloredIcon =
      symbol === 'error'
        ? chalk.red(icon)
        : symbol === 'started'
          ? chalk.green(icon)
          : symbol === 'stopped'
            ? chalk.yellow(icon)
            : symbol === 'paused'
              ? chalk.yellow(icon)
              : chalk.blue(icon)
    process.stdout.write(`${coloredIcon} ${message}\n`)
  } else {
    process.stdout.write(`${icon} ${message}\n`)
  }
}

export function formatCurrency(amount: number, currency: string): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount)
}

export function errorOutput(message: string, suggestion?: string): void {
  if (isColorEnabled()) {
    process.stderr.write(`${chalk.red(symbols.error)} ${chalk.red(message)}\n`)
    if (suggestion) {
      process.stderr.write(`  ${chalk.dim(suggestion)}\n`)
    }
  } else {
    process.stderr.write(`${symbols.error} ${message}\n`)
    if (suggestion) {
      process.stderr.write(`  ${suggestion}\n`)
    }
  }
}
