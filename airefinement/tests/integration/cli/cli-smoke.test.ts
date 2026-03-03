import { describe, it, expect, beforeAll, beforeEach, afterEach, jest } from '@jest/globals';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Command } from 'commander';
import { AnalysisResultSchema } from '@/telemetry/schemas.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const FIXTURES_DIR = resolve(__dirname, '../../fixtures');
const ARTIFACTS_DIR = resolve(FIXTURES_DIR, 'artifacts');
const CONFIG_DIR = resolve(FIXTURES_DIR, 'config');
const REPORTS_DIR = resolve(FIXTURES_DIR, 'reports');

let program: Command;

describe('CLI smoke tests with fixture data', () => {
  let logSpy: ReturnType<typeof jest.spyOn>;
  let errorSpy: ReturnType<typeof jest.spyOn>;

  beforeAll(async () => {
    const mod = await import('../../../bin/cli.js');
    program = mod.program;
    program.exitOverride();
  });

  beforeEach(() => {
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    process.exitCode = undefined;
  });

  afterEach(() => {
    logSpy.mockRestore();
    errorSpy.mockRestore();
    process.exitCode = undefined;
  });

  it('analyze --artifacts-dir returns valid AnalysisResult and recommendation output', async () => {
    await program.parseAsync([
      'node',
      'cli',
      'analyze',
      '--artifacts-dir',
      ARTIFACTS_DIR,
      '--config',
      CONFIG_DIR,
    ]);

    const jsonOutput = logSpy.mock.calls[0]?.[0];
    const recommendationLine = logSpy.mock.calls[1]?.[0];
    const parsed = JSON.parse(String(jsonOutput));

    expect(() => AnalysisResultSchema.parse(parsed)).not.toThrow();
    expect(String(recommendationLine)).toContain('Recommendation:');
    expect(process.exitCode).not.toBe(1);
  });

  it('metrics --artifacts-dir returns valid KPI and role metrics payload', async () => {
    await program.parseAsync([
      'node',
      'cli',
      'metrics',
      '--artifacts-dir',
      ARTIFACTS_DIR,
    ]);

    const jsonOutput = logSpy.mock.calls[0]?.[0];
    const parsed = JSON.parse(String(jsonOutput)) as {
      kpis: Record<string, number>;
      roles: Record<string, unknown>;
    };

    expect(parsed.kpis).toBeDefined();
    expect(parsed.roles).toBeDefined();
    expect(parsed.kpis.tsr).toBeGreaterThanOrEqual(0);
    expect(parsed.kpis.tsr).toBeLessThanOrEqual(1);
    expect(process.exitCode).not.toBe(1);
  });

  it('report --reports-dir produces readable markdown output', async () => {
    await program.parseAsync([
      'node',
      'cli',
      'report',
      '--reports-dir',
      REPORTS_DIR,
    ]);

    const output = String(logSpy.mock.calls[0]?.[0] ?? '');

    expect(output).toContain('# Experiment Report: exp-task-19');
    expect(output).toContain('## Decision: ACCEPT_WITH_CAVEAT');
    expect(process.exitCode).not.toBe(1);
  });
});
