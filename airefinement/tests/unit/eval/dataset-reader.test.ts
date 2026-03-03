import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { loadGoldenDataset, filterByTestType, filterByDifficulty } from '@/eval/dataset-reader.js';
import { CollectorError } from '@/telemetry/collector.js';
import type { GoldenDatasetTask } from '@/telemetry/schemas.js';

const makeTask = (overrides: Partial<GoldenDatasetTask> = {}): GoldenDatasetTask => ({
  id: 'task-1',
  description: 'Test task description',
  parent_task: 'Task 1',
  subtask_index: 1,
  test_type: 'unit',
  acceptance: {
    tests_must_fail_initially: true,
    tests_must_pass_after_green: true,
    no_test_modifications_in_green: true,
    static_analysis_clean: true,
    architecture_check: 'none',
  },
  reference_solution: 'implement the function',
  graders: ['grader-1'],
  difficulty: 'easy',
  ...overrides,
});

describe('loadGoldenDataset', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = join(tmpdir(), `dataset-reader-test-${randomUUID()}`);
    mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should parse valid JSONL file and return array of GoldenDatasetTask', () => {
    const task1 = makeTask({ id: 'task-1', test_type: 'unit', difficulty: 'easy' });
    const task2 = makeTask({ id: 'task-2', test_type: 'integration', difficulty: 'hard' });
    const filePath = join(tmpDir, 'dataset.jsonl');
    writeFileSync(filePath, `${JSON.stringify(task1)}\n${JSON.stringify(task2)}\n`);

    const result = loadGoldenDataset(filePath);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({ id: 'task-1', test_type: 'unit', difficulty: 'easy' });
    expect(result[1]).toMatchObject({ id: 'task-2', test_type: 'integration', difficulty: 'hard' });
  });

  it('should return empty array for empty file', () => {
    const filePath = join(tmpDir, 'empty.jsonl');
    writeFileSync(filePath, '');

    const result = loadGoldenDataset(filePath);

    expect(result).toEqual([]);
  });

  it('should throw CollectorError for non-existent file', () => {
    const filePath = join(tmpDir, 'does-not-exist.jsonl');

    expect(() => loadGoldenDataset(filePath)).toThrow(CollectorError);
  });

  it('should throw CollectorError with line number for invalid JSON on a line', () => {
    const task1 = makeTask({ id: 'task-1' });
    const filePath = join(tmpDir, 'invalid-json.jsonl');
    writeFileSync(filePath, `${JSON.stringify(task1)}\nnot valid json\n`);

    expect(() => loadGoldenDataset(filePath)).toThrow(CollectorError);
    expect(() => loadGoldenDataset(filePath)).toThrow(/line 2/i);
  });

  it('should throw CollectorError with line number when schema validation fails', () => {
    const validTask = makeTask({ id: 'task-1' });
    const invalidTask = { id: 'task-2', description: 'Missing required fields' };
    const filePath = join(tmpDir, 'invalid-schema.jsonl');
    writeFileSync(filePath, `${JSON.stringify(validTask)}\n${JSON.stringify(invalidTask)}\n`);

    expect(() => loadGoldenDataset(filePath)).toThrow(CollectorError);
    expect(() => loadGoldenDataset(filePath)).toThrow(/line 2/i);
  });
});

describe('filterByTestType', () => {
  const tasks: GoldenDatasetTask[] = [
    makeTask({ id: 'unit-1', test_type: 'unit' }),
    makeTask({ id: 'unit-2', test_type: 'unit' }),
    makeTask({ id: 'integration-1', test_type: 'integration' }),
    makeTask({ id: 'both-1', test_type: 'both' }),
  ];

  it('should return only tasks with test_type="unit"', () => {
    const result = filterByTestType(tasks, 'unit');

    expect(result).toHaveLength(2);
    expect(result.every((t) => t.test_type === 'unit')).toBe(true);
    expect(result.map((t) => t.id)).toEqual(['unit-1', 'unit-2']);
  });

  it('should return only tasks with test_type="both"', () => {
    const result = filterByTestType(tasks, 'both');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('both-1');
  });

  it('should return only tasks with test_type="integration"', () => {
    const result = filterByTestType(tasks, 'integration');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('integration-1');
  });

  it('should return empty array when no tasks match the type', () => {
    const unitOnly = [makeTask({ id: 'unit-1', test_type: 'unit' })];
    const result = filterByTestType(unitOnly, 'both');

    expect(result).toEqual([]);
  });
});

describe('filterByDifficulty', () => {
  const tasks: GoldenDatasetTask[] = [
    makeTask({ id: 'easy-1', difficulty: 'easy' }),
    makeTask({ id: 'easy-2', difficulty: 'easy' }),
    makeTask({ id: 'medium-1', difficulty: 'medium' }),
    makeTask({ id: 'hard-1', difficulty: 'hard' }),
    makeTask({ id: 'adversarial-1', difficulty: 'adversarial' }),
  ];

  it('should return only tasks with difficulty="easy"', () => {
    const result = filterByDifficulty(tasks, 'easy');

    expect(result).toHaveLength(2);
    expect(result.every((t) => t.difficulty === 'easy')).toBe(true);
    expect(result.map((t) => t.id)).toEqual(['easy-1', 'easy-2']);
  });

  it('should return only tasks with difficulty="hard"', () => {
    const result = filterByDifficulty(tasks, 'hard');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('hard-1');
  });

  it('should return only tasks with difficulty="medium"', () => {
    const result = filterByDifficulty(tasks, 'medium');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('medium-1');
  });

  it('should return only tasks with difficulty="adversarial"', () => {
    const result = filterByDifficulty(tasks, 'adversarial');

    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('adversarial-1');
  });

  it('should return empty array when no tasks match the difficulty', () => {
    const easyOnly = [makeTask({ id: 'easy-1', difficulty: 'easy' })];
    const result = filterByDifficulty(easyOnly, 'hard');

    expect(result).toEqual([]);
  });
});
