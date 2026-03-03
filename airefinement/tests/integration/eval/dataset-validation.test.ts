import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadGoldenDataset } from '@/eval/dataset-reader.js';
import { GoldenDatasetTaskSchema } from '@/telemetry/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DATASET_PATH = resolve(__dirname, '../../../datasets/golden-v1.jsonl');

describe('Golden Dataset golden-v1.jsonl validation', () => {
  it('file exists at datasets/golden-v1.jsonl', () => {
    expect(existsSync(DATASET_PATH)).toBe(true);
  });

  describe('when file exists', () => {
    let tasks: ReturnType<typeof loadGoldenDataset>;

    beforeAll(() => {
      tasks = loadGoldenDataset(DATASET_PATH);
    });

    it('contains at least 5 tasks', () => {
      expect(tasks.length).toBeGreaterThanOrEqual(5);
    });

    it('all tasks conform to GoldenDatasetTaskSchema', () => {
      for (const task of tasks) {
        const result = GoldenDatasetTaskSchema.safeParse(task);
        expect(result.success).toBe(true);
      }
    });

    it('all task IDs are unique', () => {
      const ids = tasks.map((t) => t.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);
    });

    it('contains at least one task with test_type="unit"', () => {
      const unitTasks = tasks.filter((t) => t.test_type === 'unit');
      expect(unitTasks.length).toBeGreaterThanOrEqual(1);
    });

    it('contains at least one task with test_type="integration"', () => {
      const integrationTasks = tasks.filter((t) => t.test_type === 'integration');
      expect(integrationTasks.length).toBeGreaterThanOrEqual(1);
    });
  });
});
