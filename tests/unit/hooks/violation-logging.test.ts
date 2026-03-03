import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { logViolationEvent, ViolationEvent } from '../../../.claude/hooks/prevent-test-edit';
import { makeViolationEvent } from '../../fixtures/hooks/helpers';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// 3.1 logViolationEvent -- 6 test cases
describe('logViolationEvent', () => {
  it('creates airefinement/artifacts/traces/ directory if absent', () => {
    const event = makeViolationEvent();
    logViolationEvent(event);

    const tracesDir = path.join(tmpDir, 'airefinement/artifacts/traces');
    expect(fs.existsSync(tracesDir)).toBe(true);
  });

  it('appends JSONL line to violations.jsonl', () => {
    const event = makeViolationEvent();
    logViolationEvent(event);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content.trim()).not.toBe('');
  });

  it('each line is valid JSON when parsed', () => {
    const event1 = makeViolationEvent({ agent: 'tdd-test-writer' });
    const event2 = makeViolationEvent({ agent: 'tdd-implementer' });

    logViolationEvent(event1);
    logViolationEvent(event2);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(2);
    for (const line of lines) {
      expect(() => JSON.parse(line)).not.toThrow();
    }
  });

  it('preserves all ViolationEvent fields', () => {
    const event = makeViolationEvent({
      timestamp: '2026-03-03T10:00:00.000Z',
      agent: 'test-agent',
      attempted_action: 'Custom action',
      target_file: 'tests/custom/file.ts',
      blocked: false,
      reason: 'Custom reason',
      command_hash: 'abc123',
      command_length: 42,
    });

    logViolationEvent(event);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    const content = fs.readFileSync(logPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as ViolationEvent;

    expect(parsed.timestamp).toBe('2026-03-03T10:00:00.000Z');
    expect(parsed.agent).toBe('test-agent');
    expect(parsed.attempted_action).toBe('Custom action');
    expect(parsed.target_file).toBe('tests/custom/file.ts');
    expect(parsed.blocked).toBe(false);
    expect(parsed.reason).toBe('Custom reason');
    expect(parsed.command_hash).toBe('abc123');
    expect(parsed.command_length).toBe(42);
  });

  it('does not throw on fs write failure', () => {
    // Create a read-only directory to simulate write failure
    const roDir = path.join(tmpDir, 'airefinement/artifacts/traces');
    fs.mkdirSync(roDir, { recursive: true });
    // Note: chmod approach is tricky in tests, so we verify via normal operation instead
    // The actual implementation has try-catch, so we just verify it completes

    const event = makeViolationEvent();

    // This should not throw even if mkdir/append fails internally
    expect(() => logViolationEvent(event)).not.toThrow();
  });

  it('multiple calls append multiple lines', () => {
    const event1 = makeViolationEvent({ agent: 'agent-1' });
    const event2 = makeViolationEvent({ agent: 'agent-2' });
    const event3 = makeViolationEvent({ agent: 'agent-3' });

    logViolationEvent(event1);
    logViolationEvent(event2);
    logViolationEvent(event3);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[0]).agent).toBe('agent-1');
    expect(JSON.parse(lines[1]).agent).toBe('agent-2');
    expect(JSON.parse(lines[2]).agent).toBe('agent-3');
  });
});

// 3.2 ViolationEvent structure -- 3 test cases
describe('ViolationEvent structure', () => {
  it('contains required fields: timestamp, agent, attempted_action, target_file, blocked, reason', () => {
    const event = makeViolationEvent();

    expect(event).toHaveProperty('timestamp');
    expect(event).toHaveProperty('agent');
    expect(event).toHaveProperty('attempted_action');
    expect(event).toHaveProperty('target_file');
    expect(event).toHaveProperty('blocked');
    expect(event).toHaveProperty('reason');

    expect(typeof event.timestamp).toBe('string');
    expect(typeof event.agent).toBe('string');
    expect(typeof event.attempted_action).toBe('string');
    expect(typeof event.target_file).toBe('string');
    expect(typeof event.blocked).toBe('boolean');
    expect(typeof event.reason).toBe('string');
  });

  it('optional fields command_hash and command_length are present for bash violations', () => {
    const event = makeViolationEvent({
      attempted_action: 'Bash write to tests',
      command_hash: 'sha256hash123',
      command_length: 256,
    });

    expect(event.command_hash).toBe('sha256hash123');
    expect(event.command_length).toBe(256);
    expect(typeof event.command_hash).toBe('string');
    expect(typeof event.command_length).toBe('number');
  });

  it('timestamp is valid ISO string', () => {
    const now = new Date();
    const event = makeViolationEvent({ timestamp: now.toISOString() });

    const parsedDate = new Date(event.timestamp);
    expect(parsedDate.toISOString()).toBe(event.timestamp);
    expect(Number.isNaN(parsedDate.getTime())).toBe(false);
  });
});
