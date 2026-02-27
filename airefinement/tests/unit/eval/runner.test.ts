import { describe, it, expect } from '@jest/globals';
import { aggregateTrialResults, buildTaskComparisons, makeDecision } from '@/eval/runner.js';
import type { TaskTrialResult } from '@/eval/runner.js';
import type { CompositeResult } from '@/eval/graders/composite.js';
import type { GraderResult } from '@/eval/graders/deterministic.js';
import type { AggregatedMetrics, TaskComparison } from '@/telemetry/schemas.js';

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

function makeGraderResult(grader: string, score: number): GraderResult {
  return { grader, score, pass: score >= 0.5, details: {} };
}

function makeCompositeResult(
  score: number,
  phaseProgressionScore: number = 1.0,
  guardScore: number = 1.0,
): CompositeResult {
  return {
    overall_score: score,
    pass: score >= 0.5,
    individual_scores: {
      guard_compliance: makeGraderResult('GuardComplianceGrader', guardScore),
    },
    partial_credit: {
      phases_completed: Math.round(phaseProgressionScore * 6),
      phases_total: 6,
      phase_progression_score: phaseProgressionScore,
      grader_ensemble_score: score,
      final_score: score,
    },
  };
}

function makeTrialResult(
  taskId: string,
  trial: number,
  score: number,
  durationMs: number,
  phaseProgressionScore: number = 1.0,
  guardScore: number = 1.0,
): TaskTrialResult {
  return {
    task_id: taskId,
    trial,
    composite_result: makeCompositeResult(score, phaseProgressionScore, guardScore),
    duration_ms: durationMs,
    claude_exit_code: 0,
  };
}

function makeAggregatedMetrics(overrides: Partial<AggregatedMetrics> = {}): AggregatedMetrics {
  return {
    tsr: 1.0,
    pass_at_1: 1.0,
    pass_3: 1.0,
    code_quality_score: 1.0,
    total_tokens: 0,
    median_cycle_time: 100,
    gate_failure_rate: 0.0,
    guard_violations: 0,
    ...overrides,
  };
}

function makeComparison(
  taskId: string,
  controlScore: number,
  variantScore: number,
): TaskComparison {
  const delta = variantScore - controlScore;
  const outcome = (s: number): 'pass' | 'fail' | 'partial' =>
    s >= 0.5 ? 'pass' : s < 0.25 ? 'fail' : 'partial';
  return {
    task_id: taskId,
    control_outcome: outcome(controlScore),
    variant_outcome: outcome(variantScore),
    control_score: controlScore,
    variant_score: variantScore,
    delta,
    regression: delta < -0.05,
  };
}

// ---------------------------------------------------------------------------
// aggregateTrialResults
// ---------------------------------------------------------------------------

describe('aggregateTrialResults', () => {
  describe('tsr / pass_at_1 / pass_3', () => {
    it('returns tsr=1.0, pass_at_1=1.0, pass_3=1.0 when all tasks pass all trials', () => {
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100),
        makeTrialResult('task-1', 1, 0.9, 120),
        makeTrialResult('task-1', 2, 0.7, 110),
        makeTrialResult('task-2', 0, 0.8, 100),
        makeTrialResult('task-2', 1, 0.9, 120),
        makeTrialResult('task-2', 2, 0.7, 110),
      ];
      const metrics = aggregateTrialResults(results, 2, 3);
      expect(metrics.tsr).toBe(1.0);
      expect(metrics.pass_at_1).toBe(1.0);
      expect(metrics.pass_3).toBe(1.0);
    });

    it('returns tsr=0.0, pass_at_1=0.0, pass_3=0.0 when all tasks fail', () => {
      const results = [
        makeTrialResult('task-1', 0, 0.3, 100),
        makeTrialResult('task-1', 1, 0.4, 120),
        makeTrialResult('task-2', 0, 0.2, 100),
        makeTrialResult('task-2', 1, 0.3, 120),
      ];
      const metrics = aggregateTrialResults(results, 2, 2);
      expect(metrics.tsr).toBe(0.0);
      expect(metrics.pass_at_1).toBe(0.0);
      expect(metrics.pass_3).toBe(0.0);
    });

    it('distinguishes pass_at_1 from pass_3 when task passes only in trial 1', () => {
      // trial 0 fails, trial 1 passes → pass_at_1=0, pass_3=1, tsr=1
      const results = [
        makeTrialResult('task-1', 0, 0.3, 100), // fail
        makeTrialResult('task-1', 1, 0.8, 120), // pass
        makeTrialResult('task-1', 2, 0.7, 110), // pass
      ];
      const metrics = aggregateTrialResults(results, 1, 3);
      expect(metrics.pass_at_1).toBe(0.0);
      expect(metrics.pass_3).toBe(1.0);
      expect(metrics.tsr).toBe(1.0);
    });

    it('computes pass_at_1=0.5 and pass_3=1.0 when one of two tasks passes only in later trial', () => {
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100), // task-1 passes at trial 0
        makeTrialResult('task-1', 1, 0.9, 120),
        makeTrialResult('task-2', 0, 0.3, 100), // task-2 fails at trial 0
        makeTrialResult('task-2', 1, 0.8, 120), // task-2 passes at trial 1
      ];
      const metrics = aggregateTrialResults(results, 2, 2);
      expect(metrics.pass_at_1).toBeCloseTo(0.5);
      expect(metrics.pass_3).toBeCloseTo(1.0);
    });
  });

  describe('code_quality_score', () => {
    it('computes code_quality_score as average overall_score across all results', () => {
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100),
        makeTrialResult('task-2', 0, 0.6, 100),
      ];
      const metrics = aggregateTrialResults(results, 2, 1);
      expect(metrics.code_quality_score).toBeCloseTo(0.7);
    });
  });

  describe('total_tokens', () => {
    it('always returns total_tokens=0 as placeholder', () => {
      const results = [makeTrialResult('task-1', 0, 0.8, 100)];
      const metrics = aggregateTrialResults(results, 1, 1);
      expect(metrics.total_tokens).toBe(0);
    });
  });

  describe('median_cycle_time', () => {
    it('computes median of duration_ms for odd count (picks middle value)', () => {
      // sorted: [100, 200, 300] → median = 200
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100),
        makeTrialResult('task-1', 1, 0.8, 300),
        makeTrialResult('task-1', 2, 0.8, 200),
      ];
      const metrics = aggregateTrialResults(results, 1, 3);
      expect(metrics.median_cycle_time).toBe(200);
    });

    it('computes median as average of two middle values for even count', () => {
      // sorted: [100, 200, 300, 400] → median = (200 + 300) / 2 = 250
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100),
        makeTrialResult('task-1', 1, 0.8, 400),
        makeTrialResult('task-2', 0, 0.8, 200),
        makeTrialResult('task-2', 1, 0.8, 300),
      ];
      const metrics = aggregateTrialResults(results, 2, 2);
      expect(metrics.median_cycle_time).toBe(250);
    });
  });

  describe('gate_failure_rate', () => {
    it('computes gate_failure_rate as 1 minus average phase_progression_score', () => {
      // avg phase_progression = (0.5 + 1.0) / 2 = 0.75 → gate_failure_rate = 0.25
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100, 0.5),
        makeTrialResult('task-2', 0, 0.8, 100, 1.0),
      ];
      const metrics = aggregateTrialResults(results, 2, 1);
      expect(metrics.gate_failure_rate).toBeCloseTo(0.25);
    });

    it('returns gate_failure_rate=0 when all phase_progression_score=1.0', () => {
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100, 1.0),
        makeTrialResult('task-2', 0, 0.8, 100, 1.0),
      ];
      const metrics = aggregateTrialResults(results, 2, 1);
      expect(metrics.gate_failure_rate).toBeCloseTo(0.0);
    });
  });

  describe('guard_violations', () => {
    it('counts results where guard_compliance individual score === 0', () => {
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100, 1.0, 0), // violation
        makeTrialResult('task-2', 0, 0.8, 100, 1.0, 1), // no violation
        makeTrialResult('task-3', 0, 0.8, 100, 1.0, 0), // violation
      ];
      const metrics = aggregateTrialResults(results, 3, 1);
      expect(metrics.guard_violations).toBe(2);
    });

    it('returns guard_violations=0 when no guard failures', () => {
      const results = [
        makeTrialResult('task-1', 0, 0.8, 100, 1.0, 1),
        makeTrialResult('task-2', 0, 0.8, 100, 1.0, 1),
      ];
      const metrics = aggregateTrialResults(results, 2, 1);
      expect(metrics.guard_violations).toBe(0);
    });
  });

  describe('empty input', () => {
    it('returns all zeros when results is empty (taskCount=0)', () => {
      const metrics = aggregateTrialResults([], 0, 0);
      expect(metrics.tsr).toBe(0);
      expect(metrics.pass_at_1).toBe(0);
      expect(metrics.pass_3).toBe(0);
      expect(metrics.code_quality_score).toBe(0);
      expect(metrics.total_tokens).toBe(0);
      expect(metrics.median_cycle_time).toBe(0);
      expect(metrics.gate_failure_rate).toBe(0);
      expect(metrics.guard_violations).toBe(0);
    });
  });
});

// ---------------------------------------------------------------------------
// buildTaskComparisons
// ---------------------------------------------------------------------------

describe('buildTaskComparisons', () => {
  it('reports positive delta and regression=false when variant improves a task', () => {
    const control = [makeTrialResult('task-1', 0, 0.5, 100)];
    const variant = [makeTrialResult('task-1', 0, 0.8, 100)];
    const comparisons = buildTaskComparisons(control, variant);
    expect(comparisons).toHaveLength(1);
    expect(comparisons[0].delta).toBeCloseTo(0.3);
    expect(comparisons[0].regression).toBe(false);
  });

  it('reports regression=true when delta is significantly negative (< -0.05)', () => {
    const control = [makeTrialResult('task-1', 0, 0.8, 100)];
    const variant = [makeTrialResult('task-1', 0, 0.3, 100)];
    const comparisons = buildTaskComparisons(control, variant);
    expect(comparisons[0].delta).toBeCloseTo(-0.5);
    expect(comparisons[0].regression).toBe(true);
  });

  it('reports regression=false when delta is -0.03 (within -0.05 tolerance)', () => {
    const control = [makeTrialResult('task-1', 0, 0.8, 100)];
    const variant = [makeTrialResult('task-1', 0, 0.77, 100)];
    const comparisons = buildTaskComparisons(control, variant);
    expect(comparisons[0].regression).toBe(false);
  });

  it('reports regression=false at exact boundary delta=-0.05 (inclusive)', () => {
    const control = [makeTrialResult('task-1', 0, 0.8, 100)];
    const variant = [makeTrialResult('task-1', 0, 0.75, 100)];
    const comparisons = buildTaskComparisons(control, variant);
    expect(comparisons[0].delta).toBeCloseTo(-0.05);
    expect(comparisons[0].regression).toBe(false);
  });

  it('classifies outcomes: >=0.5 → pass, <0.25 → fail, between → partial', () => {
    const control = [
      makeTrialResult('task-pass', 0, 0.8, 100),
      makeTrialResult('task-fail', 0, 0.1, 100),
      makeTrialResult('task-partial', 0, 0.4, 100),
    ];
    const variant = [
      makeTrialResult('task-pass', 0, 0.9, 100),
      makeTrialResult('task-fail', 0, 0.2, 100),
      makeTrialResult('task-partial', 0, 0.35, 100),
    ];
    const comparisons = buildTaskComparisons(control, variant);
    const byId = Object.fromEntries(comparisons.map(c => [c.task_id, c]));
    expect(byId['task-pass'].control_outcome).toBe('pass');
    expect(byId['task-fail'].control_outcome).toBe('fail');
    expect(byId['task-partial'].control_outcome).toBe('partial');
    expect(byId['task-pass'].variant_outcome).toBe('pass');
    expect(byId['task-fail'].variant_outcome).toBe('fail');
    expect(byId['task-partial'].variant_outcome).toBe('partial');
  });

  it('uses best trial score when multiple variant trials exist per task', () => {
    const control = [makeTrialResult('task-1', 0, 0.5, 100)];
    const variant = [
      makeTrialResult('task-1', 0, 0.3, 100), // low
      makeTrialResult('task-1', 1, 0.9, 120), // high → best
      makeTrialResult('task-1', 2, 0.6, 110),
    ];
    const comparisons = buildTaskComparisons(control, variant);
    expect(comparisons[0].variant_score).toBeCloseTo(0.9);
    expect(comparisons[0].delta).toBeCloseTo(0.4);
    expect(comparisons[0].regression).toBe(false);
  });

  it('uses best trial score for control tasks with multiple trials', () => {
    const control = [
      makeTrialResult('task-1', 0, 0.4, 100), // low
      makeTrialResult('task-1', 1, 0.8, 120), // high → best
    ];
    const variant = [makeTrialResult('task-1', 0, 0.75, 100)];
    const comparisons = buildTaskComparisons(control, variant);
    expect(comparisons[0].control_score).toBeCloseTo(0.8);
    expect(comparisons[0].delta).toBeCloseTo(-0.05);
  });

  it('produces one TaskComparison per unique task_id', () => {
    const control = [
      makeTrialResult('task-1', 0, 0.7, 100),
      makeTrialResult('task-2', 0, 0.8, 100),
    ];
    const variant = [
      makeTrialResult('task-1', 0, 0.75, 100),
      makeTrialResult('task-2', 0, 0.85, 100),
    ];
    const comparisons = buildTaskComparisons(control, variant);
    expect(comparisons).toHaveLength(2);
    const ids = comparisons.map(c => c.task_id).sort();
    expect(ids).toEqual(['task-1', 'task-2']);
  });
});

// ---------------------------------------------------------------------------
// makeDecision
// ---------------------------------------------------------------------------

describe('makeDecision', () => {
  it('returns accept when variant beats control on all key metrics and no regressions', () => {
    const control = makeAggregatedMetrics({ tsr: 0.8, pass_at_1: 0.7, code_quality_score: 0.75 });
    const variant = makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.8, code_quality_score: 0.85 });
    const result = makeDecision(control, variant, []);
    expect(result.decision).toBe('accept');
  });

  it('returns accept when all key metrics are equal and no regressions', () => {
    const control = makeAggregatedMetrics({ tsr: 0.8, pass_at_1: 0.7, code_quality_score: 0.75 });
    const variant = makeAggregatedMetrics({ tsr: 0.8, pass_at_1: 0.7, code_quality_score: 0.75 });
    const result = makeDecision(control, variant, []);
    expect(result.decision).toBe('accept');
  });

  it('returns reject when variant is worse on tsr', () => {
    const control = makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.8, code_quality_score: 0.85 });
    const variant = makeAggregatedMetrics({ tsr: 0.7, pass_at_1: 0.85, code_quality_score: 0.9 });
    const result = makeDecision(control, variant, []);
    expect(result.decision).toBe('reject');
  });

  it('returns reject when variant is worse on pass_at_1', () => {
    const control = makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.85, code_quality_score: 0.85 });
    const variant = makeAggregatedMetrics({ tsr: 0.95, pass_at_1: 0.7, code_quality_score: 0.9 });
    const result = makeDecision(control, variant, []);
    expect(result.decision).toBe('reject');
  });

  it('returns reject when variant is worse on code_quality_score', () => {
    const control = makeAggregatedMetrics({ tsr: 0.8, pass_at_1: 0.7, code_quality_score: 0.85 });
    const variant = makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.8, code_quality_score: 0.6 });
    const result = makeDecision(control, variant, []);
    expect(result.decision).toBe('reject');
  });

  it('returns reject when more than 20% of tasks have regression (2 of 5 = 40%)', () => {
    const control = makeAggregatedMetrics();
    const variant = makeAggregatedMetrics();
    const comparisons: TaskComparison[] = [
      makeComparison('task-1', 0.8, 0.3), // regression (delta=-0.5)
      makeComparison('task-2', 0.8, 0.3), // regression (delta=-0.5)
      makeComparison('task-3', 0.8, 0.9), // improvement
      makeComparison('task-4', 0.8, 0.9), // improvement
      makeComparison('task-5', 0.8, 0.9), // improvement
    ];
    const result = makeDecision(control, variant, comparisons);
    expect(result.decision).toBe('reject');
  });

  it('returns accept_with_caveat when variant is better on key metrics but 20% tasks regressed', () => {
    const control = makeAggregatedMetrics({ tsr: 0.8, pass_at_1: 0.7, code_quality_score: 0.75 });
    const variant = makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.8, code_quality_score: 0.85 });
    // 1 of 5 tasks regressed = 20% (boundary — still accept_with_caveat, not reject)
    const comparisons: TaskComparison[] = [
      makeComparison('task-1', 0.8, 0.3), // regression
      makeComparison('task-2', 0.8, 0.9), // improvement
      makeComparison('task-3', 0.8, 0.9), // improvement
      makeComparison('task-4', 0.8, 0.9), // improvement
      makeComparison('task-5', 0.8, 0.9), // improvement
    ];
    const result = makeDecision(control, variant, comparisons);
    expect(result.decision).toBe('accept_with_caveat');
  });

  it('returns accept_with_caveat when variant is better on metrics but has one regression (of 3)', () => {
    const control = makeAggregatedMetrics({ tsr: 0.7, pass_at_1: 0.6, code_quality_score: 0.7 });
    const variant = makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.85, code_quality_score: 0.9 });
    const comparisons: TaskComparison[] = [
      makeComparison('task-1', 0.8, 0.3), // regression (33.3% > 20%) — NO, 1/3 = 33% > 20% → reject?
      makeComparison('task-2', 0.8, 0.9),
      makeComparison('task-3', 0.8, 0.9),
    ];
    // 1/3 = 33% > 20% → should be reject despite good overall metrics
    const result = makeDecision(control, variant, comparisons);
    expect(result.decision).toBe('reject');
  });

  it('returns non-empty rationale for every decision', () => {
    const cases: Array<[AggregatedMetrics, AggregatedMetrics, TaskComparison[]]> = [
      // accept
      [
        makeAggregatedMetrics({ tsr: 0.8, pass_at_1: 0.7, code_quality_score: 0.75 }),
        makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.8, code_quality_score: 0.85 }),
        [],
      ],
      // reject (tsr regression)
      [
        makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.8, code_quality_score: 0.85 }),
        makeAggregatedMetrics({ tsr: 0.7, pass_at_1: 0.85, code_quality_score: 0.9 }),
        [],
      ],
      // accept_with_caveat
      [
        makeAggregatedMetrics({ tsr: 0.8, pass_at_1: 0.7, code_quality_score: 0.75 }),
        makeAggregatedMetrics({ tsr: 0.9, pass_at_1: 0.8, code_quality_score: 0.85 }),
        [
          makeComparison('task-1', 0.8, 0.3),
          makeComparison('task-2', 0.8, 0.9),
          makeComparison('task-3', 0.8, 0.9),
          makeComparison('task-4', 0.8, 0.9),
          makeComparison('task-5', 0.8, 0.9),
        ],
      ],
    ];

    for (const [control, variant, comparisons] of cases) {
      const result = makeDecision(control, variant, comparisons);
      expect(result.rationale).toBeTruthy();
      expect(result.rationale.length).toBeGreaterThan(0);
    }
  });
});
