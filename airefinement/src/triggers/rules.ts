import picomatch from 'picomatch';
import type {
  AggregatedMetrics,
  CommitBasedConfig,
  EventDrivenConfig,
  RunReport,
  SubagentTimingEvent,
  TrendBasedConfig,
  TraceEvent,
  TriggerResult,
} from '@/telemetry/schemas.js';

function isTimingEvent(event: TraceEvent): event is SubagentTimingEvent {
  return 'tool_calls_count' in event;
}

function extractRunTotalTokens(run: RunReport): number | null {
  return run.total_tokens !== undefined && Number.isFinite(run.total_tokens)
    ? run.total_tokens
    : null;
}

function standardDeviation(values: number[], mean: number): number {
  if (values.length === 0) {
    return 0;
  }

  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function checkEventDrivenTriggers(
  runs: RunReport[],
  traces: TraceEvent[],
  config: EventDrivenConfig,
): TriggerResult[] {
  const results: TriggerResult[] = [];

  const totalGuardViolations = runs.reduce((sum, run) => sum + run.guard_violations.length, 0);
  if (totalGuardViolations >= config.guard_violation.threshold) {
    results.push({
      type: 'event_driven',
      rule: 'guard_violation',
      severity: 'critical',
      description: config.guard_violation.description,
      evidence: {
        total_guard_violations: totalGuardViolations,
        threshold: config.guard_violation.threshold,
      },
    });
  }

  const phaseNames = ['RED', 'GREEN', 'REFACTOR', 'CODE_REVIEW', 'ARCH_REVIEW', 'DOCS'] as const;
  for (const phaseName of phaseNames) {
    let streak = 0;

    for (const run of runs) {
      const hasGateFailureInPhase = run.phases.some(
        (phase) => phase.phase === phaseName && phase.gate_result === 'fail',
      );

      if (hasGateFailureInPhase) {
        streak += 1;
      } else {
        streak = 0;
      }

      if (streak >= config.gate_failure_streak.threshold) {
        results.push({
          type: 'event_driven',
          rule: 'gate_failure_streak',
          severity: 'warning',
          description: config.gate_failure_streak.description,
          affected_phase: phaseName,
          evidence: {
            phase: phaseName,
            streak,
            threshold: config.gate_failure_streak.threshold,
          },
        });
        break;
      }
    }
  }

  const runTokenSeries = runs
    .map((run) => extractRunTotalTokens(run))
    .filter((value): value is number => value !== null);
  const traceTokenSeries = traces
    .filter(isTimingEvent)
    .map((event) => event.tool_calls_count)
    .filter((value) => Number.isFinite(value));
  const tokenSeries = runTokenSeries.length > 0 ? runTokenSeries : traceTokenSeries;

  if (tokenSeries.length >= 2) {
    const latest = tokenSeries[tokenSeries.length - 1];
    const historical = tokenSeries.slice(0, -1);
    const mean = historical.reduce((sum, value) => sum + value, 0) / historical.length;
    const stdDev = standardDeviation(historical, mean);
    const zScore = stdDev === 0 ? (latest > mean ? Number.POSITIVE_INFINITY : 0) : (latest - mean) / stdDev;

    if (zScore >= config.token_anomaly.sigma_threshold) {
      results.push({
        type: 'event_driven',
        rule: 'token_anomaly',
        severity: 'warning',
        description: config.token_anomaly.description,
        evidence: {
          latest,
          mean,
          std_dev: stdDev,
          z_score: zScore,
          sigma_threshold: config.token_anomaly.sigma_threshold,
        },
      });
    }
  }

  let escalationStreak = 0;
  for (const run of runs) {
    if (run.overall_status === 'ESCALATED') {
      escalationStreak += 1;
    } else {
      escalationStreak = 0;
    }

    if (escalationStreak >= config.manual_intervention_streak.threshold) {
      results.push({
        type: 'event_driven',
        rule: 'manual_intervention_streak',
        severity: 'critical',
        description: config.manual_intervention_streak.description,
        evidence: {
          escalation_streak: escalationStreak,
          threshold: config.manual_intervention_streak.threshold,
        },
      });
      break;
    }
  }

  return results;
}

export function checkTrendBasedTriggers(
  runs: RunReport[],
  baseline: AggregatedMetrics,
  config: TrendBasedConfig,
): TriggerResult[] {
  const results: TriggerResult[] = [];
  if (runs.length === 0) {
    return results;
  }

  const tsrWindow = runs.slice(0, config.tsr_drop.window_runs);
  if (tsrWindow.length > 0 && baseline.tsr > 0) {
    const currentTsr = tsrWindow.filter((run) => run.overall_status === 'DONE').length / tsrWindow.length;
    const dropPercent = ((baseline.tsr - currentTsr) / baseline.tsr) * 100;

    if (dropPercent > config.tsr_drop.threshold_percent) {
      results.push({
        type: 'trend_based',
        rule: 'tsr_drop',
        severity: 'warning',
        description: config.tsr_drop.description,
        evidence: {
          baseline_tsr: baseline.tsr,
          current_tsr: currentTsr,
          drop_percent: dropPercent,
          threshold_percent: config.tsr_drop.threshold_percent,
          window_runs: tsrWindow.length,
        },
      });
    }
  }

  const tokenWindow = runs.slice(0, config.token_inflation.window_runs);
  const tokenValues = tokenWindow
    .map((run) => extractRunTotalTokens(run))
    .filter((value): value is number => value !== null);

  if (tokenValues.length > 0 && baseline.total_tokens > 0) {
    const currentAvg = tokenValues.reduce((sum, value) => sum + value, 0) / tokenValues.length;
    const inflationPercent = ((currentAvg - baseline.total_tokens) / baseline.total_tokens) * 100;

    if (inflationPercent > config.token_inflation.threshold_percent) {
      results.push({
        type: 'trend_based',
        rule: 'token_inflation',
        severity: 'warning',
        description: config.token_inflation.description,
        evidence: {
          baseline_avg_tokens: baseline.total_tokens,
          current_avg_tokens: currentAvg,
          inflation_percent: inflationPercent,
          threshold_percent: config.token_inflation.threshold_percent,
          window_runs: tokenValues.length,
        },
      });
    }
  }

  const flakeWindow = runs.slice(0, config.flake_rate.window_runs);
  if (flakeWindow.length > 0) {
    const flakyRuns = flakeWindow.filter(
      (run) => run.partial_credit_score > 0 && run.partial_credit_score < 1,
    ).length;
    const currentFlakeRate = flakyRuns / flakeWindow.length;
    const threshold = config.flake_rate.threshold_percent / 100;

    if (currentFlakeRate > threshold) {
      results.push({
        type: 'trend_based',
        rule: 'flake_rate',
        severity: 'warning',
        description: config.flake_rate.description,
        evidence: {
          flaky_runs: flakyRuns,
          window_runs: flakeWindow.length,
          flake_rate: currentFlakeRate,
          threshold_rate: threshold,
        },
      });
    }
  }

  return results;
}

export function checkCommitBasedTriggers(
  changedFiles: string[],
  config: CommitBasedConfig,
): TriggerResult[] {
  const matches = changedFiles.filter((changedFile) =>
    config.watched_paths.some((pattern) => picomatch(pattern)(changedFile)),
  );

  if (matches.length === 0) {
    return [];
  }

  return [
    {
      type: 'commit_based',
      rule: 'watched_paths_change',
      severity: 'warning',
      description: 'Changes detected in watched paths; run subset evaluation',
      evidence: {
        matched_files: matches,
        watched_paths: config.watched_paths,
        action: config.action,
        subset_size: config.subset_size,
        block_if: config.block_if,
      },
    },
  ];
}
