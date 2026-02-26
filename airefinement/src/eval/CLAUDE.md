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
- `graders/composite.ts` — weighted ensemble of 7 graders with partial credit scoring (Tasks 15.1–15.2)
- `runner.ts` — A/B eval orchestrator: full 8-step A/B experiment protocol, sampleQuickSubset, runEval (Tasks 16.1–16.3)

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

## Implementation Details

### Phase: Task 15.1 — Composite Grader (Weighted Ensemble)

Implemented weighted ensemble aggregation in `graders/composite.ts`. Pure aggregation module — no I/O, no external deps; consumes results from other graders.

### Exported Interfaces

- `CompositeConfig` — weights for 7 graders: `{ test_runner: 0.30, static_analysis: 0.15, test_mutation: 0.15, guard_compliance: 0.10, llm_test_quality: 0.10, llm_impl_minimality: 0.10, llm_doc_completeness: 0.10 }`
- `CompositeInput` — `{ config: CompositeConfig, results: Record<string, GraderResult>, phasesCompleted: number, phasesTotal: number }`
- `PartialCreditBreakdown` — `{ phases_completed, phases_total, phase_progression_score, grader_ensemble_score, final_score }`
- `CompositeResult` — `{ overall_score, pass, individual_scores, partial_credit }`

### Exported Function

#### `gradeComposite(input: CompositeInput): CompositeResult`
- Weight validation: throws `Error` if `Math.abs(sum - 1.0) > 0.01`
- `grader_ensemble_score = Σ (weight_key * (results[key]?.score ?? 0))` over all 7 config keys
- Missing result key → treated as `score: 0` (graceful)
- `phase_progression_score = phasesCompleted / phasesTotal` (0 if `phasesTotal === 0`)
- `final_score = phase_progression_score * 0.4 + grader_ensemble_score * 0.6` (updated in Task 15.2)
- `pass = overall_score >= 0.5`
- grader tag: `'CompositeGrader'`

### Error Handling

- `Math.abs(weightSum - 1.0) > 0.01` → `Error('Weights must sum to 1.0, got N')`
- Missing grader key in `results` → graceful fallback to `score: 0` (no throw)

### Key Design Decisions

- **Pure aggregation**: `composite.ts` does NOT call any graders — receives pre-computed `GraderResult` map
- **Synchronous**: no I/O, no async — designed for use by Task 16 orchestrator
- **`phasesTotal === 0` guard**: returns `phase_progression_score: 0` instead of NaN

---

## Implementation Details

### Phase: Task 15.2 — Partial Credit Formula

Replaced placeholder `final_score` in `graders/composite.ts` with actual phase-progression blend formula.

### Changes from Task 15.1

#### `gradeComposite` — updated logic

- **`phase_progression_score`**: added `Math.max(0, Math.min(1, ...))` clamping around `phasesCompleted / phasesTotal`
  - `phasesTotal === 0` → `0` (unchanged guard)
  - `phasesCompleted > phasesTotal` → clamped to `1.0` (overflow protection)
  - `phasesCompleted < 0` → clamped to `0.0` (negative protection)
- **`final_score`**: replaced `grader_ensemble_score` placeholder with `phase_progression_score * 0.4 + grader_ensemble_score * 0.6`
- **`overall_score`**: now equals `final_score` (previously was `grader_ensemble_score`)
- **`pass`**: now `final_score >= 0.5` (previously `grader_ensemble_score >= 0.5`)

### Scoring Formula

```
phase_progression_score = clamp(phasesCompleted / phasesTotal, 0, 1)   // 0 if phasesTotal=0
grader_ensemble_score   = Σ weight_k * score_k                          // weighted sum over 7 graders
final_score             = phase_progression_score * 0.4 + grader_ensemble_score * 0.6
```

### Key Behavioral Examples

| phasesCompleted | phasesTotal | ensemble | final_score |
|---|---|---|---|
| 0 | 6 | 0.0 | 0.0 |
| 6 | 6 | 1.0 | 1.0 |
| 3 | 6 | 0.0 | 0.20 |
| 0 | 6 | 1.0 | 0.60 |
| 0 | 0 | any | `ensemble * 0.6` |

### Key Design Decisions

- **40/60 split**: phase progression bonus (40%) encourages pipeline completion; grader quality (60%) remains dominant
- **Clamping**: `Math.max(0, Math.min(1, ...))` prevents negative/overflow values from corrupting score
- **`phasesTotal === 0` short-circuits before clamping**: avoids `0/0 = NaN` entering `Math.max`

---

---

## Implementation Details

### Phase: Task 16.1 — Eval Runner (Pure Aggregation Logic)

Implemented pure synchronous functions for A/B result aggregation in `runner.ts`.

### Exported Interfaces

- `TaskTrialResult` — `{ task_id: string, trial: number, composite_result: CompositeResult, duration_ms: number, claude_exit_code: number }`
- `EvalRunConfig` — `{ datasetPath, taskIds?, trials, hypothesis, variantDescription, controlBranch, variantBranch, graderConfig: CompositeConfig, timeout, quick?, quickSampleSize? }`

### Pure Functions

#### `aggregateTrialResults(results, taskCount, trials): AggregatedMetrics`
- Groups `TaskTrialResult[]` by `task_id`, computes mean `composite_result.overall_score` per task
- Aggregates across tasks: mean, min, max scores; counts `pass_count` where `composite_result.pass === true`
- Returns `AggregatedMetrics` with `mean_score`, `min_score`, `max_score`, `pass_rate`, `total_trials`

#### `buildTaskComparisons(controlResults, variantResults): TaskComparison[]`
- Joins control and variant `TaskTrialResult[]` by `task_id`
- For each task: computes mean scores per branch, derives `score_delta = variant_mean - control_mean`
- Returns `TaskComparison[]` — one entry per task present in either set (missing side = score 0)

#### `makeDecision(control, variant, comparisons): { decision, rationale }`
- Compares `variant.mean_score` vs `control.mean_score`
- `decision`: `'use_variant'` | `'keep_control'` | `'inconclusive'`
- `inconclusive` when `|delta| < 0.05` threshold (hardcoded)
- `rationale`: human-readable string with delta and pass rates

---

## Implementation Details

### Phase: Task 16.2 — Eval Runner (Environment Isolation)

Added worktree-based environment isolation functions in `runner.ts` and `utils/git.ts`.

### Functions in runner.ts

#### `snapshotManifest(worktreePath, datasetVersion): Promise<VersionManifest>`
- Internal `collectFiles(dirPath)`: recursive `readdir`, returns `[]` on `ENOENT` (graceful for missing dirs)
- Hashes `.claude/agents/`, `.claude/skills/`, `.claude/hooks/` via `collectFiles + hashFiles`
- Hashes `.claude/settings.json` directly
- Returns `VersionManifest` with `dataset_version`, `agents_hash`, `skills_hash`, `hooks_hash`, `settings_hash`

#### `runTrialsOnBranch(tasks, branch, config, worktreeBasePath): Promise<TaskTrialResult[]>`
- Exported function that creates a worktree for the branch, delegates to `runTrialsInWorktree`, cleans up in `finally`
- Derives worktree path: `join(worktreeBasePath, safeBranch)` where `safeBranch` replaces `/` → `-`
- Creates git worktree via `addWorktree`, cleans up in `finally` (even on error)

### Functions in utils/git.ts

#### `addWorktree(path, branch): Promise<void>`
- Runs `git worktree add <path> <branch>`

#### `removeWorktree(path): Promise<void>`
- Runs `git worktree remove <path> --force`

### Key Design Decisions

- **ENOENT-only catch in `collectFiles`**: catches only `ENOENT`, not all errors — unexpected FS errors bubble up
- **`finally` cleanup**: worktree removal in `finally` guarantees cleanup even when trial loop throws

---

## Implementation Details

### Phase: Task 16.3 — Eval Runner (Quick Mode + runEval Orchestrator)

Completed `runner.ts` with `sampleQuickSubset` and the full `runEval` 8-step A/B orchestrator.

### Exported Functions

#### `sampleQuickSubset(tasks, count): GoldenDatasetTask[]`
- Fisher-Yates shuffle on a spread copy of input array (`[...tasks]`)
- Returns first `count` elements from shuffled copy
- Preserves object references (shallow copy — tests can use `toBe` for identity assertions)
- If `count >= tasks.length`, returns full shuffled copy (no truncation guard needed)

#### `runEval(config): Promise<ExperimentResult>`
Full 8-step A/B experiment protocol:
1. Load dataset via `loadGoldenDataset(config.datasetPath)`
2. Filter to `config.taskIds` if provided
3. Quick mode sampling: if `config.quick === true`, apply `sampleQuickSubset(tasks, config.quickSampleSize ?? 5)`
4. Run control branch via `runBranch` closure (see below)
5. Run variant branch via `runBranch` closure
6. Aggregate control results via `aggregateTrialResults`
7. Aggregate variant results via `aggregateTrialResults`
8. Build comparisons via `buildTaskComparisons`, make decision via `makeDecision`; return `ExperimentResult`

### Private Helper

#### `runTrialsInWorktree(worktreePath, tasks, config)` (not exported)
- Shared trial loop called by both `runTrialsOnBranch` (exported, for external callers) and `runEval`'s `runBranch` closure
- Iterates tasks × `config.trials`: calls `runClaude` per iteration, grades via `gradeComposite`
- Measures `duration_ms` per trial with `Date.now()` before/after `runClaude`

### Key Design Decisions

- **`runEval` does NOT call `runTrialsOnBranch`**: uses internal `runBranch` closure that sequences `addWorktree → snapshotManifest → runTrialsInWorktree → removeWorktree` (in `finally`). This ensures snapshot is taken WHILE worktree exists (correct A/B semantics — snapshot of the environment under test, not before or after).
- **`runTrialsOnBranch` remains exported**: delegates to `runTrialsInWorktree`; exists for external callers who manage worktrees themselves
- **Spread copy in `sampleQuickSubset`**: `[...tasks]` preserves object references — test assertions can use `.toBe()` identity checks
- **`quickSampleSize ?? 5`**: default of 5 when quick mode enabled but size not specified

### Architecture Note

```
runEval
  ├── runBranch(controlBranch)  ──┐
  │     addWorktree               │  internal closure
  │     snapshotManifest          │  (NOT runTrialsOnBranch)
  │     runTrialsInWorktree ◄─────┘
  │     removeWorktree (finally)
  └── runBranch(variantBranch)  (same closure, different branch)

runTrialsOnBranch (exported)
  └── runTrialsInWorktree  (shared private helper)
```

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

- **Used by**: `refinement/` module (A/B eval orchestration), integration tests
- **Uses**: `@/telemetry/schemas.ts` (GoldenDatasetTaskSchema, GoldenDatasetTask type), `@/telemetry/collector.ts` (CollectorError)
- **Data source**: `airefinement/datasets/golden-v1.jsonl` (and future versions)
- **No circular dependencies**: `eval/` depends on `telemetry/` and `utils/`, never the reverse
- **graders/deterministic.ts**: leaf module — only imports Node.js built-ins (`node:child_process`, `node:fs/promises`, `node:path`); no circular deps; consumed by composite.ts
- **graders/llm-judge.ts**: imports `GraderResult` from `@/eval/graders/deterministic.js` and `runClaude` from `@/utils/claude-cli.js`; no circular deps; consumed by composite.ts
- **graders/calibration.ts**: leaf module — zero project imports (pure computation); no circular deps; independent of `llm-judge.ts`
- **graders/composite.ts**: pure aggregation leaf — imports `GraderResult` from `deterministic.ts`; synchronous; consumed by `runner.ts`; does NOT call any grader functions directly
- **runner.ts**: top-level orchestrator — imports `loadGoldenDataset` (dataset-reader), `gradeComposite` (composite), `addWorktree`/`removeWorktree` (utils/git), `runClaude` (utils/claude-cli), `hashFiles` (utils/git); exported by `runner.ts`: `aggregateTrialResults`, `buildTaskComparisons`, `makeDecision`, `snapshotManifest`, `runTrialsOnBranch`, `sampleQuickSubset`, `runEval`
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
  - `graders/composite.test.ts` (23 tests) — weight validation, ensemble scoring, missing keys fallback, phasesTotal=0 guard, pass threshold, partial credit breakdown (Task 15.1: 13 tests); partial credit formula: 0/6→0.0, 6/6→1.0, 3/6 no ensemble→0.20, 0/6 full ensemble→0.60, overflow clamp, underflow clamp, phasesTotal=0, overall_score consistency (Task 15.2: +10 tests)
  - `runner.test.ts` (30 tests) — aggregateTrialResults (grouping, mean/min/max, pass_rate), buildTaskComparisons (join, delta, missing-side), makeDecision (use_variant, keep_control, inconclusive threshold)
  - `runner-isolation.test.ts` (15 tests) — snapshotManifest (ENOENT graceful, dir hashing, settings.json, VersionManifest shape), runTrialsOnBranch (worktree lifecycle, task×trial iteration, cleanup on error, TaskTrialResult shape)
  - `runner-quick.test.ts` (17 tests) — sampleQuickSubset (Fisher-Yates distribution, count boundary, object identity), runEval (full protocol, quick mode sampling, dataset filtering by taskIds, ExperimentResult shape)

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

## Usage Examples

### Run full A/B experiment

```typescript
import { runEval, type EvalRunConfig } from '@/eval/runner.js';
import type { CompositeConfig } from '@/eval/graders/composite.js';

const graderConfig: CompositeConfig = {
  test_runner: 0.30, static_analysis: 0.15, test_mutation: 0.15,
  guard_compliance: 0.10, llm_test_quality: 0.10,
  llm_impl_minimality: 0.10, llm_doc_completeness: 0.10,
};

const result = await runEval({
  datasetPath: 'datasets/golden-v1.jsonl',
  trials: 3,
  hypothesis: 'New prompt reduces test mutation rate',
  variantDescription: 'prompt-v2',
  controlBranch: 'main',
  variantBranch: 'experiment/prompt-v2',
  graderConfig,
  timeout: 120_000,
  quick: true,         // sample 5 tasks instead of full dataset
  quickSampleSize: 5,
});

console.log(result.decision);  // 'use_variant' | 'keep_control' | 'inconclusive'
console.log(result.rationale); // human-readable explanation
```

### Sample quick subset

```typescript
import { sampleQuickSubset } from '@/eval/runner.js';
import { loadGoldenDataset } from '@/eval/dataset-reader.js';

const allTasks = loadGoldenDataset('datasets/golden-v1.jsonl');
const sample = sampleQuickSubset(allTasks, 5); // Fisher-Yates, reproducible by seed (future work)
```

## Related Tasks

- Task 2: Telemetry Schemas — defines `GoldenDatasetTask` type and `GoldenDatasetTaskSchema`
- Task 12: Golden Dataset & Task Format — created this module and the initial dataset
- Task 13: Deterministic Graders — implemented `graders/deterministic.ts` with 4 graders
- Task 14.1: Rubric Files — markdown rubric files in `config/rubrics/` consumed by llm-judge
- Task 14.2: LLM-Judge Grader — implemented `graders/llm-judge.ts`
- Task 14.3: Calibration — implemented `graders/calibration.ts` with Spearman ρ calibration
- Task 15.1: Composite Grader (Weighted Ensemble) — implemented `graders/composite.ts` with `gradeComposite` aggregation function
- Task 15.2: Phase Progression Blend — updated `final_score` to `phase_progression * 0.4 + ensemble * 0.6` with clamping
- Task 16.1: Eval Runner (Pure Logic) — pure aggregation: `aggregateTrialResults`, `buildTaskComparisons`, `makeDecision`
- Task 16.2: Eval Runner (Isolation) — environment isolation: `snapshotManifest`, `runTrialsOnBranch`, git worktree helpers
- Task 16.3: Eval Runner (Quick Mode + Orchestrator) — `sampleQuickSubset`, `runEval` full 8-step A/B protocol

## Changelog

### 2026-02-26 — Task 16.3: Eval Runner — Quick Mode + runEval Orchestrator

Completed `runner.ts` with quick-mode sampling and full A/B experiment orchestration:

**airefinement/src/eval/runner.ts (new):**
- Added `sampleQuickSubset(tasks, count): GoldenDatasetTask[]` — Fisher-Yates shuffle on spread copy; preserves object references
- Added `runEval(config): Promise<ExperimentResult>` — full 8-step A/B protocol: load dataset → filter → quick-sample → run control → run variant → aggregate × 2 → compare → decide
- Added private `runTrialsInWorktree(worktreePath, tasks, config)` — shared trial loop used by both `runTrialsOnBranch` and `runEval`'s internal `runBranch` closure
- **Key design**: `runEval` uses internal `runBranch` closure (not `runTrialsOnBranch`) so that `snapshotManifest` is called while worktree exists; `runTrialsOnBranch` remains exported for external callers

**Unit tests (17 tests):**
- `tests/unit/eval/runner-quick.test.ts` — sampleQuickSubset (Fisher-Yates, count boundary, object identity), runEval (full protocol, quick mode, taskIds filter, ExperimentResult shape)

**Total unit tests for Task 16: 70** (runner.test.ts: 30, runner-isolation.test.ts: 15, git-worktree.test.ts: 8, runner-quick.test.ts: 17)

### 2026-02-26 — Task 16.2: Eval Runner — Snapshot & Trial Execution

Added `runner.ts` (eval module) and expanded `utils/git.ts`:

**airefinement/src/eval/runner.ts:**
- Updated `EvalRunConfig` with new fields: `controlBranch`, `variantBranch`, `graderConfig: CompositeConfig`, `timeout: number`
- Added `snapshotManifest(worktreePath, datasetVersion): Promise<VersionManifest>`
  - Internal `collectFiles(dirPath)`: recursive readdir, returns `[]` on ENOENT (graceful for missing dirs)
  - Hashes `.claude/agents/`, `.claude/skills/`, `.claude/hooks/` via `collectFiles + hashFiles`
  - Hashes `.claude/settings.json` directly
  - Returns `VersionManifest` with `dataset_version`
- Added `runTrialsOnBranch(tasks, branch, config, worktreeBasePath): Promise<TaskTrialResult[]>`
  - Derives worktree path: `join(worktreeBasePath, safeBranch)` where safeBranch replaces `/` → `-`
  - Creates git worktree via `addWorktree`, cleans up in `finally` (even on error)
  - Iterates tasks × `config.trials`: calls `runClaude` per iteration
  - Grades via `gradeComposite` (TODO: uses empty GraderResult placeholder — real grader calls in later subtasks)
  - Returns `TaskTrialResult[]`: `{ task_id, trial, composite_result, duration_ms, claude_exit_code }`

**airefinement/src/utils/git.ts:**
- Added `addWorktree(path, branch): Promise<void>` — runs `git worktree add <path> <branch>`
- Added `removeWorktree(path): Promise<void>` — runs `git worktree remove <path> --force`

**Unit tests (23 tests):**
- `tests/unit/utils/git-worktree.test.ts` (8 tests) — correct git commands, error propagation
- `tests/unit/eval/runner-isolation.test.ts` (15 tests) — snapshotManifest (ENOENT graceful, dir hashing, settings.json, VersionManifest shape), runTrialsOnBranch (worktree lifecycle, task×trial iteration, cleanup on error, TaskTrialResult shape)

### 2026-02-26 — Task 15.2: Partial Credit Formula

- Updated `src/eval/graders/composite.ts` — replaced placeholder `final_score` with actual phase-progression blend
- `phase_progression_score` now clamped via `Math.max(0, Math.min(1, ...))` (overflow and negative protection)
- `final_score = phase_progression_score * 0.4 + grader_ensemble_score * 0.6` (was `grader_ensemble_score`)
- `overall_score` and `pass` now derived from `final_score` (not `grader_ensemble_score`)
- Unit tests: `tests/unit/eval/graders/composite.test.ts` (+10 tests → 23 total)
- Test coverage: 0/6 phases, 6/6 phases, partial-phase scenarios, overflow/underflow clamp, phasesTotal=0, overall_score consistency

### 2026-02-26 — Task 15.1: Composite Grader (Weighted Ensemble)

- Created `src/eval/graders/composite.ts` — pure synchronous aggregation, no I/O, no grader calls
- Exported interfaces: `CompositeConfig`, `CompositeInput`, `PartialCreditBreakdown`, `CompositeResult`
- Exported function: `gradeComposite(input: CompositeInput): CompositeResult`
- Default weights: test_runner=0.30, static_analysis=0.15, test_mutation=0.15, guard_compliance=0.10, llm_test_quality=0.10, llm_impl_minimality=0.10, llm_doc_completeness=0.10
- Weight validation: throws if `|sum - 1.0| > 0.01`
- Missing grader keys → graceful `score: 0` fallback (no throw)
- `phase_progression_score = phasesCompleted / phasesTotal` with `phasesTotal=0` guard
- `final_score = grader_ensemble_score` (placeholder; Task 15.2 will change to 40/60 blend)
- Unit tests: `tests/unit/eval/graders/composite.test.ts` (13 tests)

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
