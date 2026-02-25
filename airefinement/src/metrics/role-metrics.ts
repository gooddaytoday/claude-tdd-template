import { RunReport } from '../telemetry/schemas.js';

export interface TestWriterMetrics {
  failing_test_rate: number;
  red_invalid_rate: number;
  retries_to_valid_red: number;
}

export interface ImplementerMetrics {
  tests_pass_rate: number;
  retry_count_avg: number;
  escalation_rate: number;
}

export interface RefactorerMetrics {
  tests_remain_green_rate: number;
  regression_rate: number;
}

export interface CodeReviewerMetrics {
  fix_cycles_avg: number;
  escalation_rate: number;
}

export interface ArchitectReviewerMetrics {
  fix_cycles_avg: number;
  pass_rate: number;
}

export interface DocumenterMetrics {
  completion_rate: number;
}

export interface RoleMetrics {
  'tdd-test-writer': TestWriterMetrics;
  'tdd-implementer': ImplementerMetrics;
  'tdd-refactorer': RefactorerMetrics;
  'tdd-code-reviewer': CodeReviewerMetrics;
  'tdd-architect-reviewer': ArchitectReviewerMetrics;
  'tdd-documenter': DocumenterMetrics;
}

export function computeRoleMetrics(reports: RunReport[]): RoleMetrics {
  const metrics: RoleMetrics = {
    'tdd-test-writer': {
      failing_test_rate: 0,
      red_invalid_rate: 0,
      retries_to_valid_red: 0,
    },
    'tdd-implementer': {
      tests_pass_rate: 0,
      retry_count_avg: 0,
      escalation_rate: 0,
    },
    'tdd-refactorer': {
      tests_remain_green_rate: 0,
      regression_rate: 0,
    },
    'tdd-code-reviewer': {
      fix_cycles_avg: 0,
      escalation_rate: 0,
    },
    'tdd-architect-reviewer': {
      fix_cycles_avg: 0,
      pass_rate: 0,
    },
    'tdd-documenter': {
      completion_rate: 0,
    },
  };

  const totalRuns = reports.length;
  if (totalRuns === 0) return metrics;

  const counts = aggregateReportCounts(reports);

  const safeDiv = (num: number, den: number) => (den > 0 ? num / den : 0);

  metrics['tdd-test-writer'].failing_test_rate = counts.red.passes / totalRuns;
  metrics['tdd-test-writer'].red_invalid_rate = safeDiv(counts.red.invalid, counts.red.phases);
  metrics['tdd-test-writer'].retries_to_valid_red = safeDiv(counts.red.retries, counts.red.phases);

  metrics['tdd-implementer'].tests_pass_rate = counts.green.passes / totalRuns;
  metrics['tdd-implementer'].retry_count_avg = safeDiv(counts.green.retries, counts.green.phases);
  metrics['tdd-implementer'].escalation_rate = counts.green.escalations / totalRuns;

  metrics['tdd-refactorer'].tests_remain_green_rate = counts.refactor.passes / totalRuns;
  metrics['tdd-refactorer'].regression_rate = safeDiv(counts.refactor.regressions, counts.refactor.phases);

  metrics['tdd-code-reviewer'].fix_cycles_avg = counts.codeReview.cycles / totalRuns;
  metrics['tdd-code-reviewer'].escalation_rate = counts.codeReview.escalations / totalRuns;

  metrics['tdd-architect-reviewer'].fix_cycles_avg = counts.archReview.cycles / totalRuns;
  metrics['tdd-architect-reviewer'].pass_rate = counts.archReview.passes / totalRuns;

  metrics['tdd-documenter'].completion_rate = counts.docs.passes / totalRuns;

  return metrics;
}

interface ReportCounts {
  red: { phases: number; invalid: number; retries: number; passes: number };
  green: { phases: number; retries: number; passes: number; escalations: number };
  refactor: { phases: number; regressions: number; passes: number };
  codeReview: { cycles: number; escalations: number };
  archReview: { cycles: number; passes: number };
  docs: { passes: number };
}

function aggregateReportCounts(reports: RunReport[]): ReportCounts {
  const counts: ReportCounts = {
    red: { phases: 0, invalid: 0, retries: 0, passes: 0 },
    green: { phases: 0, retries: 0, passes: 0, escalations: 0 },
    refactor: { phases: 0, regressions: 0, passes: 0 },
    codeReview: { cycles: 0, escalations: 0 },
    archReview: { cycles: 0, passes: 0 },
    docs: { passes: 0 }
  };

  for (const report of reports) {
    const reportPasses = {
      red: false, green: false, refactor: false, arch: false, docs: false
    };

    if (report.phases) {
      for (const phase of report.phases) {
        const isPass = phase.gate_result === 'pass';

        switch (phase.phase) {
          case 'RED':
            counts.red.phases++;
            counts.red.retries += phase.retries || 0;
            if (isPass) reportPasses.red = true;
            if (phase.gate_failure_reason?.includes('syntax') || phase.gate_failure_reason?.includes('import')) {
              counts.red.invalid++;
            }
            break;
          case 'GREEN':
            counts.green.phases++;
            counts.green.retries += phase.retries || 0;
            if (isPass) reportPasses.green = true;
            break;
          case 'REFACTOR':
            counts.refactor.phases++;
            if (isPass) {
              reportPasses.refactor = true;
            } else if (phase.gate_result === 'fail') {
              counts.refactor.regressions++;
            }
            break;
          case 'ARCH_REVIEW':
            if (isPass) reportPasses.arch = true;
            break;
          case 'DOCS':
            if (isPass) reportPasses.docs = true;
            break;
        }
      }
    }

    if (report.fix_routing) {
      counts.codeReview.cycles += report.fix_routing.code_review_cycles || 0;
      counts.archReview.cycles += report.fix_routing.arch_review_cycles || 0;

      if (report.fix_routing.escalations) {
        for (const esc of report.fix_routing.escalations) {
          if (esc.phase === 'GREEN') counts.green.escalations++;
          if (esc.phase === 'CODE_REVIEW') counts.codeReview.escalations++;
        }
      }
    }

    if (reportPasses.red) counts.red.passes++;
    if (reportPasses.green) counts.green.passes++;
    if (reportPasses.refactor) counts.refactor.passes++;
    if (reportPasses.arch) counts.archReview.passes++;
    if (reportPasses.docs) counts.docs.passes++;
  }

  return counts;
}
