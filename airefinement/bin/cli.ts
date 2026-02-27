import { Command } from 'commander';
import { readFileSync } from 'node:fs';
import { analyze } from '@/triggers/analyzer.js';
import { loadTriggersConfig } from '@/triggers/config-loader.js';
import { runRefinement } from '@/refinement/agent-runner.js';
import type { RefinementInput } from '@/refinement/agent-runner.js';
import { runEval } from '@/eval/runner.js';
import type { EvalRunConfig } from '@/eval/runner.js';
import type { CompositeConfig } from '@/eval/graders/composite.js';
import type { AnalysisResult } from '@/telemetry/schemas.js';
import {
  loadExperimentHistory,
  formatHistoryTable,
  formatMarkdownReport,
} from '@/eval/reporter.js';
import { buildComparisonReport } from '@/eval/comparator.js';
import { computePipelineKPIs } from '@/metrics/pipeline-metrics.js';
import { computeRoleMetrics } from '@/metrics/role-metrics.js';
import { readRunReports } from '@/telemetry/collector.js';

const DEFAULT_ARTIFACTS_DIR = 'airefinement/artifacts';
const DEFAULT_CONFIG_DIR = 'airefinement/config';
const DEFAULT_DATASET_PATH = 'airefinement/datasets/golden-v1.jsonl';
const DEFAULT_EVAL_TRIALS = 3;
const DEFAULT_EVAL_TIMEOUT_MS = 120_000;

const DEFAULT_GRADER_CONFIG: CompositeConfig = {
  weights: {
    test_runner: 0.30,
    static_analysis: 0.15,
    test_mutation: 0.15,
    guard_compliance: 0.10,
    llm_test_quality: 0.10,
    llm_impl_minimality: 0.10,
    llm_doc_completeness: 0.10,
  },
};

const parseIntOption = (v: string): number => parseInt(v, 10);

export const program = new Command();

program.name('airefinement').description('AI Refinement CLI');

program
  .command('analyze')
  .description('Analyze run reports and detect refinement triggers')
  .option('--artifacts-dir <path>', 'Artifacts directory', DEFAULT_ARTIFACTS_DIR)
  .option('--config <path>', 'Config directory', DEFAULT_CONFIG_DIR)
  .action((opts: { artifactsDir: string; config: string }) => {
    try {
      const configPath = `${opts.config}/triggers.json`;
      const config = loadTriggersConfig(configPath);
      const result = analyze(opts.artifactsDir, config);
      console.log(JSON.stringify(result, null, 2));
      console.log(`Recommendation: ${result.recommendation}`);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command('refine')
  .description('Run refinement based on analysis results')
  .requiredOption('--analysis <path>', 'Path to analysis JSON file')
  .option('--dry-run', 'Dry run mode without committing changes')
  .action(async (opts: { analysis: string; dryRun?: boolean }) => {
    try {
      let raw: string;
      let parsedAnalysis: AnalysisResult;
      try {
        raw = readFileSync(opts.analysis, 'utf-8');
        parsedAnalysis = JSON.parse(raw) as AnalysisResult;
      } catch {
        console.error('Error: Cannot read analysis file');
        process.exitCode = 1;
        return;
      }
      const refinementInput: RefinementInput & { analysisPath: string; dryRun?: boolean } = {
        analysis: parsedAnalysis,
        failedRunReports: [],
        currentAgentPrompts: {},
        currentPolicies: {},
        analysisPath: opts.analysis,
        dryRun: opts.dryRun,
      };
      await runRefinement(refinementInput);
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command('eval')
  .description('Run A/B evaluation between two branches')
  .exitOverride()
  .requiredOption('--control <branch>', 'Control branch name')
  .requiredOption('--variant <branch>', 'Variant branch name')
  .option('--dataset <path>', 'Dataset file path', DEFAULT_DATASET_PATH)
  .option('--trials <n>', 'Number of trials per task', parseIntOption, DEFAULT_EVAL_TRIALS)
  .option('--quick', 'Quick mode using a sampled subset of tasks')
  .action(async (opts: {
    control: string;
    variant: string;
    dataset: string;
    trials: number;
    quick?: boolean;
  }) => {
    try {
      const evalInput: EvalRunConfig & { quickMode?: boolean } = {
        controlBranch: opts.control,
        variantBranch: opts.variant,
        datasetPath: opts.dataset,
        trials: opts.trials,
        hypothesis: '',
        variantDescription: '',
        graderConfig: DEFAULT_GRADER_CONFIG,
        timeout: DEFAULT_EVAL_TIMEOUT_MS,
        quickMode: opts.quick,
      };
      const result = await runEval(evalInput);
      console.log(JSON.stringify(result, null, 2));
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command('report')
  .description('Show experiment evaluation reports')
  .option('--history', 'Show history table of all experiments')
  .option('--format <format>', 'Output format: json or md')
  .option('--reports-dir <path>', 'Reports directory', `${DEFAULT_ARTIFACTS_DIR}/reports`)
  .action((opts: { history?: boolean; format?: string; reportsDir: string }) => {
    try {
      const history = loadExperimentHistory(opts.reportsDir);

      if (opts.history) {
        console.log(formatHistoryTable(history));
        return;
      }

      const latest = history.at(-1);

      if (!latest) {
        console.error('Error: No experiment reports found');
        process.exitCode = 1;
        return;
      }

      if (opts.format === 'json') {
        console.log(JSON.stringify(latest, null, 2));
      } else {
        const report = buildComparisonReport(latest);
        console.log(formatMarkdownReport(latest, report));
      }
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

program
  .command('metrics')
  .description('Show pipeline KPI metrics')
  .option('--runs <n>', 'Number of recent runs to analyze', parseIntOption)
  .option('--artifacts-dir <path>', 'Artifacts directory', DEFAULT_ARTIFACTS_DIR)
  .action((opts: { runs?: number; artifactsDir: string }) => {
    try {
      let reports = readRunReports(opts.artifactsDir);

      if (opts.runs) {
        reports = reports.slice(-opts.runs);
      }

      const kpis = computePipelineKPIs(reports);
      const roles = computeRoleMetrics(reports);
      console.log(JSON.stringify({ kpis, roles }, null, 2));
    } catch (err) {
      console.error('Error:', err instanceof Error ? err.message : String(err));
      process.exitCode = 1;
    }
  });

if (process.env.NODE_ENV !== 'test') {
  program.parseAsync();
}
