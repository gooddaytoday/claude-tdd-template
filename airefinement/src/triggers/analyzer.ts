import type { AggregatedMetrics, TriggersConfig, AnalysisResult, TriggerResult } from '@/telemetry/schemas.js';
import { readRunReports, readTraceEvents, getLatestBaseline } from '@/telemetry/collector.js';
import { checkEventDrivenTriggers, checkTrendBasedTriggers, checkCommitBasedTriggers } from '@/triggers/rules.js';

const ZERO_BASELINE: AggregatedMetrics = {
  tsr: 0, pass_at_1: 0, pass_3: 0, code_quality_score: 0,
  total_tokens: 0, median_cycle_time: 0, gate_failure_rate: 0, guard_violations: 0,
};

export function analyze(artifactsDir: string, config: TriggersConfig, changedFiles: string[] = []): AnalysisResult {
  const runs = readRunReports(artifactsDir);
  const traces = readTraceEvents(artifactsDir);
  const baseline = getLatestBaseline(artifactsDir);
  const triggerCfg = config.auto_refinement_triggers;

  const eventTriggers = checkEventDrivenTriggers(runs, traces, triggerCfg.event_driven);

  const skipTrends = runs.length > 0 && baseline === null;
  const trendTriggers = skipTrends
    ? []
    : checkTrendBasedTriggers(runs, baseline ?? ZERO_BASELINE, triggerCfg.trend_based);

  const commitTriggers = checkCommitBasedTriggers(changedFiles, triggerCfg.commit_based);

  const triggers_fired = [...eventTriggers, ...trendTriggers, ...commitTriggers];

  let recommendation: AnalysisResult['recommendation'];
  if (triggers_fired.some((t) => t.severity === 'critical')) {
    recommendation = 'refine';
  } else if (triggers_fired.length > 0) {
    recommendation = 'eval_only';
  } else {
    recommendation = 'no_action';
  }

  const summary = triggers_fired.length > 0
    ? `Analyzed ${runs.length} runs, ${traces.length} traces; ${triggers_fired.length} trigger(s) fired → ${recommendation}`
    : `Analyzed ${runs.length} runs, ${traces.length} traces; no triggers fired`;

  return {
    timestamp: new Date().toISOString(),
    runs_analyzed: runs.length,
    traces_analyzed: traces.length,
    triggers_fired,
    recommendation,
    summary,
  };
}
