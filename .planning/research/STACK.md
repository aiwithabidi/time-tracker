# Stack Research

**Domain:** CLI-first time tracking tool (Bun/TypeScript)
**Researched:** 2026-02-27
**Confidence:** MEDIUM-HIGH (core stack HIGH; some library versions MEDIUM due to rapid ecosystem movement)

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| Bun | >=1.2 | Runtime, package manager, bundler, test runner | Mandated by project constraints; native TypeScript, built-in SQLite, fast shell script startup (<10ms cold start); Claude Code itself ships as a Bun-compiled binary |
| TypeScript | ~5.7 (via Bun) | Language | Bun executes TS natively without a transpile step — no tsconfig trickery needed for the CLI |
| gunshi | ^0.27 | CLI framework / argument parsing | Type-safe argument parsing built on Node's `parseArgs`; first-class Bun support; lazy sub-commands for fast startup; active in 2025; chosen by the "My JS CLI Stack 2025" reference author over citty/cac/cleye/commander |
| drizzle-orm | ^0.45 | ORM / query builder over bun:sqlite | First-party Drizzle docs show bun:sqlite as a supported dialect; generates SQL migrations; type-safe queries without a full SQL string; thin abstraction that doesn't hide SQLite's synchronous API |
| drizzle-kit | ^0.45 | Schema migrations (CLI companion) | `bunx drizzle-kit generate` and `bunx drizzle-kit migrate` work natively; keeps schema-to-migration workflow clean |
| bun:sqlite | built-in | Local SQLite storage | Zero deps; 3-6x faster than better-sqlite3 for read queries; synchronous API matches CLI's single-process execution model; WAL mode supported via PRAGMA |
| luxon | ^3.7 | Date/time — Duration, Interval, timezone | Built-in Duration and Interval types map directly to time-tracking math (elapsed, gaps, overlap detection); native IANA timezone via Intl (no tz file to bundle); immutable API matches project coding-style rule; v3.7.2 is current as of research date |
| ink | ^6.8 | Terminal UI rendering for dashboards | React component model for terminal; `<Box>` flexbox layout, `<Text>` styling; used by Gatsby, Shopify, Parcel; v6.8.0 published 8 days before research date — actively maintained; works with Bun |
| @inkjs/ui | ^2.0 | Pre-built ink components | Spinners, select inputs, progress bars, text inputs — avoids reimplementing common TUI patterns |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| consola | ^3 | Structured terminal output (info, success, warn, error) | Non-interactive output paths (hook scripts, status lines); lighter than ink for simple log messages; used in the "My JS CLI Stack 2025" reference |
| chalk | ^5 | Terminal string styling (colors, bold) | Colorizing output in consola log messages and raw stdout outside of ink render trees |
| @clack/prompts | ^0.9 | Interactive prompts | `tt edit`, `tt note`, confirmation dialogs; 80% smaller than alternatives; component-style API that composes with ink flows |
| zod | ^3.24 | Runtime validation | Validating config file, hook payloads, CLI option schemas (gunshi has Zod integration available) |
| vitest | ^3 | Unit and integration tests | Bun's built-in test runner works, but vitest provides safe env-var mocking critical for CLI testing, in-source tests via `import.meta.vitest`, and richer assertion API |

### Development Tools

| Tool | Purpose | Notes |
|------|---------|-------|
| tsdown | Bundler for distribution binary | Rust-based (Rolldown); superior tree-shaking vs esbuild; produces minimal bundle before `bun build --compile`; use when distributing as an npm package |
| `bun build --compile` | Single-file executable | Embeds Bun runtime + app into one binary; use for direct PATH installation; `--target bun-darwin-arm64` for Apple Silicon |
| biome | Linting + formatting | Replaces ESLint + Prettier in one tool; fast; compatible with Bun projects |
| `bun test` | Test runner (built-in) | Use for unit tests if vitest feels heavy; vitest preferred for CLI tools due to env mocking |

---

## Installation

```bash
# Core
bun add gunshi drizzle-orm luxon ink @inkjs/ui

# Supporting
bun add consola chalk @clack/prompts zod

# Dev dependencies
bun add -D drizzle-kit vitest biome tsdown @types/luxon @types/bun
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| gunshi | Commander.js | Commander.js is fine for simple tools; skip it for this project — type safety is bolted on, not built in; gunshi is better for TypeScript-first CLIs with many subcommands |
| gunshi | Clipanion | Clipanion is excellent (powers Yarn) and type-safe via class decorators; gunshi is lighter and less opinionated; either is a valid choice — gunshi won on bundle size and simpler API for this scope |
| gunshi | Citty | Citty (UnJS) is popular but its alias/subcommand ergonomics are awkward (duplicate key workaround); gunshi is more idiomatic for 2025 TypeScript projects |
| gunshi | oclif | oclif is the right choice for large multi-team CLI frameworks (Salesforce, Heroku); unnecessary complexity for a single-developer personal tool |
| gunshi | Bunli | Bunli is Bun-specific with Zod integration; promising but no verified version, low adoption signal; gunshi has more documented real-world usage in 2025 |
| bun:sqlite + drizzle-orm | better-sqlite3 | Use better-sqlite3 if this project ever needs to run on Node.js — the APIs are nearly identical. For pure Bun, bun:sqlite has zero setup and outperforms it |
| bun:sqlite + drizzle-orm | Prisma | Prisma adds a daemon process and complex schema DSL; overkill for a local single-user CLI; startup overhead would violate the <100ms hook constraint |
| luxon | date-fns | date-fns has no built-in Duration or Interval types, no timezone support without date-fns-tz addon; luxon's Duration and Interval are the correct primitives for time-tracking math |
| luxon | Temporal API | TC39 Stage 3; Chrome 144 (Jan 2026) ships it but **Bun has an open issue for Temporal support** (not yet implemented); do not use native Temporal in Bun yet — use the polyfill only if needed |
| luxon | dayjs | dayjs uses Intl (slow) and its plugin model fragments the API; fine for display formatting, wrong for duration arithmetic |
| ink | blessed / neo-blessed | blessed is unmaintained; neo-blessed is a fork with limited TypeScript support; ink's React model is more maintainable and has an active ecosystem |
| vitest | bun test | bun test lacks safe env-var mocking and test isolation features critical for CLI tools that read environment variables (CLAUDE_SESSION_ID, TT_TERMINAL_ID) |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| Moment.js | Deprecated by its own authors; mutable API; large bundle | luxon |
| Prisma | Spawns a background daemon; adds 200ms+ startup time; violates <100ms hook constraint | drizzle-orm + bun:sqlite |
| better-sqlite3 | Requires native compilation; node-gyp pain; redundant when bun:sqlite is built-in and faster | bun:sqlite |
| Temporal API (native) | Bun does not yet implement it (open issue #15853 on oven-sh/bun) | luxon; add @js-temporal/polyfill only if API parity matters |
| oclif | Framework-in-a-framework complexity; plugin scaffold adds overhead inappropriate for a personal tool | gunshi |
| yargs | Designed pre-TypeScript; type definitions feel retrofitted; slow startup vs gunshi | gunshi |
| blessed / neo-blessed | Abandoned or minimally maintained; no React component model | ink |
| tsx / ts-node | Unnecessary — Bun runs TypeScript natively at startup | `bun run` directly |
| Inquirer.js | Larger and heavier than @clack/prompts; less modern API | @clack/prompts |

---

## Stack Patterns by Variant

**For Claude Code hook scripts (PreToolUse, PostToolUse, SessionStart, Stop):**
- Shell scripts call `tt` binary directly: `tt session start --project "$(pwd)"`
- The binary must be compiled or on PATH; use `bun build --compile` for distribution
- Hook scripts are bash/zsh — the CLI binary handles all logic; hooks stay thin
- Startup time matters: gunshi's lazy subcommand loading + bun:sqlite synchronous reads keep cold start <50ms

**For interactive dashboard commands (`tt week`, `tt projects`):**
- Use ink for full terminal UI with flex layout and live-updating tables
- Use @inkjs/ui for spinner during DB query, then render results table
- Consider splitting: `tt week` outputs static table (consola + chalk), `tt week --live` uses ink

**For non-interactive output (`tt status`, hook telemetry):**
- Use consola + chalk for plain structured output
- Avoid ink overhead when no interactivity is needed

**For the local database:**
- Enable WAL mode on first open: `db.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;')`
- Use drizzle-orm for all queries — never raw SQL strings outside the schema file
- Use `db.transaction()` for session start/stop writes (atomic with git context capture)
- Store durations as integer seconds; reconstruct luxon Duration on read

---

## Version Compatibility

| Package | Compatible With | Notes |
|---------|-----------------|-------|
| ink ^6.8 | React ^18 | ink v6 requires React 18; @inkjs/ui ^2.0 is the matching component library |
| drizzle-orm ^0.45 | bun:sqlite built-in | drizzle-kit must match drizzle-orm minor version; pin both to same release line |
| gunshi ^0.27 | Bun >=1.0, Node >=18 | Type-safe argument typing relies on TypeScript >=5.0 |
| luxon ^3.7 | @types/luxon ^3.7 | Types are in a separate @types package — install both |
| vitest ^3 | Bun >=1.2 | vitest can use bun as test runner via `--pool=vmForks`; check vitest docs for bun-specific config |

---

## Sources

- [Bun SQLite docs](https://bun.com/docs/runtime/sqlite) — bun:sqlite API, WAL mode, performance claims — HIGH confidence
- [Drizzle ORM bun:sqlite guide](https://orm.drizzle.team/docs/get-started/bun-sqlite-new) — setup, migration commands, schema definition — HIGH confidence
- [gunshi GitHub](https://github.com/kazupon/gunshi) — framework features, v0.27 type system — MEDIUM confidence (actively developed, minor API churn possible)
- [My JS CLI Stack 2025](https://ryoppippi.com/blog/2025-08-12-my-js-cli-stack-2025-en) — gunshi, tsdown, consola, vitest, bun as stack — MEDIUM confidence (single author, but well-reasoned with alternatives evaluated)
- [Building CLI apps with TypeScript in 2026](https://hackers.pub/@hongminhee/2026/typescript-cli-2026) — Optique (not recommended here), Temporal API integration — LOW confidence on Optique (no version, low adoption signal)
- [ink GitHub](https://github.com/vadimdemedes/ink) — v6.8.0, React-based TUI, Bun compatible — HIGH confidence
- [Temporal support Bun issue #15853](https://github.com/oven-sh/bun/issues/15853) — Bun does NOT yet have native Temporal — HIGH confidence (open GitHub issue)
- [Bun single-file executable docs](https://bun.com/docs/bundler/executables) — `--compile` flag for CLI distribution — HIGH confidence
- WebSearch: luxon v3.7.2 current; date-fns lacks Duration/Interval; Temporal in Chrome 144 Jan 2026 — MEDIUM confidence

---

*Stack research for: CLI-first time tracking tool (Bun/TypeScript)*
*Researched: 2026-02-27*
