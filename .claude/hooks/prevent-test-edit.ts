#!/usr/bin/env npx tsx
/**
 * TDD Guard Hook - Prevents unauthorized test file modifications
 *
 * Enforces:
 * - Only tdd-test-writer can modify tests/**
 * - GREEN/REFACTOR phases cannot touch test files
 * - Tracks active subagent via state file
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { stdout, stderr } from 'node:process';

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
}

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: string;
    permissionDecision?: 'allow' | 'deny' | 'ask';
    permissionDecisionReason?: string;
  };
}

const ALLOWED_TEST_WRITERS = ['tdd-test-writer', 'main'];
const STATE_FILE = '.claude/.guard-state.json';
// Match paths that contain tests/ as a directory component
// Matches: tests/, ./tests/, ../tests/, /absolute/path/tests/, tests\unit\, etc.
const PROTECTED_PATHS = /(?:^|[\\/])tests[\\/]/;

function getProjectRoot(): string {
  // Try to find .claude directory
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
      return JSON.parse(content);
    }
  } catch (err) {
    // Fallback to default state
  }
  return { activeSubagent: 'main', lastUpdated: new Date().toISOString() };
}

function writeState(state: GuardState): void {
  const projectRoot = getProjectRoot();
  const statePath = join(projectRoot, STATE_FILE);
  try {
    writeFileSync(statePath, JSON.stringify(state, null, 2), 'utf-8');
  } catch (err) {
    // Silent fail - state tracking is best-effort
  }
}

function extractSubagentName(toolInput: Record<string, unknown>): string | null {
  // When Task tool is called, tool_input has structure like:
  // { "task_name": "tdd-implementer", "prompt": "..." }
  // or in newer Claude Code versions:
  // { "name": "tdd-implementer", "prompt": "..." }
  const name = (toolInput.task_name || toolInput.name) as string | undefined;
  return name || null;
}

function isTestFile(filePath: string): boolean {
  if (!filePath) return false;

  // Normalize path separators (both / and \) to forward slashes
  const normalized = filePath.replace(/\\/g, '/');

  // Remove leading ./ or ../ or multiple ../ prefixes
  // Examples: ./tests/file.ts → tests/file.ts, ../../tests/file.ts → tests/file.ts
  const cleaned = normalized.replace(/^(?:\.+\/)+/, '');

  // Remove leading absolute path separators
  // Examples: /tests/file.ts → tests/file.ts, //tests/file.ts → tests/file.ts
  const withoutLeadingSlash = cleaned.replace(/^\/+/, '');

  // Check if path contains tests/ as a directory component
  // Regex: (?:^|[\\/])tests[\\/]  matches:
  // - tests/ at start: "tests/unit/file.ts"
  // - tests/ after separator: "src/tests/file.ts" or "src\tests\file.ts"
  return PROTECTED_PATHS.test(withoutLeadingSlash) || PROTECTED_PATHS.test(normalized);
}

function handleTaskToolUse(toolInput: Record<string, unknown>): HookOutput {
  // Update state when a subagent is invoked
  const subagentName = extractSubagentName(toolInput);
  if (subagentName) {
    writeState({
      activeSubagent: subagentName,
      lastUpdated: new Date().toISOString(),
    });
  }
  // Always allow Task tool use - we just track state
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

function handleFileEdit(toolName: string, toolInput: Record<string, unknown>): HookOutput {
  const filePath = (toolInput.file_path || toolInput.path) as string | undefined;

  if (!filePath || !isTestFile(filePath)) {
    // Not a test file, allow
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
  }

  // This is a test file - check if current subagent is allowed to edit it
  const state = readState();
  const currentSubagent = state.activeSubagent;

  if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
    // BLOCK: Only tdd-test-writer (or main agent) can edit test files
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: `❌ TDD Guard: Cannot modify test files in GREEN/REFACTOR phases.\n\nFile: ${filePath}\nCurrent subagent: ${currentSubagent}\n\nOnly tdd-test-writer can modify tests/ during RED phase.\nIf you need to modify tests, ensure you're using the tdd-test-writer subagent or RED phase of TDD cycle.\n\nSee .cursor/rules/claude-tdd.md for TDD workflow details.`,
      },
    };
  }

  // tdd-test-writer is allowed to edit test files
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

function main(): void {
  try {
    // Read hook input from stdin
    const inputData = JSON.parse(readFileSync(0, 'utf-8')) as HookInput;

    const toolName = inputData.tool_name || '';
    const toolInput = inputData.tool_input || {};

    let result: HookOutput;

    // Route based on tool type
    if (toolName === 'Task') {
      // Track which subagent is being invoked
      result = handleTaskToolUse(toolInput);
    } else if (toolName === 'Write' || toolName === 'Edit') {
      // Check if trying to modify test files
      result = handleFileEdit(toolName, toolInput);
    } else {
      // Other tools - allow by default
      result = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    // Output JSON result with exit code 0
    stdout.write(JSON.stringify(result));
    process.exit(0);
  } catch (error) {
    // On parse error or unexpected failure, allow action
    // (fail open rather than blocking legitimate operations)
    const fallback = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'allow',
      },
    };
    stdout.write(JSON.stringify(fallback));
    process.exit(0);
  }
}

main();
