import { resolve } from 'node:path';
import {
  loadThresholdsConfig,
  loadTriggersConfig,
} from '@/triggers/config-loader.js';

describe('config-loader', () => {
  it('parses triggers.yaml with valid schema', () => {
    const configPath = resolve(process.cwd(), 'config/triggers.yaml');
    const config = loadTriggersConfig(configPath);

    expect(config.auto_refinement_triggers.event_driven.guard_violation.threshold).toBe(1);
    expect(config.auto_refinement_triggers.commit_based.action).toBe('subset_eval');
  });

  it('parses thresholds.json with valid schema', () => {
    const configPath = resolve(process.cwd(), 'config/thresholds.json');
    const config = loadThresholdsConfig(configPath);

    expect(config.pipeline_kpis.tsr_target).toBe(0.8);
    expect(config.phase_gates.GREEN.max_retries).toBe(3);
    expect(config.role_metrics['tdd-documenter'].task_master_update).toBe(true);
  });
});
