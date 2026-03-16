import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  detectEnvironment,
  logViolationEvent,
  readState,
  writeState,
  isTestFile,
  isJestConfigFile,
  isEnforcementFile,
  getProjectRoot,
  bashCommandWritesToTests,
  bashCommandWritesToJestConfig,
  bashCommandWritesToEnforcementFiles,
  type ViolationEvent,
} from '../../../.claude/hooks/lib/guard-core';

interface GuardState {
  activeSubagent: string;
  lastUpdated: string;
  sessionId?: string;
}

let tmpDir: string;
const originalCursorVersion = process.env.CURSOR_VERSION;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-core-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  delete process.env.CURSOR_VERSION;
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  if (originalCursorVersion !== undefined) {
    process.env.CURSOR_VERSION = originalCursorVersion;
  } else {
    delete process.env.CURSOR_VERSION;
  }
});

// ============================================================================
// detectEnvironment
// ============================================================================
describe('detectEnvironment', () => {
  it('returns claude-code when CURSOR_VERSION is not set', () => {
    delete process.env.CURSOR_VERSION;
    const result = detectEnvironment();
    expect(result).toBe('claude-code');
  });

  it('returns cursor when CURSOR_VERSION is set to 1.0', () => {
    process.env.CURSOR_VERSION = '1.0';
    const result = detectEnvironment();
    expect(result).toBe('cursor');
  });

  it('returns cursor when CURSOR_VERSION is set to any truthy value (1.7.2)', () => {
    process.env.CURSOR_VERSION = '1.7.2';
    const result = detectEnvironment();
    expect(result).toBe('cursor');
  });

  it('returns claude-code when CURSOR_VERSION is empty string', () => {
    process.env.CURSOR_VERSION = '';
    const result = detectEnvironment();
    expect(result).toBe('claude-code');
  });

  it('return value is one of the two valid literals', () => {
    delete process.env.CURSOR_VERSION;
    const withoutCursor = detectEnvironment();
    expect(['claude-code', 'cursor']).toContain(withoutCursor);

    process.env.CURSOR_VERSION = '2.0';
    const withCursor = detectEnvironment();
    expect(['claude-code', 'cursor']).toContain(withCursor);
    expect(withCursor).not.toBe(withoutCursor);
  });
});

// ============================================================================
// readState with explicit sessionId parameter
// ============================================================================
describe('readState with explicit sessionId parameter', () => {
  function makeState(overrides: Partial<GuardState> = {}): GuardState {
    return {
      activeSubagent: 'tdd-implementer',
      lastUpdated: new Date().toISOString(),
      sessionId: 'session-abc',
      ...overrides,
    };
  }

  it('returns state as-is when sessionId matches state sessionId', () => {
    const state = makeState({ sessionId: 'session-abc' });
    writeState(state);

    const result = readState('session-abc');
    expect(result.activeSubagent).toBe('tdd-implementer');
    expect(result.sessionId).toBe('session-abc');
  });

  it('returns fail-closed unknown state when sessionId differs from legacy state sessionId', () => {
    const state = makeState({ sessionId: 'session-abc' });
    writeState(state);

    const result = readState('session-xyz');
    expect(result.activeSubagent).toBe('unknown');
  });

  it('returns state as-is when called with sessionId = undefined (no session filtering)', () => {
    const state = makeState({ sessionId: 'session-abc' });
    writeState(state);

    const result = readState(undefined);
    expect(result.activeSubagent).toBe('tdd-implementer');
  });

  it('returns state as-is when state has no sessionId field', () => {
    const state: GuardState = {
      activeSubagent: 'tdd-refactorer',
      lastUpdated: new Date().toISOString(),
    };
    writeState(state);

    const result = readState('some-session');
    expect(result.activeSubagent).toBe('tdd-refactorer');
  });
});

// ============================================================================
// readState session-scoped storage format
// ============================================================================
describe('readState session-scoped storage format', () => {
  function writeRawStateFile(value: unknown): void {
    fs.writeFileSync(path.join(tmpDir, '.claude/.guard-state.json'), JSON.stringify(value, null, 2), 'utf-8');
  }

  it('uses the stable fallback bucket when sessionId is undefined', () => {
    const now = new Date().toISOString();
    writeRawStateFile({
      __default__: {
        activeSubagent: 'tdd-test-writer',
        lastUpdated: now,
      },
      'session-abc': {
        activeSubagent: 'tdd-implementer',
        lastUpdated: now,
        sessionId: 'session-abc',
      },
    });

    const result = readState(undefined);
    expect(result.activeSubagent).toBe('tdd-test-writer');
  });

  it('isolates multiple sessions stored in the same state file', () => {
    const now = new Date().toISOString();
    writeRawStateFile({
      'session-abc': {
        activeSubagent: 'tdd-implementer',
        lastUpdated: now,
        sessionId: 'session-abc',
      },
      'session-xyz': {
        activeSubagent: 'tdd-refactorer',
        lastUpdated: now,
        sessionId: 'session-xyz',
      },
    });

    expect(readState('session-abc').activeSubagent).toBe('tdd-implementer');
    expect(readState('session-xyz').activeSubagent).toBe('tdd-refactorer');
  });
});

// ============================================================================
// Module exports
// ============================================================================
describe('guard-core module exports', () => {
  it('exports detectEnvironment as a function', () => {
    expect(typeof detectEnvironment).toBe('function');
  });

  it('exports path-matching functions: isTestFile, isJestConfigFile, isEnforcementFile', () => {
    expect(typeof isTestFile).toBe('function');
    expect(typeof isJestConfigFile).toBe('function');
    expect(typeof isEnforcementFile).toBe('function');
  });

  it('exports state management functions: readState, writeState', () => {
    expect(typeof readState).toBe('function');
    expect(typeof writeState).toBe('function');
  });

  it('exports getProjectRoot as a function', () => {
    expect(typeof getProjectRoot).toBe('function');
  });

  it('exports logViolationEvent as a function', () => {
    expect(typeof logViolationEvent).toBe('function');
  });
});

// ============================================================================
// logViolationEvent environment enrichment
// ============================================================================
describe('logViolationEvent environment enrichment', () => {
  const violationsPath = () =>
    path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');

  function makeBaseEvent(): Omit<ViolationEvent, 'environment'> {
    return {
      timestamp: new Date().toISOString(),
      agent: 'tdd-implementer',
      attempted_action: 'Write',
      target_file: 'tests/unit/some.test.ts',
      blocked: true,
      reason: 'Writing to test files is restricted',
    };
  }

  it('writes environment: claude-code when CURSOR_VERSION is not set', () => {
    delete process.env.CURSOR_VERSION;

    logViolationEvent(makeBaseEvent() as ViolationEvent);

    const line = fs.readFileSync(violationsPath(), 'utf-8').trim();
    const written = JSON.parse(line) as Record<string, unknown>;
    expect(written).toHaveProperty('environment', 'claude-code');
  });

  it('writes environment: cursor when CURSOR_VERSION is set', () => {
    process.env.CURSOR_VERSION = '1.7.2';

    logViolationEvent(makeBaseEvent() as ViolationEvent);

    const line = fs.readFileSync(violationsPath(), 'utf-8').trim();
    const written = JSON.parse(line) as Record<string, unknown>;
    expect(written).toHaveProperty('environment', 'cursor');
  });

  it('preserves existing environment: cursor when event already has environment set', () => {
    // CURSOR_VERSION is intentionally NOT set — detectEnvironment() would return 'claude-code'
    // but the event already carries environment: 'cursor', so it must NOT be overwritten
    delete process.env.CURSOR_VERSION;

    const event = { ...makeBaseEvent(), environment: 'cursor' as const };
    logViolationEvent(event as ViolationEvent);

    const line = fs.readFileSync(violationsPath(), 'utf-8').trim();
    const written = JSON.parse(line) as Record<string, unknown>;
    expect(written).toHaveProperty('environment', 'cursor');
  });

  it('preserves existing environment: claude-code when CURSOR_VERSION is set', () => {
    // CURSOR_VERSION is set — detectEnvironment() would return 'cursor'
    // but the event already has environment: 'claude-code', so it must NOT be overwritten
    process.env.CURSOR_VERSION = '2.0';

    const event = { ...makeBaseEvent(), environment: 'claude-code' as const };
    logViolationEvent(event as ViolationEvent);

    const line = fs.readFileSync(violationsPath(), 'utf-8').trim();
    const written = JSON.parse(line) as Record<string, unknown>;
    expect(written).toHaveProperty('environment', 'claude-code');
  });
});

// ============================================================================
// bashCommandWritesToTests — touch and mkdir patterns
// ============================================================================
describe('bashCommandWritesToTests — touch and mkdir patterns', () => {
  it('detects touch targeting a unit test file', () => {
    expect(bashCommandWritesToTests('touch tests/unit/foo.test.ts')).toBe(true);
  });

  it('detects touch targeting an integration test file', () => {
    expect(bashCommandWritesToTests('touch tests/integration/bar.test.ts')).toBe(true);
  });

  it('detects mkdir targeting the tests directory', () => {
    expect(bashCommandWritesToTests('mkdir tests/unit/new-dir')).toBe(true);
  });

  it('detects mkdir -p targeting a deeply nested tests directory', () => {
    expect(bashCommandWritesToTests('mkdir -p tests/unit/deep/nested')).toBe(true);
  });

  it('does not false-positive on touch of a src file whose name contains the word tests', () => {
    expect(bashCommandWritesToTests('touch src/tests-helper.ts')).toBe(false);
  });

  it('does not false-positive on mkdir of a src directory whose name contains the word testing', () => {
    expect(bashCommandWritesToTests('mkdir src/testing')).toBe(false);
  });
});

// ============================================================================
// bashCommandWritesToJestConfig — touch and mkdir patterns
// ============================================================================
describe('bashCommandWritesToJestConfig — touch and mkdir patterns', () => {
  it('detects touch targeting jest.config.ts', () => {
    expect(bashCommandWritesToJestConfig('touch jest.config.ts')).toBe(true);
  });

  it('detects touch targeting a custom jest config file', () => {
    expect(bashCommandWritesToJestConfig('touch jest.custom.config.js')).toBe(true);
  });

  it('detects mkdir whose argument is a jest config filename (pathological but caught)', () => {
    expect(bashCommandWritesToJestConfig('mkdir -p jest.config.ts')).toBe(true);
  });
});

// ============================================================================
// bashCommandWritesToEnforcementFiles — touch and mkdir patterns
// ============================================================================
describe('bashCommandWritesToEnforcementFiles — touch and mkdir patterns', () => {
  it('detects touch targeting a new file inside .claude/hooks', () => {
    expect(bashCommandWritesToEnforcementFiles('touch .claude/hooks/new-hook.ts')).toBe(true);
  });

  it('detects touch targeting a new file inside .claude/skills', () => {
    expect(bashCommandWritesToEnforcementFiles('touch .claude/skills/new-skill.md')).toBe(true);
  });

  it('detects touch targeting .claude/settings.json', () => {
    expect(bashCommandWritesToEnforcementFiles('touch .claude/settings.json')).toBe(true);
  });

  it('detects mkdir -p targeting a subdirectory of .claude/hooks', () => {
    expect(bashCommandWritesToEnforcementFiles('mkdir -p .claude/hooks/new-dir')).toBe(true);
  });

  it('detects mkdir targeting a subdirectory of .claude/skills', () => {
    expect(bashCommandWritesToEnforcementFiles('mkdir .claude/skills/lib')).toBe(true);
  });
});

// ============================================================================
// ViolationEvent type compatibility
// ============================================================================
describe('ViolationEvent type shape', () => {
  it('ViolationEvent accepts optional environment field', () => {
    // TypeScript-level assignability check.
    // Once ViolationEvent has environment?: 'claude-code' | 'cursor',
    // the object below must satisfy the interface without any cast.
    const event = {
      timestamp: new Date().toISOString(),
      agent: 'type-check',
      attempted_action: 'Write',
      target_file: 'src/file.ts',
      blocked: false,
      reason: 'type-level test',
      environment: 'cursor' as 'claude-code' | 'cursor',
    } satisfies ViolationEvent;

    expect(event.environment).toBe('cursor');
  });
});
