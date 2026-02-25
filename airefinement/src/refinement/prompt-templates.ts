import type { AnalysisResult, RunReport } from '@/telemetry/schemas.js';
import { buildPrompt } from '@/utils/claude-cli.js';

export interface PromptInput {
  analysis: AnalysisResult;
  failedRunReports: RunReport[];
  currentAgentPrompts: Record<string, string>;
  currentPolicies: Record<string, string>;
  experimentId?: string;
}

export const DIAGNOSIS_PROMPT: string = `## Context

This project uses strict TDD with the following pipeline:
RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS

The AI Refinement Agent analyzes TDD run reports and refines agent prompts and policy files
to improve future cycle success rates.

## Problem

The following quality triggers have fired, indicating systematic issues in the TDD pipeline:

{{triggers_summary}}

Failed run reports for analysis:

{{failure_reports}}

## Task

Based on the triggers and failed runs above, analyze the current agent prompts and policy files,
identify root causes, and propose targeted modifications to improve future TDD cycle outcomes.

You may only modify files within the allowed paths:
- .claude/agents/
- .claude/skills/
- .claude/hooks/

Current agent prompts:

{{agent_prompts}}

Current policy files:

{{policy_files}}
`;

export const ALLOWED_MODIFICATION_PATHS: string[] = [
  '.claude/agents/',
  '.claude/skills/',
  '.claude/hooks/',
];

export function buildDiagnosisPrompt(input: PromptInput): string {
  const { analysis, failedRunReports, currentAgentPrompts, currentPolicies, experimentId } = input;

  const triggers_summary = analysis.triggers_fired
    .map((t) => `- ${t.rule}: ${t.description}`)
    .join('\n');

  const failure_reports = JSON.stringify(failedRunReports, null, 2);

  const agent_prompts = Object.entries(currentAgentPrompts)
    .map(([key, content]) => `${key}:\n${content}`)
    .join('\n\n');

  const policy_files = Object.entries(currentPolicies)
    .map(([key, content]) => `${key}:\n${content}`)
    .join('\n\n');

  const result = buildPrompt(DIAGNOSIS_PROMPT, {
    triggers_summary,
    failure_reports,
    agent_prompts,
    policy_files,
  });

  return experimentId ? `${result}\n\nExperiment ID: ${experimentId}` : result;
}
