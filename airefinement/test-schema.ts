import { ExperimentResultSchema } from './src/telemetry/schemas.js';

const makeVersionManifest = () => ({
  agent_prompts_hash: 'abc123',
  skill_hash: 'def456',
  hooks_hash: 'ghi789',
  settings_hash: 'jkl012',
  dataset_version: '1.0.0',
});

const makeAggregatedMetrics = () => ({
  tsr: 0.85,
  pass_at_1: 0.75,
  pass_3: 0.6,
  code_quality_score: 0.9,
  total_tokens: 5000,
  median_cycle_time: 30,
  gate_failure_rate: 0.1,
  guard_violations: 0,
});

const mock = {
  experiment_id: 'exp-1',
  timestamp: '2026-02-20T10:00:00.000Z',
  hypothesis: 'Improving prompt quality increases TSR',
  variant_description: 'Enhanced prompts',
  dataset_version: '1.0.0',
  control_config: makeVersionManifest(),
  variant_config: makeVersionManifest(),
  control_results: makeAggregatedMetrics(),
  variant_results: makeAggregatedMetrics({ tsr: 0.9 }),
  per_task_comparison: [
    {
      task_id: 'task-1',
      control_outcome: 'pass',
      variant_outcome: 'pass',
      control_score: 1,
      variant_score: 1,
      delta: 0,
      regression: false,
    },
  ],
  decision: 'accept',
  decision_rationale: 'Variant shows improvement across all metrics',
};

try {
  ExperimentResultSchema.parse(mock);
  console.log("Success");
} catch (e) {
  console.log("Error:", JSON.stringify(e.issues, null, 2));
}
