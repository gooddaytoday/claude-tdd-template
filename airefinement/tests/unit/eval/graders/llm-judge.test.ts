import { jest, describe, it, expect, beforeEach } from '@jest/globals';

const mockReadFile = jest.fn();
const mockRunClaude = jest.fn();

jest.unstable_mockModule('node:fs/promises', () => ({
  readFile: mockReadFile,
}));

jest.unstable_mockModule('@/utils/claude-cli.js', () => ({
  runClaude: mockRunClaude,
}));

const { evaluateWithLlmJudge } = await import('@/eval/graders/llm-judge.js');

const RUBRIC_CONTENT = `# Test Writer Quality Rubric

## Dimensions

### Clarity (0-2)
...

### Edge Cases (0-2)
...

### Assertions (0-2)
...

### Independence (0-2)
...
`;

const BASE_INPUT = {
  rubricPath: '/rubrics/test-writer-quality.md',
  codeToEvaluate: 'function add(a, b) { return a + b; }',
};

describe('evaluateWithLlmJudge', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockReadFile.mockResolvedValue(RUBRIC_CONTENT);
  });

  describe('successful evaluation', () => {
    it('returns GraderResult with grader LlmJudgeGrader on success', async () => {
      const jsonResponse = JSON.stringify({
        clarity: 2,
        edges: 1,
        assertions: 2,
        independence: 1,
        total: 6,
        rationale: 'Good tests overall',
      });
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: jsonResponse, stderr: '', durationMs: 100 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.grader).toBe('LlmJudgeGrader');
    });

    it('normalizes score: total=6 with 4 dimensions -> score=0.75', async () => {
      const jsonResponse = JSON.stringify({
        clarity: 2,
        edges: 1,
        assertions: 2,
        independence: 1,
        total: 6,
        rationale: 'Good tests overall',
      });
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: jsonResponse, stderr: '', durationMs: 100 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.score).toBe(0.75);
    });

    it('sets pass=true when normalized score >= 0.5', async () => {
      const jsonResponse = JSON.stringify({
        clarity: 2,
        edges: 1,
        assertions: 2,
        independence: 1,
        total: 6,
        rationale: 'Good',
      });
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: jsonResponse, stderr: '', durationMs: 100 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.pass).toBe(true);
    });

    it('sets pass=false when normalized score < 0.5', async () => {
      const jsonResponse = JSON.stringify({
        clarity: 0,
        edges: 1,
        assertions: 0,
        independence: 0,
        total: 1,
        rationale: 'Very poor',
      });
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: jsonResponse, stderr: '', durationMs: 100 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.score).toBeLessThan(0.5);
      expect(result.pass).toBe(false);
    });

    it('populates details.rationale from JSON response', async () => {
      const jsonResponse = JSON.stringify({
        clarity: 2,
        edges: 2,
        total: 4,
        rationale: 'Excellent coverage and clarity',
      });
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: jsonResponse, stderr: '', durationMs: 100 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.details.rationale).toBe('Excellent coverage and clarity');
    });

    it('populates details.rawResponse with Claude stdout', async () => {
      const jsonResponse = JSON.stringify({
        clarity: 1,
        total: 1,
        rationale: 'Ok',
      });
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: jsonResponse, stderr: '', durationMs: 100 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.details.rawResponse).toBe(jsonResponse);
    });
  });

  describe('JSON in markdown code block', () => {
    it('parses JSON wrapped in ```json...``` block', async () => {
      const jsonData = {
        clarity: 2,
        edges: 2,
        assertions: 1,
        independence: 1,
        total: 6,
        rationale: 'Good job',
      };
      const wrappedResponse = '```json\n' + JSON.stringify(jsonData) + '\n```';
      mockRunClaude.mockResolvedValue({ exitCode: 0, stdout: wrappedResponse, stderr: '', durationMs: 100 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.grader).toBe('LlmJudgeGrader');
      expect(result.score).toBe(0.75);
      expect(result.details.rationale).toBe('Good job');
    });
  });

  describe('calls runClaude correctly', () => {
    it('calls runClaude with maxTurns: 1', async () => {
      mockRunClaude.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ clarity: 1, total: 1, rationale: 'ok' }),
        stderr: '',
        durationMs: 100,
      });

      await evaluateWithLlmJudge(BASE_INPUT);

      expect(mockRunClaude).toHaveBeenCalledWith(
        expect.objectContaining({ maxTurns: 1 })
      );
    });

    it('includes rubric content in the assembled prompt', async () => {
      mockRunClaude.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ clarity: 1, total: 1, rationale: 'ok' }),
        stderr: '',
        durationMs: 100,
      });

      await evaluateWithLlmJudge(BASE_INPUT);

      const calledOptions = (mockRunClaude as jest.Mock).mock.calls[0][0] as { prompt: string };
      expect(calledOptions.prompt).toContain(RUBRIC_CONTENT);
    });

    it('includes codeToEvaluate in the assembled prompt', async () => {
      mockRunClaude.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ clarity: 1, total: 1, rationale: 'ok' }),
        stderr: '',
        durationMs: 100,
      });

      await evaluateWithLlmJudge(BASE_INPUT);

      const calledOptions = (mockRunClaude as jest.Mock).mock.calls[0][0] as { prompt: string };
      expect(calledOptions.prompt).toContain(BASE_INPUT.codeToEvaluate);
    });

    it('includes contextFiles content in the assembled prompt', async () => {
      const inputWithContext = {
        ...BASE_INPUT,
        contextFiles: {
          'src/helper.ts': 'export function helper() {}',
        },
      };
      mockRunClaude.mockResolvedValue({
        exitCode: 0,
        stdout: JSON.stringify({ clarity: 2, total: 2, rationale: 'ok' }),
        stderr: '',
        durationMs: 100,
      });

      await evaluateWithLlmJudge(inputWithContext);

      const calledOptions = (mockRunClaude as jest.Mock).mock.calls[0][0] as { prompt: string };
      expect(calledOptions.prompt).toContain('src/helper.ts');
      expect(calledOptions.prompt).toContain('export function helper() {}');
    });
  });

  describe('graceful degradation: runClaude throws', () => {
    it('returns skipped result when runClaude throws ENOENT (Claude CLI unavailable)', async () => {
      const error = Object.assign(new Error('spawn claude ENOENT'), { code: 'ENOENT' });
      mockRunClaude.mockRejectedValue(error);

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.grader).toBe('LlmJudgeGrader');
      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
      expect(result.details.skipped).toBe(true);
      expect(typeof result.details.error).toBe('string');
    });
  });

  describe('graceful degradation: non-zero exit code', () => {
    it('returns skipped result when Claude returns non-zero exit code', async () => {
      mockRunClaude.mockResolvedValue({ exitCode: 1, stdout: '', stderr: 'error', durationMs: 50 });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.grader).toBe('LlmJudgeGrader');
      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
      expect(result.details.skipped).toBe(true);
      expect(typeof result.details.error).toBe('string');
    });
  });

  describe('graceful degradation: invalid JSON', () => {
    it('returns parseError result when Claude returns invalid JSON', async () => {
      mockRunClaude.mockResolvedValue({
        exitCode: 0,
        stdout: 'this is not valid json at all',
        stderr: '',
        durationMs: 50,
      });

      const result = await evaluateWithLlmJudge(BASE_INPUT);

      expect(result.grader).toBe('LlmJudgeGrader');
      expect(result.score).toBe(0);
      expect(result.pass).toBe(false);
      expect(result.details.parseError).toBe(true);
      expect(typeof result.details.error).toBe('string');
    });
  });
});
