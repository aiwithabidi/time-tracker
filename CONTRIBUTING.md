# Contributing to tt

Thanks for your interest in contributing! tt is a small, focused CLI tool and contributions of all sizes are welcome.

## Quick Links

- **GitHub:** https://github.com/aiwithabidi/time-tracker
- **Issues:** https://github.com/aiwithabidi/time-tracker/issues

## Development Setup

```bash
# Clone and install
git clone https://github.com/aiwithabidi/time-tracker.git
cd time-tracker
bun install

# Run in dev mode (no compile step)
bun run dev -- now
bun run dev -- today

# Type check
bun run typecheck

# Run tests
bun run test:unit          # Unit tests with coverage
bun run test:integration   # Integration tests
bun run test               # Both

# Build the binary
bun run build              # Creates dist/tt
```

## Project Structure

```
src/
  cli/          Command definitions (gunshi), formatting, helpers
    commands/   One file per command (start.ts, stop.ts, now.ts, ...)
  core/         Pure business logic — sessions, idle detection, reports
    session/    Session lifecycle, idle detection
    reports/    Report generation
    export/     CSV export
    review/     Work review generation
    shared/     Shared utilities (time math, duration formatting)
  services/     Service factory layer (creates services with DB access)
  db/           SQLite schema (Drizzle ORM), repositories, migrations
  config/       Config loading, Zod schemas, types
  hooks/        Claude Code hook scripts (pulse, session lifecycle)
tests/
  cli/          CLI command tests
  core/         Business logic tests
  integration/  End-to-end integration tests
skills/         Claude Code slash commands (/tt, /tt:start, /tt:week, ...)
```

## How to Contribute

1. **Bugs and small fixes** — Open a PR directly
2. **New features or architecture changes** — Open an issue first to discuss the approach
3. **Questions** — Use GitHub Discussions

## Before You PR

- [ ] Run `bun run typecheck` — no type errors
- [ ] Run `bun run test:unit` — all tests pass
- [ ] Run `bun run build` — binary compiles
- [ ] Keep PRs focused (one thing per PR)
- [ ] Follow existing code style (immutable patterns, small functions)
- [ ] Use conventional commit messages (`feat:`, `fix:`, `refactor:`, etc.)

## Code Style

- **Immutability** — Always spread, never mutate
- **Small files** — 200-400 lines typical, 800 max
- **Error handling** — Handle errors explicitly, provide helpful messages
- **No console.log** — Use the `output()` / `errorOutput()` helpers from `src/cli/format.ts`

## Testing

We use [Vitest](https://vitest.dev) for unit tests and Bun's built-in test runner for integration tests. Coverage target is 80%.

```bash
# Run unit tests with coverage report
bun run test:unit

# Run a specific test file
bunx vitest run src/core/session/__tests__/idle-detector.test.ts
```

## AI-Assisted PRs Welcome

Built with Claude Code, Copilot, or another AI tool? Great — just mention it in the PR description so reviewers know the context.

## Maintainers

- **Abidi** — Creator
  - GitHub: [@aiwithabidi](https://github.com/aiwithabidi) / X: [@aiwithabidi](https://x.com/aiwithabidi)
