import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readTraceEvents } from '@/telemetry/collector.js';

let tempDir: string;

beforeEach(() => {
  tempDir = mkdtempSync(join(tmpdir(), 'env-compat-test-'));
});

afterEach(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('environment field compatibility', () => {
  it('preserves environment field on GuardViolationEvent', () => {
    const guardEvent = {
      timestamp: '2026-03-05T10:00:00.000Z',
      agent: 'tdd-implementer',
      attempted_action: 'edit test file',
      target_file: 'tests/unit/foo.test.ts',
      blocked: true,
      reason: 'Guard blocked test modification',
      environment: 'claude-code',
    };

    writeFileSync(join(tempDir, 'violations.jsonl'), JSON.stringify(guardEvent));

    const result = readTraceEvents(tempDir);

    expect(result).toHaveLength(1);
    expect((result[0] as typeof guardEvent & Record<string, unknown>).environment).toBe('claude-code');
  });

  it('preserves environment field on SubagentTimingEvent', () => {
    const timingEvent = {
      timestamp: '2026-03-05T10:01:00.000Z',
      agent: 'tdd-implementer',
      phase: 'GREEN',
      started_at: '2026-03-05T10:00:00.000Z',
      finished_at: '2026-03-05T10:01:00.000Z',
      tool_calls_count: 15,
      environment: 'cursor',
    };

    writeFileSync(join(tempDir, 'timings.jsonl'), JSON.stringify(timingEvent));

    const result = readTraceEvents(tempDir);

    expect(result).toHaveLength(1);
    expect((result[0] as typeof timingEvent & Record<string, unknown>).environment).toBe('cursor');
  });

  it('handles mixed-environment events in same JSONL file', () => {
    const guardEvent = {
      timestamp: '2026-03-05T10:00:00.000Z',
      agent: 'tdd-implementer',
      attempted_action: 'edit test file',
      target_file: 'tests/unit/foo.test.ts',
      blocked: true,
      reason: 'Guard blocked test modification',
      environment: 'claude-code',
    };

    const timingEvent = {
      timestamp: '2026-03-05T10:01:00.000Z',
      agent: 'tdd-implementer',
      phase: 'GREEN',
      started_at: '2026-03-05T10:00:00.000Z',
      finished_at: '2026-03-05T10:01:00.000Z',
      tool_calls_count: 15,
      environment: 'cursor',
    };

    const lines = [JSON.stringify(guardEvent), JSON.stringify(timingEvent)].join('\n');
    writeFileSync(join(tempDir, 'mixed.jsonl'), lines);

    const result = readTraceEvents(tempDir);

    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>).environment).toBe('claude-code');
    expect((result[1] as Record<string, unknown>).environment).toBe('cursor');
  });

  it('handles events without environment field (backward compatibility)', () => {
    const guardEventNoEnv = {
      timestamp: '2026-03-05T10:00:00.000Z',
      agent: 'tdd-implementer',
      attempted_action: 'edit test file',
      target_file: 'tests/unit/foo.test.ts',
      blocked: true,
      reason: 'Guard blocked test modification',
    };

    const timingEventNoEnv = {
      timestamp: '2026-03-05T10:01:00.000Z',
      agent: 'tdd-implementer',
      phase: 'GREEN',
      started_at: '2026-03-05T10:00:00.000Z',
      finished_at: '2026-03-05T10:01:00.000Z',
      tool_calls_count: 15,
    };

    const lines = [JSON.stringify(guardEventNoEnv), JSON.stringify(timingEventNoEnv)].join('\n');
    writeFileSync(join(tempDir, 'no-env.jsonl'), lines);

    expect(() => readTraceEvents(tempDir)).not.toThrow();

    const result = readTraceEvents(tempDir);
    expect(result).toHaveLength(2);
    expect((result[0] as Record<string, unknown>).environment).toBeUndefined();
    expect((result[1] as Record<string, unknown>).environment).toBeUndefined();
  });
});
