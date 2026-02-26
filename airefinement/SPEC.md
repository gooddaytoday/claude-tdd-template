# AI Refinement Module -- Specification & Task Breakdown

Continuous improvement system for the TDD Agent Harness (`.claude/skills/tdd-integration/skill.md`).
Collects telemetry from every TDD cycle run, detects failure patterns, launches an AI agent to propose prompt/policy fixes in an isolated git branch, and validates changes through A/B evaluation against a Golden Dataset before merging.

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Project File Structure](#project-file-structure)
- [Task 1 -- Project Infrastructure](#task-1----project-infrastructure)
- [Task 2 -- Telemetry Schemas](#task-2----telemetry-schemas)
- [Task 3 -- Telemetry Subagent](#task-3----telemetry-subagent)
- [Task 4 -- Telemetry Hooks](#task-4----telemetry-hooks)
- [Task 5 -- Orchestrator Integration](#task-5----orchestrator-integration)
- [Task 6 -- Trigger Rules & Configuration](#task-6----trigger-rules--configuration)
- [Task 7 -- Trigger Analyzer](#task-7----trigger-analyzer)
- [Task 8 -- Metrics Engine](#task-8----metrics-engine)
- [Task 9 -- Claude CLI Wrapper](#task-9----claude-cli-wrapper)
- [Task 10 -- Git Utilities](#task-10----git-utilities)
- [Task 11 -- AI Refinement Agent Runner](#task-11----ai-refinement-agent-runner)
- [Task 12 -- Golden Dataset & Task Format](#task-12----golden-dataset--task-format)
- [Task 13 -- Deterministic Graders](#task-13----deterministic-graders)
- [Task 14 -- LLM-Judge Graders & Rubrics](#task-14----llm-judge-graders--rubrics)
- [Task 15 -- Composite Grader & Partial Credit](#task-15----composite-grader--partial-credit)
- [Task 16 -- Eval Runner (A/B Protocol)](#task-16----eval-runner-ab-protocol)
- [Task 17 -- Result Comparator & Reporting](#task-17----result-comparator--reporting)
- [Task 18 -- CLI Entry Point](#task-18----cli-entry-point)
- [Task 19 -- End-to-End Integration Test](#task-19----end-to-end-integration-test)
- [Appendix A -- Role-Specific Metrics Reference](#appendix-a----role-specific-metrics-reference)
- [Appendix B -- Pipeline-Level KPIs Reference](#appendix-b----pipeline-level-kpis-reference)
- [Appendix C -- Anti-Patterns Checklist](#appendix-c----anti-patterns-checklist)
- [Appendix D -- Deployment Pipeline (Future)](#appendix-d----deployment-pipeline-future)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                     TDD Agent Harness (existing)                    │
│  PRE → RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS  │
│                              │                                      │
│                     ┌────────▼────────┐                             │
│                     │  TELEMETRY phase │  (new subagent)            │
│                     │  writes Run Report                            │
│                     └────────┬────────┘                             │
│                              │                                      │
│                              ▼  DONE                                │
└──────────────────────────────┼──────────────────────────────────────┘
                               │
            ┌──────────────────▼──────────────────┐
            │        airefinement/ module          │
            │                                      │
            │  1. Telemetry Collector              │
            │     artifacts/runs/*.json            │
            │     artifacts/traces/*.jsonl          │
            │                                      │
            │  2. Trigger Analyzer                 │
            │     event-driven / trend / commit    │
            │                                      │
            │  3. AI Refinement Agent              │
            │     Claude CLI in isolated branch    │
            │     modifies .claude/agents|skills   │
            │                                      │
            │  4. Eval Runner (A/B)                │
            │     Golden Dataset × N trials        │
            │     Graders: deterministic + LLM     │
            │                                      │
            │  5. Comparator & Decision            │
            │     accept / reject / caveat         │
            └──────────────────────────────────────┘
```

### Data Flow

```
TDD Cycle Run
  ├─→ tdd-telemetry-reporter (subagent) ─→ artifacts/runs/<run-id>.json
  ├─→ prevent-test-edit.ts (hook)        ─→ artifacts/traces/violations.jsonl
  └─→ tdd-telemetry-hook.ts (hook)       ─→ artifacts/traces/timings.jsonl

CLI: airefinement analyze
  ├─ reads artifacts/runs/ + artifacts/traces/
  ├─ applies trigger rules from config/triggers.yaml
  └─ outputs: triggered | no-action

CLI: airefinement refine
  ├─ creates git branch refinement/experiment-<timestamp>
  ├─ launches Claude CLI with refinement prompt + failure context
  ├─ commits changes to .claude/ files
  └─ outputs: branch name + diff summary

CLI: airefinement eval
  ├─ checks out control (main) and variant (experiment branch)
  ├─ runs Golden Dataset × N trials on each
  ├─ applies graders (deterministic → LLM-judge → composite)
  ├─ compares control vs variant
  └─ outputs: experiment report (accept/reject/caveat)

CLI: airefinement report
  └─ aggregates historical data from artifacts/reports/
```

---

## Project File Structure

```
airefinement/
├── package.json
├── tsconfig.json
├── SPEC.md
├── bin/
│   └── cli.ts                        # CLI entry point: analyze, refine, eval, report
├── src/
│   ├── telemetry/
│   │   ├── schemas.ts                 # RunReport, PhaseRecord, TraceEvent types
│   │   └── collector.ts               # Read/aggregate artifacts from disk
│   ├── triggers/
│   │   ├── rules.ts                   # Trigger rule definitions (event/trend/commit)
│   │   └── analyzer.ts                # Apply rules to collected artifacts
│   ├── eval/
│   │   ├── runner.ts                  # Orchestrate Claude CLI eval runs
│   │   ├── comparator.ts              # Side-by-side diff of control vs variant
│   │   └── graders/
│   │       ├── deterministic.ts       # Code-based: test runner, static analysis, git diff
│   │       ├── llm-judge.ts           # LLM rubric evaluation via Claude CLI
│   │       └── composite.ts           # Weighted ensemble + partial credit scoring
│   ├── refinement/
│   │   ├── agent-runner.ts            # Launch Claude CLI for prompt fixes
│   │   └── prompt-templates.ts        # Prompt templates for refinement agent
│   ├── metrics/
│   │   ├── role-metrics.ts            # Per-subagent metric computation
│   │   └── pipeline-kpis.ts           # Aggregate pipeline-level KPIs
│   └── utils/
│       ├── git.ts                     # Branch create/checkout/commit/diff
│       └── claude-cli.ts              # Claude CLI process wrapper
├── config/
│   ├── thresholds.json                # Gate thresholds per phase + KPI targets
│   ├── triggers.yaml                  # Auto-refinement trigger rules
│   └── rubrics/
│       ├── test-writer-quality.md     # LLM-judge rubric: tdd-test-writer
│       ├── implementation-minimality.md
│       ├── code-review-accuracy.md
│       ├── architecture-integration.md
│       └── documentation-completeness.md
├── datasets/
│   └── golden-v1.jsonl                # Baseline Golden Dataset
└── artifacts/                         # Runtime data (.gitignored)
    ├── runs/                          # JSON Run Reports from tdd-telemetry-reporter
    ├── traces/                        # JSONL from hooks (violations, timings)
    └── reports/                       # A/B experiment results

.claude/                               # Changes to existing TDD Harness
├── agents/
│   └── tdd-telemetry-reporter.md      # NEW subagent definition
├── hooks/
│   ├── prevent-test-edit.ts           # MODIFY: add violation logging
│   └── tdd-telemetry-hook.ts          # NEW hook: SubagentStop timings
└── skills/tdd-integration/
    ├── skill.md                       # MODIFY: add TELEMETRY phase
    └── phases/
        └── telemetry.md               # NEW phase delegation file
```

---

## [DONE] Task 1 -- Project Infrastructure

**Goal**: Initialize `airefinement/` as a buildable TypeScript project with all directories.

### Subtask 1.1 -- package.json

Create `airefinement/package.json`:
- `name`: `airefinement`
- `type`: `module`
- `scripts`:
  - `build`: `tsc`
  - `analyze`: `tsx bin/cli.ts analyze`
  - `refine`: `tsx bin/cli.ts refine`
  - `eval`: `tsx bin/cli.ts eval`
  - `report`: `tsx bin/cli.ts report`
- `devDependencies`: `typescript`, `tsx`, `@types/node`
- `dependencies`: `commander` (CLI framework), `yaml` (for triggers.yaml), `uuid` (for run IDs), `zod` (schema validation)

### Subtask 1.2 -- tsconfig.json

Create `airefinement/tsconfig.json`:
- `target`: `ES2022`
- `module`: `NodeNext`
- `moduleResolution`: `NodeNext`
- `outDir`: `dist`
- `rootDir`: `.`
- `strict`: `true`
- `esModuleInterop`: `true`
- `paths` if needed for `@/` alias

### Subtask 1.3 -- Directory scaffold

Create empty directories:
- `airefinement/bin/`
- `airefinement/src/telemetry/`
- `airefinement/src/triggers/`
- `airefinement/src/eval/graders/`
- `airefinement/src/refinement/`
- `airefinement/src/metrics/`
- `airefinement/src/utils/`
- `airefinement/config/rubrics/`
- `airefinement/datasets/`
- `airefinement/artifacts/runs/`
- `airefinement/artifacts/traces/`
- `airefinement/artifacts/reports/`

### Subtask 1.4 -- .gitignore

Create `airefinement/.gitignore`:
```
node_modules/
dist/
artifacts/runs/
artifacts/traces/
artifacts/reports/
```

### Acceptance Criteria
- `cd airefinement && npm install && npm run build` succeeds (even if no source files yet, tsc should exit 0 with empty project)
- All directories exist

---

## [DONE] Task 2 -- Telemetry Schemas

**Goal**: Define TypeScript types for all telemetry data structures used across the system.

### Subtask 2.1 -- RunReport type

File: `airefinement/src/telemetry/schemas.ts`

```typescript
interface PhaseRecord {
  phase: 'RED' | 'GREEN' | 'REFACTOR' | 'CODE_REVIEW' | 'ARCH_REVIEW' | 'DOCS';
  status: 'passed' | 'failed' | 'skipped';
  retries: number;
  gate_result: 'pass' | 'fail';
  gate_failure_reason: string | null;
  changed_files: string[];
  duration_estimate: string | null;
}

interface FixRoutingRecord {
  code_review_cycles: number;
  arch_review_cycles: number;
  escalations: Array<{
    phase: string;
    reason: string;
    fix_request_id?: string;
  }>;
}

interface RunReport {
  run_id: string;
  timestamp: string;
  task_id: string;
  subtask_id: string;
  feature: string;
  test_type: 'unit' | 'integration' | 'both';
  phases: PhaseRecord[];
  fix_routing: FixRoutingRecord;
  guard_violations: GuardViolationEvent[];
  overall_status: 'DONE' | 'FAILED' | 'ESCALATED';
  partial_credit_score: number;
}
```

### Subtask 2.2 -- TraceEvent types

Same file, add:

```typescript
interface GuardViolationEvent {
  timestamp: string;
  agent: string;
  attempted_action: string;
  target_file: string;
  blocked: boolean;
  reason: string;
}

interface SubagentTimingEvent {
  timestamp: string;
  agent: string;
  phase: string;
  started_at: string;
  finished_at: string;
  tool_calls_count: number;
}
```

### Subtask 2.3 -- Zod validation schemas

Create Zod schemas for runtime validation of `RunReport` and `TraceEvent` (used when reading artifacts from disk).

### Subtask 2.4 -- GoldenDatasetTask type

```typescript
interface GoldenDatasetTask {
  id: string;
  description: string;
  parent_task: string;
  subtask_index: number;
  test_type: 'unit' | 'integration' | 'both';
  acceptance: {
    tests_must_fail_initially: boolean;
    tests_must_pass_after_green: boolean;
    no_test_modifications_in_green: boolean;
    static_analysis_clean: boolean;
    architecture_check: string;
  };
  reference_solution: string;
  graders: string[];
  difficulty: 'easy' | 'medium' | 'hard' | 'adversarial';
}
```

### Subtask 2.5 -- ExperimentResult type

```typescript
interface ExperimentResult {
  experiment_id: string;
  timestamp: string;
  hypothesis: string;
  variant_description: string;
  dataset_version: string;
  control_config: VersionManifest;
  variant_config: VersionManifest;
  control_results: AggregatedMetrics;
  variant_results: AggregatedMetrics;
  per_task_comparison: TaskComparison[];
  decision: 'accept' | 'reject' | 'accept_with_caveat';
  decision_rationale: string;
}

interface VersionManifest {
  agent_prompts_hash: string;
  skill_hash: string;
  hooks_hash: string;
  settings_hash: string;
  dataset_version: string;
}

interface AggregatedMetrics {
  tsr: number;
  pass_at_1: number;
  pass_3: number;
  code_quality_score: number;
  total_tokens: number;
  median_cycle_time: number;
  gate_failure_rate: number;
  guard_violations: number;
}

interface TaskComparison {
  task_id: string;
  control_outcome: 'pass' | 'fail' | 'partial';
  variant_outcome: 'pass' | 'fail' | 'partial';
  control_score: number;
  variant_score: number;
  delta: number;
  regression: boolean;
}
```

### Acceptance Criteria
- All types compile without errors
- Zod schemas validate sample JSON fixtures
- Types cover every data structure referenced in later tasks

---

## [DONE] Task 3 -- Telemetry Subagent

**Goal**: Create a new Claude Code subagent `tdd-telemetry-reporter` that writes structured Run Reports.

### Subtask 3.1 -- Agent definition

Create `.claude/agents/tdd-telemetry-reporter.md`:

- **Role**: Collect phase results from the completed TDD cycle and write a structured JSON Run Report.
- **Model**: `fast` (minimal intelligence needed; this is structured data assembly)
- **Tools**: `Read`, `Bash` (for running `date` / `uuidgen`), `Write` (only to `airefinement/artifacts/runs/`)
- **Input**: The orchestrator passes the accumulated Context Packet summary and all Phase Packet summaries as the prompt.
- **Output**: A single JSON file written to `airefinement/artifacts/runs/<run-id>.json` conforming to the `RunReport` schema.
- **Constraints**:
  - MUST NOT modify any source code, test files, or `.claude/` configuration.
  - MUST NOT read files outside the project.
  - The agent computes `partial_credit_score` as: number of phases with `gate_result === 'pass'` divided by total phases (6), yielding 0.0 to 1.0.

### Subtask 3.2 -- Phase delegation file

Create `.claude/skills/tdd-integration/phases/telemetry.md`:

- Describe when this phase runs (after DOCS, before DONE).
- Specify the prompt template for the subagent invocation.
- Specify the expected Phase Packet output (minimal: just confirmation that the file was written).
- Gate: file exists and is valid JSON (orchestrator checks with `cat` + `node -e "JSON.parse(...)"`).

### Acceptance Criteria
- Agent definition follows the same format as existing agents in `.claude/agents/tdd-*.md`
- Phase file follows the same structure as existing files in `.claude/skills/tdd-integration/phases/`

---

## [DONE] Task 4 -- Telemetry Hooks

**Goal**: Instrument existing hooks to log trace events for violation tracking and phase timing.

### Subtask 4.1 -- Modify prevent-test-edit.ts for violation logging

In `.claude/hooks/prevent-test-edit.ts`, at every point where a violation is detected (blocked write/edit to tests, semantic test disabling, enforcement file protection):

- Append a `GuardViolationEvent` JSON line to `airefinement/artifacts/traces/violations.jsonl`.
- Use `fs.appendFileSync` for atomic append.
- Create the file and parent directories if they do not exist.
- Do not change any existing guard logic -- only add logging.

### Subtask 4.2 -- Create tdd-telemetry-hook.ts

Create `.claude/hooks/tdd-telemetry-hook.ts`:

- **Event**: `SubagentStop`
- **Logic**: When a TDD subagent finishes (name matches `tdd-*`):
  - Extract the agent name from the event.
  - Read the current timestamp.
  - Append a `SubagentTimingEvent` JSON line to `airefinement/artifacts/traces/timings.jsonl`.
  - Fields: `agent`, `phase` (derived from agent name: test-writer→RED, implementer→GREEN, etc.), `finished_at`, `tool_calls_count` (if available from event payload, else 0).
- Register in `.claude/settings.json` under `hooks.SubagentStop`.

### Subtask 4.3 -- Update settings.json

Add the new hook to `.claude/settings.json`:
- `hooks.SubagentStop` array should include the entry for `tdd-telemetry-hook.ts` alongside the existing `prevent-test-edit.ts`.
- Add `airefinement/artifacts/**` to `permissions.allow` for Write operations (so the telemetry subagent and hooks can write there).

### Acceptance Criteria
- Existing TDD Guard behavior is unchanged
- Violation events are appended to JSONL on every guard block
- Subagent timing events are appended on every SubagentStop for tdd-* agents
- Settings.json is valid JSON after modification

---

## [DONE] Task 5 -- Orchestrator Integration

**Goal**: Modify the TDD skill to invoke the telemetry subagent as a new phase.

### Subtask 5.1 -- Update state machine in skill.md

In `.claude/skills/tdd-integration/skill.md`:

- Add `TELEMETRY` phase after `DOCS` and before `DONE` in the state machine diagram:
  ```
  PRE-PHASE → RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS → TELEMETRY → DONE
  ```
- Add phase transition row: `DOCS → TELEMETRY` (gate: documentation saved) and `TELEMETRY → DONE` (gate: run report written).

### Subtask 5.2 -- Add phase execution section

In skill.md, add a section:
```
### Phase 7: TELEMETRY -- Record Run Report
Read `phases/telemetry.md`. Invoke `tdd-telemetry-reporter`. Gate: JSON file exists in airefinement/artifacts/runs/.
```

### Subtask 5.3 -- Update Status Reporting template

Add TELEMETRY row to the TDD Cycle Summary table:
```
| TELEMETRY | Done | tdd-telemetry-reporter | [run report file] |
```

### Subtask 5.4 -- Update permissions

Add `Task(tdd-telemetry-reporter:*)` to `permissions.allow` in `.claude/settings.json`.

### Acceptance Criteria
- skill.md state machine includes TELEMETRY phase
- Phase transitions are complete (no orphan states)
- Telemetry subagent is permitted in settings.json

---

## [DONE] Task 6 -- Trigger Rules & Configuration

**Goal**: Define configurable trigger rules that determine when auto-refinement should activate.

### Subtask 6.1 -- triggers.yaml

Create `airefinement/config/triggers.yaml`:

```yaml
auto_refinement_triggers:
  event_driven:
    guard_violation:
      threshold: 1
      description: "Any TDD Guard breach triggers immediate investigation"
    gate_failure_streak:
      threshold: 3
      description: "3 consecutive gate failures in the same phase"
    token_anomaly:
      sigma_threshold: 2
      description: "Token usage exceeds 2 standard deviations from mean"
    manual_intervention_streak:
      threshold: 2
      description: "Manual intervention required 2+ times in a row"

  trend_based:
    tsr_drop:
      threshold_percent: 5
      window_runs: 20
      description: "Task Success Rate dropped >5% vs baseline"
    token_inflation:
      threshold_percent: 20
      window_runs: 20
      description: "Average token usage inflated >20% vs baseline"
    flake_rate:
      threshold_percent: 2
      window_runs: 20
      description: "Flaky test rate exceeds 2%"

  commit_based:
    watched_paths:
      - ".claude/agents/*"
      - ".claude/skills/**"
      - ".claude/hooks/*"
    action: "subset_eval"
    subset_size: 10
    block_if: "any Layer-1 metric below threshold"
```

### Subtask 6.2 -- thresholds.json

Create `airefinement/config/thresholds.json`:

```json
{
  "pipeline_kpis": {
    "tsr_target": 0.80,
    "pass_at_1_target": 0.70,
    "pass_3_target": 0.50,
    "code_quality_score_target": 0.85,
    "defect_escape_rate_max": 0.05,
    "gate_failure_rate_max_per_phase": 0.20,
    "guard_violations_max": 0,
    "flake_rate_max": 0.02
  },
  "phase_gates": {
    "RED": { "must_fail_with_assertion": true },
    "GREEN": { "must_pass": true, "max_retries": 3 },
    "REFACTOR": { "must_stay_green": true },
    "CODE_REVIEW": { "max_fix_cycles": 5 },
    "ARCH_REVIEW": { "max_fix_cycles": 5 },
    "DOCS": { "must_update_task_master": true }
  },
  "role_metrics": {
    "tdd-test-writer": {
      "failing_test_rate": 1.0,
      "mutation_score_min": 0.80,
      "test_relevance_min": 0.90,
      "specification_clarity_min": 0.80,
      "edge_case_count_min": 3
    },
    "tdd-implementer": {
      "tests_pass_rate": 1.0,
      "max_retries": 3
    },
    "tdd-refactorer": {
      "tests_remain_green": true,
      "cyclomatic_complexity_max": 10,
      "code_duplication_max_percent": 3
    },
    "tdd-code-reviewer": {
      "false_positive_rate_max": 0.10,
      "auto_fix_success_min": 0.80,
      "review_consistency_pass3_min": 0.70
    },
    "tdd-architect-reviewer": {
      "integration_validation": true,
      "full_task_review_quality_min": 0.85
    },
    "tdd-documenter": {
      "task_master_update": true,
      "documentation_accuracy_min": 0.90,
      "completeness_min": 0.85
    }
  }
}
```

### Subtask 6.3 -- rules.ts

File: `airefinement/src/triggers/rules.ts`

Implement functions for each trigger category:
- `checkEventDrivenTriggers(runs: RunReport[], traces: TraceEvent[]): TriggerResult[]`
- `checkTrendBasedTriggers(runs: RunReport[], baseline: AggregatedMetrics): TriggerResult[]`
- `checkCommitBasedTriggers(changedFiles: string[]): TriggerResult[]`

Each returns an array of `TriggerResult`:
```typescript
interface TriggerResult {
  type: 'event_driven' | 'trend_based' | 'commit_based';
  rule: string;
  severity: 'critical' | 'warning' | 'info';
  description: string;
  affected_phase?: string;
  affected_agent?: string;
  evidence: Record<string, unknown>;
}
```

### Acceptance Criteria
- Configuration files parse correctly (YAML and JSON)
- All three trigger categories have corresponding check functions
- TriggerResult type captures enough context for the refinement agent

---

## [DONE] Task 7 -- Trigger Analyzer

**Goal**: CLI-callable module that reads artifacts, applies trigger rules, and outputs results.

### Subtask 7.1 -- collector.ts

File: `airefinement/src/telemetry/collector.ts`

- `readRunReports(dir: string): RunReport[]` -- read all JSON files from `artifacts/runs/`, validate with Zod, sort by timestamp DESC.
- `readTraceEvents(dir: string): TraceEvent[]` -- read JSONL files from `artifacts/traces/`, parse each line, validate.
- `getLatestBaseline(dir: string): AggregatedMetrics | null` -- read the most recent baseline from `artifacts/reports/`.

### Subtask 7.2 -- analyzer.ts

File: `airefinement/src/triggers/analyzer.ts`

- `analyze(artifactsDir: string, config: TriggersConfig): AnalysisResult`
- Calls collector to read data.
- Applies all three categories of trigger rules.
- Returns:

```typescript
interface AnalysisResult {
  timestamp: string;
  runs_analyzed: number;
  traces_analyzed: number;
  triggers_fired: TriggerResult[];
  recommendation: 'refine' | 'eval_only' | 'no_action';
  summary: string;
}
```

- Decision logic:
  - Any `critical` trigger → `recommendation: 'refine'`
  - Only `warning` triggers → `recommendation: 'eval_only'`
  - No triggers → `recommendation: 'no_action'`

### Acceptance Criteria
- Analyzer reads real artifact files from disk
- Returns structured AnalysisResult
- Handles empty artifacts directory gracefully (returns `no_action`)

---

## [DONE] Task 8 -- Metrics Engine

**Goal**: Compute role-specific metrics and pipeline KPIs from collected RunReports.

### Subtask 8.1 -- role-metrics.ts

File: `airefinement/src/metrics/role-metrics.ts`

For each subagent, compute metrics from RunReport data:

**tdd-test-writer (RED phase)**:
- `failing_test_rate`: phases where RED gate_result === 'pass' (test correctly failed) / total runs
- `red_invalid_rate`: phases where RED gate_failure_reason contains 'syntax' or 'import' / total RED phases
- `retries_to_valid_red`: average retries in RED phase

**tdd-implementer (GREEN phase)**:
- `tests_pass_rate`: phases where GREEN gate_result === 'pass' / total runs
- `retry_count_avg`: average retries in GREEN phase
- `escalation_rate`: GREEN escalations / total runs

**tdd-refactorer (REFACTOR phase)**:
- `tests_remain_green_rate`: REFACTOR gate_result === 'pass' / total runs
- `regression_rate`: REFACTOR phases that broke tests / total REFACTOR phases

**tdd-code-reviewer (CODE_REVIEW phase)**:
- `fix_cycles_avg`: average code_review_cycles from fix_routing
- `escalation_rate`: CODE_REVIEW escalations / total runs

**tdd-architect-reviewer (ARCH_REVIEW phase)**:
- `fix_cycles_avg`: average arch_review_cycles from fix_routing
- `pass_rate`: ARCH_REVIEW gate_result === 'pass' / total runs

**tdd-documenter (DOCS phase)**:
- `completion_rate`: DOCS gate_result === 'pass' / total runs

Return: `Record<string, Record<string, number>>` (agent → metric → value)

### Subtask 8.2 -- pipeline-kpis.ts

File: `airefinement/src/metrics/pipeline-kpis.ts`

Compute from RunReport[]:

**Outcome KPIs**:
- `tsr`: runs with overall_status === 'DONE' / total runs
- `pass_at_1`: runs with overall_status === 'DONE' and zero retries across all phases / total runs
- `code_quality_score`: average partial_credit_score
- `gate_failure_rate`: total phases with gate_result === 'fail' / total phase instances

**Trajectory KPIs**:
- `median_cycle_time`: median of duration estimates (if available)
- `total_retries_avg`: average sum of retries across all phases per run
- `fix_routing_cycles_avg`: average total fix-routing cycles per run

**System Health KPIs**:
- `guard_violations_total`: sum of guard_violations across all runs
- `guard_violations_per_run`: average per run

Return: `AggregatedMetrics`

### Subtask 8.3 -- Threshold comparison

Add function:
- `compareToThresholds(metrics: AggregatedMetrics, thresholds: ThresholdConfig): ThresholdViolation[]`
- Returns list of violated thresholds with actual vs expected values.

### Acceptance Criteria
- All metrics computable from RunReport data alone (no external dependencies)
- Threshold comparison returns actionable violations
- Edge cases: zero runs, single run, all-pass runs, all-fail runs

---

## [DONE] Task 9 -- Claude CLI Wrapper

**Goal**: Utility for launching Claude CLI processes with structured input/output.

### Subtask 9.1 -- claude-cli.ts

File: `airefinement/src/utils/claude-cli.ts`

```typescript
interface ClaudeCliOptions {
  prompt: string;
  workingDirectory: string;
  maxTurns?: number;
  timeout?: number;
  allowedTools?: string[];
  systemPrompt?: string;
}

interface ClaudeCliResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
}

async function runClaude(options: ClaudeCliOptions): Promise<ClaudeCliResult>
```

- Spawns `claude` CLI as a child process.
- Uses `--print` mode for non-interactive execution: `claude -p "<prompt>"`.
- Passes `--max-turns` if specified.
- Handles timeout with `AbortController`.
- Captures stdout/stderr.
- Returns structured result.

### Subtask 9.2 -- Prompt assembly helper

```typescript
function buildPrompt(template: string, variables: Record<string, string>): string
```

Simple Mustache-style variable substitution for prompt templates (`{{variable}}`).

### Acceptance Criteria
- Can execute `claude -p "echo hello"` and capture output
- Timeout kills the process and returns error
- Non-zero exit codes are captured without throwing

---

## [DONE] Task 10 -- Git Utilities

**Goal**: Functions for git branch management needed by the refinement workflow.

### Subtask 10.1 -- git.ts

File: `airefinement/src/utils/git.ts`

Functions:
- `getCurrentBranch(): Promise<string>` -- `git rev-parse --abbrev-ref HEAD`
- `createBranch(name: string): Promise<void>` -- `git checkout -b <name>`
- `checkoutBranch(name: string): Promise<void>` -- `git checkout <name>`
- `commitAll(message: string): Promise<void>` -- `git add -A && git commit -m "<message>"`
- `getDiff(baseBranch: string): Promise<string>` -- `git diff <baseBranch>...HEAD`
- `getChangedFiles(baseBranch: string): Promise<string[]>` -- `git diff --name-only <baseBranch>...HEAD`
- `hashFiles(paths: string[]): Promise<string>` -- compute SHA256 of concatenated file contents (for VersionManifest)
- `stash(): Promise<void>` / `stashPop(): Promise<void>`

All functions use `child_process.execFile` for safety (no shell injection).

### Acceptance Criteria
- All functions work in the repository root
- Error handling for non-git directories
- hashFiles produces deterministic output

---

## [DONE] Task 11 -- AI Refinement Agent Runner

**Goal**: Launch Claude CLI with the Self-Improvement Loop pattern to diagnose and fix harness issues.

### Subtask 11.1 -- prompt-templates.ts

File: `airefinement/src/refinement/prompt-templates.ts`

Define prompt templates:

**Diagnosis prompt** (used first):
```
You are an expert prompt engineer specializing in AI agent harnesses.

## Context
You are analyzing a TDD Agent Harness that uses 6 phases:
RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS

## Problem
The following triggers were detected:
{{triggers_summary}}

## Failure Evidence
{{failure_reports}}

## Current Agent Prompts
{{agent_prompts}}

## Current Policies
{{policy_files}}

## Task
1. Diagnose the root cause of the failures.
2. Propose specific changes to agent prompts or policies.
3. Apply ONLY the minimal changes needed.
4. Do NOT modify test files or source code.
5. Only modify files in .claude/agents/, .claude/skills/, .claude/hooks/.
6. Commit your changes with a descriptive message.
```

**Variant names**: Use experiment ID in commit message for traceability.

### Subtask 11.2 -- agent-runner.ts

File: `airefinement/src/refinement/agent-runner.ts`

```typescript
interface RefinementInput {
  analysis: AnalysisResult;
  failedRunReports: RunReport[];
  currentAgentPrompts: Record<string, string>;
  currentPolicies: Record<string, string>;
}

interface RefinementOutput {
  experimentBranch: string;
  changedFiles: string[];
  commitHash: string;
  agentStdout: string;
}

async function runRefinement(input: RefinementInput): Promise<RefinementOutput>
```

Steps:
1. Generate experiment ID: `exp-<YYYY-MM-DD>-<short-description>`.
2. Create git branch `refinement/<experiment-id>`.
3. Build prompt from template + input data.
4. Read current agent prompts from `.claude/agents/tdd-*.md`.
5. Read current policies from `.claude/skills/tdd-integration/**`.
6. Run Claude CLI with the assembled prompt.
7. Capture output.
8. Get changed files via `git diff`.
9. Commit changes.
10. Return RefinementOutput.

### Subtask 11.3 -- Scope restriction

The prompt must explicitly list allowed modification paths. Additionally, after Claude CLI finishes, the runner verifies that ONLY files in `.claude/agents/`, `.claude/skills/`, `.claude/hooks/` were changed. If other files were modified, the runner reverts and returns an error.

### Acceptance Criteria
- Creates isolated branch without affecting main
- Prompt includes all relevant failure context
- Scope verification rejects out-of-bounds modifications
- Returns structured output with diff summary

---

## [DONE] Task 12 -- Golden Dataset & Task Format

**Goal**: Create the baseline Golden Dataset and define the task format for eval runs.

### Subtask 12.1 -- Dataset schema

The Golden Dataset is stored as JSONL (`airefinement/datasets/golden-v1.jsonl`), one `GoldenDatasetTask` per line (defined in Task 2).

Four categories of tasks (from Perplexity research):

1. **Seed Tasks** (10-15): Real feature tasks previously executed through the harness.
   - Examples: "implement a config loader module", "add input validation to API handler"
   - These should cover typical unit and integration test scenarios.

2. **Edge Cases** (5-10): Tasks with complex patterns.
   - Async code, nested dependencies, cross-module integrations.
   - Tasks that require both unit and integration tests (`test_type: "both"`).

3. **Regression Seeds** (5-10): Tasks derived from past failures.
   - Cases where GREEN phase broke RED phase tests.
   - Cases where CODE_REVIEW missed critical issues.
   - Cases where ARCH_REVIEW did not detect orphaned code.

4. **Adversarial Cases** (3-5): Deliberately difficult.
   - Ambiguous requirements.
   - Conflicting constraints.
   - Tasks requiring the agent to ask clarifying questions.

### Subtask 12.2 -- Initial dataset

Create `airefinement/datasets/golden-v1.jsonl` with at least 5 seed tasks (minimal viable dataset). Each task includes:
- Clear feature description.
- Expected test type.
- Acceptance criteria.
- Difficulty level.

These seed tasks should be generic enough to work on any TypeScript project (the template is project-agnostic).

### Subtask 12.3 -- Dataset versioning

Add `airefinement/datasets/README.md` documenting:
- How to add new tasks to the dataset.
- Versioning convention: `golden-v<major>.<minor>.jsonl`.
- Graduation protocol: capability eval tasks with pass rate >90% move to regression suite.
- Rule: never remove tasks from the regression suite; only add.

### Acceptance Criteria
- JSONL file contains at least 5 valid tasks
- Each task validates against GoldenDatasetTask Zod schema
- Dataset README explains the contribution process

---

## [DONE] Task 13 -- Deterministic Graders

**Goal**: Code-based graders that evaluate outcomes objectively.

### Subtask 13.1 -- deterministic.ts

File: `airefinement/src/eval/graders/deterministic.ts`

```typescript
interface GraderResult {
  grader: string;
  score: number;       // 0.0 - 1.0
  pass: boolean;
  details: Record<string, unknown>;
}

interface DeterministicGraderInput {
  workingDirectory: string;
  testCommand: string;
  testFiles: string[];
  implFiles: string[];
  baseCommit: string;
}
```

Implement graders:

1. **TestRunnerGrader**: Execute the test command, check exit code.
   - `score`: 1.0 if pass, 0.0 if fail.
   - `details`: test output excerpt, exit code.

2. **StaticAnalysisGrader**: Run `npx tsc --noEmit` and (if available) ESLint.
   - `score`: 1.0 if zero errors, partial for warnings-only.
   - `details`: error count, warning count.

3. **TestMutationGrader**: Check `git diff` on test files between base and HEAD.
   - `score`: 1.0 if no test files modified during GREEN/REFACTOR, 0.0 otherwise.
   - `details`: list of modified test files.

4. **GuardComplianceGrader**: Read violations JSONL, check for any blocked attempts.
   - `score`: 1.0 if zero violations, 0.0 if any.
   - `details`: violation count, list.

### Acceptance Criteria
- Each grader returns a normalized 0.0-1.0 score
- TestRunnerGrader actually executes the test command
- StaticAnalysisGrader handles missing TypeScript config gracefully
- All graders are independently testable

---

## [DONE] Task 14 -- LLM-Judge Graders & Rubrics

**Goal**: LLM-based graders for subjective quality dimensions, plus calibration infrastructure.

### Subtask 14.1 -- Rubric files

Create rubric prompts in `airefinement/config/rubrics/`:

**test-writer-quality.md**:
```
You are evaluating test code generated by a TDD test-writer agent.

Rubric (score each 0-2):
1) Specification Clarity: Are tests readable as a behavioral specification?
   0=cryptic, 1=understandable but verbose, 2=clear and concise
2) Edge Case Coverage: Does the test suite cover boundary conditions?
   0=only happy path, 1=some edges, 2=comprehensive
3) Assertion Quality: Are assertions specific and meaningful?
   0=trivial assertions, 1=reasonable, 2=precise and descriptive
4) Independence: Tests don't depend on execution order or shared state?
   0=coupled, 1=mostly independent, 2=fully isolated

Return JSON: {"clarity":int,"edges":int,"assertions":int,"independence":int,
              "total":float,"rationale":"..."}
```

**implementation-minimality.md**: Evaluate whether implementation contains only what tests require.

**code-review-accuracy.md**: Evaluate whether code review findings are actionable and not false positives.

**architecture-integration.md**: Evaluate whether code integrates cleanly with existing architecture.

**documentation-completeness.md**: Evaluate whether documentation accurately reflects the implementation.

### Subtask 14.2 -- llm-judge.ts

File: `airefinement/src/eval/graders/llm-judge.ts`

```typescript
interface LlmJudgeInput {
  rubricPath: string;
  codeToEvaluate: string;
  contextFiles?: Record<string, string>;
}

async function evaluateWithLlmJudge(input: LlmJudgeInput): Promise<GraderResult>
```

- Reads the rubric file.
- Appends the code to evaluate as context.
- Calls Claude CLI with the assembled prompt.
- Parses the JSON response from Claude.
- Normalizes the score to 0.0-1.0 range.
- Includes `rationale` in details.

### Subtask 14.3 -- Calibration utilities

```typescript
interface CalibrationResult {
  rubric: string;
  spearman_correlation: number;
  sample_size: number;
  calibrated: boolean;  // true if >= 0.80
}

async function calibrateLlmJudge(
  rubric: string,
  humanAnnotations: Array<{input: string, humanScore: number}>,
  llmScores: Array<{input: string, llmScore: number}>
): Promise<CalibrationResult>
```

For bias reduction (from Perplexity research):
- Prompt includes: "Do not favor responses based on length."
- Multiple replications with fixed parameters.
- Ensemble of 2-3 judges with majority vote (future enhancement).

### Acceptance Criteria
- Rubric files follow consistent format
- LLM judge calls Claude CLI and parses JSON response
- Calibration function computes Spearman correlation
- Graceful degradation when Claude CLI is unavailable

---

## [DONE] Task 15 -- Composite Grader & Partial Credit

**Goal**: Weighted ensemble of graders with partial credit scoring.

### Subtask 15.1 -- composite.ts

File: `airefinement/src/eval/graders/composite.ts`

```typescript
interface CompositeConfig {
  weights: {
    test_runner: number;        // e.g. 0.30
    static_analysis: number;    // e.g. 0.15
    test_mutation: number;      // e.g. 0.15
    guard_compliance: number;   // e.g. 0.10
    llm_test_quality: number;   // e.g. 0.10
    llm_impl_minimality: number; // e.g. 0.10
    llm_doc_completeness: number; // e.g. 0.10
  };
}

interface CompositeResult {
  overall_score: number;
  pass: boolean;
  individual_scores: Record<string, GraderResult>;
  partial_credit: PartialCreditBreakdown;
}
```

### Subtask 15.2 -- Partial credit logic

From Perplexity research: "An agent that passed Phase 1-3 but failed on Phase 4 is significantly better than one that failed on Phase 1."

Scoring:
- Phase progression bonus: each completed phase adds 1/6 to base score.
- Grader scores are multiplied by the progression weight.
- Final score = `phase_progression * 0.4 + weighted_grader_ensemble * 0.6`.

```typescript
interface PartialCreditBreakdown {
  phases_completed: number;
  phases_total: number;
  phase_progression_score: number;
  grader_ensemble_score: number;
  final_score: number;
}
```

### Acceptance Criteria
- Composite grader combines all individual graders with configurable weights
- Partial credit rewards phase progression even on overall failure
- Score is always in 0.0-1.0 range

---

## Task 16 -- Eval Runner (A/B Protocol)

**Goal**: Orchestrate the 8-step A/B experiment protocol using Claude CLI.

### Subtask 16.1 -- runner.ts

File: `airefinement/src/eval/runner.ts`

```typescript
interface EvalRunConfig {
  controlBranch: string;        // e.g. "main"
  variantBranch: string;        // e.g. "refinement/exp-2026-02-24-fix-red"
  datasetPath: string;          // e.g. "datasets/golden-v1.jsonl"
  trials: number;               // e.g. 3
  hypothesis: string;
  graderConfig: CompositeConfig;
  timeout: number;              // per-task timeout in ms
}

async function runEval(config: EvalRunConfig): Promise<ExperimentResult>
```

**Protocol steps** (from Perplexity research):

1. **Load dataset**: Parse JSONL, validate with Zod.
2. **Snapshot**: Record VersionManifest for both branches (agent prompt hashes, skill hash, etc.).
3. **Run Control**: For each task × trial:
   - `git checkout <controlBranch>` (use a temporary worktree or stash).
   - Run Claude CLI with task description.
   - Run graders on resulting workspace.
   - Record per-task result.
4. **Run Variant**: Same as Control but on the variant branch.
5. **Aggregate**: Compute AggregatedMetrics for both.
6. **Compare**: Per-task comparison, identify regressions.
7. **Decide**:
   - `accept`: variant is better on all key metrics, no regressions.
   - `reject`: variant is worse or has critical regressions.
   - `accept_with_caveat`: net positive but some regressions exist.
8. **Save**: Write ExperimentResult to `artifacts/reports/<experiment-id>.json`.

### Subtask 16.2 -- Environment isolation

Each trial must start from a clean state:
- Use `git worktree` for parallel clean checkouts.
- Or `git stash` + `git checkout` + clean working tree.
- Ensure no artifacts from previous trials leak into next.

### Subtask 16.3 -- Simulation-based pre-testing

Before running full dataset, offer a `--quick` mode:
- Runs only 3-5 tasks from the dataset (randomly sampled).
- Quick validation that the variant is not obviously broken.
- Saves time before committing to full eval run.

### Acceptance Criteria
- Full A/B protocol executed with real Claude CLI invocations
- Environment isolation prevents cross-contamination between trials
- Quick mode runs subset of tasks
- ExperimentResult saved with full lineage (VersionManifest)

---

## Task 17 -- Result Comparator & Reporting

**Goal**: Side-by-side comparison of experiment results and human-readable reporting.

### Subtask 17.1 -- comparator.ts

File: `airefinement/src/eval/comparator.ts`

```typescript
interface ComparisonReport {
  experiment_id: string;
  control_metrics: AggregatedMetrics;
  variant_metrics: AggregatedMetrics;
  deltas: Record<string, number>;       // metric_name → (variant - control)
  regressions: TaskComparison[];        // tasks where variant is worse
  improvements: TaskComparison[];       // tasks where variant is better
  unchanged: TaskComparison[];
  net_assessment: string;               // human-readable summary
}
```

### Subtask 17.2 -- Report formatting

Generate reports in two formats:

**JSON** (machine-readable): Full ExperimentResult saved to `artifacts/reports/`.

**Markdown** (human-readable): Printed to stdout and saved to `artifacts/reports/<id>.md`:
```markdown
# Experiment Report: <experiment_id>

## Hypothesis
<hypothesis>

## Results Summary
| Metric | Control | Variant | Delta | Status |
|--------|---------|---------|-------|--------|
| TSR    | 0.80    | 0.85    | +0.05 | Better |
| ...    | ...     | ...     | ...   | ...    |

## Regressions (N tasks)
...

## Improvements (N tasks)
...

## Decision: ACCEPT / REJECT / ACCEPT_WITH_CAVEAT
<rationale>
```

### Subtask 17.3 -- Historical trend view

`airefinement report --history` command:
- Read all experiment results from `artifacts/reports/`.
- Show timeline of TSR, pass@1, guard_violations over time.
- Highlight which experiments were accepted.

### Acceptance Criteria
- Side-by-side comparison identifies regressions and improvements
- Markdown report is human-readable and includes all key metrics
- Historical view works with multiple experiment results

---

## Task 18 -- CLI Entry Point

**Goal**: Commander-based CLI that exposes all module functionality.

### Subtask 18.1 -- bin/cli.ts

File: `airefinement/bin/cli.ts`

Commands:

```
airefinement analyze [--artifacts-dir <path>] [--config <path>]
  Analyze collected artifacts for trigger patterns.
  Output: AnalysisResult JSON + human-readable summary.

airefinement refine [--analysis <path>] [--dry-run]
  Launch AI refinement agent on detected issues.
  Creates experiment branch and commits changes.
  --dry-run: show what would be changed without modifying files.

airefinement eval --control <branch> --variant <branch> [--dataset <path>] [--trials <n>] [--quick]
  Run A/B evaluation comparing two configurations.
  --quick: subset of 3-5 tasks for fast validation.

airefinement report [--history] [--format json|md]
  Show latest experiment report or historical trends.

airefinement metrics [--runs <n>]
  Compute and display role-specific metrics and pipeline KPIs from last N runs.
```

### Subtask 18.2 -- Default paths

Convention-based defaults:
- `--artifacts-dir`: `airefinement/artifacts/`
- `--config`: `airefinement/config/`
- `--dataset`: `airefinement/datasets/golden-v1.jsonl`
- `--trials`: 3

### Acceptance Criteria
- All 5 commands parse arguments correctly
- `--help` shows usage for each command
- Missing required arguments produce clear error messages

---

## Task 19 -- End-to-End Integration Test

**Goal**: Verify the full pipeline works from artifact collection to experiment report.

### Subtask 19.1 -- Fixture generation

Create test fixtures:
- Sample RunReport JSON files (pass, fail, partial).
- Sample violation JSONL entries.
- Sample timing JSONL entries.

Place in `airefinement/tests/fixtures/`.

### Subtask 19.2 -- Pipeline test

Test the following sequence with fixtures:
1. `collector.ts` reads fixture artifacts.
2. `analyzer.ts` detects triggers from fixture data.
3. `role-metrics.ts` computes per-agent metrics.
4. `pipeline-kpis.ts` computes aggregate KPIs.
5. `comparator.ts` generates comparison report from two sets of metrics.

### Subtask 19.3 -- CLI smoke test

- `airefinement analyze --artifacts-dir tests/fixtures/artifacts` returns valid AnalysisResult.
- `airefinement metrics --artifacts-dir tests/fixtures/artifacts` returns valid metrics.
- `airefinement report --artifacts-dir tests/fixtures/artifacts` produces readable output.

### Acceptance Criteria
- Full pipeline runs without errors on fixture data
- CLI commands exit with code 0 on valid input
- Fixture data covers pass, fail, and partial scenarios

---

## Appendix A -- Role-Specific Metrics Reference

Complete metrics tables from the Perplexity deep research.

### tdd-test-writer (Phase 1: RED)

| Metric | Description | Target | Grader |
|--------|-------------|--------|--------|
| Failing Test Rate | % of tests that actually fail on empty implementation | 100% | Code-based: run tests |
| Mutation Score | Test resistance to code mutations | >=80% | Code-based: mutation runner |
| Test Relevance | Tests cover stated acceptance criteria | >=0.9 | LLM-judge rubric |
| Specification Clarity | Test cases are readable as a specification | >=0.8 | LLM-judge rubric |
| Edge Case Coverage | Presence of edge cases and error scenarios | >=3 edge cases / task | Code-based + LLM |
| Token Efficiency | Tokens spent writing tests | Downward trend | Transcript analysis |
| Code-to-Test Ratio | Ratio of test code to final implementation | ~1:1 | Code-based |

### tdd-implementer (Phase 2: GREEN)

| Metric | Description | Target | Grader |
|--------|-------------|--------|--------|
| Tests Pass Rate | % of tests passing after implementation | 100% | Code-based: test runner |
| Implementation Minimality | No excess code beyond what tests require | High | LLM-judge: minimality rubric |
| Time-to-Green | Time from phase start to test pass | Downward trend | Transcript timing |
| No Test Modifications | Tests were not changed (TDD Guard) | 0 violations | Code-based: git diff on tests/ |
| Build Success | Project compiles / lint-free | 100% | Code-based: lint + type check |
| Retry Count | Iterations until green state | <=3 | Transcript analysis |

### tdd-refactorer (Phase 3: REFACTOR)

| Metric | Description | Target | Grader |
|--------|-------------|--------|--------|
| Tests Remain Green | Tests stay green after refactoring | 100% | Code-based: test runner |
| Cyclomatic Complexity | Reduction or maintenance of complexity | <10 per method | Static analysis |
| Code Duplication | % duplication in implementation | <3% | Static analysis: jscpd/PMD |
| Improvement Delta | Measurable improvement vs Phase 2 | Positive | LLM-judge + static analysis diff |
| No Test Modifications | TDD Guard enforcement | 0 violations | Code-based |
| Dead Code Elimination | Removal of unused code | 0 unused exports | Static analysis: ts-prune |

### tdd-code-reviewer (Phase 4: CODE REVIEW)

| Metric | Description | Target | Grader |
|--------|-------------|--------|--------|
| Critical Issues Found | Detection of real critical/major problems | >=1 on seeded bugs | Code-based: known issues comparison |
| False Positive Rate | % of false problem reports | <10% | Human calibration |
| Coverage Breadth | Review dimensions: security, performance, style, correctness | >=4 | LLM-judge rubric |
| Actionability | Recommendations are specific and actionable | >=0.85 | LLM-judge rubric |
| Auto-fix Success | % of issues fixed through auto-fix loop | >=80% | Code-based: before/after test run |
| Review Consistency | Repeatability on same code | pass^3 >= 70% | Multi-trial analysis |

### tdd-architect-reviewer (Phase 5: ARCHITECTURE REVIEW)

| Metric | Description | Target | Grader |
|--------|-------------|--------|--------|
| Integration Validation | Code integrates into existing architecture | Pass | Code-based: build + import checks |
| Orphaned Code Detection | Detection of unintegrated code | 100% recall on known orphans | Code-based + LLM |
| Dependency Correctness | Dependencies match architectural boundaries | 0 violations | Static analysis: dependency-cruiser |
| Full Task Review Quality | Review completeness on final subtask | >=0.85 | LLM-judge with checklist |
| Context Utilization | Usage of parent task context | Evidence of task-master reads | Transcript: tool_calls check |

### tdd-documenter (Phase 6: DOCUMENTATION)

| Metric | Description | Target | Grader |
|--------|-------------|--------|--------|
| Task Master Update | Implementation details written to task-master | 100% | Code-based: API call verification |
| CLAUDE.md Update | Module documentation updated | When applicable | Code-based: file diff |
| Documentation Accuracy | Documentation matches implementation | >=0.9 | LLM-judge: cross-reference code vs docs |
| Completeness | All key decisions documented | >=0.85 | LLM-judge rubric |
| Conciseness | No excessive details | Token count within budget | Code-based: word/token count |

---

## Appendix B -- Pipeline-Level KPIs Reference

### Outcome Metrics

| KPI | Formula | Target | Source |
|-----|---------|--------|--------|
| Task Success Rate (TSR) | Tasks completing full cycle without manual intervention / Total | >=80% | End-state evaluation |
| pass@1 | Probability of successful completion on first attempt | >=70% | Multi-trial stats |
| pass^3 | Probability of 3 consecutive successes | >=50% | Multi-trial stats |
| Code Quality Score | Composite: tests pass + static analysis + LLM rubric | >=0.85 | Weighted grader ensemble |
| Defect Escape Rate | Bugs found after Phase 5 | <5% | Post-deployment tracking |

### Trajectory Metrics

| KPI | Formula | Target | Source |
|-----|---------|--------|--------|
| Total Tokens per Task | Sum of tokens across all 6 phases | Downward trend | Transcript analysis |
| Total Tool Calls | Tool invocations per cycle | Monitor, not minimize | Transcript analysis |
| Cycle Time | Time from Phase 1 start to Phase 6 end | Downward trend | Timestamp analysis |
| Gate Failure Rate | % of phases failing gate on first attempt | <20% per phase | Gate logs |
| Retry Loops | Auto-fix cycles (Phase 4 -> implementer/refactorer) | <=2 per task | Transcript analysis |
| Plan Execution Efficiency | Actual steps / Optimal planned steps | <=1.3 | Trajectory comparison |

### System Health Metrics

| KPI | Description | Target |
|-----|-------------|--------|
| TDD Guard Violations | Test modification attempts outside tdd-test-writer | 0 |
| Context Pollution Index | Quality degradation as context window grows | Stable across compactions |
| Flake Rate | % of unstable tests in CI | <2% |
| Auto-activation Accuracy | Correctness of user-prompt-skill-eval.ts | >=95% (balanced precision/recall) |

---

## Appendix C -- Anti-Patterns Checklist

Patterns to detect and avoid in the eval framework (from Perplexity research):

| Anti-Pattern | Description | Prevention |
|-------------|-------------|------------|
| Score Theater | Optimizing judge prompt instead of agent prompt | Separate judge prompt versioning from agent prompt versioning |
| Eval Drift | Comparing runs with different KB/codebase versions | Version pinning via VersionManifest |
| One-Number Fetish | Masking slice failures behind global averages | Per-task comparison in comparator.ts, regression detection |
| Unbounded Loops | Missing step/time budgets, eval hangs | Timeout in Claude CLI wrapper, max_turns limit |
| Shared State Bias | Golden dataset tasks using git history from previous trials | Clean checkout per trial via git worktree |
| Status Hallucination | Agent claiming "tests pass" without running them | Orchestrator verification protocol (independent test run) |
| Spec Drift | Rewriting tests instead of fixing implementation | TDD Guard blocks this technically |

---

## Appendix D -- Deployment Pipeline (Future)

Four-stage model for production adoption (from Perplexity research):

1. **Pre-prod**: Full offline eval suite must pass all gates.
2. **Shadow**: Parallel run of new config on real tasks without applying results; compare deltas.
3. **Canary**: 1-2 real tasks through new configuration; rollback on breach.
4. **GA**: Gradual transition; SLO monitoring and safety sentinels.

### Capability vs Regression Eval Graduation

- **Capability evals**: Start with low pass rate; provide a "hill to climb." Example: "Can tdd-test-writer generate property-based tests?" (current: 20%)
- **Regression evals**: Must have ~100% pass rate. Any drop = something broke. Example: "All golden dataset tasks still pass full cycle."
- **Graduation**: When a capability eval reaches stable >90% pass rate, it moves to the regression suite.

### LLM-Judge Calibration Protocol

1. Collect 50-100 representative outputs from each subagent.
2. 2-3 experts independently score using the rubric.
3. Compute Spearman correlation between human consensus and LLM judge.
4. Target: >=0.80.
5. On drift (<0.75): revise rubric prompt and recalibrate.

Bias reduction measures:
- Explicit disclaimers: "Do not favor responses based on length."
- Multiple replications with fixed parameters.
- Ensemble of 2-3 judges with majority vote.
- Minority-veto for critical safety issues.
