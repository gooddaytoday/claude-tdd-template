# Golden Dataset

The Golden Dataset is the evaluation benchmark for the AI self-improvement loop. Each file contains `GoldenDatasetTask` records in JSONL format (one JSON object per line), validated against the schema in `src/telemetry/schemas.ts`.

## File Format

Each line in a `.jsonl` file is a valid JSON object with the following fields:

```typescript
{
  id: string;                                       // Unique task identifier (kebab-case)
  description: string;                              // What the agent must implement
  parent_task: string;                              // Parent feature context
  subtask_index: number;                            // Position within parent task
  test_type: 'unit' | 'integration' | 'both';      // Expected test type
  acceptance: {
    tests_must_fail_initially: boolean;             // RED phase gate
    tests_must_pass_after_green: boolean;           // GREEN phase gate
    no_test_modifications_in_green: boolean;        // Guard enforcement
    static_analysis_clean: boolean;                 // TypeScript strict mode
    architecture_check: string;                     // Structural constraint description
  };
  reference_solution: string;                       // Path or description of reference impl
  graders: string[];                                // Grader IDs to apply (e.g. "deterministic")
  difficulty: 'easy' | 'medium' | 'hard' | 'adversarial';
}
```

## Task Categories

### 1. Seed Tasks
Real feature tasks representative of typical development work.
- Cover standard unit and integration test scenarios
- Should be generic enough to work on any TypeScript project
- Examples: "implement a config loader module", "add input validation to API handler"

### 2. Edge Cases
Tasks with complex or atypical patterns.
- Async code, nested dependencies, cross-module integrations
- Tasks that require both unit and integration tests (`test_type: "both"`)

### 3. Regression Seeds
Tasks derived from observed pipeline failures.
- Cases where GREEN phase broke RED phase tests
- Cases where CODE_REVIEW missed critical issues
- Cases where ARCH_REVIEW did not detect orphaned code

### 4. Adversarial Cases
Deliberately difficult tasks to stress-test the pipeline.
- Ambiguous requirements
- Conflicting constraints
- Tasks requiring the agent to ask clarifying questions

## Versioning Convention

Dataset files follow the naming convention: `golden-v<major>.<minor>.jsonl`

- **Major version** (`v1`, `v2`, ...): Increment when the schema changes structurally (fields added/removed/renamed). Requires migration of existing tasks.
- **Minor version** (`.1`, `.2`, ...): Increment when tasks are added without schema changes.

Current versions:
- `golden-v1.jsonl` — initial seed dataset (5 tasks)

## How to Add a New Task

1. **Choose a category**: seed, edge-case, regression, or adversarial.

2. **Create a task object** conforming to `GoldenDatasetTaskSchema`:
   ```json
   {
     "id": "your-unique-kebab-id",
     "description": "Clear description of what to implement",
     "parent_task": "Parent feature or module name",
     "subtask_index": 1,
     "test_type": "unit",
     "acceptance": {
       "tests_must_fail_initially": true,
       "tests_must_pass_after_green": true,
       "no_test_modifications_in_green": true,
       "static_analysis_clean": true,
       "architecture_check": "Describe expected structural constraint"
     },
     "reference_solution": "",
     "graders": ["deterministic"],
     "difficulty": "medium"
   }
   ```

3. **Append** the JSON object as a new line to the appropriate `.jsonl` file. Do not insert in the middle — always append.

4. **Validate** using the integration test:
   ```bash
   cd airefinement && NODE_OPTIONS=--experimental-vm-modules npx jest tests/integration/eval/dataset-validation.test.ts
   ```

5. **If adding many tasks** (10+), create a new minor version: `golden-v1.2.jsonl` and update the integration test path.

## Graduation Protocol

Tasks move through the following lifecycle:

```
Capability Eval → Regression Suite
```

- **Capability Eval**: New tasks start here. The pipeline is evaluated against them to measure TDD quality.
- **Graduation threshold**: Tasks where the pipeline achieves a pass rate **>90%** across 5+ eval runs are candidates for graduation.
- **Regression Suite**: Graduated tasks are added to the regression suite to detect quality regressions in future refinements.

**Rule: Never remove tasks from the regression suite.** Tasks may be marked as `deprecated` in a comment, but the JSONL line must remain. The regression suite is append-only.

## Reader API

Load and filter tasks using the dataset reader module:

```typescript
import { loadGoldenDataset, filterByTestType, filterByDifficulty } from '@/eval/dataset-reader.js';

const tasks = loadGoldenDataset('datasets/golden-v1.jsonl');

const unitTasks = filterByTestType(tasks, 'unit');
const hardTasks = filterByDifficulty(tasks, 'hard');
```

See `src/eval/dataset-reader.ts` for full API documentation.
