import { join } from 'node:path';
import { readdir, writeFile, mkdir } from 'node:fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { loadGoldenDataset } from '@/eval/dataset-reader.js';
import { gradeComposite } from '@/eval/graders/composite.js';
import type { CompositeResult, CompositeConfig } from '@/eval/graders/composite.js';
import { hashFiles, addWorktree, removeWorktree } from '@/utils/git.js';
import { runClaude } from '@/utils/claude-cli.js';
import type { AggregatedMetrics, ExperimentResult, GoldenDatasetTask, TaskComparison, VersionManifest } from '@/telemetry/schemas.js';

export interface TaskTrialResult {
  task_id: string;
  trial: number;
  composite_result: CompositeResult;
  duration_ms: number;
  claude_exit_code: number;
}

export interface EvalRunConfig {
  datasetPath: string;
  taskIds?: string[];
  trials: number;
  hypothesis: string;
  variantDescription: string;
  controlBranch: string;
  variantBranch: string;
  graderConfig: CompositeConfig;
  timeout: number;
  quick?: boolean;
  quickSampleSize?: number;
}

export function aggregateTrialResults(
  results: TaskTrialResult[],
  taskCount: number,
  _trials: number,
): AggregatedMetrics {
  if (results.length === 0 || taskCount === 0) {
    return { tsr: 0, pass_at_1: 0, pass_3: 0, code_quality_score: 0, total_tokens: 0, median_cycle_time: 0, gate_failure_rate: 0, guard_violations: 0 };
  }

  const byTask = new Map<string, TaskTrialResult[]>();
  for (const r of results) {
    if (!byTask.has(r.task_id)) byTask.set(r.task_id, []);
    byTask.get(r.task_id)!.push(r);
  }

  let tsrCount = 0;
  let passAt1Count = 0;
  let pass3Count = 0;

  for (const taskResults of byTask.values()) {
    const maxScore = Math.max(...taskResults.map(r => r.composite_result.overall_score));
    if (maxScore >= 0.5) tsrCount++;

    const trial0 = taskResults.find(r => r.trial === 0);
    if (trial0 && trial0.composite_result.pass) passAt1Count++;

    if (taskResults.some(r => r.composite_result.pass)) pass3Count++;
  }

  const tsr = tsrCount / taskCount;
  const pass_at_1 = passAt1Count / taskCount;
  const pass_3 = pass3Count / taskCount;

  const code_quality_score = results.reduce((sum, r) => sum + r.composite_result.overall_score, 0) / results.length;

  const durations = results.map(r => r.duration_ms).sort((a, b) => a - b);
  const n = durations.length;
  const median_cycle_time = n % 2 === 1
    ? durations[Math.floor(n / 2)]
    : (durations[n / 2 - 1] + durations[n / 2]) / 2;

  const avgPhaseProgression = results.reduce((sum, r) => sum + r.composite_result.partial_credit.phase_progression_score, 0) / results.length;
  const gate_failure_rate = 1 - avgPhaseProgression;

  const guard_violations = results.filter(r => r.composite_result.individual_scores['guard_compliance']?.score === 0).length;

  return { tsr, pass_at_1, pass_3, code_quality_score, total_tokens: 0, median_cycle_time, gate_failure_rate, guard_violations };
}

export function buildTaskComparisons(
  controlResults: TaskTrialResult[],
  variantResults: TaskTrialResult[],
): TaskComparison[] {
  const bestScore = (results: TaskTrialResult[], taskId: string): number => {
    const taskResults = results.filter(r => r.task_id === taskId);
    if (taskResults.length === 0) return 0;
    return Math.max(...taskResults.map(r => r.composite_result.overall_score));
  };

  const outcome = (score: number): 'pass' | 'fail' | 'partial' =>
    score >= 0.5 ? 'pass' : score < 0.25 ? 'fail' : 'partial';

  const allTaskIds = new Set([
    ...controlResults.map(r => r.task_id),
    ...variantResults.map(r => r.task_id),
  ]);

  const comparisons: TaskComparison[] = [];
  for (const taskId of allTaskIds) {
    const control_score = bestScore(controlResults, taskId);
    const variant_score = bestScore(variantResults, taskId);
    const delta = variant_score - control_score;
    comparisons.push({
      task_id: taskId,
      control_outcome: outcome(control_score),
      variant_outcome: outcome(variant_score),
      control_score,
      variant_score,
      delta,
      regression: Math.round(delta * 1e10) / 1e10 < -0.05,
    });
  }

  return comparisons;
}

export function makeDecision(
  control: AggregatedMetrics,
  variant: AggregatedMetrics,
  comparisons: TaskComparison[],
): { decision: 'accept' | 'reject' | 'accept_with_caveat'; rationale: string } {
  const anyMetricWorse =
    variant.tsr < control.tsr ||
    variant.pass_at_1 < control.pass_at_1 ||
    variant.code_quality_score < control.code_quality_score;

  const regressionRate = comparisons.length === 0
    ? 0
    : comparisons.filter(c => c.regression).length / comparisons.length;

  if (anyMetricWorse || regressionRate > 0.20) {
    const reasons: string[] = [];
    if (variant.tsr < control.tsr) reasons.push(`tsr degraded (${control.tsr} → ${variant.tsr})`);
    if (variant.pass_at_1 < control.pass_at_1) reasons.push(`pass_at_1 degraded (${control.pass_at_1} → ${variant.pass_at_1})`);
    if (variant.code_quality_score < control.code_quality_score) reasons.push(`code_quality_score degraded (${control.code_quality_score} → ${variant.code_quality_score})`);
    if (regressionRate > 0.20) reasons.push(`regression rate ${(regressionRate * 100).toFixed(1)}% exceeds 20% threshold`);
    return { decision: 'reject', rationale: `Rejected: ${reasons.join('; ')}` };
  }

  if (regressionRate > 0) {
    return {
      decision: 'accept_with_caveat',
      rationale: `Accepted with caveat: all key metrics improved or held, but ${(regressionRate * 100).toFixed(1)}% of tasks regressed (within 20% threshold)`,
    };
  }

  return {
    decision: 'accept',
    rationale: `Accepted: all key metrics (tsr, pass_at_1, code_quality_score) are >= control with zero task regressions`,
  };
}

async function collectFiles(dirPath: string): Promise<string[]> {
  try {
    const entries = await readdir(dirPath, { recursive: true, withFileTypes: true });
    return entries
      .filter(e => e.isFile())
      .map(e => {
        const dirent = e as unknown as { parentPath?: string; path?: string };
        return join(dirent.parentPath ?? dirent.path ?? dirPath, e.name);
      });
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      return [];
    }
    throw err;
  }
}

const TOTAL_TDD_PHASES = 6;

export async function snapshotManifest(
  worktreePath: string,
  datasetVersion: string,
): Promise<VersionManifest> {
  const [agentFiles, skillFiles, hookFiles] = await Promise.all([
    collectFiles(join(worktreePath, '.claude/agents')),
    collectFiles(join(worktreePath, '.claude/skills')),
    collectFiles(join(worktreePath, '.claude/hooks')),
  ]);

  const [agent_prompts_hash, skill_hash, hooks_hash, settings_hash] = await Promise.all([
    hashFiles(agentFiles),
    hashFiles(skillFiles),
    hashFiles(hookFiles),
    hashFiles([join(worktreePath, '.claude/settings.json')]),
  ]);

  return { agent_prompts_hash, skill_hash, hooks_hash, settings_hash, dataset_version: datasetVersion };
}

async function runTrialsInWorktree(
  worktreePath: string,
  tasks: GoldenDatasetTask[],
  config: EvalRunConfig,
): Promise<TaskTrialResult[]> {
  const results: TaskTrialResult[] = [];
  for (const task of tasks) {
    for (let trial = 0; trial < config.trials; trial++) {
      const claudeResult = await runClaude({
        prompt: task.description,
        workingDirectory: worktreePath,
        timeout: config.timeout,
      });

      // TODO: pass actual grader results from task execution
      const compositeResult = gradeComposite({
        config: config.graderConfig,
        results: {},
        phasesCompleted: 0,
        phasesTotal: TOTAL_TDD_PHASES,
      });

      results.push({
        task_id: task.id,
        trial,
        composite_result: compositeResult,
        duration_ms: claudeResult.durationMs,
        claude_exit_code: claudeResult.exitCode,
      });
    }
  }
  return results;
}

export async function runTrialsOnBranch(
  tasks: GoldenDatasetTask[],
  branch: string,
  config: EvalRunConfig,
  worktreeBasePath: string,
): Promise<TaskTrialResult[]> {
  const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-');
  const worktreePath = join(worktreeBasePath, safeBranch);
  await addWorktree(worktreePath, branch);
  try {
    return await runTrialsInWorktree(worktreePath, tasks, config);
  } finally {
    await removeWorktree(worktreePath);
  }
}

export function sampleQuickSubset(tasks: GoldenDatasetTask[], count: number): GoldenDatasetTask[] {
  if (count <= 0) return [];
  if (count >= tasks.length) return [...tasks];
  const shuffled = [...tasks];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled.slice(0, count);
}

export async function runEval(config: EvalRunConfig): Promise<ExperimentResult> {
  const allTasks = loadGoldenDataset(config.datasetPath);
  const tasks = config.quick
    ? sampleQuickSubset(allTasks, config.quickSampleSize ?? 5)
    : allTasks;

  const worktreeBase = join(process.cwd(), '.eval-worktrees');
  const datasetVersion = 'v1';

  // Create worktree, snapshot while it exists, run trials inline, then cleanup.
  // Avoids snapshotting before worktrees are created (ENOENT → empty hash bug).
  async function runBranch(branch: string): Promise<{ results: TaskTrialResult[]; manifest: VersionManifest }> {
    const safeBranch = branch.replace(/[^a-zA-Z0-9-]/g, '-');
    const worktreePath = join(worktreeBase, safeBranch);
    await addWorktree(worktreePath, branch);
    try {
      const manifest = await snapshotManifest(worktreePath, datasetVersion);
      const results = await runTrialsInWorktree(worktreePath, tasks, config);
      return { results, manifest };
    } finally {
      await removeWorktree(worktreePath);
    }
  }

  const { results: controlResults, manifest: controlConfig } = await runBranch(config.controlBranch);
  const { results: variantResults, manifest: variantConfig } = await runBranch(config.variantBranch);

  const control_results = aggregateTrialResults(controlResults, tasks.length, config.trials);
  const variant_results = aggregateTrialResults(variantResults, tasks.length, config.trials);

  const per_task_comparison = buildTaskComparisons(controlResults, variantResults);
  const { decision, rationale } = makeDecision(control_results, variant_results, per_task_comparison);

  const experiment_id = `exp-${new Date().toISOString().slice(0, 10)}-${uuidv4().slice(0, 8)}`;
  const result: ExperimentResult = {
    experiment_id,
    timestamp: new Date().toISOString(),
    hypothesis: config.hypothesis,
    variant_description: config.variantDescription,
    dataset_version: datasetVersion,
    control_config: controlConfig,
    variant_config: variantConfig,
    control_results,
    variant_results,
    per_task_comparison,
    decision,
    decision_rationale: rationale,
  };

  const reportPath = join('artifacts', 'reports', `${experiment_id}.json`);
  await mkdir(join('artifacts', 'reports'), { recursive: true });
  await writeFile(reportPath, JSON.stringify(result, null, 2));

  return result;
}
