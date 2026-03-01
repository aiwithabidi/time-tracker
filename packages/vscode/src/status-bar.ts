import { execFile } from 'child_process'
import * as vscode from 'vscode'

interface NowResponse {
  active: boolean
  project?: string
  durationMs?: number
  todayTotalMs?: number
  idleState?: string
  goalMinutes?: number
  goalPercent?: number
}

export interface StatusBar {
  update(): void
  dispose(): void
}

function formatDuration(ms: number): string {
  const totalMinutes = Math.floor(ms / 60_000)
  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export function createStatusBar(binaryPath: string, intervalMs: number): StatusBar {
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100)
  item.command = 'tt.showStatus'
  let timer: ReturnType<typeof setInterval> | null = null

  function update(): void {
    execFile(binaryPath, ['now', '--json'], { timeout: 5_000 }, (error, stdout) => {
      if (error) {
        item.hide()
        return
      }

      try {
        const data: NowResponse = JSON.parse(stdout.trim())

        if (!data.active) {
          item.text = '$(clock) idle'
          item.tooltip = 'tt: No active session'
          item.show()
          return
        }

        const duration = formatDuration(data.durationMs ?? 0)
        const project = data.project ?? 'unknown'

        if (data.goalPercent != null && data.goalPercent > 0) {
          item.text = `$(clock) ${project} ${duration} (${data.goalPercent}%)`
        } else {
          item.text = `$(clock) ${project} ${duration}`
        }

        const todayTotal = data.todayTotalMs ? formatDuration(data.todayTotalMs) : '0m'
        item.tooltip = `tt: ${project} — Session: ${duration}, Today: ${todayTotal}`
        item.show()
      } catch {
        item.hide()
      }
    })
  }

  update()
  timer = setInterval(update, intervalMs)

  function dispose(): void {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
    item.dispose()
  }

  return { update, dispose }
}
