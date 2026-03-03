import type { ExperimentResult, AggregatedMetrics, TaskComparison } from '@/telemetry/schemas.js';

export interface ComparisonReport {
  experiment_id: string;
  control_metrics: AggregatedMetrics;
  variant_metrics: AggregatedMetrics;
  deltas: Record<string, number>;
  regressions: TaskComparison[];
  improvements: TaskComparison[];
  unchanged: TaskComparison[];
  net_assessment: string;
}

export function buildComparisonReport(result: ExperimentResult): ComparisonReport {
  const metricKeys: (keyof AggregatedMetrics)[] = [
    'tsr', 'pass_at_1', 'pass_3', 'code_quality_score',
    'total_tokens', 'median_cycle_time', 'gate_failure_rate', 'guard_violations',
  ];

  const deltas: Record<string, number> = {};
  for (const key of metricKeys) {
    deltas[key] = result.variant_results[key] - result.control_results[key];
  }

  const regressions = result.per_task_comparison.filter(t => t.regression);
  const improvements = result.per_task_comparison.filter(t => !t.regression && t.delta > 0);
  const unchanged = result.per_task_comparison.filter(t => !t.regression && t.delta <= 0);

  const net_assessment = `${result.decision.toUpperCase()}: ${result.decision_rationale}`;

  return {
    experiment_id: result.experiment_id,
    control_metrics: result.control_results,
    variant_metrics: result.variant_results,
    deltas,
    regressions,
    improvements,
    unchanged,
    net_assessment,
  };
}
