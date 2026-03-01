# tt - Time Tracker (VS Code Extension)

Passive time tracking for developers. This extension integrates with the [tt CLI](https://github.com/tt-cli/time-tracker) to automatically track your coding time.

## How it works

- Sends a pulse to `tt` when you save a file or switch editors
- Shows your current session in the status bar (project, duration, goal progress)
- No manual start/stop needed -- tt handles idle detection automatically

## Prerequisites

The `tt` CLI must be installed. The extension will look for it in:

1. The path configured in `tt.binaryPath` setting
2. `~/.tt/bin/tt`
3. Your system PATH

## Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `tt.enabled` | `true` | Enable/disable time tracking |
| `tt.binaryPath` | `""` | Path to the tt binary (auto-detected if empty) |
| `tt.statusBarInterval` | `30` | Status bar refresh interval in seconds |

## Commands

- **Show Time Tracking Status** - Force-refresh the status bar display

## Install

From a `.vsix` file:

```
code --install-extension tt-time-tracker-0.3.0.vsix
```

Or build from source:

```
cd packages/vscode
bun install
bun run build
bun run package
```
