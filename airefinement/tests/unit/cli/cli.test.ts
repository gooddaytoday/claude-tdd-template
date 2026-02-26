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
  // Prevent Commander from calling process.exit during tests
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

// ---- Sample analysis fixture for refine tests ----

const SAMPLE_ANALYSIS = JSON.stringify({
  triggers_fired: [],
  timestamp: '2026-01-01T00:00:00Z',
  runs_analyzed: 0,
  traces_analyzed: 0,
  recommendation: 'none',
  summary: 'test',
});

// ===========================================================================
// CLI exports
// ===========================================================================

describe('CLI program export', () => {
  it('should export a Commander program object', () => {
    expect(program).toBeDefined();
    expect(typeof program.parseAsync).toBe('function');
  });

  it('should have "analyze" command registered', () => {
    expect(program).toBeDefined();
    const cmd = program.commands.find(c => c.name() === 'analyze');
    expect(cmd).toBeDefined();
  });

  it('should have "refine" command registered', () => {
    expect(program).toBeDefined();
    const cmd = program.commands.find(c => c.name() === 'refine');
    expect(cmd).toBeDefined();
  });

  it('should have "eval" command registered', () => {
    expect(program).toBeDefined();
    const cmd = program.commands.find(c => c.name() === 'eval');
    expect(cmd).toBeDefined();
  });

  it('should have "report" command registered', () => {
    expect(program).toBeDefined();
    const cmd = program.commands.find(c => c.name() === 'report');
    expect(cmd).toBeDefined();
  });

  it('should have "metrics" command registered', () => {
    expect(program).toBeDefined();
    const cmd = program.commands.find(c => c.name() === 'metrics');
    expect(cmd).toBeDefined();
  });
});

// ===========================================================================
// analyze command
// ===========================================================================

describe('analyze command', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should call analyze() when analyze command is invoked', async () => {
    mockAnalyze.mockReturnValue({ triggers_fired: [], timestamp: '2026-01-01T00:00:00Z' });
    await program.parseAsync(['node', 'cli', 'analyze']);
    expect(mockAnalyze).toHaveBeenCalled();
  });

  it('should print JSON output to stdout after analyze', async () => {
    const result = { triggers_fired: [{ rule: 'test-rule' }], timestamp: '2026-01-01T00:00:00Z' };
    mockAnalyze.mockReturnValue(result);
    await program.parseAsync(['node', 'cli', 'analyze']);
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('"triggers');
  });

  it('should print a human-readable summary to stdout after analyze', async () => {
    const result = { triggers_fired: [], timestamp: '2026-01-01T00:00:00Z', recommendation: 'none' };
    mockAnalyze.mockReturnValue(result);
    await program.parseAsync(['node', 'cli', 'analyze']);
    expect(consoleSpy).toHaveBeenCalled();
  });
});

// ===========================================================================
// refine command
// ===========================================================================

describe('refine command', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    mockReadFileSync.mockReturnValue(SAMPLE_ANALYSIS);
    mockReadFile.mockResolvedValue(SAMPLE_ANALYSIS);
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should call runRefinement() when refine command is invoked with --analysis', async () => {
    mockRunRefinement.mockResolvedValue({ status: 'done' });
    await program.parseAsync(['node', 'cli', 'refine', '--analysis', '/tmp/analysis.json']);
    expect(mockRunRefinement).toHaveBeenCalled();
  });

  it('should pass the --analysis file path to runRefinement', async () => {
    mockRunRefinement.mockResolvedValue({ status: 'done' });
    await program.parseAsync(['node', 'cli', 'refine', '--analysis', '/tmp/my-analysis.json']);
    const callArg = mockRunRefinement.mock.calls[0]?.[0];
    const argStr = JSON.stringify(callArg);
    expect(argStr).toContain('/tmp/my-analysis.json');
  });

  it('should pass dryRun: true when --dry-run flag is provided', async () => {
    mockRunRefinement.mockResolvedValue({ status: 'dry-run' });
    await program.parseAsync(['node', 'cli', 'refine', '--analysis', '/tmp/a.json', '--dry-run']);
    expect(mockRunRefinement).toHaveBeenCalledWith(
      expect.objectContaining({ dryRun: true }),
    );
  });

  it('should pass dryRun: false (or undefined) when --dry-run flag is absent', async () => {
    mockRunRefinement.mockResolvedValue({ status: 'done' });
    await program.parseAsync(['node', 'cli', 'refine', '--analysis', '/tmp/a.json']);
    const callArg = mockRunRefinement.mock.calls[0]?.[0] as Record<string, unknown>;
    expect(callArg?.dryRun).toBeFalsy();
  });
});

// ===========================================================================
// eval command
// ===========================================================================

describe('eval command', () => {
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

  it('should call runEval() with controlBranch and variantBranch', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/test',
    ]);
    expect(mockRunEval).toHaveBeenCalledWith(
      expect.objectContaining({ controlBranch: 'main', variantBranch: 'feat/test' }),
    );
  });

  it('should pass optional --dataset path to runEval', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/v2',
      '--dataset', '/data/set.json',
    ]);
    expect(mockRunEval).toHaveBeenCalledWith(
      expect.objectContaining({ datasetPath: '/data/set.json' }),
    );
  });

  it('should parse --trials as a number and pass it to runEval', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/v2',
      '--trials', '5',
    ]);
    expect(mockRunEval).toHaveBeenCalledWith(
      expect.objectContaining({ trials: 5 }),
    );
  });

  it('should pass quickMode: true when --quick flag is provided', async () => {
    mockRunEval.mockResolvedValue({ experiment_id: 'exp-1', decision: 'accept' });
    await program.parseAsync([
      'node', 'cli', 'eval',
      '--control', 'main',
      '--variant', 'feat/v2',
      '--quick',
    ]);
    expect(mockRunEval).toHaveBeenCalledWith(
      expect.objectContaining({ quickMode: true }),
    );
  });

  it('should produce a clear error when required --control option is missing', async () => {
    await expect(
      program.parseAsync(['node', 'cli', 'eval', '--variant', 'feat/test']),
    ).rejects.toThrow();
  });

  it('should produce a clear error when required --variant option is missing', async () => {
    await expect(
      program.parseAsync(['node', 'cli', 'eval', '--control', 'main']),
    ).rejects.toThrow();
  });
});

// ===========================================================================
// report command
// ===========================================================================

describe('report command', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should call loadExperimentHistory and formatHistoryTable with --history flag', async () => {
    mockLoadExperimentHistory.mockReturnValue([]);
    mockFormatHistoryTable.mockReturnValue('History Table');
    await program.parseAsync(['node', 'cli', 'report', '--history']);
    expect(mockLoadExperimentHistory).toHaveBeenCalled();
    expect(mockFormatHistoryTable).toHaveBeenCalled();
  });

  it('should print history table to stdout when --history flag is provided', async () => {
    mockLoadExperimentHistory.mockReturnValue([]);
    mockFormatHistoryTable.mockReturnValue('=== HISTORY TABLE ===');
    await program.parseAsync(['node', 'cli', 'report', '--history']);
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('=== HISTORY TABLE ===');
  });

  it('should pass --reports-dir path to loadExperimentHistory', async () => {
    mockLoadExperimentHistory.mockReturnValue([]);
    mockFormatHistoryTable.mockReturnValue('History Table');

    await program.parseAsync(['node', 'cli', 'report', '--history', '--reports-dir', '/tmp/reports']);

    expect(mockLoadExperimentHistory).toHaveBeenCalledWith('/tmp/reports');
  });

  it('should print latest report to stdout when no flags are passed', async () => {
    const latestExperiment = { experiment_id: 'exp-latest', decision: 'accept' };
    mockLoadExperimentHistory.mockReturnValue([latestExperiment]);
    mockFormatMarkdownReport.mockReturnValue('# Latest Report\nDetails here');
    await program.parseAsync(['node', 'cli', 'report']);
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toBeTruthy();
  });

  it('should output JSON when --format json is provided', async () => {
    const exp = { experiment_id: 'exp-json-test', decision: 'accept' };
    mockLoadExperimentHistory.mockReturnValue([exp]);
    await program.parseAsync(['node', 'cli', 'report', '--format', 'json']);
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('exp-json-test');
  });

  it('should output markdown when --format md is provided', async () => {
    const exp = { experiment_id: 'exp-md-test', decision: 'reject' };
    mockLoadExperimentHistory.mockReturnValue([exp]);
    mockFormatMarkdownReport.mockReturnValue('# Markdown Report\nContent');
    await program.parseAsync(['node', 'cli', 'report', '--format', 'md']);
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toContain('Markdown Report');
  });
});

// ===========================================================================
// metrics command
// ===========================================================================

describe('metrics command', () => {
  let consoleSpy: ReturnType<typeof jest.spyOn>;

  beforeEach(() => {
    resetAllMocks();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should call computePipelineKPIs and computeRoleMetrics when metrics command is invoked', async () => {
    mockReadRunReports.mockReturnValue([]);
    mockComputePipelineKPIs.mockReturnValue({ tsr: 0.9 });
    mockComputeRoleMetrics.mockReturnValue({ roles: {} });
    await program.parseAsync(['node', 'cli', 'metrics']);
    expect(mockComputePipelineKPIs).toHaveBeenCalled();
    expect(mockComputeRoleMetrics).toHaveBeenCalled();
  });

  it('should limit run reports to --runs N (last N entries)', async () => {
    const reports = Array.from({ length: 10 }, (_, i) => ({ run_id: `run-${i}` }));
    mockReadRunReports.mockReturnValue(reports);
    mockComputePipelineKPIs.mockReturnValue({ tsr: 0.9 });
    mockComputeRoleMetrics.mockReturnValue({ roles: {} });
    await program.parseAsync(['node', 'cli', 'metrics', '--runs', '5']);
    const pipelineArg = mockComputePipelineKPIs.mock.calls[0]?.[0] as unknown[];
    expect(pipelineArg).toHaveLength(5);
  });

  it('should print KPI results to stdout', async () => {
    mockReadRunReports.mockReturnValue([]);
    mockComputePipelineKPIs.mockReturnValue({ tsr: 0.88, pass_at_1: 0.72 });
    mockComputeRoleMetrics.mockReturnValue({ test_writer: { pass_rate: 0.9 } });
    await program.parseAsync(['node', 'cli', 'metrics']);
    const output = consoleSpy.mock.calls.map(c => c.join(' ')).join('\n');
    expect(output).toBeTruthy();
  });
});
