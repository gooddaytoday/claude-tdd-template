import { jest, describe, it, expect, beforeAll, beforeEach, afterEach } from '@jest/globals';

// ---- Mock declarations (must precede any dynamic import) ----

const mockAnalyze = jest.fn();
const mockLoadTriggersConfig = jest.fn();

const mockRunRefinement = jest.fn();

const mockRunEval = jest.fn();

const mockLoadExperimentHistory = jest.fn();
const mockFormatHistoryTable = jest.fn();
const mockFormatMarkdownReport = jest.fn();
const mockSaveReport = jest.fn();

const mockBuildComparisonReport = jest.fn();

const mockComputePipelineKPIs = jest.fn();
const mockComputeRoleMetrics = jest.fn();
const mockReadRunReports = jest.fn();

const mockReadFileSync = jest.fn();
const mockReadFile = jest.fn();

jest.unstable_mockModule('@/triggers/analyzer.js', () => ({
  analyze: mockAnalyze,
}));

jest.unstable_mockModule('@/triggers/config-loader.js', () => ({
  loadTriggersConfig: mockLoadTriggersConfig,
  loadThresholdsConfig: jest.fn().mockReturnValue({}),
  ConfigLoadError: class ConfigLoadError extends Error {},
}));

jest.unstable_mockModule('@/refinement/agent-runner.js', () => ({
  runRefinement: mockRunRefinement,
}));

jest.unstable_mockModule('@/eval/runner.js', () => ({
  runEval: mockRunEval,
}));

jest.unstable_mockModule('@/eval/reporter.js', () => ({
  loadExperimentHistory: mockLoadExperimentHistory,
  formatHistoryTable: mockFormatHistoryTable,
  formatMarkdownReport: mockFormatMarkdownReport,
  saveReport: mockSaveReport,
}));

jest.unstable_mockModule('@/eval/comparator.js', () => ({
  buildComparisonReport: mockBuildComparisonReport,
}));

jest.unstable_mockModule('@/metrics/pipeline-metrics.js', () => ({
  computePipelineKPIs: mockComputePipelineKPIs,
}));

jest.unstable_mockModule('@/metrics/role-metrics.js', () => ({
  computeRoleMetrics: mockComputeRoleMetrics,
}));

jest.unstable_mockModule('@/telemetry/collector.js', () => ({
  readRunReports: mockReadRunReports,
  CollectorError: class CollectorError extends Error {},
}));

jest.unstable_mockModule('node:fs', () => ({
  readFileSync: mockReadFileSync,
  existsSync: jest.fn().mockReturnValue(true),
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

// ---- Import CLI under test ----

let program: import('commander').Command;

beforeAll(async () => {
  const mod = await import('../../../bin/cli.js');
  program = mod.program;
  if (program) {
    program.exitOverride();
  }
});

// ---- Shared mock reset helper ----

function resetAllMocks(): void {
  mockAnalyze.mockReset();
  mockLoadTriggersConfig.mockReset();
  mockRunRefinement.mockReset();
  mockRunEval.mockReset();
  mockLoadExperimentHistory.mockReset();
  mockFormatHistoryTable.mockReset();
  mockFormatMarkdownReport.mockReset();
  mockSaveReport.mockReset();
  mockBuildComparisonReport.mockReset();
  mockComputePipelineKPIs.mockReset();
  mockComputeRoleMetrics.mockReset();
  mockReadRunReports.mockReset();
  mockReadFileSync.mockReset();
  mockReadFile.mockReset();
}

// ===========================================================================
// Convention-based default paths
// ===========================================================================

describe('analyze command — default paths', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should pass a path containing "airefinement/artifacts" to analyze() when --artifacts-dir is not provided', async () => {
    mockAnalyze.mockReturnValue({ triggers_fired: [], timestamp: '2026-01-01T00:00:00Z' });
    mockLoadTriggersConfig.mockReturnValue({});
    await program.parseAsync(['node', 'cli', 'analyze']);
    const artifactsArg = mockAnalyze.mock.calls[0]?.[0] as string;
    expect(artifactsArg).toContain('airefinement/artifacts');
  });

  it('should pass a path containing "airefinement/config" to loadTriggersConfig() when --config is not provided', async () => {
    mockLoadTriggersConfig.mockReturnValue({});
    mockAnalyze.mockReturnValue({ triggers_fired: [], timestamp: '2026-01-01T00:00:00Z' });
    await program.parseAsync(['node', 'cli', 'analyze']);
    const configArg = mockLoadTriggersConfig.mock.calls[0]?.[0] as string;
    expect(configArg).toContain('airefinement/config');
  });

});

// ===========================================================================
// eval command — default paths and values
// ===========================================================================

describe('eval command — default dataset and trials', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;
  let errSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
    errSpy.mockRestore();
  });

  it('should pass a datasetPath containing "golden-v1" to runEval() when --dataset is not provided', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/test',
    ]);
    const callArg = mockRunEval.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.datasetPath).toContain('golden-v1');
  });

  it('should pass datasetPath containing "airefinement/datasets" to runEval() when --dataset is not provided', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/test',
    ]);
    const callArg = mockRunEval.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.datasetPath).toContain('airefinement/datasets');
  });

  it('should pass trials: 3 to runEval() when --trials is not provided', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/test',
    ]);
    const callArg = mockRunEval.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.trials).toBe(3);
  });

  it('should override default dataset path when --dataset is explicitly provided', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/test',
      '--dataset', '/explicit/dataset.jsonl',
    ]);
    const callArg = mockRunEval.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.datasetPath).toBe('/explicit/dataset.jsonl');
  });

  it('should override default trials when --trials is explicitly provided', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/test',
      '--trials', '7',
    ]);
    const callArg = mockRunEval.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.trials).toBe(7);
  });
});

// ===========================================================================
// metrics command — default artifacts path and no run limit
// ===========================================================================

describe('metrics command — default paths and no run limit', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should call readRunReports() with a path containing "airefinement/artifacts" when --runs is not provided', async () => {
    mockReadRunReports.mockReturnValue([]);
    mockComputePipelineKPIs.mockReturnValue({ tsr: 0.9 });
    mockComputeRoleMetrics.mockReturnValue({ roles: {} });
    await program.parseAsync(['node', 'cli', 'metrics']);
    const reportsPathArg = mockReadRunReports.mock.calls[0]?.[0] as string;
    expect(reportsPathArg).toContain('airefinement/artifacts');
  });

  it('should pass ALL run reports to computePipelineKPIs() without slicing when --runs is not provided', async () => {
    const allReports = Array.from({ length: 8 }, (_, i) => ({ run_id: `run-${i}` }));
    mockReadRunReports.mockReturnValue(allReports);
    mockComputePipelineKPIs.mockReturnValue({ tsr: 0.9 });
    mockComputeRoleMetrics.mockReturnValue({ roles: {} });
    await program.parseAsync(['node', 'cli', 'metrics']);
    const pipelineArg = mockComputePipelineKPIs.mock.calls[0]?.[0] as unknown[];
    expect(pipelineArg).toHaveLength(8);
  });
});
