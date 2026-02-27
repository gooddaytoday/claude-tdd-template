import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { AnalysisResult, RunReport, TriggerResult } from '@/telemetry/schemas.js';

const mockGetCurrentBranch = jest.fn<() => Promise<string>>();
const mockCreateBranch = jest.fn<(branch: string) => Promise<void>>();
const mockCommitAll = jest.fn<(message: string) => Promise<void>>();
const mockGetChangedFiles = jest.fn<(branch: string) => Promise<string[]>>();

const mockRunClaude = jest.fn<(opts: { prompt: string; workingDirectory: string; maxTurns: number }) => Promise<{ exitCode: number; stdout: string; stderr: string; durationMs: number }>>();
const mockBuildDiagnosisPrompt = jest.fn<(input: unknown) => string>();

jest.unstable_mockModule('@/utils/git.js', () => ({
  getCurrentBranch: mockGetCurrentBranch,
  createBranch: mockCreateBranch,
  commitAll: mockCommitAll,
  getChangedFiles: mockGetChangedFiles,
  checkoutBranch: jest.fn(),
  getDiff: jest.fn(),
  hashFiles: jest.fn(),
  stash: jest.fn(),
  stashPop: jest.fn(),
}));

jest.unstable_mockModule('@/utils/claude-cli.js', () => ({
  runClaude: mockRunClaude,
  buildPrompt: jest.fn(),
}));

jest.unstable_mockModule('@/refinement/prompt-templates.js', () => ({
  buildDiagnosisPrompt: mockBuildDiagnosisPrompt,
  DIAGNOSIS_PROMPT: '',
  ALLOWED_MODIFICATION_PATHS: [],
}));

const { generateExperimentId, runRefinement } = await import('@/refinement/agent-runner.js');

const makeTrigger = (rule: string, description = 'some issue'): TriggerResult => ({
  type: 'event_driven',
  rule,
  severity: 'critical',
  description,
  evidence: {},
});

const makeAnalysis = (triggers: TriggerResult[] = []): AnalysisResult => ({
  timestamp: '2024-01-01T00:00:00Z',
  runs_analyzed: 5,
  traces_analyzed: 10,
  triggers_fired: triggers,
  recommendation: 'refine',
  summary: 'Test summary',
});

const makeRunReport = (): RunReport => ({
  run_id: 'run-1',
  timestamp: '2024-01-01T00:00:00Z',
  task_id: 'task-1',
  subtask_id: 'sub-1',
  feature: 'test-feature',
  test_type: 'unit',
  phases: [],
  fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
  guard_violations: [],
  overall_status: 'FAILED',
  partial_credit_score: 0,
});

const makeInput = (triggers: TriggerResult[] = []) => ({
  analysis: makeAnalysis(triggers),
  failedRunReports: [makeRunReport()],
  currentAgentPrompts: { 'tdd-implementer': 'Implement minimal code' },
  currentPolicies: { 'guard-rules.md': 'No test modification in GREEN phase' },
});

describe('agent-runner', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockGetCurrentBranch.mockResolvedValue('main');
    mockCreateBranch.mockResolvedValue(undefined);
    mockCommitAll.mockResolvedValue(undefined);
    mockGetChangedFiles.mockResolvedValue(['src/foo.ts', 'src/bar.ts']);
    mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: 'Claude output', stderr: '', durationMs: 1000 });
    mockBuildDiagnosisPrompt.mockReturnValue('built prompt string');
  });

  describe('generateExperimentId', () => {
    it('returns string starting with "exp-"', () => {
      const id = generateExperimentId(makeAnalysis());
      expect(id).toMatch(/^exp-/);
    });

    it('includes today\'s date in YYYY-MM-DD format', () => {
      const today = new Date().toISOString().slice(0, 10);
      const id = generateExperimentId(makeAnalysis());
      expect(id).toContain(today);
    });

    it('uses trigger rule as short description when triggers exist', () => {
      const analysis = makeAnalysis([makeTrigger('guard violation')]);
      const id = generateExperimentId(analysis);
      // Rule 'guard violation' → lowercased, spaces → dashes
      expect(id).toContain('guard-violation');
    });

    it('uses "general" as description when no triggers', () => {
      const id = generateExperimentId(makeAnalysis([]));
      expect(id).toContain('general');
    });

    it('normalizes special characters in trigger rule to dashes', () => {
      const analysis = makeAnalysis([makeTrigger('TSR Drop! @Critical')]);
      const id = generateExperimentId(analysis);
      // Special chars and spaces → dashes, lowercased
      expect(id).toMatch(/exp-\d{4}-\d{2}-\d{2}-[a-z0-9-]+/);
      expect(id).not.toMatch(/[!@\s]/);
    });

    it('limits short description length to roughly 20 chars', () => {
      const longRule = 'very long rule name that exceeds twenty characters by a lot';
      const analysis = makeAnalysis([makeTrigger(longRule)]);
      const id = generateExperimentId(analysis);
      // Format: exp-YYYY-MM-DD-<slug> — slug should be reasonably short
      expect(id).toMatch(/^exp-\d{4}-\d{2}-\d{2}-.+/);
      const parts = id.split('-');
      // After 'exp', 'YYYY', 'MM', 'DD', rest is slug
      const slug = parts.slice(4).join('-');
      expect(slug.length).toBeGreaterThan(0);
      expect(slug.length).toBeLessThanOrEqual(25);
    });

    it('uses only the first trigger rule when multiple triggers exist', () => {
      const analysis = makeAnalysis([
        makeTrigger('first-rule'),
        makeTrigger('second-rule'),
      ]);
      const id = generateExperimentId(analysis);
      expect(id).toContain('first-rule');
      expect(id).not.toContain('second-rule');
    });
  });

  describe('runRefinement', () => {
    it('calls getCurrentBranch to save original branch', async () => {
      await runRefinement(makeInput());
      expect(mockGetCurrentBranch).toHaveBeenCalledTimes(1);
    });

    it('creates branch named "refinement/<experiment-id>"', async () => {
      await runRefinement(makeInput());
      expect(mockCreateBranch).toHaveBeenCalledTimes(1);
      const branchName = mockCreateBranch.mock.calls[0][0] as string;
      expect(branchName).toMatch(/^refinement\/exp-\d{4}-\d{2}-\d{2}-/);
    });

    it('calls buildDiagnosisPrompt with combined input and experimentId', async () => {
      const input = makeInput();
      await runRefinement(input);
      expect(mockBuildDiagnosisPrompt).toHaveBeenCalledTimes(1);
      const arg = mockBuildDiagnosisPrompt.mock.calls[0][0] as Record<string, unknown>;
      expect(arg).toMatchObject({
        analysis: input.analysis,
        failedRunReports: input.failedRunReports,
        currentAgentPrompts: input.currentAgentPrompts,
        currentPolicies: input.currentPolicies,
      });
      expect(typeof arg.experimentId).toBe('string');
      expect((arg.experimentId as string)).toMatch(/^exp-/);
    });

    it('calls runClaude with built prompt and maxTurns: 10', async () => {
      await runRefinement(makeInput());
      expect(mockRunClaude).toHaveBeenCalledTimes(1);
      const opts = mockRunClaude.mock.calls[0][0] as Record<string, unknown>;
      expect(opts.prompt).toBe('built prompt string');
      expect(opts.maxTurns).toBe(10);
    });

    it('calls getChangedFiles with the original branch name', async () => {
      mockGetCurrentBranch.mockResolvedValue('feature/some-branch');
      await runRefinement(makeInput());
      expect(mockGetChangedFiles).toHaveBeenCalledWith('feature/some-branch');
    });

    it('calls commitAll with message containing experiment ID', async () => {
      await runRefinement(makeInput());
      expect(mockCommitAll).toHaveBeenCalledTimes(1);
      const message = mockCommitAll.mock.calls[0][0] as string;
      expect(message).toMatch(/refinement\(exp-\d{4}-\d{2}-\d{2}-[a-z0-9-]+\):/);
    });

    it('returns RefinementOutput with experimentBranch matching created branch', async () => {
      const result = await runRefinement(makeInput());
      expect(result.experimentBranch).toMatch(/^refinement\/exp-\d{4}-\d{2}-\d{2}-/);
      expect(result.experimentBranch).toBe(mockCreateBranch.mock.calls[0][0]);
    });

    it('returns RefinementOutput with changedFiles from getChangedFiles', async () => {
      const result = await runRefinement(makeInput());
      expect(result.changedFiles).toEqual(['src/foo.ts', 'src/bar.ts']);
    });

    it('returns RefinementOutput with agentStdout from runClaude', async () => {
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: 'Claude did some work', stderr: '', durationMs: 500 });
      const result = await runRefinement(makeInput());
      expect(result.agentStdout).toBe('Claude did some work');
    });

    it('returns RefinementOutput with commitHash as empty string', async () => {
      const result = await runRefinement(makeInput());
      expect(result.commitHash).toBe('');
    });

    it('throws Error when runClaude exits with non-zero code', async () => {
      mockRunClaude.mockResolvedValue({
        exitCode: 1,
        stdout: 'Claude partial output',
        stderr: 'some error',
        durationMs: 500,
      });
      await expect(runRefinement(makeInput())).rejects.toThrow();
    });

    it('includes agentStdout in error message when runClaude fails', async () => {
      mockRunClaude.mockResolvedValue({
        exitCode: 1,
        stdout: 'partial output here',
        stderr: 'fatal error',
        durationMs: 500,
      });
      await expect(runRefinement(makeInput())).rejects.toThrow(/partial output here|fatal error/);
    });

    it('handles empty changedFiles when Claude made no changes', async () => {
      mockGetChangedFiles.mockResolvedValue([]);
      const result = await runRefinement(makeInput());
      expect(result.changedFiles).toEqual([]);
      expect(result.experimentBranch).toMatch(/^refinement\//);
    });

    it('creates branch before calling runClaude', async () => {
      const callOrder: string[] = [];
      mockCreateBranch.mockImplementation(async () => { callOrder.push('createBranch'); });
      mockRunClaude.mockImplementation(async () => { callOrder.push('runClaude'); return { exitCode: 0, stdout: '', stderr: '', durationMs: 0 }; });

      await runRefinement(makeInput());

      const createIdx = callOrder.indexOf('createBranch');
      const runIdx = callOrder.indexOf('runClaude');
      expect(createIdx).toBeLessThan(runIdx);
    });

    it('calls commitAll after getChangedFiles', async () => {
      const callOrder: string[] = [];
      mockGetChangedFiles.mockImplementation(async () => { callOrder.push('getChangedFiles'); return []; });
      mockCommitAll.mockImplementation(async () => { callOrder.push('commitAll'); });

      await runRefinement(makeInput());

      const changedIdx = callOrder.indexOf('getChangedFiles');
      const commitIdx = callOrder.indexOf('commitAll');
      expect(changedIdx).toBeLessThan(commitIdx);
    });
  });

  describe('validateModifiedFiles', () => {
    let validateModifiedFilesFn: (files: string[]) => { valid: boolean; violations: string[] };
    let allowedPaths: string[];

    beforeAll(async () => {
      const runner = await import('@/refinement/agent-runner.js');
      validateModifiedFilesFn = (runner as any).validateModifiedFiles;
      const templates = await import('@/refinement/prompt-templates.js') as any;
      allowedPaths = templates.ALLOWED_MODIFICATION_PATHS;
    });

    beforeEach(() => {
      allowedPaths.length = 0;
      allowedPaths.push('.claude/agents/', '.claude/skills/', '.claude/hooks/');
    });

    afterEach(() => {
      allowedPaths.length = 0;
    });

    it('returns { valid: true, violations: [] } for empty array', () => {
      expect(validateModifiedFilesFn([])).toEqual({ valid: true, violations: [] });
    });

    it('returns { valid: true } for file in .claude/agents/', () => {
      expect(validateModifiedFilesFn(['.claude/agents/foo.md'])).toEqual({ valid: true, violations: [] });
    });

    it('returns { valid: true } for file deep in .claude/skills/', () => {
      expect(validateModifiedFilesFn(['.claude/skills/tdd-integration/phases/red.md'])).toEqual({ valid: true, violations: [] });
    });

    it('returns { valid: true } for file in .claude/hooks/', () => {
      expect(validateModifiedFilesFn(['.claude/hooks/prevent-test-edit.ts'])).toEqual({ valid: true, violations: [] });
    });

    it('returns { valid: false, violations: [file] } for out-of-scope file', () => {
      expect(validateModifiedFilesFn(['src/something.ts'])).toEqual({
        valid: false,
        violations: ['src/something.ts'],
      });
    });

    it('returns { valid: false, violations: [file] } for test file', () => {
      expect(validateModifiedFilesFn(['tests/test.ts'])).toEqual({
        valid: false,
        violations: ['tests/test.ts'],
      });
    });

    it('returns { valid: false } with only invalid files in violations for mixed input', () => {
      const result = validateModifiedFilesFn([
        '.claude/agents/foo.md',
        'src/bar.ts',
        '.claude/skills/x.md',
        'tests/y.ts',
      ]);
      expect(result).toEqual({
        valid: false,
        violations: ['src/bar.ts', 'tests/y.ts'],
      });
    });
  });

  describe('ScopeViolationError', () => {
    let ScopeViolationErrorClass: new (violations: string[]) => Error & { violations: string[] };

    beforeAll(async () => {
      const runner = await import('@/refinement/agent-runner.js');
      ScopeViolationErrorClass = (runner as any).ScopeViolationError;
    });

    it('is an instance of Error', () => {
      const err = new ScopeViolationErrorClass(['src/foo.ts']);
      expect(err).toBeInstanceOf(Error);
    });

    it('has violations property containing the violating files', () => {
      const err = new ScopeViolationErrorClass(['src/foo.ts', 'tests/bar.ts']);
      expect(err.violations).toEqual(['src/foo.ts', 'tests/bar.ts']);
    });

    it('includes violation file info in message', () => {
      const err = new ScopeViolationErrorClass(['src/foo.ts']);
      expect(err.message).toContain('src/foo.ts');
    });
  });

  describe('runRefinement - scope validation', () => {
    let ScopeViolationErrorClass: new (violations: string[]) => Error & { violations: string[] };
    let allowedPaths: string[];
    let mockCheckoutBranchFn: jest.Mock;

    beforeAll(async () => {
      const runner = await import('@/refinement/agent-runner.js');
      ScopeViolationErrorClass = (runner as any).ScopeViolationError;
      const templates = await import('@/refinement/prompt-templates.js') as any;
      allowedPaths = templates.ALLOWED_MODIFICATION_PATHS;
      const gitMock = await import('@/utils/git.js') as any;
      mockCheckoutBranchFn = gitMock.checkoutBranch;
    });

    beforeEach(() => {
      jest.clearAllMocks();
      mockGetCurrentBranch.mockResolvedValue('main');
      mockCreateBranch.mockResolvedValue(undefined);
      mockCommitAll.mockResolvedValue(undefined);
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: 'Claude output', stderr: '', durationMs: 1000 });
      mockBuildDiagnosisPrompt.mockReturnValue('built prompt string');
      allowedPaths.length = 0;
      allowedPaths.push('.claude/agents/', '.claude/skills/', '.claude/hooks/');
    });

    afterEach(() => {
      allowedPaths.length = 0;
    });

    it('does NOT call commitAll when changed files are out of scope', async () => {
      mockGetChangedFiles.mockResolvedValue(['src/foo.ts', 'src/bar.ts']);
      await expect(runRefinement(makeInput())).rejects.toThrow();
      expect(mockCommitAll).not.toHaveBeenCalled();
    });

    it('calls checkoutBranch(originalBranch) when scope violation is detected', async () => {
      mockGetCurrentBranch.mockResolvedValue('feature/my-branch');
      mockGetChangedFiles.mockResolvedValue(['src/out-of-scope.ts']);
      await expect(runRefinement(makeInput())).rejects.toThrow();
      expect(mockCheckoutBranchFn).toHaveBeenCalledWith('feature/my-branch');
    });

    it('throws ScopeViolationError when files are outside allowed paths', async () => {
      mockGetChangedFiles.mockResolvedValue(['src/foo.ts']);
      await expect(runRefinement(makeInput())).rejects.toBeInstanceOf(ScopeViolationErrorClass);
    });

    it('ScopeViolationError.violations contains the violating files', async () => {
      mockGetChangedFiles.mockResolvedValue(['src/foo.ts', 'tests/bar.ts']);
      let caughtError: (Error & { violations?: string[] }) | undefined;
      try {
        await runRefinement(makeInput());
      } catch (err) {
        caughtError = err as Error & { violations?: string[] };
      }
      expect(caughtError?.violations).toEqual(['src/foo.ts', 'tests/bar.ts']);
    });

    it('calls commitAll normally when all changed files are within allowed paths', async () => {
      mockGetChangedFiles.mockResolvedValue(['.claude/agents/foo.md', '.claude/skills/x.md']);
      await runRefinement(makeInput());
      expect(mockCommitAll).toHaveBeenCalledTimes(1);
    });

    it('validates the files returned by getChangedFiles (out-of-scope triggers ScopeViolationError)', async () => {
      mockGetChangedFiles.mockResolvedValue(['src/implementation.ts']);
      await expect(runRefinement(makeInput())).rejects.toBeInstanceOf(ScopeViolationErrorClass);
    });
  });
});
