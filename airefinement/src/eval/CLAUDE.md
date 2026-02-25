# Eval Module Documentation

## Overview

The `eval` module provides infrastructure for running evaluation experiments against the Golden Dataset. It reads, validates, and filters tasks from JSONL dataset files, and will host grader implementations for scoring TDD pipeline runs.

## Implementation Details

### Phase: Task 12 — Golden Dataset & Task Format

Created the dataset reader foundation for eval pipeline.

### Files Structure

- `dataset-reader.ts` — reads and filters GoldenDatasetTask entries from JSONL files
- `graders/deterministic.ts` — 4 deterministic graders for scoring TDD pipeline runs (Task 13)
- `graders/llm-judge.ts` — LLM-based grader via Claude CLI with rubric files (Task 14.2)
- `graders/calibration.ts` — Spearman correlation calibration between human and LLM scores (Task 14.3)
- `graders/` — composite graders (Task 15+)

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

## Implementation Details

### Phase: Task 14.2 — LLM-Judge Grader

Implemented LLM-based grader in `graders/llm-judge.ts` using Claude CLI as evaluation engine.

### Exported Interface

- `LlmJudgeInput` — `{ rubricPath: string, codeToEvaluate: string, contextFiles?: Record<string, string> }`

### Grader Function

#### `evaluateWithLlmJudge(input: LlmJudgeInput): Promise<GraderResult>`
- Reads rubric markdown from `input.rubricPath` via `readFile`
- Assembles prompt: rubric + `## Code to Evaluate` section + optional `## Context: <filename>` sections
- Calls `runClaude({ maxTurns: 1, prompt, workingDirectory: process.cwd() })`
- Extracts JSON from Claude's response (strips ` ```json ... ``` ` markdown blocks via regex)
- Normalizes score: counts numeric dimension fields (excluding `total` and `rationale`), uses `Math.max` of actual values as per-dimension max — rubric-agnostic
- pass threshold: `score >= 0.5`
- grader tag: `'LlmJudgeGrader'`

**Graceful degradation (3 paths — all return `score: 0, pass: false`):**
- `readFile` failure → `{ skipped: true, error: 'Failed to read rubric: ...' }`
- `runClaude` throws → `{ skipped: true, error: String(err) }`
- `claudeResult.exitCode !== 0` → `{ skipped: true, error: 'Claude exited with code N: ...' }`
- `JSON.parse` failure → `{ parseError: true, error: String(err) }`

### Internal Helpers

- `failResult(details)` — DRY helper: `{ grader: GRADER_NAME, score: 0, pass: false, details }`
- `extractJson(stdout)` — strips ` ```json ... ``` ` markdown code blocks via `/```json\s*([\s\S]*?)\s*```/`
- `normalizeScore(parsed)` — counts numeric dimension fields (excluding `total`, `rationale`), uses `Math.max` as per-dimension max; NaN-safe (`typeof parsed['total'] === 'number' ? ... : 0`)
- `assemblePrompt(rubric, code, contextFiles?)` — builds multi-section prompt string

### Key Design Decisions

- **Rubric-agnostic scoring**: `Math.max` of dimension values as per-dimension max — no hardcoded scale assumptions
- **NaN prevention**: explicit `typeof ... === 'number'` guard on `parsed['total']` before division
- **`GRADER_NAME` constant**: avoids string literal duplication across `failResult` and success path
- **`contextFiles`**: optional map of filename → content for multi-file evaluation context

---

## Implementation Details

### Phase: Task 14.3 — Calibration

Implemented Spearman correlation calibration in `graders/calibration.ts`. Pure computation module — no I/O, no external project dependencies.

### Exported Interface

- `CalibrationResult` — `{ rubric: string, spearman_correlation: number, sample_size: number, calibrated: boolean }`

### Exported Function

#### `calibrateLlmJudge(rubric, humanAnnotations, llmScores): Promise<CalibrationResult>`
- `humanAnnotations: Array<{ input: string; humanScore: number }>` — reference human scores
- `llmScores: Array<{ input: string; llmScore: number }>` — LLM-produced scores to calibrate
- Validates `n >= 2` (throws `Error` on smaller sample — division by zero prevention)
- Validates arrays have equal length (throws `Error` on mismatch)
- Computes Spearman ρ via `rankArray` + `spearmanCorrelation` private helpers
- `calibrated: true` when `rho >= 0.80` (hardcoded threshold — tech debt for future parameterization)
- Returns synchronously inside `async` wrapper for API consistency with other graders

### Internal Helpers (unexported)

- `rankArray(values)` — sorts + groups tied values, assigns 1-based average rank (standard Spearman ties handling)
- `spearmanCorrelation(ranks1, ranks2)` — `1 - (6 * Σd²) / (n * (n²-1))` formula

### Key Design Decisions

- **Independent module**: `calibration.ts` does NOT import `llm-judge.ts`; they are separate graders with no dependency on each other
- **Pure computation**: zero I/O, zero project imports; only TypeScript primitives
- **`async` wrapper**: function is `async` for interface consistency, not because it needs async I/O
- **Hardcoded `0.80` threshold**: `calibrated` flag; parameterization deferred as tech debt

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
- **graders/llm-judge.ts**: imports `GraderResult` from `@/eval/graders/deterministic.js` and `runClaude` from `@/utils/claude-cli.js`; no circular deps; consumed by Task 15 (composite.ts)
- **graders/calibration.ts**: leaf module — zero project imports (pure computation); no circular deps; independent of `llm-judge.ts`; consumed by Task 15 (composite.ts) and Task 16 (runner.ts)
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
- Error scenarios (llm-judge):
  - `readFile` failure → `{ skipped: true }` (score 0)
  - `runClaude` throws → `{ skipped: true }` (score 0)
  - Non-zero exit code → `{ skipped: true }` (score 0)
  - Invalid JSON in Claude response → `{ parseError: true }` (score 0)
- Error scenarios (calibration):
  - `n < 2` → `Error('calibrateLlmJudge requires at least 2 samples, got N')`
  - Array length mismatch → `Error('humanAnnotations and llmScores must have the same length')`

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
  - `graders/llm-judge.test.ts` (14 tests) — covers success path, markdown JSON extraction, `runClaude` configs, 3 graceful degradation scenarios (readFile failure, runClaude throw, non-zero exit), parseError path
  - `graders/calibration.test.ts` (17 tests) — perfect correlation, inverse, strong (0.9), weak (0.5), boundary (0.8), tied ranks (average), n=2 edge case, validation guards (n<2, length mismatch)

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

## Usage Examples

### Evaluate code with LLM judge

```typescript
import { evaluateWithLlmJudge, type LlmJudgeInput } from '@/eval/graders/llm-judge.js';

const input: LlmJudgeInput = {
  rubricPath: 'airefinement/config/rubrics/test-writer-quality.md',
  codeToEvaluate: `// code under evaluation`,
  contextFiles: {
    'task-description.md': 'Feature: implement X...',
  },
};

const result = await evaluateWithLlmJudge(input);
// result: { grader: 'LlmJudgeGrader', score: 0..1, pass: boolean, details: { rationale, rawResponse } }
// On failure: { score: 0, pass: false, details: { skipped: true, error: '...' } }
```

## Usage Examples

### Calibrate LLM judge against human annotations

```typescript
import { calibrateLlmJudge, type CalibrationResult } from '@/eval/graders/calibration.js';

const result: CalibrationResult = await calibrateLlmJudge(
  'test-writer-quality',
  [
    { input: 'task-1', humanScore: 0.9 },
    { input: 'task-2', humanScore: 0.4 },
    { input: 'task-3', humanScore: 0.7 },
  ],
  [
    { input: 'task-1', llmScore: 0.85 },
    { input: 'task-2', llmScore: 0.35 },
    { input: 'task-3', llmScore: 0.75 },
  ],
);

console.log(result.spearman_correlation); // e.g. 0.9
console.log(result.calibrated);           // true (rho >= 0.80)
console.log(result.sample_size);          // 3
```

## Related Tasks

- Task 2: Telemetry Schemas — defines `GoldenDatasetTask` type and `GoldenDatasetTaskSchema`
- Task 12: Golden Dataset & Task Format — created this module and the initial dataset
- Task 13: Deterministic Graders — implemented `graders/deterministic.ts` with 4 graders
- Task 14.1: Rubric Files — markdown rubric files in `config/rubrics/` consumed by llm-judge
- Task 14.2: LLM-Judge Grader — implemented `graders/llm-judge.ts`
- Task 14.3: Calibration — implemented `graders/calibration.ts` with Spearman ρ calibration
- Task 15: Composite Grader — will consume deterministic + LLM graders in `graders/composite.ts`
- Task 16: Eval Runner — will orchestrate all graders via `eval/runner.ts`

## Changelog

### 2026-02-25 — Task 14.3: Calibration

- Created `src/eval/graders/calibration.ts` — pure computation module, zero project imports
- Exported interface: `CalibrationResult` (`rubric`, `spearman_correlation`, `sample_size`, `calibrated`)
- Exported function: `calibrateLlmJudge(rubric, humanAnnotations, llmScores): Promise<CalibrationResult>`
- Internal helpers: `rankArray` (average rank for ties), `spearmanCorrelation` (Spearman ρ formula)
- `calibrated: rho >= 0.80` hardcoded threshold (tech debt for future parameterization)
- Input validation: throws on `n < 2` and array length mismatch
- Unit tests: `tests/unit/eval/graders/calibration.test.ts` (17 tests)
- **Architecture note**: `calibration.ts` is independent of `llm-judge.ts` — no import relationship

### 2026-02-25 — Task 14.2: LLM-Judge Grader

- Created `src/eval/graders/llm-judge.ts` with `evaluateWithLlmJudge` function
- Exported interface: `LlmJudgeInput` (`rubricPath`, `codeToEvaluate`, `contextFiles?`)
- Internal helpers: `failResult`, `extractJson`, `normalizeScore`, `assemblePrompt`
- Rubric-agnostic score normalization via `Math.max` of dimension values (no hardcoded scale)
- 4 graceful degradation paths: readFile failure, runClaude throw, non-zero exit, JSON parse error
- Unit tests: `tests/unit/eval/graders/llm-judge.test.ts` (14 tests)
- CODE_REVIEW fixes: NaN guard on `parsed['total']`, `GRADER_NAME` constant, `failResult` helper

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
