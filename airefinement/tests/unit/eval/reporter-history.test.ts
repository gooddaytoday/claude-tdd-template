import { jest, describe, it, expect, beforeEach } from '@jest/globals';
import type { ExperimentResult } from '@/telemetry/schemas.js';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic import
// node:fs (sync) mock only; node:fs/promises is NOT mocked here
// (saveReport's mkdir/writeFile are untouched in this test file)
// ---------------------------------------------------------------------------

const mockReaddirSync = jest.fn();
const mockReadFileSync = jest.fn();

jest.unstable_mockModule('node:fs', () => ({
  readdirSync: mockReaddirSync,
  readFileSync: mockReadFileSync,
}));

// Dynamic imports after mock setup
const { loadExperimentHistory, formatHistoryTable } = await import('@/eval/reporter.js');
const { CollectorError } = await import('@/telemetry/collector.js');

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function makeExperiment(overrides: Partial<ExperimentResult> = {}): ExperimentResult {
  return {
    experiment_id: 'exp-2026-02-25-abc12345',
    timestamp: '2026-02-25T10:00:00.000Z',
    hypothesis: 'Test hypothesis',
    variant_description: 'variant-v1',
    dataset_version: 'v1',
    control_config: {
      agent_prompts_hash: 'a',
      skill_hash: 'b',
      hooks_hash: 'c',
      settings_hash: 'd',
      dataset_version: 'v1',
    },
    variant_config: {
      agent_prompts_hash: 'a',
      skill_hash: 'b',
      hooks_hash: 'c',
      settings_hash: 'd',
      dataset_version: 'v1',
    },
    control_results: {
      tsr: 0.80,
      pass_at_1: 0.75,
      pass_3: 0.85,
      code_quality_score: 0.70,
      total_tokens: 1000,
      median_cycle_time: 30000,
      gate_failure_rate: 0.10,
      guard_violations: 2,
    },
    variant_results: {
      tsr: 0.85,
      pass_at_1: 0.80,
      pass_3: 0.90,
      code_quality_score: 0.75,
      total_tokens: 950,
      median_cycle_time: 28000,
      gate_failure_rate: 0.08,
      guard_violations: 1,
    },
    per_task_comparison: [],
    decision: 'accept',
    decision_rationale: 'All metrics improved',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// loadExperimentHistory tests
// ---------------------------------------------------------------------------

describe('loadExperimentHistory', () => {
  beforeEach(() => {
    mockReaddirSync.mockReset();
    mockReadFileSync.mockReset();
  });

  it('returns empty array when directory contains no files', () => {
    mockReaddirSync.mockReturnValue([]);
    const result = loadExperimentHistory('/reports');
    expect(result).toEqual([]);
  });

  it('returns empty array when directory has only non-.json files', () => {
    mockReaddirSync.mockReturnValue(['README.md', 'notes.txt', 'summary.csv']);
    const result = loadExperimentHistory('/reports');
    expect(result).toEqual([]);
  });

  it('filters out non-.json files and reads only .json files', () => {
    const exp = makeExperiment();
    mockReaddirSync.mockReturnValue(['exp.json', 'README.md', 'notes.txt']);
    mockReadFileSync.mockReturnValue(JSON.stringify(exp));
    const result = loadExperimentHistory('/reports');
    expect(result).toHaveLength(1);
    expect(mockReadFileSync).toHaveBeenCalledTimes(1);
  });

  it('parses ExperimentResult from JSON file content', () => {
    const exp = makeExperiment();
    mockReaddirSync.mockReturnValue(['exp.json']);
    mockReadFileSync.mockReturnValue(JSON.stringify(exp));
    const result = loadExperimentHistory('/reports');
    expect(result).toHaveLength(1);
    expect(result[0].experiment_id).toBe('exp-2026-02-25-abc12345');
    expect(result[0].decision).toBe('accept');
    expect(result[0].hypothesis).toBe('Test hypothesis');
  });

  it('sorts multiple results by timestamp descending (newest first)', () => {
    const older = makeExperiment({
      experiment_id: 'exp-older',
      timestamp: '2026-01-15T12:00:00.000Z',
    });
    const middle = makeExperiment({
      experiment_id: 'exp-middle',
      timestamp: '2026-02-01T12:00:00.000Z',
    });
    const newer = makeExperiment({
      experiment_id: 'exp-newer',
      timestamp: '2026-02-25T12:00:00.000Z',
    });
    mockReaddirSync.mockReturnValue(['exp-older.json', 'exp-newer.json', 'exp-middle.json']);
    mockReadFileSync
      .mockReturnValueOnce(JSON.stringify(older))
      .mockReturnValueOnce(JSON.stringify(newer))
      .mockReturnValueOnce(JSON.stringify(middle));
    const result = loadExperimentHistory('/reports');
    expect(result[0].experiment_id).toBe('exp-newer');
    expect(result[1].experiment_id).toBe('exp-middle');
    expect(result[2].experiment_id).toBe('exp-older');
  });

  it('returns single experiment as array of length 1', () => {
    const exp = makeExperiment();
    mockReaddirSync.mockReturnValue(['exp.json']);
    mockReadFileSync.mockReturnValue(JSON.stringify(exp));
    const result = loadExperimentHistory('/reports');
    expect(Array.isArray(result)).toBe(true);
    expect(result).toHaveLength(1);
  });

  it('throws CollectorError when JSON is malformed', () => {
    mockReaddirSync.mockReturnValue(['bad.json']);
    mockReadFileSync.mockReturnValue('not valid json {{{');
    expect(() => loadExperimentHistory('/reports')).toThrow(CollectorError);
  });

  it('throws CollectorError when JSON has invalid schema (missing required fields)', () => {
    const invalidData = { experiment_id: 'x', timestamp: 'y' };
    mockReaddirSync.mockReturnValue(['invalid.json']);
    mockReadFileSync.mockReturnValue(JSON.stringify(invalidData));
    expect(() => loadExperimentHistory('/reports')).toThrow(CollectorError);
  });
});

// ---------------------------------------------------------------------------
// formatHistoryTable tests
// ---------------------------------------------------------------------------

describe('formatHistoryTable', () => {
  it('returns "No experiments found" for empty array', () => {
    const result = formatHistoryTable([]);
    expect(result).toBe('No experiments found');
  });

  it('contains "# Experiment History" header', () => {
    const result = formatHistoryTable([makeExperiment()]);
    expect(result).toContain('# Experiment History');
  });

  it('contains all required column headers', () => {
    const result = formatHistoryTable([makeExperiment()]);
    expect(result).toContain('Date');
    expect(result).toContain('Experiment');
    expect(result).toContain('TSR');
    expect(result).toContain('pass@1');
    expect(result).toContain('Guard Violations');
    expect(result).toContain('Decision');
  });

  it('row contains experiment_id', () => {
    const exp = makeExperiment({ experiment_id: 'exp-unique-xyz-789' });
    const result = formatHistoryTable([exp]);
    expect(result).toContain('exp-unique-xyz-789');
  });

  it('row contains variant TSR value from variant_results', () => {
    const result = formatHistoryTable([makeExperiment()]);
    // variant_results.tsr = 0.85
    expect(result).toContain('0.85');
  });

  it('row contains variant pass_at_1 value from variant_results', () => {
    const result = formatHistoryTable([makeExperiment()]);
    // variant_results.pass_at_1 = 0.80
    expect(result).toContain('0.80');
  });

  it('row contains guard_violations value from variant_results', () => {
    const exp = makeExperiment();
    const result = formatHistoryTable([exp]);
    // variant_results.guard_violations = 1
    expect(result).toMatch(/\|\s*1\s*\|/);
  });

  it('marks accepted experiments with a visual marker (✓, ✅, or [ACCEPT])', () => {
    const exp = makeExperiment({ decision: 'accept' });
    const result = formatHistoryTable([exp]);
    expect(result).toMatch(/✓|✅|\[ACCEPT\]/);
  });

  it('does not show accept marker for rejected experiments', () => {
    const exp = makeExperiment({ decision: 'reject' });
    const result = formatHistoryTable([exp]);
    expect(result).toContain('reject');
    expect(result).not.toMatch(/✓|✅|\[ACCEPT\]/);
  });

  it('shows accept_with_caveat decision text in table', () => {
    const exp = makeExperiment({ decision: 'accept_with_caveat' });
    const result = formatHistoryTable([exp]);
    expect(result).toContain('accept_with_caveat');
  });

  it('table has markdown pipe-delimited row for each experiment', () => {
    const exp1 = makeExperiment({ experiment_id: 'exp-a', timestamp: '2026-02-25T00:00:00.000Z' });
    const exp2 = makeExperiment({ experiment_id: 'exp-b', timestamp: '2026-02-24T00:00:00.000Z' });
    const result = formatHistoryTable([exp1, exp2]);
    expect(result).toContain('exp-a');
    expect(result).toContain('exp-b');
    const rows = result.split('\n').filter(line => line.includes('|'));
    // header + separator + 2 data rows = at least 4 pipe-delimited lines
    expect(rows.length).toBeGreaterThanOrEqual(4);
  });
});
