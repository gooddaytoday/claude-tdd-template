import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { GoldenDatasetTask, VersionManifest } from '@/telemetry/schemas.js';
import type { TaskTrialResult } from '@/eval/runner.js';
import type { CompositeResult, CompositeConfig } from '@/eval/graders/composite.js';

const mockAddWorktree = jest.fn();
const mockRemoveWorktree = jest.fn();
const mockHashFiles = jest.fn();
const mockRunClaude = jest.fn();
const mockGradeComposite = jest.fn();

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

type RunnerModuleExtended = typeof import('@/eval/runner.js') & {
  snapshotManifest: (worktreePath: string, datasetVersion: string) => Promise<VersionManifest>;
  runTrialsOnBranch: (
    tasks: GoldenDatasetTask[],
    branch: string,
    config: any,
    worktreeBasePath: string,
  ) => Promise<TaskTrialResult[]>;
};

const { snapshotManifest, runTrialsOnBranch } =
  (await import('@/eval/runner.js')) as RunnerModuleExtended;

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

function makeTask(id: string): GoldenDatasetTask {
  return {
    id,
    description: `Description for task ${id}`,
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
    graders: ['test_runner', 'static_analysis'],
    difficulty: 'medium',
  };
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

const baseConfig = {
  datasetPath: 'datasets/golden-v1.jsonl',
  trials: 2,
  hypothesis: 'Test hypothesis',
  variantDescription: 'Test variant',
  controlBranch: 'main',
  variantBranch: 'feature/test',
  graderConfig: defaultGraderConfig,
  timeout: 5000,
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
// snapshotManifest
// ---------------------------------------------------------------------------

describe('snapshotManifest', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('exports snapshotManifest as a function', () => {
    expect(typeof snapshotManifest).toBe('function');
  });

  it('returns VersionManifest with the passed datasetVersion', async () => {
    mockHashFiles.mockResolvedValue('abc123hash');

    const result = await snapshotManifest('/my/worktree', 'v1.2.3');

    expect(result.dataset_version).toBe('v1.2.3');
  });

  it('returns VersionManifest with all required fields populated', async () => {
    mockHashFiles.mockResolvedValue('somehash');

    const result = await snapshotManifest('/my/worktree', 'v1');

    expect(result).toHaveProperty('agent_prompts_hash');
    expect(result).toHaveProperty('skill_hash');
    expect(result).toHaveProperty('hooks_hash');
    expect(result).toHaveProperty('settings_hash');
    expect(result).toHaveProperty('dataset_version', 'v1');
    expect(typeof result.agent_prompts_hash).toBe('string');
    expect(typeof result.skill_hash).toBe('string');
    expect(typeof result.hooks_hash).toBe('string');
    expect(typeof result.settings_hash).toBe('string');
  });

  it('calls hashFiles with paths prefixed by worktreePath', async () => {
    mockHashFiles.mockResolvedValue('anyhash');
    const worktreePath = '/path/to/my/worktree';

    await snapshotManifest(worktreePath, 'v1');

    expect(mockHashFiles).toHaveBeenCalled();
    const allCalls: unknown[][] = mockHashFiles.mock.calls;
    const allPaths = allCalls.flatMap((call) => call[0] as string[]);
    expect(allPaths.length).toBeGreaterThan(0);
    const allPrefixed = allPaths.every((p: string) => p.startsWith(worktreePath));
    expect(allPrefixed).toBe(true);
  });

  it('uses different paths for different worktrees', async () => {
    mockHashFiles.mockResolvedValue('somehash');

    await snapshotManifest('/worktree-a', 'v1');
    const callsA: unknown[][] = mockHashFiles.mock.calls;
    const pathsA = callsA.flatMap((c) => c[0] as string[]);

    jest.clearAllMocks();
    mockHashFiles.mockResolvedValue('somehash');

    await snapshotManifest('/worktree-b', 'v1');
    const callsB: unknown[][] = mockHashFiles.mock.calls;
    const pathsB = callsB.flatMap((c) => c[0] as string[]);

    expect(pathsA.some((p: string) => p.startsWith('/worktree-a'))).toBe(true);
    expect(pathsB.some((p: string) => p.startsWith('/worktree-b'))).toBe(true);
    expect(pathsA.some((p: string) => p.startsWith('/worktree-b'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// runTrialsOnBranch
// ---------------------------------------------------------------------------

describe('runTrialsOnBranch', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockAddWorktree.mockResolvedValue(undefined);
    mockRemoveWorktree.mockResolvedValue(undefined);
    mockRunClaude.mockResolvedValue({
      exitCode: 0,
      stdout: '',
      stderr: '',
      durationMs: 100,
    });
    mockGradeComposite.mockReturnValue(makeFakeCompositeResult(0.8));
  });

  it('exports runTrialsOnBranch as a function', () => {
    expect(typeof runTrialsOnBranch).toBe('function');
  });

  it('creates a worktree via addWorktree before running trials', async () => {
    const tasks = [makeTask('task-1')];

    await runTrialsOnBranch(tasks, 'feature/test', baseConfig, '/tmp/worktrees');

    expect(mockAddWorktree).toHaveBeenCalledTimes(1);
    const [worktreePath, branch] = mockAddWorktree.mock.calls[0] as [string, string];
    expect(worktreePath).toContain('/tmp/worktrees');
    expect(branch).toBe('feature/test');
  });

  it('runs runClaude once per task per trial (tasks × trials total calls)', async () => {
    const tasks = [makeTask('task-1'), makeTask('task-2')];
    const configWith3Trials = { ...baseConfig, trials: 3 };

    await runTrialsOnBranch(tasks, 'feature/test', configWith3Trials, '/tmp/worktrees');

    expect(mockRunClaude).toHaveBeenCalledTimes(tasks.length * configWith3Trials.trials);
  });

  it('returns TaskTrialResult[] with one entry per task per trial', async () => {
    const tasks = [makeTask('task-a'), makeTask('task-b')];
    const configWith2Trials = { ...baseConfig, trials: 2 };

    const results = await runTrialsOnBranch(
      tasks,
      'feature/test',
      configWith2Trials,
      '/tmp/worktrees',
    );

    expect(results).toHaveLength(tasks.length * configWith2Trials.trials);
  });

  it('each TaskTrialResult contains the correct task_id', async () => {
    const tasks = [makeTask('task-x'), makeTask('task-y')];

    const results = await runTrialsOnBranch(
      tasks,
      'feature/test',
      { ...baseConfig, trials: 1 },
      '/tmp/worktrees',
    );

    const taskIds = results.map((r) => r.task_id).sort();
    expect(taskIds).toEqual(['task-x', 'task-y']);
  });

  it('each TaskTrialResult.trial matches the trial index (0-based)', async () => {
    const tasks = [makeTask('task-1')];
    const configWith3Trials = { ...baseConfig, trials: 3 };

    const results = await runTrialsOnBranch(
      tasks,
      'feature/test',
      configWith3Trials,
      '/tmp/worktrees',
    );

    const trialNumbers = results.map((r) => r.trial).sort((a, b) => a - b);
    expect(trialNumbers).toEqual([0, 1, 2]);
  });

  it('each TaskTrialResult.claude_exit_code matches runClaude result exitCode', async () => {
    mockRunClaude.mockResolvedValue({ exitCode: 2, stdout: '', stderr: '', durationMs: 50 });
    const tasks = [makeTask('task-1')];

    const results = await runTrialsOnBranch(
      tasks,
      'feature/test',
      { ...baseConfig, trials: 1 },
      '/tmp/worktrees',
    );

    expect(results[0].claude_exit_code).toBe(2);
  });

  it('removes worktree via removeWorktree after successful run', async () => {
    const tasks = [makeTask('task-1')];

    await runTrialsOnBranch(tasks, 'feature/test', baseConfig, '/tmp/worktrees');

    expect(mockRemoveWorktree).toHaveBeenCalledTimes(1);
    const [removedPath] = mockRemoveWorktree.mock.calls[0] as [string];
    expect(removedPath).toContain('/tmp/worktrees');
  });

  it('removes the same worktree path that was created via addWorktree', async () => {
    const tasks = [makeTask('task-1')];

    await runTrialsOnBranch(tasks, 'feature/test', baseConfig, '/tmp/worktrees');

    const [addedPath] = mockAddWorktree.mock.calls[0] as [string, string];
    const [removedPath] = mockRemoveWorktree.mock.calls[0] as [string];
    expect(removedPath).toBe(addedPath);
  });

  it('removes worktree via removeWorktree even when runClaude throws', async () => {
    mockRunClaude.mockRejectedValue(new Error('claude CLI crashed'));
    const tasks = [makeTask('task-1')];

    let threw = false;
    try {
      await runTrialsOnBranch(tasks, 'feature/test', baseConfig, '/tmp/worktrees');
    } catch (_) {
      threw = true;
    }

    expect(threw).toBe(true);
    expect(mockRemoveWorktree).toHaveBeenCalledTimes(1);
  });
});
