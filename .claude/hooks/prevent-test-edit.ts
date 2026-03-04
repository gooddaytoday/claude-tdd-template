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

import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
import {
  GuardState,
  ViolationEvent,
  ALLOWED_TEST_WRITERS,
  getProjectRoot,
  redactSensitiveSegment,
  sanitizeCommand,
  logViolationEvent,
  writeState,
  extractSubagentName,
  normalizePath,
  isTestFile,
  isJestConfigFile,
  isEnforcementFile,
  contentHasSkipPatterns,
  bashCommandWritesToTests,
  bashCommandWritesToJestConfig,
  bashCommandWritesToEnforcementFiles,
  detectEnvironment,
  readState as guardReadState,
} from './lib/guard-core';

export type { GuardState, ViolationEvent };
export {
  detectEnvironment,
  getProjectRoot,
  redactSensitiveSegment,
  sanitizeCommand,
  logViolationEvent,
  writeState,
  extractSubagentName,
  normalizePath,
  isTestFile,
  isJestConfigFile,
  isEnforcementFile,
  contentHasSkipPatterns,
  bashCommandWritesToTests,
  bashCommandWritesToJestConfig,
  bashCommandWritesToEnforcementFiles,
};

interface HookInput {
  hook_event_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
  session_id?: string;
  agent_type?: string;
  conversation_id?: string;
  subagent_type?: string;
}

export interface HookOutput {
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

// Current session ID, set from hook input in main()
let currentSessionId: string | undefined;

export function setCurrentSessionId(id: string | undefined): void {
  currentSessionId = id;
}

export function readState(): GuardState {
  return guardReadState(currentSessionId);
}

// A1: Handle Bash tool — detect write-capable commands targeting tests/ or jest configs
export function handleBashCommand(toolInput: Record<string, unknown>): HookOutput {
  const command = (toolInput.command || toolInput.cmd || '') as string;

  if (!command) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const state = readState();
  const currentSubagent = state.activeSubagent;

  if (bashCommandWritesToTests(command)) {
    if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
      const sanitizedCommand = sanitizeCommand(command);
      logViolationEvent({
        timestamp: new Date().toISOString(),
        agent: currentSubagent,
        attempted_action: 'Bash write to tests',
        target_file: sanitizedCommand.target_file,
        blocked: true,
        reason: 'TDD Guard: Cannot modify test files via shell commands in GREEN/REFACTOR phases',
        command_hash: sanitizedCommand.command_hash,
        command_length: sanitizedCommand.command_length,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `❌ TDD Guard (Bash): Cannot modify test files via shell commands in GREEN/REFACTOR phases.\n\nCommand: ${command.slice(0, 200)}\nCurrent subagent: ${currentSubagent}\n\nRecovery: Return to orchestrator. If tests need changes, escalate to tdd-test-writer via RED phase.\nSee policies/guard-rules.md for full role-permission matrix.`,
        },
      };
    }
  }

  if (bashCommandWritesToJestConfig(command)) {
    if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
      const sanitizedCommand = sanitizeCommand(command);
      logViolationEvent({
        timestamp: new Date().toISOString(),
        agent: currentSubagent,
        attempted_action: 'Bash write to jest config',
        target_file: sanitizedCommand.target_file,
        blocked: false,
        reason: 'TDD Guard: Modifying Jest configuration via shell command outside RED phase',
        command_hash: sanitizedCommand.command_hash,
        command_length: sanitizedCommand.command_length,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `⚠️ TDD Guard (Bash): Modifying Jest configuration via shell command outside RED phase.\n\nCommand: ${command.slice(0, 200)}\nCurrent subagent: ${currentSubagent}\n\nJest config changes can indirectly affect which tests run. Proceed only if intentional.`,
        },
      };
    }
  }

  if (bashCommandWritesToEnforcementFiles(command)) {
    if (currentSubagent !== 'main') {
      const sanitizedCommand = sanitizeCommand(command);
      logViolationEvent({
        timestamp: new Date().toISOString(),
        agent: currentSubagent,
        attempted_action: 'Bash write to enforcement files',
        target_file: sanitizedCommand.target_file,
        blocked: false,
        reason: 'TDD Guard: Modifying TDD enforcement files via shell command during an active subagent cycle',
        command_hash: sanitizedCommand.command_hash,
        command_length: sanitizedCommand.command_length,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'ask',
          permissionDecisionReason: `⚠️ TDD Guard (Bash): Modifying TDD enforcement files via shell command during an active subagent cycle.\n\nCommand: ${command.slice(0, 200)}\nCurrent subagent: ${currentSubagent}\n\nRecovery: Finish TDD cycle first. Modify enforcement files only from main agent outside TDD.\nSee policies/guard-rules.md for full role-permission matrix.`,
        },
      };
    }
  }

  return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
}

// Handle Write/Edit tools with A2 (fail-closed), A3 (skip detection), A4 (enforcement protection)
export function handleFileEdit(toolName: string, toolInput: Record<string, unknown>): HookOutput {
  const filePath = (toolInput.file_path || toolInput.path) as string | undefined;

  if (!filePath) {
    return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'allow' } };
  }

  const state = readState();
  const currentSubagent = state.activeSubagent;

  // A4: Protect enforcement files during any TDD subagent cycle (including unknown/stale state)
  if (isEnforcementFile(filePath) && currentSubagent !== 'main') {
    logViolationEvent({
      timestamp: new Date().toISOString(),
      agent: currentSubagent,
      attempted_action: `${toolName} write to enforcement files`,
      target_file: filePath,
      blocked: false,
      reason: 'TDD Guard: Modifying TDD enforcement files during an active subagent cycle',
    });
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: `⚠️ TDD Guard: Modifying TDD enforcement files during an active subagent cycle.\n\nFile: ${filePath}\nCurrent subagent: ${currentSubagent}\n\nRecovery: Finish TDD cycle first. Modify enforcement files only from main agent outside TDD.\nSee policies/guard-rules.md for full role-permission matrix.`,
      },
    };
  }

  // A2: fail-closed — unknown state blocks test modifications
  if (isTestFile(filePath)) {
    if (!ALLOWED_TEST_WRITERS.includes(currentSubagent)) {
      logViolationEvent({
        timestamp: new Date().toISOString(),
        agent: currentSubagent,
        attempted_action: `${toolName} write to test file`,
        target_file: filePath,
        blocked: true,
        reason: `TDD Guard: Cannot modify test files in ${currentSubagent === 'unknown' ? 'unknown state' : currentSubagent + ' phase'}`,
      });
      return {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'deny',
          permissionDecisionReason: `❌ TDD Guard: Cannot modify test files in ${currentSubagent === 'unknown' ? 'unknown state' : currentSubagent + ' phase'}.\n\nFile: ${filePath}\nCurrent subagent: ${currentSubagent}\n\nRecovery: ${currentSubagent === 'unknown' ? 'Guard state is stale or unknown. Complete current work, then restart TDD cycle.' : 'Return to orchestrator. If tests need changes, escalate to tdd-test-writer via RED phase.'}\nSee policies/guard-rules.md for full role-permission matrix.`,
        },
      };
    }

    // A3: Detect semantic test-disabling patterns in content being written.
    const newContent = [
      toolInput.new_content,
      toolInput.content,
      toolInput.new_string,
      ...(Array.isArray(toolInput.edits)
        ? (toolInput.edits as Array<Record<string, unknown>>).map(e => e.new_string ?? '')
        : []),
    ]
      .filter(Boolean)
      .join('\n') as string;
    if (newContent && contentHasSkipPatterns(newContent)) {
      logViolationEvent({
        timestamp: new Date().toISOString(),
        agent: currentSubagent,
        attempted_action: `${toolName} with skip/only patterns`,
        target_file: filePath,
        blocked: false,
        reason: 'TDD Guard: Test file contains skip/only patterns that may disable tests',
      });
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
      logViolationEvent({
        timestamp: new Date().toISOString(),
        agent: currentSubagent,
        attempted_action: `${toolName} write to jest config`,
        target_file: filePath,
        blocked: false,
        reason: 'TDD Guard: Modifying Jest configuration outside RED phase',
      });
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

export function handleTaskToolUse(toolInput: Record<string, unknown>): HookOutput {
  const subagentName = extractSubagentName(toolInput);
  if (subagentName) {
    writeState({
      activeSubagent: subagentName,
      lastUpdated: new Date().toISOString(),
      sessionId: currentSessionId,
    });
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: 'allow',
    },
  };
}

export function handleSubagentStop(): HookOutput {
  writeState({
    activeSubagent: 'main',
    lastUpdated: new Date().toISOString(),
    sessionId: currentSessionId,
  });
  return {};
}

export function handleSubagentStart(agentType?: string): HookOutput {
  writeState({
    activeSubagent: agentType ?? 'unknown',
    lastUpdated: new Date().toISOString(),
    sessionId: currentSessionId,
  });
  return {};
}

export type PermissionDecision = 'allow' | 'deny' | 'ask';

export interface FormatOutputResult {
  json: string;
  exitCode: number;
}

export function formatOutput(decision: PermissionDecision, reason?: string): FormatOutputResult {
  const env = detectEnvironment();

  if (env === 'cursor') {
    const cursorDecision = decision === 'ask' ? 'deny' : decision;
    return {
      json: JSON.stringify({ decision: cursorDecision, reason: reason || '' }),
      exitCode: decision === 'deny' ? 2 : 0,
    };
  }

  // Claude Code format
  return {
    json: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        ...(reason ? { permissionDecisionReason: reason } : {}),
      },
    }),
    exitCode: 0,
  };
}

export function main(): void {
  try {
    const inputData = JSON.parse(readFileSync(0, 'utf-8')) as HookInput;

    const hookEventName = inputData.hook_event_name || '';
    const normalizedEvent = hookEventName.toLowerCase();
    const rawToolName = inputData.tool_name || '';
    const toolName = rawToolName === 'Shell' ? 'Bash' : rawToolName;
    const toolInput = inputData.tool_input || {};
    currentSessionId = inputData.session_id || inputData.conversation_id || undefined;
    const agentType = inputData.agent_type || inputData.subagent_type || undefined;

    let result: HookOutput;

    if (normalizedEvent === 'subagentstart') {
      result = handleSubagentStart(agentType);
    } else if (normalizedEvent === 'subagentstop') {
      result = handleSubagentStop();
    } else if (toolName === 'Task') {
      result = handleTaskToolUse(toolInput);
    } else if (toolName === 'Bash') {
      result = handleBashCommand(toolInput);
    } else if (toolName === 'Write' || toolName === 'Edit' || toolName === 'MultiEdit') {
      result = handleFileEdit(toolName, toolInput);
    } else {
      result = {
        hookSpecificOutput: {
          hookEventName: 'PreToolUse',
          permissionDecision: 'allow',
        },
      };
    }

    if (result.hookSpecificOutput?.permissionDecision !== undefined) {
      const decision = result.hookSpecificOutput.permissionDecision;
      const reason = result.hookSpecificOutput.permissionDecisionReason;
      const formatted = formatOutput(decision, reason);
      stdout.write(formatted.json);
      process.exit(formatted.exitCode);
    } else {
      stdout.write(JSON.stringify(result));
      process.exit(0);
    }
  } catch {
    const formatted = formatOutput('ask', '⚠️ TDD Guard: Hook encountered an unexpected error. Please verify this action is safe before proceeding.');
    stdout.write(formatted.json);
    process.exit(formatted.exitCode);
  }
}

if (!process.env.JEST_WORKER_ID) {
  main();
}
