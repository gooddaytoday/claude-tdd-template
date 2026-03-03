import type { GraderResult } from '@/eval/graders/deterministic.js';

export interface CompositeConfig {
  weights: {
    test_runner: number;
    static_analysis: number;
    test_mutation: number;
    guard_compliance: number;
    llm_test_quality: number;
    llm_impl_minimality: number;
    llm_doc_completeness: number;
  };
}

export interface CompositeInput {
  config: CompositeConfig;
  results: Record<string, GraderResult>;
  phasesCompleted: number;
  phasesTotal: number;
}

export interface PartialCreditBreakdown {
  phases_completed: number;
  phases_total: number;
  phase_progression_score: number;
  grader_ensemble_score: number;
  final_score: number;
}

export interface CompositeResult {
  overall_score: number;
  pass: boolean;
  individual_scores: Record<string, GraderResult>;
  partial_credit: PartialCreditBreakdown;
}

export function gradeComposite(input: CompositeInput): CompositeResult {
  const { config, results, phasesCompleted, phasesTotal } = input;
  const weights = config.weights;

  const weightSum = Object.values(weights).reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightSum - 1.0) > 0.01) {
    throw new Error(`Weights must sum to 1.0, got ${weightSum}`);
  }

  const grader_ensemble_score =
    (Object.keys(weights) as Array<keyof typeof weights>).reduce(
      (sum, key) => sum + weights[key] * (results[key]?.score ?? 0),
      0,
    );

  const phase_progression_score =
    phasesTotal === 0 ? 0 : Math.max(0, Math.min(1, phasesCompleted / phasesTotal));

  const final_score = phase_progression_score * 0.4 + grader_ensemble_score * 0.6;

  const partial_credit: PartialCreditBreakdown = {
    phases_completed: phasesCompleted,
    phases_total: phasesTotal,
    phase_progression_score,
    grader_ensemble_score,
    final_score,
  };

  return {
    overall_score: final_score,
    pass: final_score >= 0.5,
    individual_scores: { ...results },
    partial_credit,
  };
}
