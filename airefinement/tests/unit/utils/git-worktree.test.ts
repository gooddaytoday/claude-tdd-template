import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockExecFile = jest.fn();
const EXEC_GIT_OPTIONS = {
  timeout: 30000,
  maxBuffer: 1024 * 1024 * 10,
};

type ExecFileCallback = (error: Error | null, stdout: string, stderr: string) => void;

function resolveExecFileCallback(maybeOptions: unknown, maybeCallback: unknown): ExecFileCallback {
  if (typeof maybeOptions === 'function') {
    return maybeOptions as ExecFileCallback;
  }
  if (typeof maybeCallback === 'function') {
    return maybeCallback as ExecFileCallback;
  }
  throw new TypeError('callback is not a function');
}

function mockExecSuccess(stdout = '', stderr = ''): void {
  mockExecFile.mockImplementation(
    (_file: unknown, _args: unknown, maybeOptions: unknown, maybeCallback: unknown) => {
      const callback = resolveExecFileCallback(maybeOptions, maybeCallback);
      callback(null, stdout, stderr);
    }
  );
}

function mockExecFailure(error: Error, stdout = '', stderr = ''): void {
  mockExecFile.mockImplementation(
    (_file: unknown, _args: unknown, maybeOptions: unknown, maybeCallback: unknown) => {
      const callback = resolveExecFileCallback(maybeOptions, maybeCallback);
      callback(error, stdout, stderr);
    }
  );
}

jest.unstable_mockModule('node:child_process', () => ({
  execFile: mockExecFile,
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: jest.fn(),
}));

type GitModuleWithWorktree = typeof import('@/utils/git.js') & {
  addWorktree: (path: string, branch: string) => Promise<void>;
  removeWorktree: (path: string) => Promise<void>;
};

const { addWorktree, removeWorktree } = (await import('@/utils/git.js')) as GitModuleWithWorktree;

describe('Git Worktree Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('addWorktree', () => {
    it('exports addWorktree as a function', () => {
      expect(typeof addWorktree).toBe('function');
    });

    it('calls git worktree add <path> <branch>', async () => {
      mockExecSuccess();

      await addWorktree('/tmp/worktree-test', 'feature/my-branch');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '/tmp/worktree-test', 'feature/my-branch'],
        expect.objectContaining(EXEC_GIT_OPTIONS),
        expect.any(Function),
      );
    });

    it('resolves to undefined when execFile succeeds (exit 0)', async () => {
      mockExecSuccess();

      await expect(addWorktree('/tmp/worktree-success', 'main')).resolves.toBeUndefined();
    });

    it('rejects when execFile reports error', async () => {
      const error = new Error('fatal: worktree creation failed');
      mockExecFailure(error);

      await expect(addWorktree('/tmp/worktree-fail', 'main')).rejects.toThrow(
        'fatal: worktree creation failed',
      );
    });
  });

  describe('removeWorktree', () => {
    it('exports removeWorktree as a function', () => {
      expect(typeof removeWorktree).toBe('function');
    });

    it('calls git worktree remove <path> --force', async () => {
      mockExecSuccess();

      await removeWorktree('/tmp/worktree-to-remove');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/tmp/worktree-to-remove', '--force'],
        expect.objectContaining(EXEC_GIT_OPTIONS),
        expect.any(Function),
      );
    });

    it('resolves to undefined when execFile succeeds', async () => {
      mockExecSuccess();

      await expect(removeWorktree('/tmp/worktree-cleanup')).resolves.toBeUndefined();
    });

    it('rejects when execFile reports error', async () => {
      const error = new Error('fatal: worktree not found');
      mockExecFailure(error);

      await expect(removeWorktree('/tmp/worktree-missing')).rejects.toThrow(
        'fatal: worktree not found',
      );
    });
  });
});
