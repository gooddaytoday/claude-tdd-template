import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readRunReports, readTraceEvents, getLatestBaseline } from '@/telemetry/collector.js';
import type {
  RunReport,
  ExperimentResult,
  AggregatedMetrics,
  GuardViolationEvent,
  SubagentTimingEvent,
} from '@/telemetry/schemas.js';

function makeRunReport(overrides: Partial<RunReport> = {}): RunReport {
  return {
    run_id: 'run-1',
    timestamp: '2026-02-20T10:00:00.000Z',
    task_id: 'task-1',
    subtask_id: 'subtask-1',
    feature: 'some-feature',
    test_type: 'unit',
    phases: [
      {
        phase: 'RED',
        status: 'passed',
        retries: 0,
        gate_result: 'pass',
        gate_failure_reason: null,
        changed_files: ['tests/unit/foo.test.ts'],
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
    ...overrides,
  };
}

function makeVersionManifest() {
  return {
    agent_prompts_hash: 'abc123',
    skill_hash: 'def456',
    hooks_hash: 'ghi789',
    settings_hash: 'jkl012',
    dataset_version: '1.0.0',
  };
}

function makeAggregatedMetrics(overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics {
  return {
    tsr: 0.85,
    pass_at_1: 0.75,
    pass_3: 0.6,
    code_quality_score: 0.9,
    total_tokens: 5000,
    median_cycle_time: 30,
    gate_failure_rate: 0.1,
    guard_violations: 0,
    ...overrides,
  };
}

function makeExperimentResult(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    experiment_id: 'exp-1',
    timestamp: '2026-02-20T10:00:00.000Z',
    hypothesis: 'Improving prompt quality increases TSR',
    variant_description: 'Enhanced prompts',
    dataset_version: '1.0.0',
    control_config: makeVersionManifest(),
    variant_config: makeVersionManifest(),
    control_results: makeAggregatedMetrics(),
    variant_results: makeAggregatedMetrics({ tsr: 0.9 }),
    per_task_comparison: [
      {
        task_id: 'task-1',
        control_outcome: 'pass',
        variant_outcome: 'pass',
        control_score: 1,
        variant_score: 1,
        delta: 0,
        regression: false,
      },
    ],
    decision: 'accept',
    decision_rationale: 'Variant shows improvement across all metrics',
    ...overrides,
  };
}

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'collector-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('readRunReports', () => {
  it('reads valid JSON files and returns RunReport[] sorted by timestamp DESC', () => {
    const older = makeRunReport({
      run_id: 'run-old',
      timestamp: '2026-02-18T08:00:00.000Z',
    });
    const newer = makeRunReport({
      run_id: 'run-new',
      timestamp: '2026-02-22T14:00:00.000Z',
    });

    writeFileSync(join(tempDir, 'older.json'), JSON.stringify(older));
    writeFileSync(join(tempDir, 'newer.json'), JSON.stringify(newer));

    const result = readRunReports(tempDir);

    expect(result).toHaveLength(2);
    expect(result[0].run_id).toBe('run-new');
    expect(result[1].run_id).toBe('run-old');
  });

  it('returns empty array for empty directory', () => {
    const result = readRunReports(tempDir);
    expect(result).toEqual([]);
  });

  it('sorts three reports by timestamp DESC (newest first)', () => {
    const reports = [
      makeRunReport({ run_id: 'mid', timestamp: '2026-02-20T12:00:00.000Z' }),
      makeRunReport({ run_id: 'oldest', timestamp: '2026-02-19T06:00:00.000Z' }),
      makeRunReport({ run_id: 'newest', timestamp: '2026-02-21T18:00:00.000Z' }),
    ];

    reports.forEach((r, i) => {
      writeFileSync(join(tempDir, `report-${i}.json`), JSON.stringify(r));
    });

    const result = readRunReports(tempDir);

    expect(result).toHaveLength(3);
    expect(result.map((r) => r.run_id)).toEqual(['newest', 'mid', 'oldest']);
  });
});

describe('readTraceEvents', () => {
  it('reads JSONL files and returns parsed TraceEvent[]', () => {
    const guardEvent: GuardViolationEvent = {
      timestamp: '2026-02-20T10:00:00.000Z',
      agent: 'tdd-implementer',
      attempted_action: 'edit test file',
      target_file: 'tests/unit/foo.test.ts',
      blocked: true,
      reason: 'Guard blocked test modification',
    };

    const timingEvent: SubagentTimingEvent = {
      timestamp: '2026-02-20T10:01:00.000Z',
      agent: 'tdd-implementer',
      phase: 'GREEN',
      started_at: '2026-02-20T10:00:00.000Z',
      finished_at: '2026-02-20T10:01:00.000Z',
      tool_calls_count: 15,
    };

    const lines = [JSON.stringify(guardEvent), JSON.stringify(timingEvent)].join('\n');
    writeFileSync(join(tempDir, 'trace-001.jsonl'), lines);

    const result = readTraceEvents(tempDir);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ agent: 'tdd-implementer', blocked: true });
    expect(result[1]).toMatchObject({ phase: 'GREEN', tool_calls_count: 15 });
  });

  it('reads multiple JSONL files and combines all events', () => {
    const event1: GuardViolationEvent = {
      timestamp: '2026-02-20T10:00:00.000Z',
      agent: 'tdd-implementer',
      attempted_action: 'write test',
      target_file: 'tests/unit/bar.test.ts',
      blocked: true,
      reason: 'Blocked',
    };

    const event2: SubagentTimingEvent = {
      timestamp: '2026-02-20T11:00:00.000Z',
      agent: 'tdd-refactorer',
      phase: 'REFACTOR',
      started_at: '2026-02-20T11:00:00.000Z',
      finished_at: '2026-02-20T11:05:00.000Z',
      tool_calls_count: 8,
    };

    writeFileSync(join(tempDir, 'trace-a.jsonl'), JSON.stringify(event1));
    writeFileSync(join(tempDir, 'trace-b.jsonl'), JSON.stringify(event2));

    const result = readTraceEvents(tempDir);

    expect(result).toHaveLength(2);
  });

  it('returns empty array for empty directory', () => {
    const result = readTraceEvents(tempDir);
    expect(result).toEqual([]);
  });
});

describe('getLatestBaseline', () => {
  it('returns control_results from the most recent ExperimentResult', () => {
    const controlMetrics = makeAggregatedMetrics({ tsr: 0.88, pass_at_1: 0.77 });
    const older = makeExperimentResult({
      experiment_id: 'exp-old',
      timestamp: '2026-02-18T08:00:00.000Z',
      control_results: makeAggregatedMetrics({ tsr: 0.70 }),
    });
    const newer = makeExperimentResult({
      experiment_id: 'exp-new',
      timestamp: '2026-02-22T14:00:00.000Z',
      control_results: controlMetrics,
    });

    writeFileSync(join(tempDir, 'exp-old.json'), JSON.stringify(older));
    writeFileSync(join(tempDir, 'exp-new.json'), JSON.stringify(newer));

    const result = getLatestBaseline(tempDir);

    expect(result).not.toBeNull();
    expect(result!.tsr).toBe(0.88);
    expect(result!.pass_at_1).toBe(0.77);
  });

  it('returns null for empty directory', () => {
    const result = getLatestBaseline(tempDir);
    expect(result).toBeNull();
  });

  it('returns the full AggregatedMetrics object from control_results', () => {
    const metrics = makeAggregatedMetrics({
      tsr: 0.92,
      pass_at_1: 0.85,
      pass_3: 0.70,
      code_quality_score: 0.95,
      total_tokens: 3000,
      median_cycle_time: 25,
      gate_failure_rate: 0.05,
      guard_violations: 1,
    });

    const experiment = makeExperimentResult({
      control_results: metrics,
    });

    writeFileSync(join(tempDir, 'single.json'), JSON.stringify(experiment));

    const result = getLatestBaseline(tempDir);

    expect(result).toEqual(metrics);
  });
});
