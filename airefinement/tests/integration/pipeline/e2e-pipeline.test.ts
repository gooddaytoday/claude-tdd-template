import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readRunReports, readTraceEvents } from '@/telemetry/collector.js';
import { analyze } from '@/triggers/analyzer.js';
import { loadTriggersConfig } from '@/triggers/config-loader.js';
import { computeRoleMetrics } from '@/metrics/role-metrics.js';
import { computePipelineKPIs } from '@/metrics/pipeline-metrics.js';
import { loadExperimentHistory } from '@/eval/reporter.js';
import { buildComparisonReport } from '@/eval/comparator.js';
import { AnalysisResultSchema } from '@/telemetry/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = resolve(__dirname, '../../fixtures');
const ARTIFACTS_DIR = resolve(FIXTURES_DIR, 'artifacts');
const REPORTS_DIR = resolve(FIXTURES_DIR, 'reports');
const TRIGGERS_PATH = resolve(FIXTURES_DIR, 'config', 'triggers.json');

describe('E2E pipeline integration with fixtures', () => {
  it('collector reads RunReports from fixture artifacts', () => {
    const reports = readRunReports(ARTIFACTS_DIR);

    expect(reports).toHaveLength(3);
    expect(reports.map((r) => r.run_id)).toEqual(['run-pass', 'run-partial', 'run-fail']);
    expect(reports.map((r) => r.overall_status)).toEqual(['DONE', 'ESCALATED', 'FAILED']);
  });

  it('collector reads trace events from fixture artifacts', () => {
    const traces = readTraceEvents(ARTIFACTS_DIR);
    const guardEvents = traces.filter((event) => 'blocked' in event);
    const timingEvents = traces.filter((event) => 'tool_calls_count' in event);

    expect(traces).toHaveLength(5);
    expect(guardEvents).toHaveLength(2);
    expect(timingEvents).toHaveLength(3);
  });

  it('analyzer detects triggers from fixture data and returns valid AnalysisResult', () => {
    const config = loadTriggersConfig(TRIGGERS_PATH);
    const result = analyze(ARTIFACTS_DIR, config);

    expect(() => AnalysisResultSchema.parse(result)).not.toThrow();
    expect(result.runs_analyzed).toBe(3);
    expect(result.traces_analyzed).toBe(5);
    expect(result.triggers_fired.length).toBeGreaterThan(0);
    expect(result.recommendation).toBe('refine');
  });

  it('role-metrics computes per-agent metrics from fixture reports', () => {
    const reports = readRunReports(ARTIFACTS_DIR);
    const roles = computeRoleMetrics(reports);

    expect(Object.keys(roles)).toEqual([
      'tdd-test-writer',
      'tdd-implementer',
      'tdd-refactorer',
      'tdd-code-reviewer',
      'tdd-architect-reviewer',
      'tdd-documenter',
    ]);
    expect(roles['tdd-test-writer'].failing_test_rate).toBeGreaterThan(0);
    expect(roles['tdd-implementer'].tests_pass_rate).toBeGreaterThanOrEqual(0);
    expect(roles['tdd-implementer'].tests_pass_rate).toBeLessThanOrEqual(1);
    expect(roles['tdd-documenter'].completion_rate).toBeCloseTo(1 / 3, 5);
  });

  it('pipeline-kpis computes aggregate KPIs from fixture reports', () => {
    const reports = readRunReports(ARTIFACTS_DIR);
    const kpis = computePipelineKPIs(reports);

    expect(kpis.tsr).toBeCloseTo(1 / 3, 5);
    expect(kpis.pass_at_1).toBeCloseTo(1 / 3, 5);
    expect(kpis.code_quality_score).toBeGreaterThan(0);
    expect(kpis.gate_failure_rate).toBeGreaterThan(0);
    expect(kpis.median_cycle_time).toBe(155);
    expect(kpis.guard_violations_total).toBe(2);
  });

  it('comparator generates comparison report from fixture experiment data', () => {
    const history = loadExperimentHistory(REPORTS_DIR);
    const report = buildComparisonReport(history[0]);

    expect(history).toHaveLength(1);
    expect(report.experiment_id).toBe('exp-task-19');
    expect(report.deltas.tsr).toBeCloseTo(0.15, 5);
    expect(report.regressions).toHaveLength(1);
    expect(report.improvements).toHaveLength(1);
    expect(report.unchanged).toHaveLength(1);
    expect(report.net_assessment).toContain('ACCEPT_WITH_CAVEAT');
  });
});
