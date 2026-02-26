import { join } from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { readdirSync, readFileSync } from 'node:fs';
import type { ExperimentResult, TaskComparison } from '@/telemetry/schemas.js';
import { ExperimentResultSchema } from '@/telemetry/schemas.js';
import type { ComparisonReport } from '@/eval/comparator.js';
import { CollectorError } from '@/telemetry/collector.js';

export function loadExperimentHistory(reportsDir: string): ExperimentResult[] {
  const files = readdirSync(reportsDir).filter((f: string) => f.endsWith('.json'));
  const experiments: ExperimentResult[] = [];

  for (const file of files) {
    const content = readFileSync(join(reportsDir, file), 'utf-8');
    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch (err) {
      throw new CollectorError(`Failed to parse ${file}: invalid JSON`, err);
    }
    try {
      experiments.push(ExperimentResultSchema.parse(raw));
    } catch (err) {
      throw new CollectorError(`Invalid schema in ${file}`, err);
    }
  }

  return experiments.sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
  );
}

export function formatHistoryTable(experiments: ExperimentResult[]): string {
  if (experiments.length === 0) {
    return 'No experiments found';
  }

  const lines: string[] = [];
  lines.push('# Experiment History');
  lines.push('');
  lines.push('| Date | Experiment | TSR | pass@1 | Guard Violations | Decision |');
  lines.push('|------|------------|-----|--------|------------------|----------|');

  for (const exp of experiments) {
    const date = exp.timestamp.slice(0, 10);
    const tsr = exp.variant_results.tsr.toFixed(2);
    const passAt1 = exp.variant_results.pass_at_1.toFixed(2);
    const guardViolations = exp.variant_results.guard_violations;
    const marker = exp.decision === 'accept' ? ' ✓' : '';
    lines.push(`| ${date} | ${exp.experiment_id} | ${tsr} | ${passAt1} | ${guardViolations} | ${exp.decision}${marker} |`);
  }

  return lines.join('\n');
}

function formatDelta(delta: number): string {
  const sign = delta >= 0 ? '+' : '';
  return `${sign}${delta.toFixed(2)}`;
}

function deltaStatus(delta: number): string {
  if (delta > 0) return 'Better';
  if (delta < 0) return 'Worse';
  return 'Same';
}

function formatTaskSection(title: string, tasks: TaskComparison[]): string[] {
  const lines: string[] = ['', `## ${title} (${tasks.length} tasks)`];
  for (const t of tasks) {
    lines.push(`- ${t.task_id}: control=${t.control_score.toFixed(2)}, variant=${t.variant_score.toFixed(2)}, delta=${formatDelta(t.delta)}`);
  }
  return lines;
}

export function formatMarkdownReport(
  result: ExperimentResult,
  report: ComparisonReport,
): string {
  const lines: string[] = [];

  lines.push(`# Experiment Report: ${result.experiment_id}`);
  lines.push('');
  lines.push('## Hypothesis');
  lines.push(result.hypothesis);
  lines.push('');
  lines.push('## Results Summary');
  lines.push('| Metric | Control | Variant | Delta | Status |');
  lines.push('|--------|---------|---------|-------|--------|');

  for (const key of Object.keys(report.deltas)) {
    const control = (report.control_metrics as Record<string, number>)[key] ?? 0;
    const variant = (report.variant_metrics as Record<string, number>)[key] ?? 0;
    const delta = report.deltas[key];
    lines.push(`| ${key} | ${control.toFixed(2)} | ${variant.toFixed(2)} | ${formatDelta(delta)} | ${deltaStatus(delta)} |`);
  }

  lines.push(...formatTaskSection('Regressions', report.regressions));
  lines.push(...formatTaskSection('Improvements', report.improvements));

  lines.push('');
  lines.push(`## Decision: ${result.decision.toUpperCase()}`);
  lines.push(result.decision_rationale);

  return lines.join('\n');
}

export async function saveReport(
  result: ExperimentResult,
  report: ComparisonReport,
  reportsDir: string,
): Promise<{ jsonPath: string; mdPath: string }> {
  await mkdir(reportsDir, { recursive: true });

  const jsonPath = join(reportsDir, `${result.experiment_id}.json`);
  const mdPath = join(reportsDir, `${result.experiment_id}.md`);

  await writeFile(jsonPath, JSON.stringify(result, null, 2));
  await writeFile(mdPath, formatMarkdownReport(result, report));

  return { jsonPath, mdPath };
}
