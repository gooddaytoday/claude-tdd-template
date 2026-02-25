# Refinement Module Documentation

## Overview

The Refinement module implements the AI Self-Improvement Loop pattern: it takes TDD run analysis results and failed run reports, launches Claude CLI to diagnose root causes, and produces targeted modifications to agent prompts and policy files. The module enforces strict scope restrictions — Claude is only permitted to modify files under `.claude/agents/`, `.claude/skills/`, and `.claude/hooks/`.

## Implementation Details

### Phase: Task 11 — AI Refinement Agent Runner

Implemented across three subtasks (11.1 → 11.3):
- **11.1**: Prompt template infrastructure (`prompt-templates.ts`)
- **11.2**: Core agent runner orchestration (`agent-runner.ts`)
- **11.3**: Scope restriction enforcement (`validateModifiedFiles` + `ScopeViolationError`)

### Files Structure

- `prompt-templates.ts` - Diagnosis prompt template, allowed paths constant, prompt builder
- `agent-runner.ts` - Experiment branch management, Claude CLI invocation, scope validation, run orchestration

### Classes and Interfaces

- `ScopeViolationError extends Error` - Thrown when Claude modifies files outside allowed paths
  - Key fields: `violations: string[]` (list of illegal file paths)
  - Used by: `runRefinement()` after `validateModifiedFiles()` check

- `RefinementInput` - Input to `runRefinement()`
  - Fields: `analysis: AnalysisResult`, `failedRunReports: RunReport[]`, `currentAgentPrompts: Record<string, string>`, `currentPolicies: Record<string, string>`

- `RefinementOutput` - Output from `runRefinement()`
  - Fields: `experimentBranch: string`, `changedFiles: string[]`, `commitHash: string`, `agentStdout: string`

- `PromptInput` - Input to `buildDiagnosisPrompt()`
  - Fields: same as `RefinementInput` plus optional `experimentId?: string`

### Functions

- `buildDiagnosisPrompt(input: PromptInput): string` — Interpolates `DIAGNOSIS_PROMPT` template with mustache-style `{{placeholders}}` using `buildPrompt()` from `claude-cli` utils. Appends `Experiment ID` suffix when provided.

- `generateExperimentId(analysis: AnalysisResult): string` — Generates deterministic branch slug from today's date + first trigger rule name (slugified, max 20 chars). Falls back to `general` when no triggers.

- `validateModifiedFiles(files: string[]): { valid: boolean; violations: string[] }` — Checks each file path against `ALLOWED_MODIFICATION_PATHS`. Returns `valid: true` when `ALLOWED_MODIFICATION_PATHS` is empty (safety valve).

- `runRefinement(input: RefinementInput): Promise<RefinementOutput>` — Full orchestration: create git branch → build prompt → invoke Claude CLI → validate scope → commit. Restores original branch on any error.

### Constants

- `DIAGNOSIS_PROMPT: string` — Mustache template with four placeholders: `{{triggers_summary}}`, `{{failure_reports}}`, `{{agent_prompts}}`, `{{policy_files}}`
- `ALLOWED_MODIFICATION_PATHS: string[]` — `['.claude/agents/', '.claude/skills/', '.claude/hooks/']`

## Architecture

### Design Patterns

- **Self-Improvement Loop**: Claude CLI is invoked as an autonomous agent that reads its own configuration and suggests improvements to itself
- **Experiment Branch Pattern**: Every refinement run is isolated in a git branch `refinement/exp-<date>-<slug>`, preventing partial changes from polluting main
- **Scope Guard**: Post-execution validation (`validateModifiedFiles`) rejects runs that touched files outside the allowed set — errors cause branch restoration without commit

### Integration Points

- **Uses**:
  - `@/utils/git.ts` — `getCurrentBranch`, `createBranch`, `checkoutBranch`, `getChangedFiles`, `commitAll`
  - `@/utils/claude-cli.ts` — `runClaude`, `buildPrompt`
  - `@/telemetry/schemas.ts` — `AnalysisResult`, `RunReport` types
- **Used by**: Higher-level orchestration layer (not yet implemented as of Task 11)

### Error Handling

- `ScopeViolationError` — Claude modified files outside allowed paths; branch is left uncommitted, original branch restored
- `Error` (Claude CLI failure) — Non-zero exit code from Claude CLI; original branch restored
- Branch restoration failures are logged to `console.error` but do not suppress the original error

## Testing

### Unit Tests

- Location: `tests/unit/refinement/`
- Key test files:
  - `prompt-templates.test.ts` — 21 tests covering template interpolation, edge cases, allowed paths constant
  - `agent-runner.test.ts` — 38 tests covering experiment ID generation, scope validation, run orchestration with mocked git/CLI utils
- Total: **59 unit tests**, all passing

### Integration Tests

- Not applicable for this module (all external dependencies are mocked at unit level)

## Usage Examples

### Example 1: Run a refinement cycle

```typescript
import { runRefinement } from '@/refinement/agent-runner.js';

const output = await runRefinement({
  analysis: { triggers_fired: [{ rule: 'LOW_PASS_RATE', description: 'Pass rate < 80%' }] },
  failedRunReports: [...reports],
  currentAgentPrompts: { 'tdd-implementer': '...' },
  currentPolicies: { 'guard-rules': '...' },
});

console.log(output.experimentBranch); // "refinement/exp-2026-02-25-low-pass-rate"
console.log(output.changedFiles);     // [".claude/skills/tdd-integration/skill.md"]
```

### Example 2: Validate scope manually

```typescript
import { validateModifiedFiles } from '@/refinement/agent-runner.js';

const result = validateModifiedFiles(['.claude/agents/foo.md', 'src/utils/bar.ts']);
// { valid: false, violations: ['src/utils/bar.ts'] }
```

## Related Tasks

- Task 10: Telemetry schemas (`AnalysisResult`, `RunReport`) — prerequisite types
- Task 11.1: Prompt templates — first subtask of this module
- Task 11.2: Agent runner core — second subtask of this module
- Task 11.3: Scope restriction — final subtask of this module

## Changelog

### 2026-02-25 — Task 11: AI Refinement Agent Runner

- Created `prompt-templates.ts`: `DIAGNOSIS_PROMPT`, `ALLOWED_MODIFICATION_PATHS`, `PromptInput`, `buildDiagnosisPrompt()`
- Created `agent-runner.ts`: `RefinementInput`, `RefinementOutput`, `ScopeViolationError`, `generateExperimentId()`, `validateModifiedFiles()`, `runRefinement()`
- 59 unit tests added across two test files
