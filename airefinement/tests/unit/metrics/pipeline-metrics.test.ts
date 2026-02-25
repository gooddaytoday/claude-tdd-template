import { computePipelineKPIs } from '@/metrics/pipeline-metrics';
import { RunReport } from '@/telemetry/schemas';

describe('computePipelineKPIs', () => {
  const baseReport: Omit<RunReport, 'run_id' | 'overall_status' | 'partial_credit_score' | 'phases' | 'fix_routing' | 'guard_violations'> = {
    timestamp: '2025-01-01T00:00:00Z',
    task_id: 'task-1',
    subtask_id: 'subtask-1',
    feature: 'test',
    test_type: 'unit',
    total_tokens: 1000,
  };

  it('should compute outcome KPIs correctly', () => {
    const reports: RunReport[] = [
      {
        ...baseReport,
        run_id: 'run-1',
        overall_status: 'DONE',
        partial_credit_score: 100,
        phases: [
          { phase: 'RED', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '10s' },
          { phase: 'GREEN', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '20s' },
        ],
        fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
        guard_violations: [],
      },
      {
        ...baseReport,
        run_id: 'run-2',
        overall_status: 'FAILED',
        partial_credit_score: 50,
        phases: [
          { phase: 'RED', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '15s' },
          { phase: 'GREEN', status: 'failed', retries: 2, gate_result: 'fail', gate_failure_reason: 'error', changed_files: [], duration_estimate: '30s' },
        ],
        fix_routing: { code_review_cycles: 1, arch_review_cycles: 0, escalations: [] },
        guard_violations: [
          { timestamp: '2025-01-01', agent: 'agent', attempted_action: 'write', target_file: 'test.ts', blocked: true, reason: 'test' }
        ],
      },
      {
        ...baseReport,
        run_id: 'run-3',
        overall_status: 'DONE',
        partial_credit_score: 90,
        phases: [
          { phase: 'RED', status: 'passed', retries: 1, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '12s' },
          { phase: 'GREEN', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '25s' },
        ],
        fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
        guard_violations: [],
      }
    ];

    const kpis = computePipelineKPIs(reports);

    // tsr: 2 DONE / 3 total = 0.666...
    expect(kpis.tsr).toBeCloseTo(0.6667, 4);
    
    // pass_at_1: 1 DONE with 0 retries (run-1) / 3 total = 0.333...
    expect(kpis.pass_at_1).toBeCloseTo(0.3333, 4);
    
    // code_quality_score: (100 + 50 + 90) / 3 = 80
    expect(kpis.code_quality_score).toBe(80);
    
    // gate_failure_rate: 1 fail (run-2 GREEN) / 6 total phases = 0.166...
    expect(kpis.gate_failure_rate).toBeCloseTo(0.1667, 4);
  });

  it('should compute trajectory KPIs correctly', () => {
    const reports: RunReport[] = [
      {
        ...baseReport,
        run_id: 'run-1',
        overall_status: 'DONE',
        partial_credit_score: 100,
        phases: [
          { phase: 'RED', status: 'passed', retries: 1, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '10' },
          { phase: 'GREEN', status: 'passed', retries: 2, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '20s' },
        ],
        fix_routing: { code_review_cycles: 1, arch_review_cycles: 2, escalations: [] },
        guard_violations: [],
      },
      {
        ...baseReport,
        run_id: 'run-2',
        overall_status: 'DONE',
        partial_credit_score: 100,
        phases: [
          { phase: 'RED', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '15s' },
          { phase: 'GREEN', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '30s' },
        ],
        fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
        guard_violations: [],
      },
      {
        ...baseReport,
        run_id: 'run-3',
        overall_status: 'DONE',
        partial_credit_score: 100,
        phases: [
          { phase: 'RED', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '12s' },
          { phase: 'GREEN', status: 'passed', retries: 0, gate_result: 'pass', gate_failure_reason: null, changed_files: [], duration_estimate: '25m' }, // 25m = 1500s
        ],
        fix_routing: { code_review_cycles: 0, arch_review_cycles: 1, escalations: [] },
        guard_violations: [],
      }
    ];

    const kpis = computePipelineKPIs(reports);

    // median_cycle_time:
    // run-1: 10 + 20 = 30s
    // run-2: 15 + 30 = 45s
    // run-3: 12 + 1500 = 1512s
    // median of [30, 45, 1512] is 45
    expect(kpis.median_cycle_time).toBe(45);

    // total_retries_avg: (3 + 0 + 0) / 3 = 1
    expect(kpis.total_retries_avg).toBe(1);

    // fix_routing_cycles_avg: (3 + 0 + 1) / 3 = 1.333...
    expect(kpis.fix_routing_cycles_avg).toBeCloseTo(1.3333, 4);
  });

  it('should compute system health KPIs correctly', () => {
    const reports: RunReport[] = [
      {
        ...baseReport,
        run_id: 'run-1',
        overall_status: 'DONE',
        partial_credit_score: 100,
        phases: [],
        fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
        guard_violations: [
          { timestamp: '1', agent: 'a', attempted_action: 'w', target_file: 'f', blocked: true, reason: 'r' },
          { timestamp: '2', agent: 'a', attempted_action: 'w', target_file: 'f', blocked: true, reason: 'r' },
        ],
      },
      {
        ...baseReport,
        run_id: 'run-2',
        overall_status: 'DONE',
        partial_credit_score: 100,
        phases: [],
        fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
        guard_violations: [],
      },
      {
        ...baseReport,
        run_id: 'run-3',
        overall_status: 'DONE',
        partial_credit_score: 100,
        phases: [],
        fix_routing: { code_review_cycles: 0, arch_review_cycles: 0, escalations: [] },
        guard_violations: [
          { timestamp: '3', agent: 'a', attempted_action: 'w', target_file: 'f', blocked: true, reason: 'r' },
        ],
      }
    ];

    const kpis = computePipelineKPIs(reports);

    // guard_violations_total: 2 + 0 + 1 = 3
    expect(kpis.guard_violations_total).toBe(3);

    // guard_violations_per_run: 3 / 3 = 1
    expect(kpis.guard_violations_per_run).toBe(1);
  });
});
