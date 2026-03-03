import { describe, it, expect } from '@jest/globals';
import type { ExperimentResult, AggregatedMetrics, TaskComparison } from '@/telemetry/schemas.js';
import type { ComparisonReport } from '@/eval/comparator.js';
import { buildComparisonReport } from '@/eval/comparator.js';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const BASE_CONTROL_METRICS: AggregatedMetrics = {
  tsr: 0.8,
  pass_at_1: 0.75,
  pass_3: 0.85,
  code_quality_score: 0.7,
  total_tokens: 1000,
  median_cycle_time: 30000,
  gate_failure_rate: 0.1,
  guard_violations: 2,
};

const BASE_VARIANT_METRICS: AggregatedMetrics = {
  tsr: 0.85,
  pass_at_1: 0.80,
  pass_3: 0.90,
  code_quality_score: 0.75,
  total_tokens: 950,
  median_cycle_time: 28000,
  gate_failure_rate: 0.08,
  guard_violations: 1,
};

const BASE_CONTROL_CONFIG = {
  agent_prompts_hash: 'a',
  skill_hash: 'b',
  hooks_hash: 'c',
  settings_hash: 'd',
  dataset_version: 'v1',
};

function makeTaskComparison(overrides: Partial<TaskComparison> = {}): TaskComparison {
  return {
    task_id: 'task-1',
    control_outcome: 'pass',
    variant_outcome: 'pass',
    control_score: 0.8,
    variant_score: 0.9,
    delta: 0.1,
    regression: false,
    ...overrides,
  };
}

function makeExperimentResult(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    experiment_id: 'exp-test-123',
    timestamp: '2026-02-26T00:00:00.000Z',
    hypothesis: 'test hypothesis',
    variant_description: 'test variant',
    dataset_version: 'v1',
    control_config: BASE_CONTROL_CONFIG,
    variant_config: BASE_CONTROL_CONFIG,
    control_results: BASE_CONTROL_METRICS,
    variant_results: BASE_VARIANT_METRICS,
    per_task_comparison: [],
    decision: 'accept',
    decision_rationale: 'All metrics improved',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('buildComparisonReport()', () => {
  describe('basic structure', () => {
    it('returns experiment_id from input', () => {
      const result = makeExperimentResult({ experiment_id: 'my-exp-456' });
      const report = buildComparisonReport(result);
      expect(report.experiment_id).toBe('my-exp-456');
    });

    it('passes control_metrics through unchanged', () => {
      const result = makeExperimentResult();
      const report = buildComparisonReport(result);
      expect(report.control_metrics).toEqual(BASE_CONTROL_METRICS);
    });

    it('passes variant_metrics through unchanged', () => {
      const result = makeExperimentResult();
      const report = buildComparisonReport(result);
      expect(report.variant_metrics).toEqual(BASE_VARIANT_METRICS);
    });
  });

  describe('deltas computation', () => {
    it('all deltas are 0 when control and variant metrics are identical', () => {
      const result = makeExperimentResult({
        variant_results: { ...BASE_CONTROL_METRICS },
      });
      const report = buildComparisonReport(result);

      for (const value of Object.values(report.deltas)) {
        expect(value).toBeCloseTo(0);
      }
    });

    it('deltas contain all 8 AggregatedMetrics keys', () => {
      const result = makeExperimentResult();
      const report = buildComparisonReport(result);
      const expectedKeys = [
        'tsr',
        'pass_at_1',
        'pass_3',
        'code_quality_score',
        'total_tokens',
        'median_cycle_time',
        'gate_failure_rate',
        'guard_violations',
      ];
      expect(Object.keys(report.deltas).sort()).toEqual(expectedKeys.sort());
    });

    it('computes correct delta: variant - control for each metric', () => {
      const result = makeExperimentResult();
      const report = buildComparisonReport(result);

      expect(report.deltas.tsr).toBeCloseTo(0.85 - 0.8);
      expect(report.deltas.pass_at_1).toBeCloseTo(0.80 - 0.75);
      expect(report.deltas.total_tokens).toBeCloseTo(950 - 1000);
      expect(report.deltas.guard_violations).toBeCloseTo(1 - 2);
    });
  });

  describe('task classification', () => {
    it('improvements non-empty and regressions empty when variant is strictly better', () => {
      const task = makeTaskComparison({ delta: 0.2, regression: false });
      const result = makeExperimentResult({ per_task_comparison: [task] });
      const report = buildComparisonReport(result);

      expect(report.improvements).toHaveLength(1);
      expect(report.regressions).toHaveLength(0);
    });

    it('regressions non-empty and improvements empty when variant is worse', () => {
      const task = makeTaskComparison({ delta: -0.3, regression: true });
      const result = makeExperimentResult({ per_task_comparison: [task] });
      const report = buildComparisonReport(result);

      expect(report.regressions).toHaveLength(1);
      expect(report.improvements).toHaveLength(0);
    });

    it('mixed scenario: some regressions, some improvements, some unchanged', () => {
      const regression = makeTaskComparison({ task_id: 'reg', delta: -0.1, regression: true });
      const improvement = makeTaskComparison({ task_id: 'imp', delta: 0.15, regression: false });
      const unchanged = makeTaskComparison({ task_id: 'unch', delta: 0.0, regression: false });

      const result = makeExperimentResult({
        per_task_comparison: [regression, improvement, unchanged],
      });
      const report = buildComparisonReport(result);

      expect(report.regressions).toHaveLength(1);
      expect(report.improvements).toHaveLength(1);
      expect(report.unchanged).toHaveLength(1);
      expect(report.regressions[0].task_id).toBe('reg');
      expect(report.improvements[0].task_id).toBe('imp');
      expect(report.unchanged[0].task_id).toBe('unch');
    });

    it('unchanged contains tasks with delta <= 0 AND regression === false', () => {
      const negDelta = makeTaskComparison({ task_id: 'neg', delta: -0.05, regression: false });
      const zeroDelta = makeTaskComparison({ task_id: 'zero', delta: 0, regression: false });

      const result = makeExperimentResult({
        per_task_comparison: [negDelta, zeroDelta],
      });
      const report = buildComparisonReport(result);

      expect(report.unchanged).toHaveLength(2);
      expect(report.improvements).toHaveLength(0);
      expect(report.regressions).toHaveLength(0);
    });

    it('empty per_task_comparison: all three arrays are empty', () => {
      const result = makeExperimentResult({ per_task_comparison: [] });
      const report = buildComparisonReport(result);

      expect(report.regressions).toHaveLength(0);
      expect(report.improvements).toHaveLength(0);
      expect(report.unchanged).toHaveLength(0);
    });

    it('single task regression: regressions has one item', () => {
      const task = makeTaskComparison({ task_id: 'solo-reg', delta: -0.5, regression: true });
      const result = makeExperimentResult({ per_task_comparison: [task] });
      const report = buildComparisonReport(result);

      expect(report.regressions).toHaveLength(1);
      expect(report.regressions[0].task_id).toBe('solo-reg');
    });

    it('single task improvement: improvements has one item', () => {
      const task = makeTaskComparison({ task_id: 'solo-imp', delta: 0.4, regression: false });
      const result = makeExperimentResult({ per_task_comparison: [task] });
      const report = buildComparisonReport(result);

      expect(report.improvements).toHaveLength(1);
      expect(report.improvements[0].task_id).toBe('solo-imp');
    });
  });

  describe('net_assessment', () => {
    it('net_assessment contains "ACCEPT" when decision === "accept"', () => {
      const result = makeExperimentResult({ decision: 'accept', decision_rationale: 'looks good' });
      const report = buildComparisonReport(result);

      expect(report.net_assessment).toMatch(/ACCEPT/);
    });

    it('net_assessment contains "REJECT" when decision === "reject"', () => {
      const result = makeExperimentResult({
        decision: 'reject',
        decision_rationale: 'tsr degraded',
      });
      const report = buildComparisonReport(result);

      expect(report.net_assessment).toMatch(/REJECT/);
    });

    it('net_assessment contains "ACCEPT_WITH_CAVEAT" when decision === "accept_with_caveat"', () => {
      const result = makeExperimentResult({
        decision: 'accept_with_caveat',
        decision_rationale: 'minor risk',
      });
      const report = buildComparisonReport(result);

      expect(report.net_assessment).toMatch(/ACCEPT_WITH_CAVEAT/);
    });

    it('net_assessment includes decision_rationale content', () => {
      const result = makeExperimentResult({
        decision: 'accept',
        decision_rationale: 'all metrics improved significantly',
      });
      const report = buildComparisonReport(result);

      expect(report.net_assessment).toMatch(/all metrics improved significantly/i);
    });
  });
});
