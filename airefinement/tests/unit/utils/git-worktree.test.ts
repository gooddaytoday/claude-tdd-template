import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockExecFile = jest.fn();

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
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await addWorktree('/tmp/worktree-test', 'feature/my-branch');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'add', '/tmp/worktree-test', 'feature/my-branch'],
        expect.any(Function),
      );
    });

    it('resolves to undefined when execFile succeeds (exit 0)', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await expect(addWorktree('/tmp/worktree-success', 'main')).resolves.toBeUndefined();
    });

    it('rejects when execFile reports error', async () => {
      const error = new Error('fatal: worktree creation failed');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

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
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await removeWorktree('/tmp/worktree-to-remove');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['worktree', 'remove', '/tmp/worktree-to-remove', '--force'],
        expect.any(Function),
      );
    });

    it('resolves to undefined when execFile succeeds', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await expect(removeWorktree('/tmp/worktree-cleanup')).resolves.toBeUndefined();
    });

    it('rejects when execFile reports error', async () => {
      const error = new Error('fatal: worktree not found');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

      await expect(removeWorktree('/tmp/worktree-missing')).rejects.toThrow(
        'fatal: worktree not found',
      );
    });
  });
});
