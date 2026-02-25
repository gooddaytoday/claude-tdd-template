import { describe, it, expect } from '@jest/globals';
import { calibrateLlmJudge, type CalibrationResult } from '@/eval/graders/calibration.js';

function makeAnnotations(scores: number[]): Array<{ input: string; humanScore: number }> {
  return scores.map((s, i) => ({ input: `sample_${i}`, humanScore: s }));
}

function makeLlmScores(scores: number[]): Array<{ input: string; llmScore: number }> {
  return scores.map((s, i) => ({ input: `sample_${i}`, llmScore: s }));
}

describe('calibrateLlmJudge', () => {
  describe('return type', () => {
    it('returns a Promise', async () => {
      const result = calibrateLlmJudge(
        'test-rubric',
        makeAnnotations([1, 2, 3]),
        makeLlmScores([1, 2, 3]),
      );
      expect(result).toBeInstanceOf(Promise);
      // Suppress unhandled rejection from stub implementation
      await result.catch(() => {});
    });
  });

  describe('result shape', () => {
    it('populates rubric field from input', async () => {
      const result = await calibrateLlmJudge(
        'my-special-rubric',
        makeAnnotations([1, 2, 3]),
        makeLlmScores([1, 2, 3]),
      );
      expect(result.rubric).toBe('my-special-rubric');
    });

    it('populates sample_size from humanAnnotations.length', async () => {
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([4, 2, 5, 1, 3]),
        makeLlmScores([4, 2, 5, 1, 3]),
      );
      expect(result.sample_size).toBe(5);
    });

    it('result has all required fields', async () => {
      const result: CalibrationResult = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3]),
        makeLlmScores([1, 2, 3]),
      );
      expect(result).toHaveProperty('rubric');
      expect(result).toHaveProperty('spearman_correlation');
      expect(result).toHaveProperty('sample_size');
      expect(result).toHaveProperty('calibrated');
    });
  });

  describe('Spearman correlation computation', () => {
    it('returns spearman_correlation 1.0 for perfect positive correlation', async () => {
      // Identical rank order -> rho = 1.0
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([1, 2, 3, 4, 5]),
      );
      expect(result.spearman_correlation).toBeCloseTo(1.0, 5);
    });

    it('returns spearman_correlation -1.0 for perfect inverse correlation', async () => {
      // Exact reverse -> rho = -1.0
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([5, 4, 3, 2, 1]),
      );
      expect(result.spearman_correlation).toBeCloseTo(-1.0, 5);
    });

    it('computes strong correlation correctly (rho ~0.9)', async () => {
      // [1,2,3,4,5] vs [1,2,4,3,5] — one swap, d^2 sum = 2 -> rho = 1 - 12/120 = 0.9
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([1, 2, 4, 3, 5]),
      );
      expect(result.spearman_correlation).toBeCloseTo(0.9, 5);
    });

    it('computes weak correlation correctly (rho ~0.5)', async () => {
      // [1,2,3,4,5] vs [1,3,5,2,4]
      // ranks human: [1,2,3,4,5], ranks llm: [1,3,5,2,4]
      // d: [0,-1,-2,2,1], d^2: [0,1,4,4,1] -> sum=10 -> rho = 1 - 60/120 = 0.5
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([1, 3, 5, 2, 4]),
      );
      expect(result.spearman_correlation).toBeCloseTo(0.5, 5);
    });

    it('n=2 edge case: perfect positive correlation', async () => {
      // n=2: rho = 1 - 6*0/(2*3) = 1.0
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2]),
        makeLlmScores([1, 2]),
      );
      expect(result.spearman_correlation).toBeCloseTo(1.0, 5);
    });

    it('n=2 edge case: perfect inverse correlation', async () => {
      // n=2: rho = 1 - 6*2/(2*3) = -1.0
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2]),
        makeLlmScores([2, 1]),
      );
      expect(result.spearman_correlation).toBeCloseTo(-1.0, 5);
    });
  });

  describe('tied ranks handling', () => {
    it('assigns average rank for tied values', async () => {
      // humanScores: [3, 1, 3] -> sorted: 1(rank1), 3(rank2), 3(rank3) -> ties avg=2.5
      // humanRanks: [2.5, 1.0, 2.5]
      // llmScores: [3, 1, 3] -> same -> llmRanks: [2.5, 1.0, 2.5]
      // All d_i = 0 -> rho = 1.0
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([3, 1, 3]),
        makeLlmScores([3, 1, 3]),
      );
      expect(result.spearman_correlation).toBeCloseTo(1.0, 5);
    });

    it('correctly computes rho with ties in one array', async () => {
      // humanScores: [1, 2, 3], no ties -> ranks [1, 2, 3]
      // llmScores:   [2, 2, 3] -> sorted: 2(r1),2(r2),3(r3) -> ties at r1,r2: avg=1.5
      // llmRanks: [1.5, 1.5, 3.0]
      // d: [1-1.5, 2-1.5, 3-3] = [-0.5, 0.5, 0]
      // d^2: [0.25, 0.25, 0] -> sum = 0.5
      // rho = 1 - 6*0.5 / (3*(9-1)) = 1 - 3/24 = 1 - 0.125 = 0.875
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3]),
        makeLlmScores([2, 2, 3]),
      );
      expect(result.spearman_correlation).toBeCloseTo(0.875, 5);
    });
  });

  describe('calibrated threshold', () => {
    it('calibrated is true when spearman_correlation >= 0.80 (perfect 1.0)', async () => {
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([1, 2, 3, 4, 5]),
      );
      expect(result.calibrated).toBe(true);
    });

    it('calibrated is true when spearman_correlation is exactly 0.80', async () => {
      // Need rho = 0.80 exactly for n=5:
      // rho = 1 - 6*sum_d2 / (5*24) = 0.80 -> 6*sum_d2 = 0.20*120 = 24 -> sum_d2 = 4
      // [1,2,3,4,5] vs [1,3,2,5,4]: d=[0,-1,1,-1,1] -> sum_d2=4 -> rho=1-24/120=0.8
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([1, 3, 2, 5, 4]),
      );
      expect(result.spearman_correlation).toBeCloseTo(0.8, 5);
      expect(result.calibrated).toBe(true);
    });

    it('calibrated is false when spearman_correlation is 0.5', async () => {
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([1, 3, 5, 2, 4]),
      );
      expect(result.spearman_correlation).toBeCloseTo(0.5, 5);
      expect(result.calibrated).toBe(false);
    });

    it('calibrated is false for perfect inverse correlation (-1.0)', async () => {
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([5, 4, 3, 2, 1]),
      );
      expect(result.calibrated).toBe(false);
    });

    it('calibrated is true when strong correlation (~0.9)', async () => {
      const result = await calibrateLlmJudge(
        'rubric',
        makeAnnotations([1, 2, 3, 4, 5]),
        makeLlmScores([1, 2, 4, 3, 5]),
      );
      expect(result.calibrated).toBe(true);
    });
  });
});
