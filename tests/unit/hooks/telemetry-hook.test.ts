import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { agentTypeToPhase, logTimingEvent, SubagentTimingEvent, getProjectRoot } from '../../../.claude/hooks/tdd-telemetry-hook';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// Helper to create mock timing events
function makeTimingEvent(overrides: Partial<SubagentTimingEvent> = {}): SubagentTimingEvent {
  return {
    timestamp: new Date().toISOString(),
    agent: 'tdd-implementer',
    phase: 'GREEN',
    started_at: '',
    finished_at: new Date().toISOString(),
    tool_calls_count: 0,
    ...overrides,
  };
}

// ============================================================================
// 5.1 agentTypeToPhase -- 9 test cases
// ============================================================================
describe('agentTypeToPhase', () => {
  it('maps tdd-test-writer to RED', () => {
    expect(agentTypeToPhase('tdd-test-writer')).toBe('RED');
  });

  it('maps tdd-implementer to GREEN', () => {
    expect(agentTypeToPhase('tdd-implementer')).toBe('GREEN');
  });

  it('maps tdd-refactorer to REFACTOR', () => {
    expect(agentTypeToPhase('tdd-refactorer')).toBe('REFACTOR');
  });

  it('maps tdd-code-reviewer to CODE_REVIEW', () => {
    expect(agentTypeToPhase('tdd-code-reviewer')).toBe('CODE_REVIEW');
  });

  it('maps tdd-architect-reviewer to ARCH_REVIEW', () => {
    expect(agentTypeToPhase('tdd-architect-reviewer')).toBe('ARCH_REVIEW');
  });

  it('maps tdd-documenter to DOCS', () => {
    expect(agentTypeToPhase('tdd-documenter')).toBe('DOCS');
  });

  it('maps tdd-telemetry-reporter to TELEMETRY', () => {
    expect(agentTypeToPhase('tdd-telemetry-reporter')).toBe('TELEMETRY');
  });

  it('returns null for unknown agent type', () => {
    expect(agentTypeToPhase('some-other-agent')).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(agentTypeToPhase('')).toBeNull();
  });
});

// ============================================================================
// 5.2 Timing event logging -- 5 test cases
// ============================================================================
describe('logTimingEvent', () => {
  it('writes timing event to airefinement/artifacts/traces/timings.jsonl', () => {
    const event = makeTimingEvent();
    logTimingEvent(event, tmpDir);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/timings.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf-8');
    expect(content.trim()).not.toBe('');
  });

  it('timing event JSON is valid when parsed', () => {
    const event = makeTimingEvent({ agent: 'tdd-test-writer', phase: 'RED' });
    logTimingEvent(event, tmpDir);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/timings.jsonl');
    const content = fs.readFileSync(logPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as SubagentTimingEvent;

    expect(parsed.agent).toBe('tdd-test-writer');
    expect(parsed.phase).toBe('RED');
  });

  it('timing event contains timestamp, agent, phase, finished_at', () => {
    const now = new Date().toISOString();
    const event = makeTimingEvent({
      timestamp: now,
      agent: 'tdd-implementer',
      phase: 'GREEN',
      finished_at: now,
    });
    logTimingEvent(event, tmpDir);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/timings.jsonl');
    const content = fs.readFileSync(logPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as SubagentTimingEvent;

    expect(parsed).toHaveProperty('timestamp');
    expect(parsed).toHaveProperty('agent');
    expect(parsed).toHaveProperty('phase');
    expect(parsed).toHaveProperty('finished_at');
    expect(typeof parsed.timestamp).toBe('string');
    expect(typeof parsed.agent).toBe('string');
    expect(typeof parsed.phase).toBe('string');
    expect(typeof parsed.finished_at).toBe('string');
  });

  it('multiple calls append multiple lines', () => {
    const event1 = makeTimingEvent({ agent: 'tdd-test-writer' });
    const event2 = makeTimingEvent({ agent: 'tdd-implementer' });
    const event3 = makeTimingEvent({ agent: 'tdd-refactorer' });

    logTimingEvent(event1, tmpDir);
    logTimingEvent(event2, tmpDir);
    logTimingEvent(event3, tmpDir);

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/timings.jsonl');
    const content = fs.readFileSync(logPath, 'utf-8');
    const lines = content.trim().split('\n');

    expect(lines.length).toBe(3);
    expect(JSON.parse(lines[0]).agent).toBe('tdd-test-writer');
    expect(JSON.parse(lines[1]).agent).toBe('tdd-implementer');
    expect(JSON.parse(lines[2]).agent).toBe('tdd-refactorer');
  });

  it('does not throw on fs write failure (invalid projectRoot)', () => {
    const event = makeTimingEvent();

    // Pass an impossible path to projectRoot
    expect(() => logTimingEvent(event, '/dev/null/impossible/path')).not.toThrow();
  });
});

// ============================================================================
// 5.3 getProjectRoot for telemetry -- 4 test cases
// ============================================================================
describe('getProjectRoot for telemetry', () => {
  it('returns cwd when .claude exists', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-proj-root-'));
    fs.mkdirSync(path.join(tempRoot, '.claude'), { recursive: true });

    const result = getProjectRoot(tempRoot);
    expect(result).toBe(tempRoot);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('walks up directories to find .claude', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-walk-up-'));
    const nestedDir = path.join(tempRoot, 'src', 'deeply', 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.mkdirSync(path.join(tempRoot, '.claude'), { recursive: true });

    const result = getProjectRoot(nestedDir);
    expect(result).toBe(tempRoot);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('returns original cwd when .claude not found', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'telemetry-no-claude-'));
    const nestedDir = path.join(tempRoot, 'a', 'b', 'c');
    fs.mkdirSync(nestedDir, { recursive: true });

    const result = getProjectRoot(nestedDir);
    expect(result).toBe(nestedDir);

    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('stops when reaching filesystem root', () => {
    const result = getProjectRoot('/');
    expect(result).toBe('/');
  });
});

