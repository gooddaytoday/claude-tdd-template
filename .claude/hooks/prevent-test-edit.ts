#!/usr/bin/env npx tsx
/**
 * TDD Guard Hook - Prevents unauthorized test file modifications
 *
 * Enforces:
 * - Only tdd-test-writer can modify tests/**
 * - GREEN/REFACTOR phases cannot touch test files via Write, Edit, OR Bash
 * - Fail-closed: unknown state = deny (not allow)
 * - Detects semantic test disabling (.skip/.only patterns)
 * - Protects enforcement files (.claude/hooks, .claude/skills, .claude/settings.json)
 * - Tracks active subagent via state file with session_id and TTL
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stdout } from 'node:process';

interface HookInput {
  hook_event_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
  session_id: string;
}

interface GuardState {
  activeSubagent: string;
  lastUpdated: string;
  sessionId?: string;
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  };
  decision?: 'block';
  reason?: string;
  continue?: boolean;
  stopReason?: string;
}

const ALLOWED_TEST_WRITERS = ['tdd-test-writer', 'main'];

// State file lives inside the project's .claude directory
const STATE_FILE = '.claude/.guard-state.json';

// State TTL: if older than 2 hours, treat as stale (unknown subagent)
const STATE_TTL_MS = 2 * 60 * 60 * 1000;

// Match paths that contain tests/ as a directory component
const PROTECTED_TEST_PATHS = /(?:^|[\\/])tests[\\/]/;

// Match jest config files
const JEST_CONFIG_PATHS = /(?:^|[\\/])jest(?:\.[^/\\]*)?\.config\.[jt]s$/;

// Match enforcement files that should be protected during TDD cycles
const ENFORCEMENT_PATHS = /(?:^|[\\/])\.claude[\\/](?:hooks|skills|settings\.json)/;

// Patterns in Bash commands that could write to tests/ (write-capable shell operators/commands).
// Checks if the command string contains a write operation targeting a tests/ path.
// Uses simple substring-aware patterns (no ^ anchor inside nested groups).
const BASH_WRITE_TEST_PATTERNS: RegExp[] = [
  // Redirect operators (> or >>) writing to a path containing tests/
  /(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*tests[\\/]/,
  // cp/mv with a destination argument containing tests/
  /\b(?:cp|mv)\b.*\btests[\\/]/,
  // sed -i targeting a file in tests/
  /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s*(?:''|"")?|--in-place(?:=(?:''|"")?)?\s+).*tests[\\/]/,
  // echo/printf piped or redirected to tests/
  /\b(?:echo|printf)\b.*(?:>>?|tee\s)\s*['"]?[^\s'"]*tests[\\/]/,
  // cat redirected to tests/
  /\bcat\b.*(?:>>?)\s+['"]?[^\s'"]*tests[\\/]/,
];

// Patterns for Bash commands writing to jest config files
const BASH_WRITE_JEST_PATTERNS: RegExp[] = [
  /(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*jest(?:\.[^/\\'"\s]*)?\.config\.[jt]s/,
  /\b(?:cp|mv)\b.*jest(?:\.[^/\\'"\s]*)?\.config\.[jt]s/,
  /\bsed\s+(?:-[a-zA-Z]*i[a-zA-Z]*\s*(?:''|"")?|--in-place(?:=(?:''|"")?)?\s+).*jest(?:\.[^/\\'"\s]*)?\.config\.[jt]s/,
];

// Semantic test-disabling patterns to detect inside test file content
const SKIP_PATTERNS = /\b(?:\.skip|xdescribe|xit\b|xtest\b|test\.only\b|describe\.only\b|it\.only\b)\b|if\s*\(\s*false\s*\)/;

function getProjectRoot(): string {
  let cwd = process.cwd();
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(cwd, '.claude'))) {
      return cwd;
    }
    const parent = join(cwd, '..');
    if (parent === cwd) break;
    cwd = parent;
  }
  return process.cwd();
}

function readState(): GuardState {
  const projectRoot = getProjectRoot();
  const statePath = join(projectRoot, STATE_FILE);
  try {
    if (existsSync(statePath)) {
      const content = readFileSync(statePath, 'utf-8');
      const state = JSON.parse(content) as GuardState;

      // Check TTL: stale state is treated as unknown
      const age = Date.now() - new Date(state.lastUpdated).getTime();
      if (age > STATE_TTL_MS) {
        return { activeSubagent: 'unknown', lastUpdated: new Date().toISOString() };
      }

      return state;
    }
  } catch {
    // Fall through to fail-closed default
  }
  // A2: fail-closed — unknown state blocks test modifications
  return { activeSubagent: 'unknown', lastUpdated: new Date().toISOString() };
}

function writeState(state: GuardState): void {
  const projectRoot = getProjectRoot();
  const statePath = join(projectRoot, STATE_FILE);
  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch {
    // Silent fail - state tracking is best-effort on write
  }
}

function extractSubagentName(toolInput: Record<string, unknown>): string | null {
  const name = (toolInput.task_name || toolInput.name) as string | undefined;
  return name || null;
}

function normalizePath(filePath: string): string {
  const normalized = filePath.replace(/\\/g, '/');
  const cleaned = normalized.replace(/^(?:\.+\/)+/, '');
  return cleaned.replace(/^\/+/, '');
}

function isTestFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  const withoutLeadingSlash = normalizePath(filePath);
  return PROTECTED_TEST_PATHS.test(withoutLeadingSlash) || PROTECTED_TEST_PATHS.test(normalized);
}

function isJestConfigFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  const withoutLeadingSlash = normalizePath(filePath);
  return JEST_CONFIG_PATHS.test(withoutLeadingSlash) || JEST_CONFIG_PATHS.test(normalized);
}

function isEnforcementFile(filePath: string): boolean {
  if (!filePath) return false;
  const normalized = filePath.replace(/\\/g, '/');
  const withoutLeadingSlash = normalizePath(filePath);
  return ENFORCEMENT_PATHS.test(withoutLeadingSlash) || ENFORCEMENT_PATHS.test(normalized);
}

function contentHasSkipPatterns(content: string): boolean {
  return SKIP_PATTERNS.test(content);
}

function bashCommandWritesToTests(command: string): boolean {
  return BASH_WRITE_TEST_PATTERNS.some(pattern => pattern.test(command));
}

function bashCommandWritesToJestConfig(command: string): boolean {
  return BASH_WRITE_JEST_PATTERNS.some(pattern => pattern.test(command));
}

// A1: Handle Bash tool — detect write-capable commands targeting tests/ or jest configs
function handleBashCommand(toolInput: Record<string, unknown>): HookOutput {
  const command = (toolInput.command || toolInput.cmd || '') as string;

  if (!command) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const state = readState();
  const currentSubagent = state.activeSubagent;

  if (bashCommandWritesToTests(command)) {
    if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `❌ TDD Guard (Bash): Cannot modify test files via shell commands in GREEN/REFACTOR phases.\n\nCommand: ${command.slice(0, 200)}\nCurrent subagent: ${currentSubagent}\n\nShell-based modifications to tests/ are blocked outside RED phase, just like Write/Edit.\nOnly tdd-test-writer can modify tests/ during RED phase.`,
        },
      };
    }
  }

  if (bashCommandWritesToJestConfig(command)) {
    if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `⚠️ TDD Guard (Bash): Modifying Jest configuration via shell command outside RED phase.\n\nCommand: ${command.slice(0, 200)}\nCurrent subagent: ${currentSubagent}\n\nJest config changes can indirectly affect which tests run. Proceed only if intentional.`,
        },
      };
    }
  }

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

// Handle Write/Edit tools with A2 (fail-closed), A3 (skip detection), A4 (enforcement protection)
function handleFileEdit(toolName: string, toolInput: Record<string, unknown>): HookOutput {
  const filePath = (toolInput.file_path || toolInput.path) as string | undefined;

  if (!filePath) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const state = readState();
  const currentSubagent = state.activeSubagent;

  // A4: Protect enforcement files during any TDD subagent cycle (including unknown/stale state)
  if (isEnforcementFile(filePath) && currentSubagent !== 'main') {
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `⚠️ TDD Guard: Modifying TDD enforcement files during an active subagent cycle.\n\nFile: ${filePath}\nCurrent subagent: ${currentSubagent}\n\nChanges to .claude/hooks/, .claude/skills/, or .claude/settings.json during TDD cycles risk disabling guard protections. This should only happen in a maintenance context, not during a TDD cycle.`,
      },
    };
  }

  // A2: fail-closed — unknown state blocks test modifications
  if (isTestFile(filePath)) {
    if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `❌ TDD Guard: Cannot modify test files in GREEN/REFACTOR phases.\n\nFile: ${filePath}\nCurrent subagent: ${currentSubagent}\n\nOnly tdd-test-writer can modify tests/ during RED phase.\nIf you need to modify tests, ensure you're using the tdd-test-writer subagent or RED phase of TDD cycle.\n\nSee .claude/skills/tdd-integration/skill.md for TDD workflow details.`,
        },
      };
    }

    // A3: Detect semantic test-disabling patterns in content being written
    const newContent = (toolInput.new_content || toolInput.content || '') as string;
    if (newContent && contentHasSkipPatterns(newContent)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `⚠️ TDD Guard: Test file contains skip/only patterns that may disable tests.\n\nFile: ${filePath}\nDetected patterns: .skip, .only, xdescribe, xit, xtest, if(false), etc.\n\nThese patterns create "dead" tests that don't actually run. Ensure this is intentional (e.g., a temporarily skipped test with a clear reason).`,
        },
      };
    }

    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  // Jest config protection
  if (isJestConfigFile(filePath)) {
    if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `⚠️ TDD Guard: Modifying Jest configuration outside RED phase.\n\nFile: ${filePath}\nCurrent subagent: ${currentSubagent}\n\nJest config changes can indirectly affect test behavior. This is only expected during RED phase (tdd-test-writer).\n\nProceed only if this change is intentional and unrelated to current TDD cycle.`,
        },
      };
    }
  }

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

function handleTaskToolUse(toolInput: Record<string, unknown>): HookOutput {
  const subagentName = extractSubagentName(toolInput);
  if (subagentName) {
    writeState({
      activeSubagent: subagentName,
      lastUpdated: new Date().toISOString(),
    });
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

function handleSubagentStop(): HookOutput {
  writeState({
    activeSubagent: 'main',
    lastUpdated: new Date().toISOString(),
  });
  return {};
}

function main(): void {
  try {
    const inputData = JSON.parse(readFileSync(0, 'utf-8')) as HookInput;

    const hookEventName = inputData.hook_event_name || '';
    const toolName = inputData.tool_name || '';
    const toolInput = inputData.tool_input || {};

    let result: HookOutput;

    if (hookEventName === 'SubagentStop') {
      result = handleSubagentStop();
    } else if (toolName === 'Task') {
      result = handleTaskToolUse(toolInput);
    } else if (toolName === 'Bash') {
      // A1: Intercept Bash commands that could write to tests/
      result = handleBashCommand(toolInput);
    } else if (toolName === 'Write' || toolName === 'Edit') {
      result = handleFileEdit(toolName, toolInput);
    } else {
      result = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch {
    // On unexpected failure, ask user rather than blindly allowing
    const fallback = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: '⚠️ TDD Guard: Hook encountered an unexpected error. Please verify this action is safe before proceeding.',
      },
    };
    stdout.write(JSON.stringify(fallback));
    process.exit(0);
  }
}

main();
