import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  detectEnvironment,
  readState,
  writeState,
  isTestFile,
  isJestConfigFile,
  isEnforcementFile,
  getProjectRoot,
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

  it('returns main-agent state when sessionId differs from state sessionId', () => {
    const state = makeState({ sessionId: 'session-abc' });
    writeState(state);

    const result = readState('session-xyz');
    expect(result.activeSubagent).toBe('main');
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
});
