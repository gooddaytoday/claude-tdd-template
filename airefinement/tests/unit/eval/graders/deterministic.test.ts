import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockExecFile = jest.fn();
const mockReadFile = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  execFile: mockExecFile,
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

const {
  gradeTestRunner,
  gradeStaticAnalysis,
  gradeTestMutation,
  gradeGuardCompliance,
} = await import('@/eval/graders/deterministic.js');

const baseInput = {
  workingDirectory: '/project',
  testCommand: 'npm test',
  testFiles: ['tests/unit/foo.test.ts', 'tests/integration/bar.test.ts'],
  implFiles: ['src/foo.ts'],
  baseCommit: 'abc123',
};

describe('Deterministic Graders', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('gradeTestRunner', () => {
    it('returns score 1.0 and pass true when exit code is 0', async () => {
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, 'All tests passed', '');
      });

      const result = await gradeTestRunner(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
    });

    it('returns score 0.0 and pass false when exit code is non-zero', async () => {
      const error = Object.assign(new Error('Command failed'), { code: 1 });
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(error, 'some output', '');
      });

      const result = await gradeTestRunner(baseInput);

      expect(result.score).toBe(0.0);
      expect(result.pass).toBe(false);
    });

    it('truncates stdout to 1000 chars in outputExcerpt', async () => {
      const longOutput = 'x'.repeat(2000);
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, longOutput, '');
      });

      const result = await gradeTestRunner(baseInput);

      expect(result.details.outputExcerpt).toHaveLength(1000);
    });

    it('includes exitCode in details when test passes', async () => {
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, 'ok', '');
      });

      const result = await gradeTestRunner(baseInput);

      expect(result.details.exitCode).toBe(0);
    });

    it('includes exitCode in details when test fails', async () => {
      const error = Object.assign(new Error('failed'), { code: 2 });
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(error, '', '');
      });

      const result = await gradeTestRunner(baseInput);

      expect(result.details.exitCode).toBe(2);
    });

    it('sets grader field to TestRunnerGrader', async () => {
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, '', '');
      });

      const result = await gradeTestRunner(baseInput);

      expect(result.grader).toBe('TestRunnerGrader');
    });
  });

  describe('gradeStaticAnalysis', () => {
    it('returns score 1.0 when no tsc errors or warnings', async () => {
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, '', '');
      });

      const result = await gradeStaticAnalysis(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.details.errorCount).toBe(0);
      expect(result.details.warningCount).toBe(0);
    });

    it('returns score 0.5 when only warnings present (pass true)', async () => {
      const output = 'src/foo.ts(1,1): warning TS6133: variable is declared but never read\n';
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, output, '');
      });

      const result = await gradeStaticAnalysis(baseInput);

      expect(result.score).toBe(0.5);
      expect(result.pass).toBe(true);
      expect(result.details.warningCount).toBe(1);
      expect(result.details.errorCount).toBe(0);
    });

    it('returns score 0.0 and pass false when errors present', async () => {
      const output =
        'src/foo.ts(1,1): error TS2304: Cannot find name\n' +
        'src/bar.ts(2,5): error TS2551: Did you mean\n';
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, output, '');
      });

      const result = await gradeStaticAnalysis(baseInput);

      expect(result.score).toBe(0.0);
      expect(result.pass).toBe(false);
      expect(result.details.errorCount).toBe(2);
    });

    it('returns score 1.0 with skipped true when execFile fails (tsc not found)', async () => {
      const error = new Error('tsc: command not found');
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(error, '', '');
      });

      const result = await gradeStaticAnalysis(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.details.skipped).toBe(true);
      expect(result.details.errorCount).toBe(0);
      expect(result.details.warningCount).toBe(0);
    });

    it('sets grader field to StaticAnalysisGrader', async () => {
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, '', '');
      });

      const result = await gradeStaticAnalysis(baseInput);

      expect(result.grader).toBe('StaticAnalysisGrader');
    });
  });

  describe('gradeTestMutation', () => {
    it('returns score 1.0 when no test files were modified', async () => {
      const diffOutput = 'src/foo.ts\nsrc/bar.ts\n';
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, diffOutput, '');
      });

      const result = await gradeTestMutation(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.details.modifiedTestFiles).toEqual([]);
    });

    it('returns score 0.0 when a test file was modified', async () => {
      const diffOutput = 'src/foo.ts\ntests/unit/foo.test.ts\n';
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, diffOutput, '');
      });

      const result = await gradeTestMutation(baseInput);

      expect(result.score).toBe(0.0);
      expect(result.pass).toBe(false);
      expect(result.details.modifiedTestFiles).toContain('tests/unit/foo.test.ts');
    });

    it('returns score 1.0 when git diff output contains only non-test files', async () => {
      const diffOutput = 'src/impl.ts\nsrc/helpers.ts\n';
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, diffOutput, '');
      });

      const result = await gradeTestMutation(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.details.modifiedTestFiles).toHaveLength(0);
    });

    it('runs git diff with baseCommit in correct format', async () => {
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, '', '');
      });

      await gradeTestMutation(baseInput);

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-only', 'abc123...HEAD'],
        expect.anything(),
        expect.any(Function)
      );
    });

    it('sets grader field to TestMutationGrader', async () => {
      mockExecFile.mockImplementation((...args: any[]) => {
        const callback = args[args.length - 1];
        callback(null, '', '');
      });

      const result = await gradeTestMutation(baseInput);

      expect(result.grader).toBe('TestMutationGrader');
    });
  });

  describe('gradeGuardCompliance', () => {
    it('returns score 1.0 when violations.jsonl does not exist', async () => {
      const error = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
      mockReadFile.mockRejectedValue(error);

      const result = await gradeGuardCompliance(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.details.violationCount).toBe(0);
      expect(result.details.violations).toEqual([]);
    });

    it('returns score 1.0 when violations.jsonl is empty', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await gradeGuardCompliance(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.details.violationCount).toBe(0);
    });

    it('returns score 0.0 when violations with blocked: true exist', async () => {
      const violation = JSON.stringify({
        timestamp: '2026-02-25T10:00:00Z',
        agent: 'tdd-implementer',
        attempted_action: 'Write',
        target_file: 'tests/unit/foo.test.ts',
        blocked: true,
        reason: 'Test files cannot be modified in GREEN phase',
      });
      mockReadFile.mockResolvedValue(violation + '\n');

      const result = await gradeGuardCompliance(baseInput);

      expect(result.score).toBe(0.0);
      expect(result.pass).toBe(false);
      expect(result.details.violationCount).toBe(1);
    });

    it('returns score 1.0 when all violations have blocked: false', async () => {
      const violation = JSON.stringify({
        timestamp: '2026-02-25T10:00:00Z',
        agent: 'tdd-implementer',
        attempted_action: 'Write',
        target_file: 'src/foo.ts',
        blocked: false,
        reason: '',
      });
      mockReadFile.mockResolvedValue(violation + '\n');

      const result = await gradeGuardCompliance(baseInput);

      expect(result.score).toBe(1.0);
      expect(result.pass).toBe(true);
      expect(result.details.violationCount).toBe(0);
    });

    it('counts only entries with blocked: true when mixed violations exist', async () => {
      const blockedViolation = JSON.stringify({
        timestamp: '2026-02-25T10:00:00Z',
        agent: 'tdd-implementer',
        attempted_action: 'Write',
        target_file: 'tests/unit/foo.test.ts',
        blocked: true,
        reason: 'Not allowed',
      });
      const allowedViolation = JSON.stringify({
        timestamp: '2026-02-25T10:01:00Z',
        agent: 'main',
        attempted_action: 'Write',
        target_file: 'src/bar.ts',
        blocked: false,
        reason: '',
      });
      mockReadFile.mockResolvedValue(blockedViolation + '\n' + allowedViolation + '\n');

      const result = await gradeGuardCompliance(baseInput);

      expect(result.details.violationCount).toBe(1);
      expect(result.score).toBe(0.0);
    });

    it('reads from correct violations.jsonl path', async () => {
      mockReadFile.mockResolvedValue('');

      await gradeGuardCompliance(baseInput);

      expect(mockReadFile).toHaveBeenCalledWith(
        '/project/artifacts/traces/violations.jsonl',
        'utf-8'
      );
    });

    it('sets grader field to GuardComplianceGrader', async () => {
      mockReadFile.mockResolvedValue('');

      const result = await gradeGuardCompliance(baseInput);

      expect(result.grader).toBe('GuardComplianceGrader');
    });
  });
});
