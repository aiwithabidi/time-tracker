import * as vscode from 'vscode'
import { findBinary } from './binary-finder'
import { createPulseRunner, type PulseRunner } from './pulse-runner'
import { createStatusBar, type StatusBar } from './status-bar'

let pulseRunner: PulseRunner | null = null
let statusBar: StatusBar | null = null

function getCwd(document?: vscode.TextDocument): string {
  if (document) {
    const folder = vscode.workspace.getWorkspaceFolder(document.uri)
    if (folder) {
      return folder.uri.fsPath
    }
  }

  const folders = vscode.workspace.workspaceFolders
  if (folders && folders.length > 0) {
    return folders[0].uri.fsPath
  }

  return process.cwd()
}

function startup(context: vscode.ExtensionContext): void {
  const config = vscode.workspace.getConfiguration('tt')
  const enabled = config.get<boolean>('enabled', true)

  if (!enabled) {
    return
  }

  const binaryPath = findBinary()

  if (!binaryPath) {
    vscode.window.showInformationMessage(
      'tt time tracker binary not found. Install tt or set tt.binaryPath in settings.'
    )
    return
  }

  const intervalSeconds = config.get<number>('statusBarInterval', 30)
  const intervalMs = Math.max(intervalSeconds, 5) * 1000

  pulseRunner = createPulseRunner(binaryPath)
  statusBar = createStatusBar(binaryPath, intervalMs)

  context.subscriptions.push({ dispose: () => pulseRunner?.dispose() })
  context.subscriptions.push({ dispose: () => statusBar?.dispose() })

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((document) => {
      pulseRunner?.pulse('vscode-save', getCwd(document))
    })
  )

  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((editor) => {
      if (editor) {
        pulseRunner?.pulse('vscode-focus', getCwd(editor.document))
      }
    })
  )

  context.subscriptions.push(
    vscode.commands.registerCommand('tt.showStatus', () => {
      statusBar?.update()
    })
  )
}

function teardown(): void {
  if (pulseRunner) {
    pulseRunner.dispose()
    pulseRunner = null
  }
  if (statusBar) {
    statusBar.dispose()
    statusBar = null
  }
}

export function activate(context: vscode.ExtensionContext): void {
  startup(context)

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('tt')) {
        teardown()
        startup(context)
      }
    })
  )
}

export function deactivate(): void {
  teardown()
}
