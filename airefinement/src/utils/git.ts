import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

function execGit(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const options = {
      timeout: 30000, // 30 seconds
      maxBuffer: 1024 * 1024 * 10, // 10 MB
    };
    
    execFile('git', args, options, (error, stdout) => {
      if (error) {
        if (error.killed) {
          reject(new Error(`Git command timed out: git ${args.join(' ')}`));
        } else if (error.message && error.message.includes('maxBuffer')) {
          reject(new Error(`Git command output exceeded maxBuffer: git ${args.join(' ')}`));
        } else {
          reject(error);
        }
      } else {
        resolve(stdout);
      }
    });
  });
}

export async function getCurrentBranch(): Promise<string> {
  const stdout = await execGit(['rev-parse', '--abbrev-ref', 'HEAD']);
  return stdout.trim();
}

export async function createBranch(name: string): Promise<void> {
  await execGit(['checkout', '-b', name]);
}

export async function checkoutBranch(name: string): Promise<void> {
  await execGit(['checkout', name]);
}

export async function commitAll(message: string): Promise<void> {
  await execGit(['add', '-A']);
  await execGit(['commit', '-m', message]);
}

export async function getDiff(baseBranch: string): Promise<string> {
  return execGit(['diff', `${baseBranch}...HEAD`]);
}

export async function getChangedFiles(baseBranch: string): Promise<string[]> {
  const stdout = await execGit(['diff', '--name-only', `${baseBranch}...HEAD`]);
  return stdout.split('\n').filter((line) => line !== '');
}

export async function hashFiles(paths: string[]): Promise<string> {
  const hash = createHash('sha256');
  for (const p of paths) {
    const content = await readFile(p);
    hash.update(content);
  }
  return hash.digest('hex');
}

export async function stash(): Promise<void> {
  await execGit(['stash']);
}

export async function stashPop(): Promise<void> {
  await execGit(['stash', 'pop']);
}

export async function addWorktree(path: string, branch: string): Promise<void> {
  await execGit(['worktree', 'add', path, branch]);
}

export async function removeWorktree(path: string): Promise<void> {
  await execGit(['worktree', 'remove', path, '--force']);
}
