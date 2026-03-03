import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ClaudeCliOptions } from '@/utils/claude-cli.js';

const mockSpawn = jest.fn();

jest.unstable_mockModule('child_process', () => ({
  spawn: mockSpawn
}));

// We must dynamically import the module after mocking
const { runClaude, buildPrompt } = await import('@/utils/claude-cli.js');

describe('Claude CLI Wrapper', () => {
  describe('runClaude', () => {
    let mockProcess: any;

    beforeEach(() => {
      jest.clearAllMocks();

      mockProcess = new EventEmitter();
      mockProcess.stdout = new PassThrough();
      mockProcess.stderr = new PassThrough();
      mockProcess.kill = jest.fn();

      mockSpawn.mockReturnValue(mockProcess);
    });

    it('spawns claude CLI with --print mode and basic options', async () => {
      const options: ClaudeCliOptions = {
        prompt: 'test prompt',
        workingDirectory: '/test/dir',
      };

      const resultPromise = runClaude(options);

      // Simulate process end
      mockProcess.stdout.end('mock output');
      mockProcess.stderr.end('');
      mockProcess.emit('close', 0);

      const result = await resultPromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        ['-p', 'test prompt'],
        expect.objectContaining({ cwd: '/test/dir' })
      );
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('mock output');
      expect(result.stderr).toBe('');
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('passes --max-turns when specified', async () => {
      const options: ClaudeCliOptions = {
        prompt: 'test',
        workingDirectory: '/test',
        maxTurns: 5,
      };

      const resultPromise = runClaude(options);
      mockProcess.stdout.end('');
      mockProcess.emit('close', 0);
      await resultPromise;

      expect(mockSpawn).toHaveBeenCalledWith(
        'claude',
        expect.arrayContaining(['--max-turns', '5']),
        expect.any(Object)
      );
    });

    it('handles non-zero exit codes without throwing', async () => {
      const options: ClaudeCliOptions = {
        prompt: 'test error',
        workingDirectory: '/test',
      };

      const resultPromise = runClaude(options);
      mockProcess.stderr.end('some error occurred');
      mockProcess.emit('close', 1);

      const result = await resultPromise;

      expect(result.exitCode).toBe(1);
      expect(result.stderr).toBe('some error occurred');
    });

    it('handles timeout and kills the process', async () => {
      const options: ClaudeCliOptions = {
        prompt: 'long task',
        workingDirectory: '/test',
        timeout: 100, // 100ms
      };

      const resultPromise = runClaude(options);

      // We don't close the process immediately. Wait for timeout.
      await new Promise(resolve => setTimeout(resolve, 150));

      // The promise should have rejected or returned with timeout error
      await expect(resultPromise).rejects.toThrow(/timeout/i);
      expect(mockProcess.kill).toHaveBeenCalled();
    });
  });

  describe('buildPrompt', () => {
    it('substitutes variables in mustache style', () => {
      const template = 'Hello {{name}}, you are {{age}} years old.';
      const variables = { name: 'Alice', age: '30' };

      const result = buildPrompt(template, variables);

      expect(result).toBe('Hello Alice, you are 30 years old.');
    });

    it('handles multiple occurrences of the same variable', () => {
      const template = '{{greeting}} Alice, {{greeting}} Bob!';
      const variables = { greeting: 'Hi' };

      const result = buildPrompt(template, variables);

      expect(result).toBe('Hi Alice, Hi Bob!');
    });
  });
});