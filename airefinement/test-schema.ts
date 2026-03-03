import { ExperimentResultSchema } from './src/telemetry/schemas.js';
import { makeAggregatedMetrics, makeVersionManifest } from './tests/fixtures/helpers.js';

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
