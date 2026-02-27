import { readFile } from 'node:fs/promises';
import type { GraderResult } from '@/eval/graders/deterministic.js';
import { runClaude } from '@/utils/claude-cli.js';

export interface LlmJudgeInput {
  rubricPath: string;
  codeToEvaluate: string;
  contextFiles?: Record<string, string>;
}

const GRADER_NAME = 'LlmJudgeGrader';

function failResult(details: Record<string, unknown>): GraderResult {
  return { grader: GRADER_NAME, score: 0, pass: false, details };
}

function extractJson(stdout: string): string {
  const match = stdout.match(/```json\s*([\s\S]*?)\s*```/);
  return match ? match[1] : stdout;
}

function normalizeScore(parsed: Record<string, unknown>): number {
  const dimEntries = Object.entries(parsed).filter(
    ([key, val]) => key !== 'total' && key !== 'rationale' && typeof val === 'number',
  );
  if (dimEntries.length === 0) return 0;
  const maxPerDim = Math.max(...dimEntries.map(([, v]) => v as number));
  const maxScore = dimEntries.length * maxPerDim;
  if (maxScore === 0) return 0;
  const total = typeof parsed['total'] === 'number' ? parsed['total'] : 0;
  return total / maxScore;
}

function assemblePrompt(rubric: string, code: string, contextFiles?: Record<string, string>): string {
  let prompt = `${rubric}\n\n## Code to Evaluate\n\n${code}`;
  if (contextFiles) {
    for (const [filename, content] of Object.entries(contextFiles)) {
      prompt += `\n\n## Context: ${filename}\n\n${content}`;
    }
  }
  return prompt;
}

export async function evaluateWithLlmJudge(input: LlmJudgeInput): Promise<GraderResult> {
  let rubric: string;
  try {
    rubric = await readFile(input.rubricPath, 'utf-8');
  } catch (err) {
    return failResult({ skipped: true, error: `Failed to read rubric: ${String(err)}` });
  }
  const prompt = assemblePrompt(rubric, input.codeToEvaluate, input.contextFiles);

  let claudeResult: { exitCode: number; stdout: string; stderr: string; durationMs: number };
  try {
    claudeResult = await runClaude({ maxTurns: 1, prompt, workingDirectory: process.cwd() });
  } catch (err) {
    return failResult({ skipped: true, error: String(err) });
  }

  if (claudeResult.exitCode !== 0) {
    return failResult({ skipped: true, error: `Claude exited with code ${claudeResult.exitCode}: ${claudeResult.stderr}` });
  }

  const rawResponse = claudeResult.stdout;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(extractJson(rawResponse));
  } catch (err) {
    return failResult({ parseError: true, error: String(err) });
  }

  const score = normalizeScore(parsed);
  return {
    grader: GRADER_NAME,
    score,
    pass: score >= 0.5,
    details: {
      rationale: parsed['rationale'] as string,
      rawResponse,
    },
  };
}
