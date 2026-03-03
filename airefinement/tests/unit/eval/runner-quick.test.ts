import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { GoldenDatasetTask } from '@/telemetry/schemas.js';
import type { CompositeConfig, CompositeResult } from '@/eval/graders/composite.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import
// ---------------------------------------------------------------------------

const mockRunClaude = jest.fn();
const mockAddWorktree = jest.fn();
const mockRemoveWorktree = jest.fn();
const mockHashFiles = jest.fn();
const mockGradeComposite = jest.fn();
const mockLoadGoldenDataset = jest.fn();
const mockWriteFile = jest.fn();
const mockMkdir = jest.fn();
const mockReaddir = jest.fn();

jest.unstable_mockModule('@/utils/git.js', () => ({
  addWorktree: mockAddWorktree,
  removeWorktree: mockRemoveWorktree,
  hashFiles: mockHashFiles,
  getCurrentBranch: jest.fn(),
  createBranch: jest.fn(),
  checkoutBranch: jest.fn(),
  commitAll: jest.fn(),
  getDiff: jest.fn(),
  getChangedFiles: jest.fn(),
  stash: jest.fn(),
  stashPop: jest.fn(),
}));

jest.unstable_mockModule('@/utils/claude-cli.js', () => ({
  runClaude: mockRunClaude,
  buildPrompt: jest.fn(),
}));

jest.unstable_mockModule('@/eval/graders/composite.js', () => ({
  gradeComposite: mockGradeComposite,
}));

jest.unstable_mockModule('@/eval/dataset-reader.js', () => ({
  loadGoldenDataset: mockLoadGoldenDataset,
  filterByTestType: jest.fn(),
  filterByDifficulty: jest.fn(),
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  writeFile: mockWriteFile,
  mkdir: mockMkdir,
  readdir: mockReaddir,
}));

const { sampleQuickSubset, runEval } = await import('@/eval/runner.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeTask(id: string): GoldenDatasetTask {
  return {
    id,
    description: `Task description for ${id}`,
    parent_task: 'parent-16',
    subtask_index: 1,
    test_type: 'unit',
    acceptance: {
      tests_must_fail_initially: true,
      tests_must_pass_after_green: true,
      no_test_modifications_in_green: true,
      static_analysis_clean: true,
      architecture_check: 'must pass',
    },
    reference_solution: 'solution code',
    graders: ['test_runner'],
    difficulty: 'medium',
  };
}

function makeTaskArray(count: number): GoldenDatasetTask[] {
  return Array.from({ length: count }, (_, i) => makeTask(`task-${i + 1}`));
}

const defaultGraderConfig: CompositeConfig = {
  weights: {
    test_runner: 0.30,
    static_analysis: 0.15,
    test_mutation: 0.15,
    guard_compliance: 0.10,
    llm_test_quality: 0.10,
    llm_impl_minimality: 0.10,
    llm_doc_completeness: 0.10,
  },
};

function makeFakeCompositeResult(score = 0.8): CompositeResult {
  return {
    overall_score: score,
    pass: score >= 0.5,
    individual_scores: {},
    partial_credit: {
      phases_completed: 6,
      phases_total: 6,
      phase_progression_score: 1.0,
      grader_ensemble_score: score,
      final_score: score,
    },
  };
}

// ---------------------------------------------------------------------------
// sampleQuickSubset — pure function
// ---------------------------------------------------------------------------

describe('sampleQuickSubset', () => {
  it('returns exactly count tasks when tasks.length > count', () => {
    const tasks = makeTaskArray(10);
    const result = sampleQuickSubset(tasks, 3);
    expect(result).toHaveLength(3);
  });

  it('returns all tasks when count exceeds tasks.length', () => {
    const tasks = makeTaskArray(4);
    const result = sampleQuickSubset(tasks, 10);
    expect(result).toHaveLength(4);
  });

  it('returns empty array when count is 0', () => {
    const tasks = makeTaskArray(5);
    const result = sampleQuickSubset(tasks, 0);
    expect(result).toHaveLength(0);
  });

  it('every element in result belongs to the original array', () => {
    const tasks = makeTaskArray(10);
    const result = sampleQuickSubset(tasks, 5);
    expect(result).toHaveLength(5);
    for (const item of result) {
      expect(tasks).toContain(item);
    }
  });

  it('result contains no duplicate tasks', () => {
    const tasks = makeTaskArray(10);
    const result = sampleQuickSubset(tasks, 7);
    expect(result).toHaveLength(7);
    const ids = result.map((t) => t.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(ids.length);
  });

  it('does not modify the original array', () => {
    const tasks = makeTaskArray(10);
    const snapshot = tasks.map((t) => t.id);
    const result = sampleQuickSubset(tasks, 5);
    // Confirm return value is correct (ensures stub fails here)
    expect(result).toHaveLength(5);
    // Confirm original is intact
    expect(tasks.map((t) => t.id)).toEqual(snapshot);
    expect(tasks).toHaveLength(10);
  });

  it('returns all tasks when count equals tasks.length (boundary)', () => {
    const tasks = makeTaskArray(5);
    const result = sampleQuickSubset(tasks, 5);
    expect(result).toHaveLength(5);
    const ids = new Set(result.map((t) => t.id));
    expect(ids.size).toBe(5);
  });
});

// ---------------------------------------------------------------------------
// runEval — orchestrator
// ---------------------------------------------------------------------------

describe('runEval', () => {
  const fiveTaskDataset = makeTaskArray(5);

  const baseConfig = {
    datasetPath: 'datasets/golden-v1.jsonl',
    trials: 1,
    hypothesis: 'Test hypothesis',
    variantDescription: 'Variant description for testing',
    controlBranch: 'main',
    variantBranch: 'feature/test',
    graderConfig: defaultGraderConfig,
    timeout: 5000,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockLoadGoldenDataset.mockReturnValue(fiveTaskDataset);
    mockAddWorktree.mockResolvedValue(undefined);
    mockRemoveWorktree.mockResolvedValue(undefined);
    mockHashFiles.mockResolvedValue('testhash');
    // readdir returns empty array — collectFiles gracefully returns []
    mockReaddir.mockResolvedValue([]);
    mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: '', stderr: '', durationMs: 100 });
    mockGradeComposite.mockReturnValue(makeFakeCompositeResult(0.8));
    mockWriteFile.mockResolvedValue(undefined);
    mockMkdir.mockResolvedValue(undefined);
  });

  it('calls loadGoldenDataset with config.datasetPath', async () => {
    await runEval(baseConfig);
    expect(mockLoadGoldenDataset).toHaveBeenCalledWith(baseConfig.datasetPath);
  });

  it('when quick:true, runClaude is called quickSampleSize × trials × 2 times (not full dataset)', async () => {
    // Dataset has 5 tasks, quick mode samples 2
    // Expected: 2 tasks × 1 trial × 2 branches = 4 calls
    // If full mode were used: 5 × 1 × 2 = 10 calls
    const quickConfig = { ...baseConfig, quick: true, quickSampleSize: 2, trials: 1 };
    await runEval(quickConfig);
    expect(mockRunClaude).toHaveBeenCalledTimes(4);
  });

  it('when quick:true without quickSampleSize, uses default of 5 tasks', async () => {
    // Dataset has 20 tasks, default quickSampleSize=5
    // Expected: 5 tasks × 1 trial × 2 branches = 10 calls
    mockLoadGoldenDataset.mockReturnValue(makeTaskArray(20));
    const quickConfig = { ...baseConfig, quick: true, trials: 1 };
    await runEval(quickConfig);
    expect(mockRunClaude).toHaveBeenCalledTimes(10);
  });

  it('when quick:false, runs with all tasks from dataset', async () => {
    // 5 tasks × 1 trial × 2 branches = 10 calls
    const config = { ...baseConfig, quick: false, trials: 1 };
    await runEval(config);
    expect(mockRunClaude).toHaveBeenCalledTimes(10);
  });

  it('when quick is not set, runs with all tasks from dataset', async () => {
    // no quick field → same as quick:false
    // 5 tasks × 1 trial × 2 branches = 10 calls
    await runEval(baseConfig);
    expect(mockRunClaude).toHaveBeenCalledTimes(10);
  });

  it('returns an ExperimentResult with all required fields', async () => {
    const result = await runEval(baseConfig);
    expect(result).toBeDefined();
    expect(result).toHaveProperty('experiment_id');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('hypothesis');
    expect(result).toHaveProperty('variant_description');
    expect(result).toHaveProperty('decision');
    expect(result).toHaveProperty('decision_rationale');
    expect(result).toHaveProperty('control_results');
    expect(result).toHaveProperty('variant_results');
    expect(result).toHaveProperty('per_task_comparison');
    expect(result).toHaveProperty('control_config');
    expect(result).toHaveProperty('variant_config');
    expect(result).toHaveProperty('dataset_version');
  });

  it('result.variant_description matches config.variantDescription', async () => {
    const result = await runEval(baseConfig);
    expect(result.variant_description).toBe(baseConfig.variantDescription);
  });

  it('result.hypothesis matches config.hypothesis', async () => {
    const result = await runEval(baseConfig);
    expect(result.hypothesis).toBe(baseConfig.hypothesis);
  });

  it('saves ExperimentResult to artifacts/reports/<id>.json via writeFile', async () => {
    await runEval(baseConfig);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [filePath] = mockWriteFile.mock.calls[0] as [string, string];
    expect(filePath).toContain('artifacts/reports/');
    expect(filePath).toMatch(/\.json$/);
  });

  it('saved JSON is parseable and contains the experiment_id', async () => {
    const result = await runEval(baseConfig);
    expect(mockWriteFile).toHaveBeenCalledTimes(1);
    const [, content] = mockWriteFile.mock.calls[0] as [string, string];
    const parsed = JSON.parse(content);
    expect(parsed.experiment_id).toBe(result.experiment_id);
    expect(parsed.decision).toBeDefined();
  });
});
