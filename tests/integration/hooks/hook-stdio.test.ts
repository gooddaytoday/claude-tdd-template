/**
 * Phase 7: Integration Tests (stdin/stdout)
 *
 * Tests hooks as subprocess: pipe JSON via stdin, read stdout + exit code + side effects.
 * Each test is fully isolated with a temp project directory.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { spawnSync } from 'node:child_process';

/**
 * Hook run result from subprocess execution
 */
interface HookResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal: string | null;
  timedOut: boolean;
  error?: Error;
}

/**
 * Create isolated temp project with .claude directory
 */
function setupTempProject(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'hook-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
  return tmpDir;
}

/**
 * Get the repository root (where package.json lives)
 */
function getRepoRoot(): string {
  let current = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(current, 'package.json'))) {
      const content = fs.readFileSync(path.join(current, 'package.json'), 'utf-8');
      if (content.includes('claude-tdd-template')) {
        return current;
      }
    }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return process.cwd();
}

/**
 * Run a hook as subprocess via npx tsx
 *
 * Supported modes:
 * - `input`: object to JSON.stringify as stdin
 * - `rawInput`: raw string as stdin (for corrupt JSON testing)
 */
function runHook(
  hookPath: string,
  options: {
    input?: unknown;
    rawInput?: string;
    cwd?: string;
    timeout?: number;
  } = {}
): HookResult {
  const repoRoot = getRepoRoot();
  const absoluteHookPath = path.resolve(repoRoot, hookPath);

  // Prepare stdin
  let stdin: string;
  if (options.rawInput !== undefined) {
    stdin = options.rawInput;
  } else if (options.input !== undefined) {
    stdin = JSON.stringify(options.input);
  } else {
    stdin = '';
  }

  // Run via spawnSync with npx --prefix
  const result = spawnSync(
    'npx',
    ['--prefix', repoRoot, 'tsx', absoluteHookPath],
    {
      cwd: options.cwd || process.cwd(),
      input: stdin,
      encoding: 'utf-8',
      timeout: options.timeout ?? 15000,
      // Remove JEST_WORKER_ID from env so main() executes (not skipped by if (!process.env.JEST_WORKER_ID))
      env: {
        ...process.env,
        JEST_WORKER_ID: undefined,
      },
    }
  );

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? (result.error ? 1 : 0),
    signal: result.signal ?? null,
    timedOut: result.error?.code === 'ETIMEDOUT',
    error: result.error,
  };
}

/**
 * Read JSON log file line by line
 */
function readJsonlLog(logPath: string): Record<string, unknown>[] {
  if (!fs.existsSync(logPath)) {
    return [];
  }
  const content = fs.readFileSync(logPath, 'utf-8');
  if (!content.trim()) {
    return [];
  }
  return content
    .trim()
    .split('\n')
    .filter(line => line.trim())
    .map(line => JSON.parse(line));
}

// ============================================================================
// 7.1 prevent-test-edit.ts full pipeline -- 6 test cases
// ============================================================================
describe('prevent-test-edit.ts stdio', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns valid JSON for PreToolUse + Write to src/', () => {
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'src/main.ts', content: 'code' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput?.permissionDecision).toBe('allow');
    expect(parsed.hookSpecificOutput?.hookEventName).toBe('PreToolUse');
  });

  it('returns deny JSON for PreToolUse + Write to tests/ (unknown state)', () => {
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'tests/unit/foo.test.ts', content: 'test' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny');
    expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('Cannot modify test files');
  });

  it('returns allow JSON for PreToolUse + Task(tdd-test-writer)', () => {
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'tdd-test-writer' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput?.permissionDecision).toBe('allow');

    // Verify state was written
    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.activeSubagent).toBe('tdd-test-writer');
  });

  it('returns empty JSON for SubagentStop', () => {
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'SubagentStop',
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed).length).toBe(0);
  });

  it('returns ask JSON for invalid/corrupt stdin', () => {
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      rawInput: '{"invalid json}',
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.hookSpecificOutput?.permissionDecision).toBe('ask');
    expect(parsed.hookSpecificOutput?.permissionDecisionReason).toContain('unexpected error');
  });

  it('exits with code 0 for all cases', () => {
    // Test a deny case
    const denyResult = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'tests/unit/foo.test.ts', content: 'test' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });
    expect(denyResult.exitCode).toBe(0);

    // Test another case
    const allowResult = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'src/main.ts', content: 'code' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });
    expect(allowResult.exitCode).toBe(0);
  });
});

// ============================================================================
// 7.2 tdd-telemetry-hook.ts full pipeline -- 3 test cases
// ============================================================================
describe('tdd-telemetry-hook.ts stdio', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty JSON and writes timing for SubagentStop + tdd-implementer', () => {
    const result = runHook('.claude/hooks/tdd-telemetry-hook.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'SubagentStop',
        agent_type: 'tdd-implementer',
        session_id: 'test-session-001',
        cwd: tmpDir,
        transcript_path: '/tmp/transcript',
        permission_mode: 'default',
        agent_id: 'agent-001',
        agent_transcript_path: '/tmp/agent-transcript',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed).length).toBe(0);

    // Verify timing was written
    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/timings.jsonl');
    expect(fs.existsSync(logPath)).toBe(true);
    const events = readJsonlLog(logPath);
    expect(events.length).toBe(1);
    expect(events[0].agent).toBe('tdd-implementer');
    expect(events[0].phase).toBe('GREEN');
  });

  it('returns empty JSON and skips for non-tdd agent', () => {
    const result = runHook('.claude/hooks/tdd-telemetry-hook.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'SubagentStop',
        agent_type: 'assistant',
        session_id: 'test-session-001',
        cwd: tmpDir,
        transcript_path: '/tmp/transcript',
        permission_mode: 'default',
        agent_id: 'agent-001',
        agent_transcript_path: '/tmp/agent-transcript',
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed).length).toBe(0);

    // Verify timing was NOT written
    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/timings.jsonl');
    expect(fs.existsSync(logPath)).toBe(false);
  });

  it('returns empty JSON on invalid stdin', () => {
    const result = runHook('.claude/hooks/tdd-telemetry-hook.ts', {
      cwd: tmpDir,
      rawInput: '{"bad json',
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed).length).toBe(0);

    // Verify timing was NOT written
    const logPath = path.join(tmpDir, 'airefinement/artifacts/traces/timings.jsonl');
    expect(fs.existsSync(logPath)).toBe(false);
  });
});

// ============================================================================
// 7.3 user-prompt-skill-eval.ts full pipeline -- 3 test cases
// ============================================================================
describe('user-prompt-skill-eval.ts stdio', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('outputs activation text for "implement user auth"', () => {
    const result = runHook('.claude/hooks/user-prompt-skill-eval.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'implement user auth',
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('<user-prompt-submit-hook>');
    expect(result.stdout).toContain('MANDATORY SKILL ACTIVATION SEQUENCE');
  });

  it('outputs suggestion text for "fix build errors"', () => {
    const result = runHook('.claude/hooks/user-prompt-skill-eval.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'fix build errors',
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('<user-prompt-submit-hook>');
    expect(result.stdout).toContain('SUGGESTION:');
  });

  it('outputs nothing for "fix bug"', () => {
    const result = runHook('.claude/hooks/user-prompt-skill-eval.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'UserPromptSubmit',
        prompt: 'fix bug',
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);
    expect(result.stdout.trim()).toBe('');
  });
});

/**
 * Run hook with custom environment variables (for CURSOR_VERSION testing)
 */
function runHookWithEnv(
  hookPath: string,
  options: {
    input?: unknown;
    rawInput?: string;
    cwd?: string;
    timeout?: number;
    env?: Record<string, string | undefined>;
  } = {}
): HookResult {
  const repoRoot = getRepoRoot();
  const absoluteHookPath = path.resolve(repoRoot, hookPath);

  let stdin: string;
  if (options.rawInput !== undefined) {
    stdin = options.rawInput;
  } else if (options.input !== undefined) {
    stdin = JSON.stringify(options.input);
  } else {
    stdin = '';
  }

  const result = spawnSync(
    'npx',
    ['--prefix', repoRoot, 'tsx', absoluteHookPath],
    {
      cwd: options.cwd || process.cwd(),
      input: stdin,
      encoding: 'utf-8',
      timeout: options.timeout ?? 15000,
      env: {
        ...process.env,
        JEST_WORKER_ID: undefined,
        ...(options.env || {}),
      },
    }
  );

  return {
    stdout: result.stdout || '',
    stderr: result.stderr || '',
    exitCode: result.status ?? (result.error ? 1 : 0),
    signal: result.signal ?? null,
    timedOut: (result.error as NodeJS.ErrnoException)?.code === 'ETIMEDOUT',
    error: result.error,
  };
}

// ============================================================================
// 7.4 State file side effects -- 3 test cases
// ============================================================================
describe('state side effects', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('Task(tdd-implementer) creates .guard-state.json with activeSubagent=tdd-implementer', () => {
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'tdd-implementer' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);

    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.activeSubagent).toBe('tdd-implementer');
    expect(state.sessionId).toBe('test-session-001');
  });

  it('SubagentStop resets .guard-state.json to activeSubagent=main', () => {
    // First, set state to tdd-implementer
    runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'tdd-implementer' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    // Then, stop subagent
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'SubagentStop',
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    expect(result.exitCode).toBe(0);

    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.activeSubagent).toBe('main');
    expect(state.sessionId).toBe('test-session-001');
  });

  it('sequential Task + deny + Stop produces correct violation log + state transitions', () => {
    // Step 1: Task(tdd-implementer) - state = tdd-implementer
    runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Task',
        tool_input: { subagent_type: 'tdd-implementer' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    let statePath = path.join(tmpDir, '.claude/.guard-state.json');
    let state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.activeSubagent).toBe('tdd-implementer');

    // Step 2: Write to tests/ - should deny
    const denyResult = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'tests/unit/foo.test.ts', content: 'test' },
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    expect(denyResult.exitCode).toBe(0);
    const denyParsed = JSON.parse(denyResult.stdout);
    expect(denyParsed.hookSpecificOutput?.permissionDecision).toBe('deny');

    // Verify violation was logged
    const violationPath = path.join(tmpDir, 'airefinement/artifacts/traces/violations.jsonl');
    expect(fs.existsSync(violationPath)).toBe(true);
    const violations = readJsonlLog(violationPath);
    expect(violations.length).toBe(1);
    expect(violations[0].agent).toBe('tdd-implementer');
    expect(violations[0].blocked).toBe(true);
    expect(violations[0].attempted_action).toContain('test file');

    // Step 3: SubagentStop - state resets to main
    runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'SubagentStop',
        cwd: tmpDir,
        session_id: 'test-session-001',
      },
    });

    state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.activeSubagent).toBe('main');
  });
});

// ============================================================================
// 2.2 Cursor dual-format input parsing -- 5 test cases
// Task 2.2: camelCase normalization, Shell→Bash mapping, conversation_id fallback,
//           subagent_type fallback, Cursor exit code 2
// ============================================================================
describe('prevent-test-edit.ts — Cursor dual-format input parsing', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles camelCase subagentStart (Cursor format) and reads subagent_type', () => {
    // Cursor sends 'subagentStart' (camelCase) and 'subagent_type' instead of 'agent_type'
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'subagentStart',
        subagent_type: 'tdd-implementer',
        conversation_id: 'conv-001',
        cwd: tmpDir,
      },
    });

    expect(result.exitCode).toBe(0);
    // stdout must be valid JSON
    expect(() => JSON.parse(result.stdout)).not.toThrow();

    // Guard state must reflect the subagent from subagent_type field
    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    expect(fs.existsSync(statePath)).toBe(true);
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.activeSubagent).toBe('tdd-implementer');
  });

  it('handles camelCase subagentStop (Cursor format) and resets guard state', () => {
    // Pre-set state to tdd-implementer
    fs.writeFileSync(
      path.join(tmpDir, '.claude/.guard-state.json'),
      JSON.stringify({
        activeSubagent: 'tdd-implementer',
        lastUpdated: new Date().toISOString(),
        sessionId: 'conv-001',
      })
    );

    // Cursor sends 'subagentStop' (camelCase) with conversation_id (no session_id)
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'subagentStop',
        conversation_id: 'conv-001',
        cwd: tmpDir,
      },
    });

    expect(result.exitCode).toBe(0);
    // SubagentStop must return empty object {}
    const parsed = JSON.parse(result.stdout);
    expect(Object.keys(parsed).length).toBe(0);

    // Guard state must be reset to main
    const statePath = path.join(tmpDir, '.claude/.guard-state.json');
    const state = JSON.parse(fs.readFileSync(statePath, 'utf-8'));
    expect(state.activeSubagent).toBe('main');
  });

  it('maps Shell tool to Bash handler — blocks write to tests/ in tdd-implementer phase', () => {
    // Pre-set state to tdd-implementer (GREEN phase — cannot touch tests/)
    fs.writeFileSync(
      path.join(tmpDir, '.claude/.guard-state.json'),
      JSON.stringify({
        activeSubagent: 'tdd-implementer',
        lastUpdated: new Date().toISOString(),
        sessionId: 'test-001',
      })
    );

    // Cursor uses 'Shell' instead of 'Bash' for shell commands
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Shell',
        tool_input: { command: 'cat > tests/unit/foo.test.ts <<EOF\nconst x = 1;\nEOF' },
        session_id: 'test-001',
        cwd: tmpDir,
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // Shell writing to tests/ during tdd-implementer must be blocked (same as Bash)
    expect(parsed.hookSpecificOutput?.permissionDecision).toBe('deny');
  });

  it('uses conversation_id as session fallback when session_id is absent — enables cross-session isolation', () => {
    // A tdd-implementer is active in a DIFFERENT session ('OTHER-SESSION')
    fs.writeFileSync(
      path.join(tmpDir, '.claude/.guard-state.json'),
      JSON.stringify({
        activeSubagent: 'tdd-implementer',
        lastUpdated: new Date().toISOString(),
        sessionId: 'OTHER-SESSION',
      })
    );

    // This hook call belongs to a NEW session ('conv-123') identified via conversation_id only
    // Since sessions differ, the OTHER-SESSION's tdd-implementer must not affect this session
    const result = runHook('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'tests/unit/foo.test.ts', content: 'const x = 1;' },
        conversation_id: 'conv-123',
        cwd: tmpDir,
        // NOTE: no session_id field — main() must fall back to conversation_id
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    // This session ('conv-123') is effectively 'main' — other session's tdd-implementer must not block it
    expect(parsed.hookSpecificOutput?.permissionDecision).toBe('allow');
  });

  it('exits with code 2 in Cursor environment when decision is deny', () => {
    // Pre-set state to tdd-implementer
    fs.writeFileSync(
      path.join(tmpDir, '.claude/.guard-state.json'),
      JSON.stringify({
        activeSubagent: 'tdd-implementer',
        lastUpdated: new Date().toISOString(),
        sessionId: 'test-001',
      })
    );

    // Run with CURSOR_VERSION env — Cursor format requires exit code 2 for deny
    const result = runHookWithEnv('.claude/hooks/prevent-test-edit.ts', {
      cwd: tmpDir,
      env: { CURSOR_VERSION: '1.0' },
      input: {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        tool_input: { file_path: 'tests/unit/foo.test.ts', content: 'x' },
        session_id: 'test-001',
        cwd: tmpDir,
      },
    });

    // Cursor format: deny must produce exit code 2
    expect(result.exitCode).toBe(2);
    const parsed = JSON.parse(result.stdout);
    expect(parsed.decision).toBe('deny');
    expect(parsed.reason).toBeDefined();
  });
});

// ============================================================================
// cursor-session-init.ts stdio -- 4 test cases
// ============================================================================
describe('cursor-session-init.ts stdio', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = setupTempProject();
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns valid JSON with additional_context containing TDD for sessionStart input', () => {
    const result = runHook('.claude/hooks/cursor-session-init.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'sessionStart',
        session_id: 'test-session-001',
        conversation_id: 'conv-001',
        is_background_agent: false,
      },
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(typeof parsed.additional_context).toBe('string');
    expect(parsed.additional_context).toContain('TDD');
  });

  it('writes .guard-state.json with activeSubagent main and sessionId after sessionStart', () => {
    const result = runHook('.claude/hooks/cursor-session-init.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'sessionStart',
        session_id: 'test-session-001',
        conversation_id: 'conv-001',
        is_background_agent: false,
      },
    });

    expect(result.exitCode).toBe(0);

    const guardStatePath = path.join(tmpDir, '.claude/.guard-state.json');
    expect(fs.existsSync(guardStatePath)).toBe(true);

    const state = JSON.parse(fs.readFileSync(guardStatePath, 'utf-8'));
    expect(state.activeSubagent).toBe('main');
    expect(state.sessionId).toBe('test-session-001');
  });

  it('returns {} and exits with code 0 on corrupt stdin', () => {
    const result = runHook('.claude/hooks/cursor-session-init.ts', {
      cwd: tmpDir,
      rawInput: '{"bad json',
    });

    expect(result.exitCode).toBe(0);
    const parsed = JSON.parse(result.stdout);
    expect(parsed).toEqual({});
  });

  it('always exits with code 0 for both valid and invalid input', () => {
    const validResult = runHook('.claude/hooks/cursor-session-init.ts', {
      cwd: tmpDir,
      input: {
        hook_event_name: 'sessionStart',
        session_id: 'test-session-002',
        conversation_id: 'conv-002',
        is_background_agent: false,
      },
    });
    expect(validResult.exitCode).toBe(0);

    const invalidResult = runHook('.claude/hooks/cursor-session-init.ts', {
      cwd: tmpDir,
      rawInput: 'not valid json at all!!!',
    });
    expect(invalidResult.exitCode).toBe(0);
  });
});
