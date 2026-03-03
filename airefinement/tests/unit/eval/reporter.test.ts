import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ExperimentResult, AggregatedMetrics, VersionManifest } from '@/telemetry/schemas.js';
import type { ComparisonReport } from '@/eval/comparator.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import
// ---------------------------------------------------------------------------

const mockMkdir = jest.fn();
const mockWriteFile = jest.fn();

jest.unstable_mockModule('node:fs/promises', () => ({
  mkdir: mockMkdir,
  writeFile: mockWriteFile,
}));

const { formatMarkdownReport, saveReport } = await import('@/eval/reporter.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeVersionManifest(): VersionManifest {
  return {
    agent_prompts_hash: 'a',
    skill_hash: 'b',
    hooks_hash: 'c',
    settings_hash: 'd',
    dataset_version: 'v1',
  };
}

function makeControlMetrics(): AggregatedMetrics {
  return {
    tsr: 0.80,
    pass_at_1: 0.75,
    pass_3: 0.85,
    code_quality_score: 0.70,
    total_tokens: 1000,
    median_cycle_time: 30000,
    gate_failure_rate: 0.10,
    guard_violations: 2,
  };
}

function makeVariantMetrics(): AggregatedMetrics {
  return {
    tsr: 0.85,
    pass_at_1: 0.80,
    pass_3: 0.90,
    code_quality_score: 0.75,
    total_tokens: 950,
    median_cycle_time: 28000,
    gate_failure_rate: 0.08,
    guard_violations: 1,
  };
}

function makeExperimentResult(
  overrides: Partial<ExperimentResult> = {},
): ExperimentResult {
  return {
    experiment_id: 'exp-test-2026-abc12345',
    timestamp: '2026-02-26T00:00:00.000Z',
    hypothesis: 'New prompt reduces test mutation rate',
    variant_description: 'prompt-v2',
    dataset_version: 'v1',
    control_config: makeVersionManifest(),
    variant_config: makeVersionManifest(),
    control_results: makeControlMetrics(),
    variant_results: makeVariantMetrics(),
    per_task_comparison: [],
    decision: 'accept',
    decision_rationale: 'All metrics improved',
    ...overrides,
  };
}

function makeComparisonReport(
  result: ExperimentResult,
  overrides: Partial<ComparisonReport> = {},
): ComparisonReport {
  return {
    experiment_id: result.experiment_id,
    control_metrics: result.control_results,
    variant_metrics: result.variant_results,
    deltas: {
      tsr: 0.05,
      pass_at_1: 0.05,
      pass_3: 0.05,
      code_quality_score: 0.05,
      total_tokens: -50,
      median_cycle_time: -2000,
      gate_failure_rate: -0.02,
      guard_violations: -1,
    },
    regressions: [],
    improvements: [],
    unchanged: [],
    net_assessment: 'ACCEPT: All metrics improved',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// formatMarkdownReport tests
// ---------------------------------------------------------------------------

describe('formatMarkdownReport', () => {
  let result: ExperimentResult;
  let report: ComparisonReport;
  let md: string;

  beforeEach(() => {
    result = makeExperimentResult();
    report = makeComparisonReport(result);
    md = formatMarkdownReport(result, report);
  });

  it('contains experiment ID header', () => {
    expect(md).toContain('# Experiment Report: exp-test-2026-abc12345');
  });

  it('contains Hypothesis section header', () => {
    expect(md).toContain('## Hypothesis');
  });

  it('contains hypothesis text', () => {
    expect(md).toContain('New prompt reduces test mutation rate');
  });

  it('contains Results Summary section header', () => {
    expect(md).toContain('## Results Summary');
  });

  it('contains markdown table header row', () => {
    expect(md).toContain('| Metric | Control | Variant | Delta | Status |');
  });

  it('has all 8 metric rows in the table', () => {
    const metrics = [
      'tsr',
      'pass_at_1',
      'pass_3',
      'code_quality_score',
      'total_tokens',
      'median_cycle_time',
      'gate_failure_rate',
      'guard_violations',
    ];
    for (const metric of metrics) {
      expect(md).toContain(metric);
    }
  });

  it('formats positive delta with plus sign', () => {
    expect(md).toContain('+0.05');
  });

  it('formats negative delta with minus sign', () => {
    expect(md).toContain('-50');
  });

  it('shows Status "Better" when delta > 0', () => {
    const lines = md.split('\n').filter(l => l.includes('tsr'));
    expect(lines.some(l => l.includes('Better'))).toBe(true);
  });

  it('shows Status "Worse" when delta < 0', () => {
    const resultWithRegression = makeExperimentResult({
      variant_results: { ...makeVariantMetrics(), tsr: 0.70 },
    });
    const reportWithRegression = makeComparisonReport(resultWithRegression, {
      deltas: { ...makeComparisonReport(resultWithRegression).deltas, tsr: -0.10 },
    });
    const mdReg = formatMarkdownReport(resultWithRegression, reportWithRegression);
    const lines = mdReg.split('\n').filter(l => l.includes('tsr'));
    expect(lines.some(l => l.includes('Worse'))).toBe(true);
  });

  it('shows Status "Same" when delta === 0', () => {
    const reportSame = makeComparisonReport(result, {
      deltas: { ...makeComparisonReport(result).deltas, tsr: 0 },
    });
    const mdSame = formatMarkdownReport(result, reportSame);
    const lines = mdSame.split('\n').filter(l => l.includes('tsr'));
    expect(lines.some(l => l.includes('Same'))).toBe(true);
  });

  it('contains Regressions section with task count', () => {
    expect(md).toContain('## Regressions');
    expect(md).toMatch(/## Regressions \(\d+ tasks?\)/);
  });

  it('shows correct regression count (0 regressions)', () => {
    expect(md).toContain('## Regressions (0 tasks)');
  });

  it('shows correct regression count (2 regressions)', () => {
    const reportWithRegs = makeComparisonReport(result, {
      regressions: [
        {
          task_id: 'task-1',
          control_outcome: 'pass',
          variant_outcome: 'fail',
          control_score: 0.90,
          variant_score: 0.60,
          delta: -0.30,
          regression: true,
        },
        {
          task_id: 'task-2',
          control_outcome: 'pass',
          variant_outcome: 'partial',
          control_score: 0.85,
          variant_score: 0.55,
          delta: -0.30,
          regression: true,
        },
      ],
    });
    const mdRegs = formatMarkdownReport(result, reportWithRegs);
    expect(mdRegs).toContain('## Regressions (2 tasks)');
  });

  it('contains Improvements section with task count', () => {
    expect(md).toContain('## Improvements');
    expect(md).toMatch(/## Improvements \(\d+ tasks?\)/);
  });

  it('shows correct improvement count (0 improvements)', () => {
    expect(md).toContain('## Improvements (0 tasks)');
  });

  it('shows correct improvement count when improvements present', () => {
    const reportWithImprovements = makeComparisonReport(result, {
      improvements: [
        {
          task_id: 'task-3',
          control_outcome: 'fail',
          variant_outcome: 'pass',
          control_score: 0.50,
          variant_score: 0.90,
          delta: 0.40,
          regression: false,
        },
      ],
    });
    const mdImprovements = formatMarkdownReport(result, reportWithImprovements);
    expect(mdImprovements).toContain('## Improvements (1 tasks)');
  });

  it('contains Decision section with ACCEPT for decision=accept', () => {
    expect(md).toContain('## Decision: ACCEPT');
  });

  it('contains Decision section with REJECT for decision=reject', () => {
    const resultReject = makeExperimentResult({ decision: 'reject', decision_rationale: 'TSR dropped' });
    const mdReject = formatMarkdownReport(resultReject, makeComparisonReport(resultReject));
    expect(mdReject).toContain('## Decision: REJECT');
  });

  it('contains Decision section with ACCEPT_WITH_CAVEAT for decision=accept_with_caveat', () => {
    const resultCaveat = makeExperimentResult({
      decision: 'accept_with_caveat',
      decision_rationale: 'Minor regression in one task',
    });
    const mdCaveat = formatMarkdownReport(resultCaveat, makeComparisonReport(resultCaveat));
    expect(mdCaveat).toContain('## Decision: ACCEPT_WITH_CAVEAT');
  });

  it('contains decision rationale text', () => {
    expect(md).toContain('All metrics improved');
  });

  it('lists regression task details when regressions are present', () => {
    const reportWithRegs = makeComparisonReport(result, {
      regressions: [
        {
          task_id: 'task-reg-1',
          control_outcome: 'pass',
          variant_outcome: 'fail',
          control_score: 0.90,
          variant_score: 0.60,
          delta: -0.30,
          regression: true,
        },
      ],
    });
    const mdRegs = formatMarkdownReport(result, reportWithRegs);
    expect(mdRegs).toContain('task-reg-1');
  });
});

// ---------------------------------------------------------------------------
// saveReport tests
// ---------------------------------------------------------------------------

describe('saveReport', () => {
  let result: ExperimentResult;
  let report: ComparisonReport;

  beforeEach(() => {
    mockMkdir.mockReset();
    mockWriteFile.mockReset();
    mockMkdir.mockResolvedValue(undefined);
    mockWriteFile.mockResolvedValue(undefined);

    result = makeExperimentResult();
    report = makeComparisonReport(result);
  });

  it('returns correct jsonPath', async () => {
    const { jsonPath } = await saveReport(result, report, '/reports');
    expect(jsonPath).toBe('/reports/exp-test-2026-abc12345.json');
  });

  it('returns correct mdPath', async () => {
    const { mdPath } = await saveReport(result, report, '/reports');
    expect(mdPath).toBe('/reports/exp-test-2026-abc12345.md');
  });

  it('calls mkdir with recursive option', async () => {
    await saveReport(result, report, '/reports');
    expect(mockMkdir).toHaveBeenCalledWith('/reports', { recursive: true });
  });

  it('calls writeFile twice (JSON and MD)', async () => {
    await saveReport(result, report, '/reports');
    expect(mockWriteFile).toHaveBeenCalledTimes(2);
  });

  it('saves JSON to correct path', async () => {
    await saveReport(result, report, '/reports');
    const calls = (mockWriteFile as jest.MockedFunction<typeof mockWriteFile>).mock.calls;
    const jsonCall = calls.find(c => String(c[0]).endsWith('.json'));
    expect(jsonCall).toBeDefined();
    expect(jsonCall![0]).toBe('/reports/exp-test-2026-abc12345.json');
  });

  it('saves MD to correct path', async () => {
    await saveReport(result, report, '/reports');
    const calls = (mockWriteFile as jest.MockedFunction<typeof mockWriteFile>).mock.calls;
    const mdCall = calls.find(c => String(c[0]).endsWith('.md'));
    expect(mdCall).toBeDefined();
    expect(mdCall![0]).toBe('/reports/exp-test-2026-abc12345.md');
  });

  it('JSON content is valid JSON containing experiment_id', async () => {
    await saveReport(result, report, '/reports');
    const calls = (mockWriteFile as jest.MockedFunction<typeof mockWriteFile>).mock.calls;
    const jsonCall = calls.find(c => String(c[0]).endsWith('.json'));
    const jsonContent = String(jsonCall![1]);
    const parsed = JSON.parse(jsonContent);
    expect(parsed.experiment_id).toBe('exp-test-2026-abc12345');
  });

  it('MD content contains experiment ID header', async () => {
    await saveReport(result, report, '/reports');
    const calls = (mockWriteFile as jest.MockedFunction<typeof mockWriteFile>).mock.calls;
    const mdCall = calls.find(c => String(c[0]).endsWith('.md'));
    const mdContent = String(mdCall![1]);
    expect(mdContent).toContain('# Experiment Report: exp-test-2026-abc12345');
  });

  it('creates directory before writing files', async () => {
    const callOrder: string[] = [];
    mockMkdir.mockImplementation(async () => { callOrder.push('mkdir'); });
    mockWriteFile.mockImplementation(async () => { callOrder.push('writeFile'); });

    await saveReport(result, report, '/reports');

    expect(callOrder[0]).toBe('mkdir');
  });

  it('works with nested reportsDir path', async () => {
    const { jsonPath, mdPath } = await saveReport(result, report, '/data/experiments/reports');
    expect(jsonPath).toBe('/data/experiments/reports/exp-test-2026-abc12345.json');
    expect(mdPath).toBe('/data/experiments/reports/exp-test-2026-abc12345.md');
    expect(mockMkdir).toHaveBeenCalledWith('/data/experiments/reports', { recursive: true });
  });
});
