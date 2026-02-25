import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { createHash } from 'crypto';

const mockExecFile = jest.fn();
const mockReadFile = jest.fn();

jest.unstable_mockModule('node:child_process', () => ({
  execFile: mockExecFile,
}));

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

const {
  getCurrentBranch,
  createBranch,
  checkoutBranch,
  commitAll,
  getDiff,
  getChangedFiles,
  hashFiles,
  stash,
  stashPop,
} = await import('@/utils/git.js');

describe('Git Utilities', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getCurrentBranch', () => {
    it('returns trimmed branch name', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, 'main\n', '');
      });

      const result = await getCurrentBranch();

      expect(result).toBe('main');
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['rev-parse', '--abbrev-ref', 'HEAD'],
        expect.any(Function)
      );
    });

    it('rejects when execFile errors', async () => {
      const error = new Error('not a git repo');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', 'fatal: not a git repo');
      });

      await expect(getCurrentBranch()).rejects.toThrow('not a git repo');
    });
  });

  describe('createBranch', () => {
    it('calls git checkout -b with branch name', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await createBranch('feature/test');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['checkout', '-b', 'feature/test'],
        expect.any(Function)
      );
    });

    it('rejects when branch creation fails', async () => {
      const error = new Error('branch already exists');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

      await expect(createBranch('feature/test')).rejects.toThrow('branch already exists');
    });
  });

  describe('checkoutBranch', () => {
    it('calls git checkout with branch name', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await checkoutBranch('main');

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['checkout', 'main'],
        expect.any(Function)
      );
    });

    it('rejects when checkout fails', async () => {
      const error = new Error('branch not found');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

      await expect(checkoutBranch('nonexistent')).rejects.toThrow('branch not found');
    });
  });

  describe('commitAll', () => {
    it('calls git add -A then git commit with message', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await commitAll('my message');

      expect(mockExecFile).toHaveBeenCalledTimes(2);
      expect(mockExecFile).toHaveBeenNthCalledWith(
        1,
        'git',
        ['add', '-A'],
        expect.any(Function)
      );
      expect(mockExecFile).toHaveBeenNthCalledWith(
        2,
        'git',
        ['commit', '-m', 'my message'],
        expect.any(Function)
      );
    });

    it('rejects when git add fails', async () => {
      const error = new Error('git add failed');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

      await expect(commitAll('msg')).rejects.toThrow('git add failed');
    });
  });

  describe('getDiff', () => {
    it('returns stdout string from git diff', async () => {
      const diffOutput = 'diff --git a/file.ts b/file.ts\n+new line\n';
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, diffOutput, '');
      });

      const result = await getDiff('main');

      expect(result).toBe(diffOutput);
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['diff', 'main...HEAD'],
        expect.any(Function)
      );
    });

    it('rejects when git diff fails', async () => {
      const error = new Error('unknown revision');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

      await expect(getDiff('nonexistent')).rejects.toThrow('unknown revision');
    });
  });

  describe('getChangedFiles', () => {
    it('returns array of filenames split by newlines', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, 'src/a.ts\nsrc/b.ts\n', '');
      });

      const result = await getChangedFiles('main');

      expect(result).toEqual(['src/a.ts', 'src/b.ts']);
      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['diff', '--name-only', 'main...HEAD'],
        expect.any(Function)
      );
    });

    it('filters out empty strings', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, 'src/a.ts\n\nsrc/b.ts\n', '');
      });

      const result = await getChangedFiles('main');

      expect(result).toEqual(['src/a.ts', 'src/b.ts']);
    });

    it('returns empty array when no changed files', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      const result = await getChangedFiles('main');

      expect(result).toEqual([]);
    });
  });

  describe('hashFiles', () => {
    it('reads all files and returns deterministic SHA256 hex', async () => {
      const contentA = Buffer.from('content of a');
      const contentB = Buffer.from('content of b');

      mockReadFile
        .mockResolvedValueOnce(contentA as any)
        .mockResolvedValueOnce(contentB as any);

      const result = await hashFiles(['/a', '/b']);

      const expected = createHash('sha256')
        .update(contentA)
        .update(contentB)
        .digest('hex');

      expect(result).toBe(expected);
      expect(mockReadFile).toHaveBeenCalledWith('/a');
      expect(mockReadFile).toHaveBeenCalledWith('/b');
    });

    it('returns same hash for same file contents in same order', async () => {
      const content = Buffer.from('same content');
      mockReadFile.mockResolvedValue(content as any);

      const result1 = await hashFiles(['/file1']);
      mockReadFile.mockResolvedValue(content as any);
      const result2 = await hashFiles(['/file1']);

      expect(result1).toBe(result2);
    });
  });

  describe('stash', () => {
    it('calls git stash', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await stash();

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['stash'],
        expect.any(Function)
      );
    });

    it('rejects when git stash fails', async () => {
      const error = new Error('stash failed');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

      await expect(stash()).rejects.toThrow('stash failed');
    });
  });

  describe('stashPop', () => {
    it('calls git stash pop', async () => {
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(null, '', '');
      });

      await stashPop();

      expect(mockExecFile).toHaveBeenCalledWith(
        'git',
        ['stash', 'pop'],
        expect.any(Function)
      );
    });

    it('rejects when git stash pop fails', async () => {
      const error = new Error('no stash entries found');
      mockExecFile.mockImplementation((_file: unknown, _args: unknown, callback: any) => {
        callback(error, '', '');
      });

      await expect(stashPop()).rejects.toThrow('no stash entries found');
    });
  });
});
