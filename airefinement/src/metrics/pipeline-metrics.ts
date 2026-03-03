import { RunReport } from '../telemetry/schemas.js';

export interface PipelineKPIs {
  tsr: number;
  pass_at_1: number;
  code_quality_score: number;
  gate_failure_rate: number;
  median_cycle_time: number;
  total_retries_avg: number;
  fix_routing_cycles_avg: number;
  guard_violations_total: number;
  guard_violations_per_run: number;
}

function parseDuration(duration: string | undefined | null): number {
  if (!duration) return 0;
  const match = duration.match(/^(\d+)(s|m|h)?$/);
  if (!match) return 0;
  const value = parseInt(match[1], 10);
  const unit = match[2];
  if (unit === 'm') return value * 60;
  if (unit === 'h') return value * 3600;
  return value; // 's' or no unit
}

function calculateMedian(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

export function computePipelineKPIs(reports: RunReport[]): PipelineKPIs {
  if (reports.length === 0) {
    return {
      tsr: 0,
      pass_at_1: 0,
      code_quality_score: 0,
      gate_failure_rate: 0,
      median_cycle_time: 0,
      total_retries_avg: 0,
      fix_routing_cycles_avg: 0,
      guard_violations_total: 0,
      guard_violations_per_run: 0,
    };
  }

  let doneCount = 0;
  let passAt1Count = 0;
  let totalScore = 0;
  let totalGateFailures = 0;
  let totalPhases = 0;
  const cycleTimes: number[] = [];
  let totalRetries = 0;
  let totalFixRoutingCycles = 0;
  let totalGuardViolations = 0;

  for (const report of reports) {
    const phases = report.phases || [];
    
    const reportRetries = phases.reduce((sum, p) => sum + (p.retries || 0), 0);
    const cycleTime = phases.reduce((sum, p) => sum + parseDuration(p.duration_estimate), 0);

    totalPhases += phases.length;
    totalGateFailures += phases.filter(p => p.gate_result === 'fail').length;

    if (report.overall_status === 'DONE') {
      doneCount++;
      if (reportRetries === 0) {
        passAt1Count++;
      }
    }

    totalScore += report.partial_credit_score || 0;
    cycleTimes.push(cycleTime);
    totalRetries += reportRetries;
    
    if (report.fix_routing) {
      totalFixRoutingCycles += (report.fix_routing.code_review_cycles || 0) + (report.fix_routing.arch_review_cycles || 0);
    }
    
    if (report.guard_violations) {
      totalGuardViolations += report.guard_violations.length;
    }
  }

  const numReports = reports.length;

  return {
    tsr: doneCount / numReports,
    pass_at_1: passAt1Count / numReports,
    code_quality_score: totalScore / numReports,
    gate_failure_rate: totalPhases > 0 ? totalGateFailures / totalPhases : 0,
    median_cycle_time: calculateMedian(cycleTimes),
    total_retries_avg: totalRetries / numReports,
    fix_routing_cycles_avg: totalFixRoutingCycles / numReports,
    guard_violations_total: totalGuardViolations,
    guard_violations_per_run: totalGuardViolations / numReports,
  };
}
