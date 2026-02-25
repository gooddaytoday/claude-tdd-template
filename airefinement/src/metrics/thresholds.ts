import type { AggregatedMetrics, ThresholdsConfig } from '@/telemetry/schemas.js';

export interface ThresholdViolation {
  metric: string;
  actual: number;
  expected: number;
  violation_type: 'max_exceeded' | 'min_not_met';
}

export function compareToThresholds(metrics: AggregatedMetrics, thresholds: ThresholdsConfig): ThresholdViolation[] {
  const violations: ThresholdViolation[] = [];
  const kpis = thresholds.pipeline_kpis;

  if (metrics.tsr < kpis.tsr_target) {
    violations.push({ metric: 'tsr', actual: metrics.tsr, expected: kpis.tsr_target, violation_type: 'min_not_met' });
  }
  if (metrics.pass_at_1 < kpis.pass_at_1_target) {
    violations.push({ metric: 'pass_at_1', actual: metrics.pass_at_1, expected: kpis.pass_at_1_target, violation_type: 'min_not_met' });
  }
  if (metrics.pass_3 < kpis.pass_3_target) {
    violations.push({ metric: 'pass_3', actual: metrics.pass_3, expected: kpis.pass_3_target, violation_type: 'min_not_met' });
  }
  if (metrics.code_quality_score < kpis.code_quality_score_target) {
    violations.push({ metric: 'code_quality_score', actual: metrics.code_quality_score, expected: kpis.code_quality_score_target, violation_type: 'min_not_met' });
  }
  if (metrics.gate_failure_rate > kpis.gate_failure_rate_max_per_phase) {
    violations.push({ metric: 'gate_failure_rate', actual: metrics.gate_failure_rate, expected: kpis.gate_failure_rate_max_per_phase, violation_type: 'max_exceeded' });
  }
  if (metrics.guard_violations > kpis.guard_violations_max) {
    violations.push({ metric: 'guard_violations', actual: metrics.guard_violations, expected: kpis.guard_violations_max, violation_type: 'max_exceeded' });
  }

  return violations;
}
