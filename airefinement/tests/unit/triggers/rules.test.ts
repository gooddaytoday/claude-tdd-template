import {
  checkCommitBasedTriggers,
  checkEventDrivenTriggers,
  checkTrendBasedTriggers,
} from '@/triggers/rules.js';
import type {
  AggregatedMetrics,
  CommitBasedConfig,
  EventDrivenConfig,
  RunReport,
  SubagentTimingEvent,
  TrendBasedConfig,
  TraceEvent,
} from '@/telemetry/schemas.js';

function makeRun(overrides: Partial<RunReport> = {}, extra: Record<string, unknown> = {}): RunReport {
  const base: Record<string, unknown> = {
    run_id: 'run-1',
    timestamp: '2026-02-24T12:00:00.000Z',
    task_id: 'task-1',
    subtask_id: 'subtask-1',
    feature: 'feature',
    test_type: 'unit',
    phases: [
      {
        phase: 'RED',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: [],
        duration_estimate: null,
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
    ...extra,
    ...overrides,
  };

  return base as unknown as RunReport;
}

function makeTimingEvent(toolCalls: number): SubagentTimingEvent {
  return {
    timestamp: '2026-02-24T12:00:00.000Z',
    agent: 'tdd-implementer',
    phase: 'GREEN',
    started_at: '2026-02-24T12:00:00.000Z',
    finished_at: '2026-02-24T12:01:00.000Z',
    tool_calls_count: toolCalls,
  };
}

const eventConfig: EventDrivenConfig = {
  guard_violation: { threshold: 1, description: 'guard violations threshold' },
  gate_failure_streak: { threshold: 3, description: 'gate failure streak threshold' },
  token_anomaly: { sigma_threshold: 2, description: 'token anomaly threshold' },
  manual_intervention_streak: { threshold: 2, description: 'manual intervention streak threshold' },
};

const trendConfig: TrendBasedConfig = {
  tsr_drop: { threshold_percent: 5, window_runs: 20, description: 'tsr drop threshold' },
  token_inflation: { threshold_percent: 20, window_runs: 20, description: 'token inflation threshold' },
  flake_rate: { threshold_percent: 2, window_runs: 20, description: 'flake rate threshold' },
};

const commitConfig: CommitBasedConfig = {
  watched_paths: ['.claude/agents/*', '.claude/skills/**', '.claude/hooks/*'],
  action: 'subset_eval',
  subset_size: 10,
  block_if: 'any Layer-1 metric below threshold',
};

const guardViolation: RunReport['guard_violations'][number] = {
  timestamp: '2026-02-24T12:00:00.000Z',
  agent: 'tdd-implementer',
  attempted_action: 'edit tests',
  target_file: 'tests/unit/foo.test.ts',
  blocked: true,
  reason: 'TDD Guard blocked test edit',
};

const failedGreenPhase: RunReport['phases'][number] = {
  phase: 'GREEN',
  status: 'failed',
  retries: 1,
  gate_result: 'fail',
  gate_failure_reason: 'test failed',
  changed_files: ['src/a.ts'],
  duration_estimate: null,
};

const passedGreenPhase: RunReport['phases'][number] = {
  phase: 'GREEN',
  status: 'passed',
  retries: 0,
  gate_result: 'pass',
  gate_failure_reason: null,
  changed_files: [],
  duration_estimate: null,
};

describe('checkEventDrivenTriggers', () => {
  it('fires guard_violation trigger when violations reach threshold', () => {
    const runs = [makeRun({ guard_violations: [guardViolation] })];
    const results = checkEventDrivenTriggers(runs, [], eventConfig);

    expect(results.some((r) => r.rule === 'guard_violation')).toBe(true);
    const trigger = results.find((r) => r.rule === 'guard_violation')!;
    expect(trigger.severity).toBe('critical');
    expect(trigger.type).toBe('event_driven');
  });

  it('returns no guard_violation trigger when runs have no violations', () => {
    const runs = [makeRun(), makeRun({ run_id: 'run-2' })];
    const results = checkEventDrivenTriggers(runs, [], eventConfig);

    expect(results.some((r) => r.rule === 'guard_violation')).toBe(false);
  });

  it('detects gate failure streak in the same phase', () => {
    const runs = [
      makeRun({ run_id: 'run-1', phases: [failedGreenPhase] }),
      makeRun({ run_id: 'run-2', phases: [failedGreenPhase] }),
      makeRun({ run_id: 'run-3', phases: [failedGreenPhase] }),
    ];

    const results = checkEventDrivenTriggers(runs, [], eventConfig);
    expect(results.some((r) => r.rule === 'gate_failure_streak')).toBe(true);
  });

  it('ignores non-consecutive gate failures in the same phase', () => {
    const runs = [
      makeRun({ run_id: 'run-1', phases: [failedGreenPhase] }),
      makeRun({ run_id: 'run-2', phases: [passedGreenPhase] }),
      makeRun({ run_id: 'run-3', phases: [failedGreenPhase] }),
      makeRun({ run_id: 'run-4', phases: [passedGreenPhase] }),
      makeRun({ run_id: 'run-5', phases: [failedGreenPhase] }),
    ];

    const results = checkEventDrivenTriggers(runs, [], eventConfig);
    expect(results.some((r) => r.rule === 'gate_failure_streak')).toBe(false);
  });

  it('fires manual intervention streak for consecutive escalations', () => {
    const runs = [
      makeRun({ run_id: 'run-1', overall_status: 'ESCALATED' }),
      makeRun({ run_id: 'run-2', overall_status: 'ESCALATED' }),
    ];

    const results = checkEventDrivenTriggers(runs, [], eventConfig);
    expect(results.some((r) => r.rule === 'manual_intervention_streak')).toBe(true);
    const trigger = results.find((r) => r.rule === 'manual_intervention_streak')!;
    expect(trigger.severity).toBe('critical');
  });

  it('fires token anomaly when latest trace is above sigma threshold', () => {
    const traces: TraceEvent[] = [
      makeTimingEvent(10),
      makeTimingEvent(10),
      makeTimingEvent(10),
      makeTimingEvent(100),
    ];

    const results = checkEventDrivenTriggers([makeRun()], traces, eventConfig);
    expect(results.some((r) => r.rule === 'token_anomaly')).toBe(true);
  });

  it('does not fire token anomaly when usage is within normal range', () => {
    // historical = [100, 102, 98], mean = 100, stdDev ≈ 1.6
    // latest = 101 → z-score ≈ 0.6, well below sigma_threshold = 2
    const traces: TraceEvent[] = [
      makeTimingEvent(100),
      makeTimingEvent(102),
      makeTimingEvent(98),
      makeTimingEvent(101),
    ];

    const results = checkEventDrivenTriggers([makeRun()], traces, eventConfig);
    expect(results.some((r) => r.rule === 'token_anomaly')).toBe(false);
  });
});

describe('checkTrendBasedTriggers', () => {
  const baseline: AggregatedMetrics = {
    tsr: 0.8,
    pass_at_1: 0.7,
    pass_3: 0.5,
    code_quality_score: 0.9,
    total_tokens: 100,
    median_cycle_time: 20,
    gate_failure_rate: 0.2,
    guard_violations: 0,
  };

  it('fires tsr_drop when TSR drops more than threshold', () => {
    const runs = [
      makeRun({ overall_status: 'FAILED' }),
      makeRun({ run_id: 'run-2', overall_status: 'FAILED' }),
      makeRun({ run_id: 'run-3', overall_status: 'DONE' }),
    ];

    const results = checkTrendBasedTriggers(runs, baseline, trendConfig);
    expect(results.some((r) => r.rule === 'tsr_drop')).toBe(true);
  });

  it('does not fire tsr_drop when TSR is stable or improving', () => {
    const runs = [
      makeRun({ overall_status: 'DONE' }),
      makeRun({ run_id: 'run-2', overall_status: 'DONE' }),
      makeRun({ run_id: 'run-3', overall_status: 'DONE' }),
    ];

    const results = checkTrendBasedTriggers(runs, baseline, trendConfig);
    expect(results.some((r) => r.rule === 'tsr_drop')).toBe(false);
  });

  it('fires token_inflation when average run tokens are inflated', () => {
    const runs = [
      makeRun({ run_id: 'run-1', total_tokens: 160 }),
      makeRun({ run_id: 'run-2', total_tokens: 140 }),
    ];

    const results = checkTrendBasedTriggers(runs, baseline, trendConfig);
    expect(results.some((r) => r.rule === 'token_inflation')).toBe(true);
  });

  it('does not fire token_inflation when tokens are within normal range', () => {
    const runs = [
      makeRun({ run_id: 'run-1', total_tokens: 100 }),
      makeRun({ run_id: 'run-2', total_tokens: 105 }),
    ];

    const results = checkTrendBasedTriggers(runs, baseline, trendConfig);
    expect(results.some((r) => r.rule === 'token_inflation')).toBe(false);
  });

  it('fires flake_rate when flaky outcomes exceed threshold', () => {
    const runs = [
      makeRun({ partial_credit_score: 0.5 }),
      makeRun({ run_id: 'run-2', partial_credit_score: 0.95 }),
      makeRun({ run_id: 'run-3', partial_credit_score: 0.99 }),
    ];

    const results = checkTrendBasedTriggers(runs, baseline, trendConfig);
    expect(results.some((r) => r.rule === 'flake_rate')).toBe(true);
  });

  it('respects window_runs and only considers first N runs', () => {
    const smallWindowConfig: TrendBasedConfig = {
      ...trendConfig,
      tsr_drop: { ...trendConfig.tsr_drop, window_runs: 2 },
    };

    // First 2 runs (within window): TSR = 100% — well above baseline 0.8, no drop
    // Remaining runs (outside window): all FAILED — bad TSR, but excluded
    const runs = [
      makeRun({ run_id: 'run-1', overall_status: 'DONE' }),
      makeRun({ run_id: 'run-2', overall_status: 'DONE' }),
      makeRun({ run_id: 'run-3', overall_status: 'FAILED' }),
      makeRun({ run_id: 'run-4', overall_status: 'FAILED' }),
      makeRun({ run_id: 'run-5', overall_status: 'FAILED' }),
    ];

    const results = checkTrendBasedTriggers(runs, baseline, smallWindowConfig);
    expect(results.some((r) => r.rule === 'tsr_drop')).toBe(false);
  });
});

describe('checkCommitBasedTriggers', () => {
  it('returns commit trigger when watched files are changed', () => {
    const changedFiles = ['.claude/hooks/prevent-test-edit.ts'];
    const results = checkCommitBasedTriggers(changedFiles, commitConfig);

    expect(results).toHaveLength(1);
    expect(results[0].rule).toBe('watched_paths_change');
    expect(results[0].type).toBe('commit_based');
  });

  it('includes subset_eval action in trigger evidence', () => {
    const changedFiles = ['.claude/agents/tdd-test-writer.md'];
    const results = checkCommitBasedTriggers(changedFiles, commitConfig);

    expect(results).toHaveLength(1);
    expect(results[0].evidence.action).toBe('subset_eval');
    expect(results[0].evidence.subset_size).toBe(10);
    expect(results[0].evidence.matched_files).toEqual(changedFiles);
  });

  it('returns empty when no watched paths changed', () => {
    const changedFiles = ['src/app.ts'];
    const results = checkCommitBasedTriggers(changedFiles, commitConfig);
    expect(results).toHaveLength(0);
  });
});
