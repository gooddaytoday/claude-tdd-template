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
