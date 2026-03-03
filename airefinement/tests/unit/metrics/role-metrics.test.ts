import { RunReport } from '@/telemetry/schemas.js';
import { computeRoleMetrics } from '@/metrics/role-metrics.js';

describe('Role Metrics Computation', () => {
  it('should compute metrics for all subagents correctly', () => {
    // Arrange
    const reports: RunReport[] = [
      {
        run_id: 'run-1',
        timestamp: '2023-10-01T12:00:00Z',
        task_id: 't-1',
        subtask_id: 'st-1',
        feature: 'feat',
        test_type: 'unit',
        phases: [
          {
            phase: 'RED',
            status: 'failed',
            retries: 2,
            gate_result: 'pass',
            gate_failure_reason: null,
            changed_files: [],
            duration_estimate: '1m',
          },
          {
            phase: 'RED',
            status: 'failed',
            retries: 1,
            gate_result: 'fail',
            gate_failure_reason: 'syntax error',
            changed_files: [],
            duration_estimate: '1m',
          },
          {
            phase: 'GREEN',
            status: 'passed',
            retries: 3,
            gate_result: 'pass',
            gate_failure_reason: null,
            changed_files: [],
            duration_estimate: '2m',
          },
          {
            phase: 'REFACTOR',
            status: 'passed',
            retries: 0,
            gate_result: 'pass',
            gate_failure_reason: null,
            changed_files: [],
            duration_estimate: '1m',
          },
          {
            phase: 'REFACTOR',
            status: 'passed',
            retries: 0,
            gate_result: 'fail',
            gate_failure_reason: 'regression',
            changed_files: [],
            duration_estimate: '1m',
          },
          {
            phase: 'DOCS',
            status: 'passed',
            retries: 0,
            gate_result: 'pass',
            gate_failure_reason: null,
            changed_files: [],
            duration_estimate: '1m',
          }
        ],
        fix_routing: {
          code_review_cycles: 2,
          arch_review_cycles: 1,
          escalations: [
            { phase: 'GREEN', reason: 'stuck' },
            { phase: 'CODE_REVIEW', reason: 'rejected' }
          ],
        },
        guard_violations: [],
        overall_status: 'DONE',
        partial_credit_score: 1.0,
      }
    ];

    // Act
    const metrics = computeRoleMetrics(reports);

    // Assert tdd-test-writer (RED phase)
    // failing_test_rate: phases where RED gate_result === 'pass' (1) / total runs (1)
    expect(metrics['tdd-test-writer']).toBeDefined();
    expect(metrics['tdd-test-writer'].failing_test_rate).toBe(1);
    // red_invalid_rate: phases where RED gate_failure_reason contains 'syntax' or 'import' (1) / total RED phases (2)
    expect(metrics['tdd-test-writer'].red_invalid_rate).toBe(0.5);
    // retries_to_valid_red: average retries in RED phase = (2 + 1) / 2 = 1.5
    expect(metrics['tdd-test-writer'].retries_to_valid_red).toBe(1.5);

    // Assert tdd-implementer (GREEN phase)
    // tests_pass_rate: phases where GREEN gate_result === 'pass' (1) / total runs (1)
    expect(metrics['tdd-implementer']).toBeDefined();
    expect(metrics['tdd-implementer'].tests_pass_rate).toBe(1);
    // retry_count_avg: average retries in GREEN phase = 3 / 1 = 3
    expect(metrics['tdd-implementer'].retry_count_avg).toBe(3);
    // escalation_rate: GREEN escalations (1) / total runs (1) = 1
    expect(metrics['tdd-implementer'].escalation_rate).toBe(1);

    // Assert tdd-refactorer (REFACTOR phase)
    // tests_remain_green_rate: REFACTOR gate_result === 'pass' (1) / total runs (1)
    expect(metrics['tdd-refactorer']).toBeDefined();
    expect(metrics['tdd-refactorer'].tests_remain_green_rate).toBe(1);
    // regression_rate: REFACTOR phases that broke tests (fail) (1) / total REFACTOR phases (2) = 0.5
    expect(metrics['tdd-refactorer'].regression_rate).toBe(0.5);

    // Assert tdd-code-reviewer (CODE_REVIEW phase)
    // fix_cycles_avg: average code_review_cycles from fix_routing (2)
    expect(metrics['tdd-code-reviewer']).toBeDefined();
    expect(metrics['tdd-code-reviewer'].fix_cycles_avg).toBe(2);
    // escalation_rate: CODE_REVIEW escalations (1) / total runs (1) = 1
    expect(metrics['tdd-code-reviewer'].escalation_rate).toBe(1);

    // Assert tdd-architect-reviewer (ARCH_REVIEW phase)
    // fix_cycles_avg: average arch_review_cycles from fix_routing (1)
    expect(metrics['tdd-architect-reviewer']).toBeDefined();
    expect(metrics['tdd-architect-reviewer'].fix_cycles_avg).toBe(1);
    // pass_rate: ARCH_REVIEW gate_result === 'pass' (0, no ARCH_REVIEW phase in data) / total runs (1)
    expect(metrics['tdd-architect-reviewer'].pass_rate).toBe(0);

    // Assert tdd-documenter (DOCS phase)
    // completion_rate: DOCS gate_result === 'pass' (1) / total runs (1)
    expect(metrics['tdd-documenter']).toBeDefined();
    expect(metrics['tdd-documenter'].completion_rate).toBe(1);
  });
});
