import { describe, it, expect } from '@jest/globals';
import { gradeComposite } from '@/eval/graders/composite.js';
import type { GraderResult } from '@/eval/graders/deterministic.js';

function makeResult(grader: string, score: number, pass: boolean): GraderResult {
  return { grader, score, pass, details: {} };
}

const DEFAULT_WEIGHTS = {
  test_runner: 0.30,
  static_analysis: 0.15,
  test_mutation: 0.15,
  guard_compliance: 0.10,
  llm_test_quality: 0.10,
  llm_impl_minimality: 0.10,
  llm_doc_completeness: 0.10,
};

function makeAllResults(score: number): Record<string, GraderResult> {
  return {
    test_runner: makeResult('test_runner', score, score >= 0.5),
    static_analysis: makeResult('static_analysis', score, score >= 0.5),
    test_mutation: makeResult('test_mutation', score, score >= 0.5),
    guard_compliance: makeResult('guard_compliance', score, score >= 0.5),
    llm_test_quality: makeResult('llm_test_quality', score, score >= 0.5),
    llm_impl_minimality: makeResult('llm_impl_minimality', score, score >= 0.5),
    llm_doc_completeness: makeResult('llm_doc_completeness', score, score >= 0.5),
  };
}

describe('gradeComposite', () => {
  describe('result shape', () => {
    it('returns CompositeResult with all required fields', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(1.0),
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result).toHaveProperty('overall_score');
      expect(result).toHaveProperty('pass');
      expect(result).toHaveProperty('individual_scores');
      expect(result).toHaveProperty('partial_credit');
    });

    it('partial_credit has all required sub-fields', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(1.0),
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.partial_credit).toHaveProperty('phases_completed');
      expect(result.partial_credit).toHaveProperty('phases_total');
      expect(result.partial_credit).toHaveProperty('phase_progression_score');
      expect(result.partial_credit).toHaveProperty('grader_ensemble_score');
      expect(result.partial_credit).toHaveProperty('final_score');
    });
  });

  describe('weighted ensemble score', () => {
    it('returns grader_ensemble_score 1.0 when all graders score 1.0', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(1.0),
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(1.0, 5);
    });

    it('returns grader_ensemble_score 0.0 when all graders score 0.0', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.0),
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(0.0, 5);
    });

    it('computes weighted score: test_runner=1.0 (0.30), rest 0.0 → ensemble ≈ 0.30', () => {
      const results: Record<string, GraderResult> = {
        ...makeAllResults(0.0),
        test_runner: makeResult('test_runner', 1.0, true),
      };

      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results,
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(0.30, 5);
    });

    it('computes weighted score: test_runner=1.0 (0.30) + static_analysis=1.0 (0.15) → ensemble ≈ 0.45', () => {
      const results: Record<string, GraderResult> = {
        ...makeAllResults(0.0),
        test_runner: makeResult('test_runner', 1.0, true),
        static_analysis: makeResult('static_analysis', 1.0, true),
      };

      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results,
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(0.45, 5);
    });
  });

  describe('individual_scores', () => {
    it('preserves GraderResult objects passed in results', () => {
      const graderResults = makeAllResults(0.7);

      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: graderResults,
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.individual_scores['test_runner']).toEqual(graderResults['test_runner']);
      expect(result.individual_scores['static_analysis']).toEqual(graderResults['static_analysis']);
      expect(result.individual_scores['guard_compliance']).toEqual(graderResults['guard_compliance']);
    });
  });

  describe('missing grader key', () => {
    it('treats absent grader key as score 0 without throwing', () => {
      const partialResults: Record<string, GraderResult> = {
        test_runner: makeResult('test_runner', 1.0, true),
      };

      expect(() => {
        gradeComposite({
          config: { weights: DEFAULT_WEIGHTS },
          results: partialResults,
          phasesCompleted: 3,
          phasesTotal: 3,
        });
      }).not.toThrow();

      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: partialResults,
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(0.30, 5);
    });
  });

  describe('weight validation', () => {
    it('throws Error when weights sum to != 1.0 (tolerance 0.01)', () => {
      const badWeights = {
        test_runner: 0.20,
        static_analysis: 0.15,
        test_mutation: 0.15,
        guard_compliance: 0.10,
        llm_test_quality: 0.10,
        llm_impl_minimality: 0.10,
        llm_doc_completeness: 0.00,
      };

      expect(() => {
        gradeComposite({
          config: { weights: badWeights },
          results: makeAllResults(1.0),
          phasesCompleted: 3,
          phasesTotal: 3,
        });
      }).toThrow(Error);
    });

    it('does not throw when weights sum to 1.0 exactly', () => {
      expect(() => {
        gradeComposite({
          config: { weights: DEFAULT_WEIGHTS },
          results: makeAllResults(1.0),
          phasesCompleted: 3,
          phasesTotal: 3,
        });
      }).not.toThrow();
    });
  });

  describe('pass threshold', () => {
    it('pass is true when overall_score >= 0.5', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(1.0),
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.overall_score).toBeGreaterThanOrEqual(0.5);
      expect(result.pass).toBe(true);
    });

    it('pass is false when overall_score < 0.5', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.0),
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.overall_score).toBeLessThan(0.5);
      expect(result.pass).toBe(false);
    });
  });

  describe('overall_score consistency', () => {
    it('overall_score equals partial_credit.final_score', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.8),
        phasesCompleted: 3,
        phasesTotal: 3,
      });

      expect(result.overall_score).toBe(result.partial_credit.final_score);
    });
  });

  describe('partial credit formula', () => {
    // final_score = phase_progression * 0.4 + ensemble * 0.6
    // phase_progression = clamp(phasesCompleted / phasesTotal, 0, 1)

    it('final_score = 0.0 when 0/6 phases completed and all graders 0.0', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.0),
        phasesCompleted: 0,
        phasesTotal: 6,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(0.0, 5);
      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(0.0, 5);
      expect(result.partial_credit.final_score).toBeCloseTo(0.0, 5);
    });

    it('final_score = 1.0 when 6/6 phases completed and all graders 1.0', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(1.0),
        phasesCompleted: 6,
        phasesTotal: 6,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(1.0, 5);
      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(1.0, 5);
      expect(result.partial_credit.final_score).toBeCloseTo(1.0, 5);
    });

    it('final_score = 0.20 when 3/6 phases completed and all graders 0.0 (progression contributes)', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.0),
        phasesCompleted: 3,
        phasesTotal: 6,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(0.5, 5);
      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(0.0, 5);
      expect(result.partial_credit.final_score).toBeCloseTo(0.20, 5);
    });

    it('final_score = 0.60 when 0/6 phases completed and all graders 1.0 (ensemble contributes)', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(1.0),
        phasesCompleted: 0,
        phasesTotal: 6,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(0.0, 5);
      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(1.0, 5);
      expect(result.partial_credit.final_score).toBeCloseTo(0.60, 5);
    });

    it('final_score ≈ 0.4467 when 4/6 phases and test_runner=1.0 rest 0.0', () => {
      const results: Record<string, GraderResult> = {
        ...makeAllResults(0.0),
        test_runner: makeResult('test_runner', 1.0, true),
      };

      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results,
        phasesCompleted: 4,
        phasesTotal: 6,
      });

      // phase_progression = 4/6 ≈ 0.6667, ensemble = 0.30
      // final_score = 0.6667 * 0.4 + 0.30 * 0.6 ≈ 0.2667 + 0.18 = 0.4467
      expect(result.partial_credit.phase_progression_score).toBeCloseTo(4 / 6, 5);
      expect(result.partial_credit.grader_ensemble_score).toBeCloseTo(0.30, 5);
      expect(result.partial_credit.final_score).toBeCloseTo(0.4467, 3);
    });

    it('phase_progression_score in partial_credit equals phasesCompleted / phasesTotal', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.5),
        phasesCompleted: 3,
        phasesTotal: 6,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(3 / 6, 5);
    });

    it('phase_progression_score = 0 when phasesTotal = 0 (guard against division by zero)', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.0),
        phasesCompleted: 0,
        phasesTotal: 0,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(0.0, 5);
    });

    it('phase_progression_score clamped to 1.0 when phasesCompleted > phasesTotal (7/6)', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.0),
        phasesCompleted: 7,
        phasesTotal: 6,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(1.0, 5);
    });

    it('phase_progression_score clamped to 0.0 when phasesCompleted is negative (-1/6)', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(0.0),
        phasesCompleted: -1,
        phasesTotal: 6,
      });

      expect(result.partial_credit.phase_progression_score).toBeCloseTo(0.0, 5);
    });

    it('overall_score equals partial_credit.final_score with non-trivial phase progression', () => {
      const result = gradeComposite({
        config: { weights: DEFAULT_WEIGHTS },
        results: makeAllResults(1.0),
        phasesCompleted: 0,
        phasesTotal: 6,
      });

      // new formula: final_score = 0.0 * 0.4 + 1.0 * 0.6 = 0.60
      expect(result.overall_score).toBeCloseTo(0.60, 5);
      expect(result.overall_score).toBe(result.partial_credit.final_score);
    });
  });
});
