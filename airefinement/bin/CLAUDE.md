# CLI Module — `bin/cli.ts`

## Overview

Commander.js-based CLI that exposes all AI Refinement module functionality through 5 commands. The `program` object is exported for testability, allowing unit tests to call `parseAsync` directly without spawning subprocesses.

## Usage Examples

```bash
# Analyze run artifacts for refinement triggers
npx ts-node bin/cli.ts analyze

# Run refinement from analysis file (dry-run mode)
npx ts-node bin/cli.ts refine --analysis artifacts/analysis.json --dry-run

# A/B evaluation between two branches
npx ts-node bin/cli.ts eval --control main --variant feat/new-prompt --trials 5 --quick

# Show experiment history table
npx ts-node bin/cli.ts report --history

# Show latest report in JSON format
npx ts-node bin/cli.ts report --format json

# Show pipeline KPIs for last 10 runs
npx ts-node bin/cli.ts metrics --runs 10
```

## Commands

| Command   | Required Options         | Optional Options                                                                                         | Delegates to                                        |
|-----------|--------------------------|----------------------------------------------------------------------------------------------------------|-----------------------------------------------------|
| `analyze` | —                        | `--artifacts-dir <path>` (default: `airefinement/artifacts`), `--config <path>` (default: `airefinement/config`) | `triggers/analyzer.analyze()`                |
| `refine`  | `--analysis <path>`      | `--dry-run`                                                                                              | `refinement/agent-runner.runRefinement()`           |
| `eval`    | `--control`, `--variant` | `--dataset <path>` (default: `.../golden-v1.jsonl`), `--trials <n>` (default: 3), `--quick`             | `eval/runner.runEval()`                             |
| `report`  | —                        | `--history`, `--format json\|md`                                                                         | `eval/reporter`, `eval/comparator`                  |
| `metrics` | —                        | `--runs <n>`, `--artifacts-dir <path>` (default: `airefinement/artifacts`)                               | `metrics/pipeline-metrics`, `metrics/role-metrics`  |

## Files Structure

```
bin/
  cli.ts          — Commander program definition, all 5 commands, DEFAULT_* constants, parseIntOption
tests/unit/cli/
  cli.test.ts         — 27 unit tests covering exports, argument parsing, delegation, error cases
  cli-defaults.test.ts — 9 unit tests verifying convention-based default paths for analyze/eval/metrics
```

## Implementation Details

### Exported `program` object

`export const program = new Command()` — Commander instance exported at module level. This allows tests to import the program and call `program.parseAsync([...args])` without spawning a child process. All commands are registered synchronously at import time.

### Error handling pattern

Every command wraps its action in `try/catch`:
- Errors print to `console.error('Error: <message>')` with `err.message` for `Error` instances, `String(err)` otherwise
- Sets `process.exitCode = 1` (non-throwing) to allow Commander's exit override to remain in place during tests
- Async commands (`refine`, `eval`) use `async` action handlers with `await`

### `eval` command — `exitOverride()`

The `eval` command calls `.exitOverride()` on itself so that missing required options (`--control`, `--variant`) throw a `CommanderError` instead of calling `process.exit()`. This makes the error testable via `expect(...).rejects.toThrow()`.

### `report` command — null guard

`history.at(-1)` returns `undefined` when history is empty. A null guard checks for this case, prints an error, and sets `process.exitCode = 1` without throwing.

### `refine` command — file reading

The analysis file is read with `readFileSync` inside a nested try/catch. A failed read (file not found, invalid JSON) prints `'Error: Cannot read analysis file'` and returns early, without calling `runRefinement`.

### Convention-based default paths

Four module-level constants define project-relative defaults used across commands:

```typescript
DEFAULT_ARTIFACTS_DIR = 'airefinement/artifacts'
DEFAULT_CONFIG_DIR    = 'airefinement/config'
DEFAULT_DATASET_PATH  = 'airefinement/datasets/golden-v1.jsonl'
DEFAULT_EVAL_TRIALS   = 3
```

These constants are referenced directly in `.option()` calls, so the default is visible in `--help` output and enforced by Commander without extra logic in action handlers.

### `parseIntOption` — shared integer parser

```typescript
function parseIntOption(v: string): number { return parseInt(v, 10); }
```

Passed as the `parseArg` callback to Commander's `.option()` for `--trials` and `--runs`. Using a named function (instead of inline `parseInt`) satisfies the Commander type signature and avoids `as any` casts.

### Type safety improvements

Removed all `as any` casts in `refine` and `eval` action handlers by importing and using `RefinementInput` and `EvalRunConfig` types explicitly when constructing the argument objects.

## Architecture

The CLI is a thin orchestration layer with no business logic of its own:

```
bin/cli.ts
  ├── analyze  →  triggers/analyzer          (sync)
  ├── refine   →  refinement/agent-runner    (async)
  ├── eval     →  eval/runner                (async)
  ├── report   →  eval/reporter + eval/comparator  (sync)
  └── metrics  →  metrics/pipeline-metrics + metrics/role-metrics + telemetry/collector  (sync)
```

All imports use the `@/` alias resolved to `src/` via `tsconfig.json` paths, with `.js` extension for ESM compatibility.

## Testing Approach

Tests use `jest.unstable_mockModule` (ESM-compatible dynamic mocking) — all module dependencies are mocked before the CLI is imported via `beforeAll(async () => { program = (await import('../../../bin/cli.js')).program })`.

The test suite covers:
- **Export verification**: `program` is a Commander `Command` instance with all 5 subcommands registered
- **Delegation**: each command invokes the expected module function with correct arguments
- **Option parsing**: flags like `--dry-run`, `--quick`, `--trials` are parsed and forwarded correctly
- **Error cases**: missing required options (`eval`), empty history (`report`), unreadable file (`refine`)

### `jest.config.ts` — module mapper

Added `'^(\\.{1,2}/.*)\\.js$': '$1'` to `moduleNameMapper`. This allows `import('../../../bin/cli.js')` in tests to resolve to the TypeScript source file `bin/cli.ts` at runtime, without requiring a compiled build step.

## Changelog

| Subtask | Change |
|---------|--------|
| 18.1    | Initial implementation: replaced primitive `process.argv` script with Commander.js CLI; 5 commands with full error handling; 27 unit tests |
| 18.2    | Convention-based default paths: `DEFAULT_ARTIFACTS_DIR`, `DEFAULT_CONFIG_DIR`, `DEFAULT_DATASET_PATH`, `DEFAULT_EVAL_TRIALS`; `parseIntOption` helper; `--artifacts-dir`/`--config` options on `analyze`; defaults for `--dataset`/`--trials` on `eval`; `--artifacts-dir` on `metrics`; `"metrics"` npm script added; removed `as any` casts via proper types; 9 new unit tests in `cli-defaults.test.ts` |
