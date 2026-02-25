import { compareToThresholds, ThresholdViolation } from '@/metrics/thresholds.js';
import type { AggregatedMetrics, ThresholdsConfig } from '@/telemetry/schemas.js';

describe('compareToThresholds', () => {
  const defaultMetrics: AggregatedMetrics = {
    tsr: 0.95,
    pass_at_1: 0.8,
    pass_3: 0.9,
    code_quality_score: 95,
    total_tokens: 15000,
    median_cycle_time: 45,
    gate_failure_rate: 0.05,
    guard_violations: 0,
  };

  const defaultThresholds: ThresholdsConfig = {
    pipeline_kpis: {
      tsr_target: 0.9,
      pass_at_1_target: 0.7,
      pass_3_target: 0.85,
      code_quality_score_target: 90,
      defect_escape_rate_max: 0.05,
      gate_failure_rate_max_per_phase: 0.1,
      guard_violations_max: 0,
      flake_rate_max: 0.01,
    },
    phase_gates: {
      RED: { must_fail_with_assertion: true },
      GREEN: { must_pass: true, max_retries: 3 },
      REFACTOR: { must_stay_green: true },
      CODE_REVIEW: { max_fix_cycles: 2 },
      ARCH_REVIEW: { max_fix_cycles: 2 },
      DOCS: { must_update_task_master: true },
    },
    role_metrics: {},
  };

  it('should return empty array when all metrics meet thresholds', () => {
    const result = compareToThresholds(defaultMetrics, defaultThresholds);
    expect(result).toEqual([]);
  });

  it('should return violation when tsr is below target (min_not_met)', () => {
    const metrics = { ...defaultMetrics, tsr: 0.8 };
    const result = compareToThresholds(metrics, defaultThresholds);
    expect(result).toContainEqual({
      metric: 'tsr',
      actual: 0.8,
      expected: 0.9,
      violation_type: 'min_not_met',
    });
  });

  it('should return violation when guard_violations exceeds max (max_exceeded)', () => {
    const metrics = { ...defaultMetrics, guard_violations: 2 };
    const result = compareToThresholds(metrics, defaultThresholds);
    expect(result).toContainEqual({
      metric: 'guard_violations',
      actual: 2,
      expected: 0,
      violation_type: 'max_exceeded',
    });
  });

  it('should return multiple violations if several thresholds are not met', () => {
    const metrics = {
      ...defaultMetrics,
      tsr: 0.7, // Below 0.9
      gate_failure_rate: 0.2, // Above 0.1
    };
    const result = compareToThresholds(metrics, defaultThresholds);
    expect(result).toHaveLength(2);
    expect(result).toEqual(expect.arrayContaining([
      { metric: 'tsr', actual: 0.7, expected: 0.9, violation_type: 'min_not_met' },
      { metric: 'gate_failure_rate', actual: 0.2, expected: 0.1, violation_type: 'max_exceeded' },
    ]));
  });
});
