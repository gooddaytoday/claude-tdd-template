import { jest, describe, it, expect, beforeAll, beforeEach } from '@jest/globals';
import type {
  AnalysisResult,
  RunReport,
  TraceEvent,
  TriggerResult,
  TriggersConfig,
  AggregatedMetrics,
  SubagentTimingEvent,
} from '@/telemetry/schemas.js';

const mockReadRunReports = jest.fn<(dir: string) => RunReport[]>();
const mockReadTraceEvents = jest.fn<(dir: string) => TraceEvent[]>();
const mockGetLatestBaseline = jest.fn<(dir: string) => AggregatedMetrics | null>();

const mockCheckEventDrivenTriggers = jest.fn<() => TriggerResult[]>();
const mockCheckTrendBasedTriggers = jest.fn<() => TriggerResult[]>();
const mockCheckCommitBasedTriggers = jest.fn<() => TriggerResult[]>();

jest.unstable_mockModule('@/telemetry/collector.js', () => ({
  readRunReports: mockReadRunReports,
  readTraceEvents: mockReadTraceEvents,
  getLatestBaseline: mockGetLatestBaseline,
}));

jest.unstable_mockModule('@/triggers/rules.js', () => ({
  checkEventDrivenTriggers: mockCheckEventDrivenTriggers,
  checkTrendBasedTriggers: mockCheckTrendBasedTriggers,
  checkCommitBasedTriggers: mockCheckCommitBasedTriggers,
}));

let analyze: (dir: string, config: TriggersConfig, changedFiles?: string[]) => AnalysisResult;

beforeAll(async () => {
  const mod = await import('@/triggers/analyzer.js');
  analyze = mod.analyze;
});

const triggersConfig: TriggersConfig = {
  auto_refinement_triggers: {
    event_driven: {
      guard_violation: { threshold: 1, description: 'guard violations threshold' },
      gate_failure_streak: { threshold: 3, description: 'gate failure streak threshold' },
      token_anomaly: { sigma_threshold: 2, description: 'token anomaly threshold' },
      manual_intervention_streak: { threshold: 2, description: 'manual intervention streak threshold' },
    },
    trend_based: {
      tsr_drop: { threshold_percent: 5, window_runs: 20, description: 'tsr drop threshold' },
      token_inflation: { threshold_percent: 20, window_runs: 20, description: 'token inflation threshold' },
      flake_rate: { threshold_percent: 2, window_runs: 20, description: 'flake rate threshold' },
    },
    commit_based: {
      watched_paths: ['.claude/agents/*'],
      action: 'subset_eval',
      subset_size: 10,
      block_if: 'any Layer-1 metric below threshold',
    },
  },
};

function makeRun(overrides: Partial<RunReport> = {}): RunReport {
  return {
    run_id: 'run-1',
    timestamp: '2026-02-24T12:00:00.000Z',
    task_id: 'task-1',
    subtask_id: 'subtask-1',
    feature: 'feature',
    test_type: 'unit',
    phases: [],
    fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
    guard_violations: [],
    overall_status: 'DONE',
    partial_credit_score: 1,
    ...overrides,
  } as RunReport;
}

function makeTrace(): TraceEvent {
  return {
    timestamp: '2026-02-24T12:00:00.000Z',
    agent: 'tdd-implementer',
    phase: 'GREEN',
    started_at: '2026-02-24T12:00:00.000Z',
    finished_at: '2026-02-24T12:01:00.000Z',
    tool_calls_count: 10,
  } satisfies SubagentTimingEvent;
}

function makeTrigger(overrides: Partial<TriggerResult> = {}): TriggerResult {
  return {
    type: 'event_driven',
    rule: 'guard_violation',
    severity: 'critical',
    description: 'Guard violation detected',
    evidence: {},
    ...overrides,
  };
}

const ARTIFACTS_DIR = '/fake/artifacts';

beforeEach(() => {
  jest.clearAllMocks();
  mockReadRunReports.mockReturnValue([]);
  mockReadTraceEvents.mockReturnValue([]);
  mockGetLatestBaseline.mockReturnValue(null);
  mockCheckEventDrivenTriggers.mockReturnValue([]);
  mockCheckTrendBasedTriggers.mockReturnValue([]);
  mockCheckCommitBasedTriggers.mockReturnValue([]);
});

describe('analyze', () => {
  describe('recommendation decision logic', () => {
    it('returns "refine" when any trigger has critical severity', () => {
      const criticalTrigger = makeTrigger({ severity: 'critical' });
      mockCheckEventDrivenTriggers.mockReturnValue([criticalTrigger]);

      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.recommendation).toBe('refine');
    });

    it('returns "eval_only" when triggers exist but none are critical', () => {
      const warningTrigger = makeTrigger({ severity: 'warning', rule: 'tsr_drop', type: 'trend_based' });
      mockCheckTrendBasedTriggers.mockReturnValue([warningTrigger]);

      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.recommendation).toBe('eval_only');
    });

    it('returns "no_action" when no triggers fire', () => {
      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.recommendation).toBe('no_action');
    });

    it('returns "refine" when mix of critical and warning triggers (critical takes priority)', () => {
      const criticalTrigger = makeTrigger({ severity: 'critical', rule: 'guard_violation' });
      const warningTrigger = makeTrigger({ severity: 'warning', rule: 'tsr_drop', type: 'trend_based' });
      mockCheckEventDrivenTriggers.mockReturnValue([criticalTrigger]);
      mockCheckTrendBasedTriggers.mockReturnValue([warningTrigger]);

      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.recommendation).toBe('refine');
    });
  });

  describe('counting', () => {
    it('sets runs_analyzed to the number of RunReports from collector', () => {
      const runs = [makeRun({ run_id: 'r1' }), makeRun({ run_id: 'r2' }), makeRun({ run_id: 'r3' })];
      mockReadRunReports.mockReturnValue(runs);

      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.runs_analyzed).toBe(3);
    });

    it('sets traces_analyzed to the number of TraceEvents from collector', () => {
      const traces = [makeTrace(), makeTrace()];
      mockReadTraceEvents.mockReturnValue(traces);

      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.traces_analyzed).toBe(2);
    });
  });

  describe('edge cases', () => {
    it('handles empty artifacts: no_action, 0 runs, 0 traces', () => {
      mockReadRunReports.mockReturnValue([]);
      mockReadTraceEvents.mockReturnValue([]);
      mockGetLatestBaseline.mockReturnValue(null);

      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.recommendation).toBe('no_action');
      expect(result.runs_analyzed).toBe(0);
      expect(result.traces_analyzed).toBe(0);
      expect(result.triggers_fired).toEqual([]);
    });

    it('skips trend-based triggers when baseline is null', () => {
      mockReadRunReports.mockReturnValue([makeRun()]);
      mockGetLatestBaseline.mockReturnValue(null);

      analyze(ARTIFACTS_DIR, triggersConfig);

      expect(mockCheckTrendBasedTriggers).not.toHaveBeenCalled();
    });

    it('calls trend-based triggers when baseline exists', () => {
      const baseline: AggregatedMetrics = {
        tsr: 0.8, pass_at_1: 0.7, pass_3: 0.5,
        code_quality_score: 0.9, total_tokens: 100,
        median_cycle_time: 20, gate_failure_rate: 0.2, guard_violations: 0,
      };
      mockReadRunReports.mockReturnValue([makeRun()]);
      mockGetLatestBaseline.mockReturnValue(baseline);

      analyze(ARTIFACTS_DIR, triggersConfig);

      expect(mockCheckTrendBasedTriggers).toHaveBeenCalledWith(
        [makeRun()],
        baseline,
        triggersConfig.auto_refinement_triggers.trend_based,
      );
    });
  });

  describe('result structure', () => {
    it('has a valid ISO timestamp', () => {
      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(result.timestamp).toBeDefined();
      expect(() => new Date(result.timestamp).toISOString()).not.toThrow();
    });

    it('has a summary string', () => {
      const result = analyze(ARTIFACTS_DIR, triggersConfig);

      expect(typeof result.summary).toBe('string');
      expect(result.summary.length).toBeGreaterThan(0);
    });

    it('aggregates triggers_fired from all three categories', () => {
      const eventTrigger = makeTrigger({ type: 'event_driven', rule: 'guard_violation' });
      const trendTrigger = makeTrigger({ type: 'trend_based', rule: 'tsr_drop', severity: 'warning' });
      const commitTrigger = makeTrigger({ type: 'commit_based', rule: 'watched_paths_change', severity: 'warning' });

      mockCheckEventDrivenTriggers.mockReturnValue([eventTrigger]);
      mockCheckTrendBasedTriggers.mockReturnValue([trendTrigger]);
      mockCheckCommitBasedTriggers.mockReturnValue([commitTrigger]);

      const baseline: AggregatedMetrics = {
        tsr: 0.8, pass_at_1: 0.7, pass_3: 0.5,
        code_quality_score: 0.9, total_tokens: 100,
        median_cycle_time: 20, gate_failure_rate: 0.2, guard_violations: 0,
      };
      mockGetLatestBaseline.mockReturnValue(baseline);

      const result = analyze(ARTIFACTS_DIR, triggersConfig, ['.claude/agents/foo.md']);

      expect(result.triggers_fired).toHaveLength(3);
      expect(result.triggers_fired).toContainEqual(eventTrigger);
      expect(result.triggers_fired).toContainEqual(trendTrigger);
      expect(result.triggers_fired).toContainEqual(commitTrigger);
    });
  });

  describe('dependency calls', () => {
    it('passes changedFiles to checkCommitBasedTriggers', () => {
      const changedFiles = ['src/foo.ts', '.claude/agents/bar.md'];

      analyze(ARTIFACTS_DIR, triggersConfig, changedFiles);

      expect(mockCheckCommitBasedTriggers).toHaveBeenCalledWith(
        changedFiles,
        triggersConfig.auto_refinement_triggers.commit_based,
      );
    });

    it('defaults changedFiles to empty array', () => {
      analyze(ARTIFACTS_DIR, triggersConfig);

      expect(mockCheckCommitBasedTriggers).toHaveBeenCalledWith(
        [],
        triggersConfig.auto_refinement_triggers.commit_based,
      );
    });

    it('passes runs and traces to checkEventDrivenTriggers', () => {
      const runs = [makeRun()];
      const traces = [makeTrace()];
      mockReadRunReports.mockReturnValue(runs);
      mockReadTraceEvents.mockReturnValue(traces);

      analyze(ARTIFACTS_DIR, triggersConfig);

      expect(mockCheckEventDrivenTriggers).toHaveBeenCalledWith(
        runs,
        traces,
        triggersConfig.auto_refinement_triggers.event_driven,
      );
    });
  });
});
