import type {
  AggregatedMetrics,
  ExperimentResult,
  GuardViolationEvent,
  RunReport,
  SubagentTimingEvent,
  TriggersConfig,
} from '@/telemetry/schemas.js';

export function makeAggregatedMetrics(overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics {
  return {
    tsr: 0.67,
    pass_at_1: 0.33,
    pass_3: 0.67,
    code_quality_score: 0.62,
    total_tokens: 3000,
    median_cycle_time: 180,
    gate_failure_rate: 0.2,
    guard_violations: 1,
    ...overrides,
  };
}

export function makeGuardViolation(
  overrides: Partial<GuardViolationEvent> = {},
): GuardViolationEvent {
  return {
    timestamp: '2026-02-20T10:05:00.000Z',
    agent: 'tdd-implementer',
    attempted_action: 'edit test file',
    target_file: 'tests/unit/sample.test.ts',
    blocked: true,
    reason: 'Guard blocked test modification',
    ...overrides,
  };
}

export function makeSubagentTiming(
  overrides: Partial<SubagentTimingEvent> = {},
): SubagentTimingEvent {
  return {
    timestamp: '2026-02-20T10:06:00.000Z',
    agent: 'tdd-implementer',
    phase: 'GREEN',
    started_at: '2026-02-20T10:04:00.000Z',
    finished_at: '2026-02-20T10:06:00.000Z',
    tool_calls_count: 12,
    ...overrides,
  };
}

export function makeRunReport(overrides: Partial<RunReport> = {}): RunReport {
  return {
    run_id: 'run-pass',
    timestamp: '2026-02-20T10:00:00.000Z',
    task_id: 'task-19',
    subtask_id: '19.2',
    feature: 'e2e-integration',
    test_type: 'integration',
    phases: [
      {
        phase: 'RED',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: ['tests/integration/pipeline/e2e-pipeline.test.ts'],
        duration_estimate: '20s',
      },
      {
        phase: 'GREEN',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: ['src/telemetry/collector.ts'],
        duration_estimate: '40s',
      },
      {
        phase: 'REFACTOR',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: ['src/metrics/pipeline-metrics.ts'],
        duration_estimate: '30s',
      },
      {
        phase: 'CODE_REVIEW',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: [],
        duration_estimate: '10s',
      },
      {
        phase: 'ARCH_REVIEW',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: [],
        duration_estimate: '15s',
      },
      {
        phase: 'DOCS',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: ['src/metrics/CLAUDE.md'],
        duration_estimate: '25s',
      },
    ],
    fix_routing: {
      code_review_cycles: 0,
      arch_review_cycles: 0,
      escalations: [],
    },
    guard_violations: [],
    overall_status: 'DONE',
    partial_credit_score: 1,
    total_tokens: 2400,
    ...overrides,
  };
}

function makeVersionManifest() {
  return {
    agent_prompts_hash: 'abc123',
    skill_hash: 'def456',
    hooks_hash: 'ghi789',
    settings_hash: 'jkl012',
    dataset_version: 'golden-v1',
  };
}

export function makeExperimentResult(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    experiment_id: 'exp-task-19',
    timestamp: '2026-02-20T12:00:00.000Z',
    hypothesis: 'Fixture-based e2e validation improves confidence',
    variant_description: 'Task 19 fixtures and tests',
    dataset_version: 'golden-v1',
    control_config: makeVersionManifest(),
    variant_config: makeVersionManifest(),
    control_results: makeAggregatedMetrics({
      tsr: 0.6,
      pass_at_1: 0.3,
      pass_3: 0.5,
      code_quality_score: 0.7,
      total_tokens: 3200,
      median_cycle_time: 210,
      gate_failure_rate: 0.25,
      guard_violations: 2,
    }),
    variant_results: makeAggregatedMetrics({
      tsr: 0.75,
      pass_at_1: 0.5,
      pass_3: 0.75,
      code_quality_score: 0.8,
      total_tokens: 2900,
      median_cycle_time: 180,
      gate_failure_rate: 0.15,
      guard_violations: 1,
    }),
    per_task_comparison: [
      {
        task_id: 'task-pass',
        control_outcome: 'pass',
        variant_outcome: 'pass',
        control_score: 0.8,
        variant_score: 0.9,
        delta: 0.1,
        regression: false,
      },
      {
        task_id: 'task-fail',
        control_outcome: 'partial',
        variant_outcome: 'fail',
        control_score: 0.6,
        variant_score: 0.4,
        delta: -0.2,
        regression: true,
      },
      {
        task_id: 'task-partial',
        control_outcome: 'partial',
        variant_outcome: 'partial',
        control_score: 0.5,
        variant_score: 0.5,
        delta: 0,
        regression: false,
      },
    ],
    decision: 'accept_with_caveat',
    decision_rationale: 'Variant improves aggregate KPIs but has one per-task regression.',
    ...overrides,
  };
}

export function makeTriggersConfig(): TriggersConfig {
  return {
    auto_refinement_triggers: {
      event_driven: {
        guard_violation: {
          threshold: 1,
          description: 'Any guard violation triggers immediate investigation',
        },
        gate_failure_streak: {
          threshold: 2,
          description: 'Two consecutive gate failures in the same phase',
        },
        token_anomaly: {
          sigma_threshold: 2,
          description: 'Token usage anomaly detected',
        },
        manual_intervention_streak: {
          threshold: 2,
          description: 'Two escalations in a row',
        },
      },
      trend_based: {
        tsr_drop: {
          threshold_percent: 5,
          window_runs: 20,
          description: 'TSR drop over threshold',
        },
        token_inflation: {
          threshold_percent: 10,
          window_runs: 20,
          description: 'Token inflation over threshold',
        },
        flake_rate: {
          threshold_percent: 2,
          window_runs: 20,
          description: 'Flake rate over threshold',
        },
      },
      commit_based: {
        watched_paths: ['.claude/agents/*', '.claude/skills/**', '.claude/hooks/*'],
        action: 'subset_eval',
        subset_size: 10,
        block_if: 'any Layer-1 metric below threshold',
      },
    },
  };
}
