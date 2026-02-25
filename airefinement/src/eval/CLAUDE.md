# Eval Module Documentation

## Overview

The `eval` module provides infrastructure for running evaluation experiments against the Golden Dataset. It reads, validates, and filters tasks from JSONL dataset files, and will host grader implementations for scoring TDD pipeline runs.

## Implementation Details

### Phase: Task 12 — Golden Dataset & Task Format

Created the dataset reader foundation for eval pipeline.

### Files Structure

- `dataset-reader.ts` — reads and filters GoldenDatasetTask entries from JSONL files
- `graders/deterministic.ts` — 4 deterministic graders for scoring TDD pipeline runs (Task 13)
- `graders/` — LLM-judge, composite graders (Task 14+)

### Functions

- `loadGoldenDataset(filePath: string): GoldenDatasetTask[]` — reads JSONL file, validates each line against GoldenDatasetTaskSchema, throws CollectorError with line number on failure
- `filterByTestType(tasks, type)` — filters tasks by `test_type` field (exact match: 'unit' | 'integration' | 'both')
- `filterByDifficulty(tasks, difficulty)` — filters tasks by `difficulty` field (exact match: 'easy' | 'medium' | 'hard' | 'adversarial')

---

## Implementation Details

### Phase: Task 13 — Deterministic Graders

Implemented 4 deterministic grader functions in `graders/deterministic.ts`.

### Exported Interfaces

- `GraderResult` — `{ grader: string, score: number, pass: boolean, details: Record<string, unknown> }`
- `DeterministicGraderInput` — `{ workingDirectory: string, testCommand: string, testFiles: string[], implFiles: string[], baseCommit: string }`

> **Tech debt**: `GraderResult` and `DeterministicGraderInput` are currently exported from `deterministic.ts`. Move to `eval/graders/types.ts` before Task 14 when more graders are added.

### Grader Functions

#### `gradeTestRunner(input): Promise<GraderResult>`
- Splits `input.testCommand` by space, executes via `execFile` in `input.workingDirectory`
- score: `1.0` if exit code 0, `0.0` otherwise
- details: `{ exitCode: number, outputExcerpt: string }` (stdout truncated to 1000 chars)
- grader tag: `'TestRunnerGrader'`

#### `gradeStaticAnalysis(input): Promise<GraderResult>`
- Runs `npx tsc --noEmit` in `input.workingDirectory`
- Counts lines matching `/error TS/gi` and `/warning TS/gi`
- score: `1.0` (no errors/warnings) → `0.5` (warnings only) → `0.0` (errors present)
- Graceful degradation: if `tsc` not available (no stdout) → score `1.0`, `skipped: true`
- grader tag: `'StaticAnalysisGrader'`

#### `gradeTestMutation(input): Promise<GraderResult>`
- Runs `git diff --name-only baseCommit...HEAD` in `input.workingDirectory`
- Intersects changed files with `input.testFiles`
- score: `1.0` if no test files modified, `0.0` if any modified
- details: `{ modifiedTestFiles: string[] }`
- grader tag: `'TestMutationGrader'`

#### `gradeGuardCompliance(input): Promise<GraderResult>`
- Reads `{workingDirectory}/artifacts/traces/violations.jsonl`
- Counts entries with `blocked: true`
- score: `1.0` if violationCount === 0, `0.0` otherwise
- Graceful degradation: file not found (`ENOENT`) → score `1.0`, `violationCount: 0`
- JSON.parse wrapped in try/catch: throws `Error('Invalid JSON in violations.jsonl at line N: ...')` on malformed input
- grader tag: `'GuardComplianceGrader'`

### Internal Helper

- `runCommand(command, args, cwd): Promise<{ error, stdout }>` — promisifies `execFile` callback; always resolves (never rejects); used by TestRunner, StaticAnalysis, TestMutation graders

---

## Architecture

### Design Patterns

- **CollectorError pattern**: reuses `CollectorError` from `@/telemetry/collector.ts` for consistent error handling across all I/O operations
- **JSONL streaming**: reads file synchronously then parses line by line with 1-based line number tracking for diagnostic messages
- **Two-phase validation**: JSON parsing and Zod schema validation in separate try/catch blocks to produce distinct, actionable error messages
- **execFile wrapper** (`runCommand`): wraps callback-based `execFile` into a Promise that always resolves — graders handle failure via `error` field, not exceptions
- **Graceful degradation**: graders treat unavailable tools (`tsc`) and missing files (`violations.jsonl`) as pass-through (score 1.0) rather than errors
- **JSON.parse protection**: `gradeGuardCompliance` wraps each line parse in try/catch, throwing with 1-based line number for debuggability

### Integration Points

- **Used by**: eval runner (Task 13+), integration tests
- **Uses**: `@/telemetry/schemas.ts` (GoldenDatasetTaskSchema, GoldenDatasetTask type), `@/telemetry/collector.ts` (CollectorError)
- **Data source**: `airefinement/datasets/golden-v1.jsonl` (and future versions)
- **No circular dependencies**: `eval/` depends on `telemetry/`, never the reverse
- **graders/deterministic.ts**: leaf module — only imports Node.js built-ins (`node:child_process`, `node:fs/promises`, `node:path`); no circular deps; consumed by Task 15 (composite.ts) and Task 16 (runner.ts)
- **violations.jsonl path**: hardcoded as `artifacts/traces/violations.jsonl` relative to `workingDirectory`

### Error Handling

- Custom errors: `CollectorError` (from telemetry/collector.ts)
- Error scenarios (dataset-reader):
  - Non-existent file → `CollectorError('Failed to read file: <path>')`
  - Invalid JSON on line N → `CollectorError('Invalid JSON at line N: ...')`
  - Schema validation failure on line N → `CollectorError('Invalid schema at line N')`
- Error scenarios (deterministic graders):
  - `ENOENT` on `violations.jsonl` → pass through (score 1.0)
  - Other `readFile` errors → rethrown as-is
  - Invalid JSON in `violations.jsonl` → `Error('Invalid JSON in violations.jsonl at line N: ...')`

### Key Design Notes

- `filterByTestType(tasks, 'both')` performs **exact match** — only returns tasks with `test_type === 'both'`. It does NOT return `unit` or `integration` tasks. If you need "all tasks applicable for unit testing" (i.e., `unit | both`), use a custom filter.
- `readFileSync` (synchronous I/O) is intentional — eval runner loads dataset once before processing, no streaming needed.
- `GoldenDatasetTaskSchema` lives in `telemetry/schemas.ts` by design (Task 2 defined it there). Consider migrating to `eval/schemas.ts` when the schema complexity grows.

## Testing

### Unit Tests

- Location: `tests/unit/eval/`
- Key test files:
  - `dataset-reader.test.ts` (14 tests) — valid JSONL parsing, empty file, non-existent file, invalid JSON with line number, schema validation error with line number, filterByTestType, filterByDifficulty
  - `graders/deterministic.test.ts` (23 tests) — covers all 4 graders; uses `jest.unstable_mockModule` for ESM-compatible mocking of `node:child_process` and `node:fs/promises`

### Integration Tests

- Location: `tests/integration/eval/`
- Key test files: `dataset-validation.test.ts` (6 tests)
- Coverage: validates that `datasets/golden-v1.jsonl` exists, has >= 5 tasks, all schema-valid, unique IDs, both unit and integration types present

## Usage Examples

### Run deterministic graders

```typescript
import {
  gradeTestRunner,
  gradeStaticAnalysis,
  gradeTestMutation,
  gradeGuardCompliance,
  type DeterministicGraderInput,
} from '@/eval/graders/deterministic.js';

const input: DeterministicGraderInput = {
  workingDirectory: '/path/to/project',
  testCommand: 'npx jest tests/unit/my.test.ts --no-coverage',
  testFiles: ['tests/unit/my.test.ts'],
  implFiles: ['src/my.ts'],
  baseCommit: 'abc123',
};

const [testResult, tsResult, mutationResult, guardResult] = await Promise.all([
  gradeTestRunner(input),
  gradeStaticAnalysis(input),
  gradeTestMutation(input),
  gradeGuardCompliance(input),
]);

// Each result: { grader, score, pass, details }
console.log(testResult.score); // 1.0 | 0.0
```

### Load and filter dataset

```typescript
import { loadGoldenDataset, filterByTestType, filterByDifficulty } from '@/eval/dataset-reader.js';

const tasks = loadGoldenDataset('datasets/golden-v1.jsonl');

// Filter by test type
const unitTasks = filterByTestType(tasks, 'unit');
const integrationTasks = filterByTestType(tasks, 'integration');

// Filter by difficulty
const hardTasks = filterByDifficulty(tasks, 'hard');
const easyTasks = filterByDifficulty(tasks, 'easy');
```

### Error handling

```typescript
import { CollectorError } from '@/telemetry/collector.js';

try {
  const tasks = loadGoldenDataset('datasets/golden-v1.jsonl');
} catch (error) {
  if (error instanceof CollectorError) {
    console.error('Dataset error:', error.message);
    // error.causeDetail contains the original ZodError.issues or Error
  }
}
```

## Related Tasks

- Task 2: Telemetry Schemas — defines `GoldenDatasetTask` type and `GoldenDatasetTaskSchema`
- Task 12: Golden Dataset & Task Format — created this module and the initial dataset
- Task 13: Deterministic Graders — implemented `graders/deterministic.ts` with 4 graders
- Task 14: LLM-Judge Grader — will add `graders/llm-judge.ts`
- Task 15: Composite Grader — will consume deterministic + LLM graders in `graders/composite.ts`
- Task 16: Eval Runner — will orchestrate all graders via `eval/runner.ts`

## Changelog

### 2026-02-25 — Task 13: Deterministic Graders

- Created `src/eval/graders/deterministic.ts` with 4 grader functions: `gradeTestRunner`, `gradeStaticAnalysis`, `gradeTestMutation`, `gradeGuardCompliance`
- Exported interfaces: `GraderResult`, `DeterministicGraderInput`
- Internal helper: `runCommand` (execFile → Promise wrapper)
- Unit tests: `tests/unit/eval/graders/deterministic.test.ts` (23 tests, ESM mocking via `jest.unstable_mockModule`)
- CODE_REVIEW fix: added try/catch around `JSON.parse` in `gradeGuardCompliance` with 1-based line number in error message

### 2026-02-25 — Task 12: Golden Dataset & Task Format

- Created `src/eval/dataset-reader.ts` with `loadGoldenDataset`, `filterByTestType`, `filterByDifficulty`
- Created `datasets/golden-v1.jsonl` with 5 seed tasks
- Unit tests: `tests/unit/eval/dataset-reader.test.ts`
- Integration tests: `tests/integration/eval/dataset-validation.test.ts`
