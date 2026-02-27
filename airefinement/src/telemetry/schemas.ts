import { z } from 'zod';

export const PhaseSchema = z.enum(['RED', 'GREEN', 'REFACTOR', 'CODE_REVIEW', 'ARCH_REVIEW', 'DOCS']);

export const PhaseRecordSchema = z.object({
  phase: PhaseSchema,
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
    phase: PhaseSchema,
    reason: z.string(),
    fix_request_id: z.string().optional(),
  })),
});

export type FixRoutingRecord = z.infer<typeof FixRoutingRecordSchema>;

export const GuardViolationEventSchema = z.object({
  timestamp: z.iso.datetime(),
  agent: z.string(),
  attempted_action: z.string(),
  target_file: z.string(),
  blocked: z.boolean(),
  reason: z.string(),
});

export type GuardViolationEvent = z.infer<typeof GuardViolationEventSchema>;

export const RunReportSchema = z.object({
  run_id: z.string(),
  timestamp: z.iso.datetime(),
  task_id: z.string(),
  subtask_id: z.string(),
  feature: z.string(),
  test_type: z.enum(['unit', 'integration', 'both']),
  phases: z.array(PhaseRecordSchema),
  fix_routing: FixRoutingRecordSchema,
  guard_violations: z.array(GuardViolationEventSchema),
  overall_status: z.enum(['DONE', 'FAILED', 'ESCALATED']),
  partial_credit_score: z.number(),
  total_tokens: z.number().optional(),
});

export type RunReport = z.infer<typeof RunReportSchema>;

export const SubagentTimingEventSchema = z.object({
  timestamp: z.iso.datetime(),
  agent: z.string(),
  phase: PhaseSchema,
  started_at: z.string(),
  finished_at: z.string(),
  tool_calls_count: z.number(),
});

export type SubagentTimingEvent = z.infer<typeof SubagentTimingEventSchema>;

export const TraceEventSchema = z.union([
  GuardViolationEventSchema,
  SubagentTimingEventSchema,
]);

export type TraceEvent = z.infer<typeof TraceEventSchema>;

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
  timestamp: z.iso.datetime(),
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

export const TriggerResultSchema = z.object({
  type: z.enum(['event_driven', 'trend_based', 'commit_based']),
  rule: z.string(),
  severity: z.enum(['critical', 'warning', 'info']),
  description: z.string(),
  affected_phase: PhaseSchema.optional(),
  affected_agent: z.string().optional(),
  evidence: z.record(z.string(), z.unknown()),
});

export type TriggerResult = z.infer<typeof TriggerResultSchema>;

export const AnalysisResultSchema = z.object({
  timestamp: z.iso.datetime(),
  runs_analyzed: z.number(),
  traces_analyzed: z.number(),
  triggers_fired: z.array(TriggerResultSchema),
  recommendation: z.enum(['refine', 'eval_only', 'no_action']),
  summary: z.string(),
});

export type AnalysisResult = z.infer<typeof AnalysisResultSchema>;

export const EventDrivenConfigSchema = z.object({
  guard_violation: z.object({
    threshold: z.number(),
    description: z.string(),
  }),
  gate_failure_streak: z.object({
    threshold: z.number(),
    description: z.string(),
  }),
  token_anomaly: z.object({
    sigma_threshold: z.number(),
    description: z.string(),
  }),
  manual_intervention_streak: z.object({
    threshold: z.number(),
    description: z.string(),
  }),
});

export type EventDrivenConfig = z.infer<typeof EventDrivenConfigSchema>;

export const TrendBasedConfigSchema = z.object({
  tsr_drop: z.object({
    threshold_percent: z.number(),
    window_runs: z.number(),
    description: z.string(),
  }),
  token_inflation: z.object({
    threshold_percent: z.number(),
    window_runs: z.number(),
    description: z.string(),
  }),
  flake_rate: z.object({
    threshold_percent: z.number(),
    window_runs: z.number(),
    description: z.string(),
  }),
});

export type TrendBasedConfig = z.infer<typeof TrendBasedConfigSchema>;

export const CommitBasedConfigSchema = z.object({
  watched_paths: z.array(z.string()),
  action: z.string(),
  subset_size: z.number(),
  block_if: z.string(),
});

export type CommitBasedConfig = z.infer<typeof CommitBasedConfigSchema>;

export const TriggersConfigSchema = z.object({
  auto_refinement_triggers: z.object({
    event_driven: EventDrivenConfigSchema,
    trend_based: TrendBasedConfigSchema,
    commit_based: CommitBasedConfigSchema,
  }),
});

export type TriggersConfig = z.infer<typeof TriggersConfigSchema>;

export const ThresholdsConfigSchema = z.object({
  pipeline_kpis: z.object({
    tsr_target: z.number(),
    pass_at_1_target: z.number(),
    pass_3_target: z.number(),
    code_quality_score_target: z.number(),
    defect_escape_rate_max: z.number(),
    gate_failure_rate_max_per_phase: z.number(),
    guard_violations_max: z.number(),
    flake_rate_max: z.number(),
  }),
  phase_gates: z.object({
    RED: z.object({
      must_fail_with_assertion: z.boolean(),
    }),
    GREEN: z.object({
      must_pass: z.boolean(),
      max_retries: z.number(),
    }),
    REFACTOR: z.object({
      must_stay_green: z.boolean(),
    }),
    CODE_REVIEW: z.object({
      max_fix_cycles: z.number(),
    }),
    ARCH_REVIEW: z.object({
      max_fix_cycles: z.number(),
    }),
    DOCS: z.object({
      must_update_task_master: z.boolean(),
    }),
  }),
  role_metrics: z.record(z.string(), z.record(z.string(), z.union([z.number(), z.boolean()]))),
});

export type ThresholdsConfig = z.infer<typeof ThresholdsConfigSchema>;
