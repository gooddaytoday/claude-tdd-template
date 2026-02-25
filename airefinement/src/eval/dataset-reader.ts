import { readFileSync } from 'node:fs';
import { CollectorError } from '@/telemetry/collector.js';
import { GoldenDatasetTaskSchema } from '@/telemetry/schemas.js';
import type { GoldenDatasetTask } from '@/telemetry/schemas.js';

export function loadGoldenDataset(filePath: string): GoldenDatasetTask[] {
  let content: string;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (error) {
    throw new CollectorError(`Failed to read file: ${filePath}`, error);
  }

  const lines = content.split('\n').filter((line) => line.trim() !== '');
  const tasks: GoldenDatasetTask[] = [];

  for (let i = 0; i < lines.length; i++) {
    const lineNumber = i + 1;
    let parsed: unknown;
    try {
      parsed = JSON.parse(lines[i]);
    } catch (error) {
      throw new CollectorError(`Invalid JSON at line ${lineNumber}: ${lines[i]}`, error);
    }
    try {
      tasks.push(GoldenDatasetTaskSchema.parse(parsed));
    } catch (error) {
      throw new CollectorError(`Invalid schema at line ${lineNumber}`, error);
    }
  }

  return tasks;
}

export function filterByTestType(
  tasks: GoldenDatasetTask[],
  type: 'unit' | 'integration' | 'both',
): GoldenDatasetTask[] {
  return tasks.filter((t) => t.test_type === type);
}

export function filterByDifficulty(
  tasks: GoldenDatasetTask[],
  difficulty: 'easy' | 'medium' | 'hard' | 'adversarial',
): GoldenDatasetTask[] {
  return tasks.filter((t) => t.difficulty === difficulty);
}
