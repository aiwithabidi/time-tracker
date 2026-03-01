import { execSync } from 'child_process'
import { existsSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'
import * as vscode from 'vscode'

export function findBinary(): string | null {
  const config = vscode.workspace.getConfiguration('tt')
  const configuredPath = config.get<string>('binaryPath', '')

  if (configuredPath && existsSync(configuredPath)) {
    return configuredPath
  }

  const homeBinary = join(homedir(), '.tt', 'bin', 'tt')
  if (existsSync(homeBinary)) {
    return homeBinary
  }

  try {
    const whichResult = execSync('which tt', { encoding: 'utf-8' }).trim()
    if (whichResult && existsSync(whichResult)) {
      return whichResult
    }
  } catch {
    // tt not found in PATH
  }

  return null
}
