import type { AnalysisResult, RunReport } from '@/telemetry/schemas.js';
import { getCurrentBranch, createBranch, checkoutBranch, getChangedFiles, commitAll } from '@/utils/git.js';
import { runClaude } from '@/utils/claude-cli.js';
import { buildDiagnosisPrompt, ALLOWED_MODIFICATION_PATHS } from '@/refinement/prompt-templates.js';

export class ScopeViolationError extends Error {
  violations: string[];
  constructor(violations: string[]) {
    super(`Scope violation: ${violations.join(', ')}`);
    this.violations = violations;
    this.name = 'ScopeViolationError';
  }
}

export function validateModifiedFiles(files: string[]): { valid: boolean; violations: string[] } {
  if (ALLOWED_MODIFICATION_PATHS.length === 0) {
    return { valid: true, violations: [] };
  }
  const violations = files.filter(
    (file) => !ALLOWED_MODIFICATION_PATHS.some((allowed) => file.startsWith(allowed))
  );
  return { valid: violations.length === 0, violations };
}

export interface RefinementInput {
  analysis: AnalysisResult;
  failedRunReports: RunReport[];
  currentAgentPrompts: Record<string, string>;
  currentPolicies: Record<string, string>;
}

export interface RefinementOutput {
  experimentBranch: string;
  changedFiles: string[];
  commitHash: string;
  agentStdout: string;
}

export function generateExperimentId(analysis: AnalysisResult): string {
  const today = new Date().toISOString().slice(0, 10);
  const firstTrigger = analysis.triggers_fired[0];
  let slug: string;
  if (firstTrigger) {
    slug = firstTrigger.rule
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 20)
      .replace(/-+$/g, '');
  } else {
    slug = 'general';
  }
  return `exp-${today}-${slug}`;
}

export async function runRefinement(input: RefinementInput): Promise<RefinementOutput> {
  const originalBranch = await getCurrentBranch();
  const experimentId = generateExperimentId(input.analysis);
  const experimentBranch = `refinement/${experimentId}`;

  await createBranch(experimentBranch);

  try {
    const prompt = buildDiagnosisPrompt({ ...input, experimentId });

    const claudeResult = await runClaude({
      prompt,
      workingDirectory: process.cwd(),
      maxTurns: 10,
    });

    if (claudeResult.exitCode !== 0) {
      throw new Error(
        `Claude CLI failed with exit code ${claudeResult.exitCode}. stdout: ${claudeResult.stdout}. stderr: ${claudeResult.stderr}`
      );
    }

    const changedFiles = await getChangedFiles(originalBranch);

    const scopeCheck = validateModifiedFiles(changedFiles);
    if (!scopeCheck.valid) {
      throw new ScopeViolationError(scopeCheck.violations);
    }

    await commitAll(`refinement(${experimentId}): auto-refinement run`);

    return {
      experimentBranch,
      changedFiles,
      commitHash: '',
      agentStdout: claudeResult.stdout,
    };
  } catch (err) {
    try {
      await checkoutBranch(originalBranch);
    } catch (restoreErr) {
      console.error('Failed to restore branch after error:', restoreErr);
    }
    throw err;
  }
}
