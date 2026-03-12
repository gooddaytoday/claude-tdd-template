import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import {
  HookOutput,
  writeState,
  readState,
  setCurrentSessionId,
  handleFileEdit,
  handleBashCommand,
  handleTaskToolUse,
  handleSubagentStart,
  handleSubagentStop,
  logViolationEvent,
  ViolationEvent,
  getProjectRoot,
  formatOutput,
  PermissionDecision,
} from '../../../.claude/hooks/prevent-test-edit';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
  jest.spyOn(process, 'cwd').mockReturnValue(tmpDir);
  setCurrentSessionId('test-session-001');
});

afterEach(() => {
  jest.restoreAllMocks();
  fs.rmSync(tmpDir, { recursive: true, force: true });
  setCurrentSessionId(undefined);
});

// Helper to setup guard state before each test
function setupState(activeSubagent: string, sessionId = 'test-session-001'): void {
  writeState({
    activeSubagent,
    lastUpdated: new Date().toISOString(),
    sessionId,
  });
  setCurrentSessionId(sessionId);
}

// ============================================================================
// 4.1 handleFileEdit - test file protection (8 test cases)
// ============================================================================
describe('handleFileEdit - test file protection', () => {
  it('DENY: Write to tests/unit/foo.test.ts when activeSubagent=tdd-implementer', () => {
    setupState('tdd-implementer');
    const result = handleFileEdit('Write', { file_path: 'tests/unit/foo.test.ts', content: 'test' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('Cannot modify test files');
  });

  it('DENY: Edit to tests/integration/bar.test.ts when activeSubagent=tdd-refactorer', () => {
    setupState('tdd-refactorer');
    const result = handleFileEdit('Edit', {
      file_path: 'tests/integration/bar.test.ts',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('Cannot modify test files');
  });

  it('DENY: Write to tests/ when activeSubagent=unknown (fail-closed)', () => {
    setupState('unknown');
    const result = handleFileEdit('Write', { file_path: 'tests/unit/foo.test.ts', content: 'test' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('unknown state');
  });

  it('ALLOW: Write to tests/ when activeSubagent=tdd-test-writer', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('Write', { file_path: 'tests/unit/foo.test.ts', content: 'test' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ALLOW: Write to tests/ when activeSubagent=main', () => {
    setupState('main');
    const result = handleFileEdit('Write', { file_path: 'tests/unit/foo.test.ts', content: 'test' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ALLOW: Write to src/main.ts when activeSubagent=tdd-implementer', () => {
    setupState('tdd-implementer');
    const result = handleFileEdit('Write', { file_path: 'src/main.ts', content: 'code' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ALLOW: Write to src/main.ts when activeSubagent=unknown', () => {
    setupState('unknown');
    const result = handleFileEdit('Write', { file_path: 'src/main.ts', content: 'code' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ALLOW: Write with no file_path in tool_input', () => {
    setupState('tdd-implementer');
    const result = handleFileEdit('Write', { content: 'test' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });
});

// ============================================================================
// 4.2 handleFileEdit - skip patterns (5 test cases)
// ============================================================================
describe('handleFileEdit - skip pattern detection', () => {
  it('ASK: Write to tests/ with content containing describe.skip (even as tdd-test-writer)', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('Write', {
      file_path: 'tests/unit/foo.test.ts',
      content: 'describe.skip("suite", () => { it("test", () => {}); })',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('skip');
  });

  it('ASK: Write with it.only pattern', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('Write', {
      file_path: 'tests/unit/foo.test.ts',
      content: 'it.only("test", () => {})',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
  });

  it('ASK: Write with xdescribe pattern', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('Write', {
      file_path: 'tests/unit/foo.test.ts',
      content: 'xdescribe("suite", () => {})',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
  });

  it('ASK: Write with if(false) pattern', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('Write', {
      file_path: 'tests/unit/foo.test.ts',
      content: 'if(false) { runTests(); }',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
  });

  it('ALLOW: Write to tests/ with clean content as tdd-test-writer', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('Write', {
      file_path: 'tests/unit/foo.test.ts',
      content: 'describe("suite", () => { it("test", () => { expect(1).toBe(1); }); })',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });
});

// ============================================================================
// 4.3 handleFileEdit - enforcement files (4 test cases)
// ============================================================================
describe('handleFileEdit - enforcement file protection', () => {
  it('ASK: Edit .claude/hooks/prevent-test-edit.ts when activeSubagent=tdd-implementer', () => {
    setupState('tdd-implementer');
    const result = handleFileEdit('Edit', {
      file_path: '.claude/hooks/prevent-test-edit.ts',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('enforcement');
  });

  it('ASK: Edit .claude/skills/tdd-integration/skill.md when activeSubagent=tdd-refactorer', () => {
    setupState('tdd-refactorer');
    const result = handleFileEdit('Edit', {
      file_path: '.claude/skills/tdd-integration/skill.md',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('enforcement');
  });

  it('ASK: Edit .claude/settings.json when activeSubagent=tdd-code-reviewer', () => {
    setupState('tdd-code-reviewer');
    const result = handleFileEdit('Edit', {
      file_path: '.claude/settings.json',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('enforcement');
  });

  it('ALLOW: Edit .claude/hooks/ when activeSubagent=main', () => {
    setupState('main');
    const result = handleFileEdit('Edit', {
      file_path: '.claude/hooks/prevent-test-edit.ts',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });
});

// ============================================================================
// 4.4 handleFileEdit - jest config (3 test cases)
// ============================================================================
describe('handleFileEdit - jest config protection', () => {
  it('ASK: Edit jest.config.ts when activeSubagent=tdd-implementer', () => {
    setupState('tdd-implementer');
    const result = handleFileEdit('Edit', {
      file_path: 'jest.config.ts',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('Jest configuration');
  });

  it('ALLOW: Edit jest.config.ts when activeSubagent=tdd-test-writer', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('Edit', {
      file_path: 'jest.config.ts',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ALLOW: Edit jest.config.ts when activeSubagent=main', () => {
    setupState('main');
    const result = handleFileEdit('Edit', {
      file_path: 'jest.config.ts',
      new_string: 'updated',
      old_string: 'original',
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });
});

// ============================================================================
// 4.5 handleBashCommand (8 test cases)
// ============================================================================
describe('handleBashCommand', () => {
  it('DENY: bash write to tests/ when activeSubagent=tdd-implementer', () => {
    setupState('tdd-implementer');
    const result = handleBashCommand({ command: 'echo "x" > tests/unit/foo.ts' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('Cannot modify test files');
  });

  it('DENY: cp to tests/ when activeSubagent=tdd-refactorer', () => {
    setupState('tdd-refactorer');
    const result = handleBashCommand({ command: 'cp src/main.ts tests/unit/' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('Cannot modify test files');
  });

  it('ALLOW: bash write to tests/ when activeSubagent=tdd-test-writer', () => {
    setupState('tdd-test-writer');
    const result = handleBashCommand({ command: 'echo "x" > tests/unit/foo.ts' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ALLOW: bash write to tests/ when activeSubagent=main', () => {
    setupState('main');
    const result = handleBashCommand({ command: 'echo "x" > tests/unit/foo.ts' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ALLOW: bash read from tests/ (cat, grep)', () => {
    setupState('tdd-implementer');
    const result = handleBashCommand({ command: 'cat tests/unit/foo.ts' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('ASK: bash write to jest config when not test-writer', () => {
    setupState('tdd-implementer');
    const result = handleBashCommand({ command: 'echo "x" > jest.config.ts' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('Jest configuration');
  });

  it('ASK: bash write to enforcement files from subagent', () => {
    setupState('tdd-implementer');
    const result = handleBashCommand({ command: 'echo "x" > .claude/hooks/new-hook.ts' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('enforcement');
  });

  it('ALLOW: empty command', () => {
    setupState('tdd-implementer');
    const result = handleBashCommand({ command: '' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });
});

// ============================================================================
// 4.6 handleTaskToolUse (4 test cases)
// ============================================================================
describe('handleTaskToolUse', () => {
  it('writes activeSubagent=tdd-implementer to state when Task(tdd-implementer)', () => {
    setupState('main');
    const result = handleTaskToolUse({ subagent_type: 'tdd-implementer' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');

    const state = readState();
    expect(state.activeSubagent).toBe('tdd-implementer');
  });

  it('writes activeSubagent=tdd-test-writer to state when Task(tdd-test-writer)', () => {
    setupState('main');
    const result = handleTaskToolUse({ subagent_type: 'tdd-test-writer' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');

    const state = readState();
    expect(state.activeSubagent).toBe('tdd-test-writer');
  });

  it('returns allow decision', () => {
    setupState('main');
    const result = handleTaskToolUse({ subagent_type: 'tdd-refactorer' });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('does not write state when subagent_type is missing', () => {
    setupState('main');
    const initialState = readState();

    handleTaskToolUse({ other_field: 'value' });

    const state = readState();
    expect(state.activeSubagent).toBe(initialState.activeSubagent);
  });
});

// ============================================================================
// 4.7 handleSubagentStart (3 test cases)
// ============================================================================
describe('handleSubagentStart', () => {
  it('writes activeSubagent to state with provided agent_type', () => {
    setupState('main');
    handleSubagentStart('tdd-test-writer');

    const state = readState();
    expect(state.activeSubagent).toBe('tdd-test-writer');
  });

  it('writes activeSubagent=unknown when agent_type is undefined', () => {
    setupState('main');
    handleSubagentStart(undefined);

    const state = readState();
    expect(state.activeSubagent).toBe('unknown');
  });

  it('includes sessionId in written state', () => {
    setupState('main', 'test-session-001');
    handleSubagentStart('tdd-implementer');

    const state = readState();
    expect(state.sessionId).toBe('test-session-001');
  });
});

// ============================================================================
// 4.8 handleSubagentStop (3 test cases)
// ============================================================================
describe('handleSubagentStop', () => {
  it('resets activeSubagent to "main"', () => {
    setupState('tdd-implementer');
    handleSubagentStop();

    const state = readState();
    expect(state.activeSubagent).toBe('main');
  });

  it('preserves sessionId', () => {
    setupState('tdd-implementer', 'test-session-001');
    handleSubagentStop();

    const state = readState();
    expect(state.sessionId).toBe('test-session-001');
  });

  it('returns empty object', () => {
    setupState('tdd-implementer');
    const result = handleSubagentStop();

    expect(Object.keys(result).length).toBe(0);
  });
});

// ============================================================================
// 4.9 Handler violation logging (4 test cases)
// ============================================================================
describe('handler violation logging', () => {
  it('handleFileEdit logs violation for denied test edits', () => {
    setupState('tdd-implementer');
    handleFileEdit('Write', { file_path: 'tests/unit/foo.test.ts', content: 'test' });

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as ViolationEvent;
    expect(parsed.attempted_action).toContain('test file');
    expect(parsed.blocked).toBe(true);
  });

  it('handleFileEdit logs violation for skip pattern detection', () => {
    setupState('tdd-test-writer');
    handleFileEdit('Write', {
      file_path: 'tests/unit/foo.test.ts',
      content: 'describe.skip("suite", () => {})',
    });

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as ViolationEvent;
    expect(parsed.attempted_action).toContain('skip');
    expect(parsed.blocked).toBe(false);
  });

  it('handleBashCommand logs violation for denied bash writes to tests', () => {
    setupState('tdd-refactorer');
    handleBashCommand({ command: 'cp src/main.ts tests/unit/' });

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);

    const content = fs.readFileSync(logPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as ViolationEvent;
    expect(parsed.attempted_action).toContain('Bash write to tests');
    expect(parsed.blocked).toBe(true);
    expect(parsed.command_hash).toBeDefined();
    expect(parsed.command_length).toBeDefined();
  });

  it('logged violations contain correct agent, attempted_action, target_file', () => {
    setupState('tdd-implementer');
    handleFileEdit('Edit', {
      file_path: 'tests/integration/bar.test.ts',
      new_string: 'updated',
      old_string: 'original',
    });

    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    const content = fs.readFileSync(logPath, 'utf-8');
    const parsed = JSON.parse(content.trim()) as ViolationEvent;

    expect(parsed.agent).toBe('tdd-implementer');
    expect(parsed.attempted_action).toContain('test file');
    expect(parsed.target_file).toContain('tests/integration');
    expect(parsed.timestamp).toBeDefined();
    expect(parsed.reason).toBeDefined();
  });
});

// ============================================================================
// 4.10 getProjectRoot -- 5 test cases
// ============================================================================
describe('getProjectRoot', () => {
  it('returns current directory when .claude exists', () => {
    const result = getProjectRoot();
    const isValid = fs.existsSync(path.join(result, '.claude'));
    expect(isValid).toBe(true);
  });

  it('walks up directories to find .claude', () => {
    // Create temp nested structure
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'project-root-test-'));
    const nestedDir = path.join(tempRoot, 'src', 'deeply', 'nested');
    fs.mkdirSync(nestedDir, { recursive: true });
    fs.mkdirSync(path.join(tempRoot, '.claude'), { recursive: true });

    // Mock cwd to nested directory
    const originalCwd = process.cwd;
    jest.spyOn(process, 'cwd').mockReturnValue(nestedDir);

    try {
      const result = getProjectRoot();
      expect(result).toBe(tempRoot);
    } finally {
      jest.restoreAllMocks();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('returns original cwd when .claude not found after 10 iterations', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'no-claude-test-'));
    const nestedDir = path.join(tempRoot, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k');
    fs.mkdirSync(nestedDir, { recursive: true });

    const originalCwd = process.cwd;
    jest.spyOn(process, 'cwd').mockReturnValue(nestedDir);

    try {
      const result = getProjectRoot();
      expect(result).toBe(nestedDir);
    } finally {
      jest.restoreAllMocks();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });

  it('stops when reaching filesystem root', () => {
    // This test verifies the parent === cwd check
    const originalCwd = process.cwd;
    jest.spyOn(process, 'cwd').mockReturnValue('/');

    try {
      const result = getProjectRoot();
      expect(result).toBe('/');
    } finally {
      jest.restoreAllMocks();
    }
  });

  it('returns cwd after 10 iterations max', () => {
    const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'max-iter-test-'));
    const nestedDir = path.join(tempRoot, 'a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l');
    fs.mkdirSync(nestedDir, { recursive: true });

    const originalCwd = process.cwd;
    jest.spyOn(process, 'cwd').mockReturnValue(nestedDir);

    try {
      const result = getProjectRoot();
      // After 10 iterations without finding .claude, it returns original cwd
      expect(result).toBe(nestedDir);
    } finally {
      jest.restoreAllMocks();
      fs.rmSync(tempRoot, { recursive: true, force: true });
    }
  });
});

// ============================================================================
// 4.11 readState edge cases -- 3 test cases
// ============================================================================
describe('readState - edge cases', () => {
  it('returns unknown state when TTL expired (age > STATE_TTL_MS)', () => {
    // Write a state with a very old timestamp
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000 - 1000).toISOString();
    writeState({
      activeSubagent: 'tdd-implementer',
      lastUpdated: twoHoursAgo,
      sessionId: 'test-session-001',
    });

    const result = readState();
    expect(result.activeSubagent).toBe('unknown');
  });

  it('returns main when session ID differs from current session', () => {
    // Write a state for a different session
    writeState({
      activeSubagent: 'tdd-implementer',
      lastUpdated: new Date().toISOString(),
      sessionId: 'old-session-999',
    });

    // Set current session to different value
    setCurrentSessionId('new-session-001');

    const result = readState();
    expect(result.activeSubagent).toBe('main');
  });

  it('returns unknown state when file is missing', () => {
    // Ensure state file doesn't exist
    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    if (fs.existsSync(statePath)) {
      fs.unlinkSync(statePath);
    }

    const result = readState();
    expect(result.activeSubagent).toBe('unknown');
  });

  it('returns unknown state when file contains invalid JSON', () => {
    // Write corrupt JSON to state file
    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(statePath, '{invalid json}', 'utf-8');

    const result = readState();
    expect(result.activeSubagent).toBe('unknown');
  });

  it('returns unknown state when timestamp is invalid', () => {
    // Write a state with invalid timestamp
    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    fs.mkdirSync(path.dirname(statePath), { recursive: true });
    fs.writeFileSync(
      statePath,
      JSON.stringify({
        activeSubagent: 'tdd-implementer',
        lastUpdated: 'not-a-date',
      }),
      'utf-8'
    );

    const result = readState();
    expect(result.activeSubagent).toBe('unknown');
  });
});

// ============================================================================
// 4.12 handleFileEdit - MultiEdit with edits array -- 1 test case
// ============================================================================
describe('handleFileEdit - MultiEdit edits array', () => {
  it('ASK: MultiEdit with edits containing skip pattern', () => {
    setupState('tdd-test-writer');
    const result = handleFileEdit('MultiEdit', {
      file_path: 'tests/unit/foo.test.ts',
      edits: [
        { old_string: 'old1', new_string: 'describe.skip("suite", () => {})' },
        { old_string: 'old2', new_string: 'updated' },
      ],
    });

    expect(result.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(result.hookSpecificOutput?.permissionDecisionReason).toContain('skip');
  });
});

// ============================================================================
// 4.13 formatOutput dual-environment output -- 8 test cases
// ============================================================================
describe('formatOutput dual-environment output', () => {
  const originalCursorVersion = process.env.CURSOR_VERSION;

  afterEach(() => {
    if (originalCursorVersion === undefined) {
      delete process.env.CURSOR_VERSION;
    } else {
      process.env.CURSOR_VERSION = originalCursorVersion;
    }
  });

  // Claude Code format tests (no CURSOR_VERSION)
  describe('Claude Code format (no CURSOR_VERSION)', () => {
    beforeEach(() => {
      delete process.env.CURSOR_VERSION;
    });

    it('formatOutput(deny, reason) returns exitCode 0 and JSON with hookSpecificOutput.permissionDecision: deny', () => {
      const result = formatOutput('deny', 'some reason');

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.json) as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny');
    });

    it('formatOutput(deny, reason) JSON includes permissionDecisionReason', () => {
      const result = formatOutput('deny', 'my reason');

      const parsed = JSON.parse(result.json) as { hookSpecificOutput?: { permissionDecisionReason?: string } };
      expect(parsed.hookSpecificOutput?.permissionDecisionReason).toBe('my reason');
    });

    it('formatOutput(allow) returns exitCode 0 and JSON with hookSpecificOutput.permissionDecision: allow', () => {
      const result = formatOutput('allow');

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.json) as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe('allow');
    });

    it('formatOutput(ask, reason) returns exitCode 0 and JSON with hookSpecificOutput.permissionDecision: ask', () => {
      const result = formatOutput('ask', 'please confirm');

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.json) as { hookSpecificOutput?: { permissionDecision?: string } };
      expect(parsed.hookSpecificOutput?.permissionDecision).toBe('ask');
    });
  });

  // Cursor format tests (CURSOR_VERSION='1.0')
  describe('Cursor format (CURSOR_VERSION=1.0)', () => {
    beforeEach(() => {
      process.env.CURSOR_VERSION = '1.0';
    });

    it('formatOutput(deny, reason) returns exitCode 2 and JSON with decision: deny', () => {
      const result = formatOutput('deny', 'blocked reason');

      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.json) as { decision?: string };
      expect(parsed.decision).toBe('deny');
    });

    it('formatOutput(deny, reason) JSON includes reason field', () => {
      const result = formatOutput('deny', 'blocked reason');

      const parsed = JSON.parse(result.json) as { reason?: string };
      expect(parsed.reason).toBe('blocked reason');
    });

    it('formatOutput(allow) returns exitCode 0 and JSON with decision: allow', () => {
      const result = formatOutput('allow');

      expect(result.exitCode).toBe(0);
      const parsed = JSON.parse(result.json) as { decision?: string };
      expect(parsed.decision).toBe('allow');
    });

    it('formatOutput(ask, reason) returns exitCode 2 and JSON with decision: deny (ask mapped to deny in Cursor)', () => {
      const result = formatOutput('ask', 'needs confirmation');

      expect(result.exitCode).toBe(2);
      const parsed = JSON.parse(result.json) as { decision?: string };
      expect(parsed.decision).toBe('deny');
    });
  });
});


