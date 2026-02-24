import { z } from 'zod';

export const PhaseRecordSchema = z.object({
  phase: z.enum(['RED', 'GREEN', 'REFACTOR', 'CODE_REVIEW', 'ARCH_REVIEW', 'DOCS']),
  status: z.enum(['passed', 'failed', 'skipped']),
  retries: z.number(),
  gate_result: z.enum(['pass', 'fail']),
  gate_failure_reason: z.string().nullable(),
  changed_files: z.array(z.string()),
  duration_estimate: z.string().nullable(),
});

export type PhaseRecord = z.infer<typeof PhaseRecordSchema>;

export const FixRoutingRecordSchema = z.object({
  code_review_cycles: z.number(),
  arch_review_cycles: z.number(),
  escalations: z.array(z.object({
    phase: z.string(),
    reason: z.string(),
    fix_request_id: z.string().optional(),
  })),
});

export type FixRoutingRecord = z.infer<typeof FixRoutingRecordSchema>;

export const GuardViolationEventSchema = z.object({
  timestamp: z.string(),
  agent: z.string(),
  attempted_action: z.string(),
  target_file: z.string(),
  blocked: z.boolean(),
  reason: z.string(),
});

export type GuardViolationEvent = z.infer<typeof GuardViolationEventSchema>;

export const RunReportSchema = z.object({
  run_id: z.string(),
  timestamp: z.string(),
  task_id: z.string(),
  subtask_id: z.string(),
  feature: z.string(),
  test_type: z.enum(['unit', 'integration', 'both']),
  phases: z.array(PhaseRecordSchema),
  fix_routing: FixRoutingRecordSchema,
  guard_violations: z.array(GuardViolationEventSchema),
  overall_status: z.enum(['DONE', 'FAILED', 'ESCALATED']),
  partial_credit_score: z.number(),
});

export type RunReport = z.infer<typeof RunReportSchema>;

export const SubagentTimingEventSchema = z.object({
  timestamp: z.string(),
  agent: z.string(),
  phase: z.string(),
  started_at: z.string(),
  finished_at: z.string(),
  tool_calls_count: z.number(),
});

export type SubagentTimingEvent = z.infer<typeof SubagentTimingEventSchema>;

export const GoldenDatasetTaskSchema = z.object({
  id: z.string(),
  description: z.string(),
  parent_task: z.string(),
  subtask_index: z.number(),
  test_type: z.enum(['unit', 'integration', 'both']),
  acceptance: z.object({
    tests_must_fail_initially: z.boolean(),
    tests_must_pass_after_green: z.boolean(),
    no_test_modifications_in_green: z.boolean(),
    static_analysis_clean: z.boolean(),
    architecture_check: z.string(),
  }),
  reference_solution: z.string(),
  graders: z.array(z.string()),
  difficulty: z.enum(['easy', 'medium', 'hard', 'adversarial']),
});

export type GoldenDatasetTask = z.infer<typeof GoldenDatasetTaskSchema>;

export const VersionManifestSchema = z.object({
  agent_prompts_hash: z.string(),
  skill_hash: z.string(),
  hooks_hash: z.string(),
  settings_hash: z.string(),
  dataset_version: z.string(),
});

export type VersionManifest = z.infer<typeof VersionManifestSchema>;

export const AggregatedMetricsSchema = z.object({
  tsr: z.number(),
  pass_at_1: z.number(),
  pass_3: z.number(),
  code_quality_score: z.number(),
  total_tokens: z.number(),
  median_cycle_time: z.number(),
  gate_failure_rate: z.number(),
  guard_violations: z.number(),
});

export type AggregatedMetrics = z.infer<typeof AggregatedMetricsSchema>;

export const TaskComparisonSchema = z.object({
  task_id: z.string(),
  control_outcome: z.enum(['pass', 'fail', 'partial']),
  variant_outcome: z.enum(['pass', 'fail', 'partial']),
  control_score: z.number(),
  variant_score: z.number(),
  delta: z.number(),
  regression: z.boolean(),
});

export type TaskComparison = z.infer<typeof TaskComparisonSchema>;

export const ExperimentResultSchema = z.object({
  experiment_id: z.string(),
  timestamp: z.string(),
  hypothesis: z.string(),
  variant_description: z.string(),
  dataset_version: z.string(),
  control_config: VersionManifestSchema,
  variant_config: VersionManifestSchema,
  control_results: AggregatedMetricsSchema,
  variant_results: AggregatedMetricsSchema,
  per_task_comparison: z.array(TaskComparisonSchema),
  decision: z.enum(['accept', 'reject', 'accept_with_caveat']),
  decision_rationale: z.string(),
});

export type ExperimentResult = z.infer<typeof ExperimentResultSchema>;
