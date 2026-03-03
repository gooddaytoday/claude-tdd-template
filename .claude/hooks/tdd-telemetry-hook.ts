#!/usr/bin/env npx tsx
/**
 * TDD Telemetry Hook - Records timing events when subagents complete
 *
 * Runs on SubagentStop hook event.
 * Logs SubagentTimingEvent for tdd-* agents to track phase execution times.
 * Does not block agent termination (telemetry is informational only).
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { stdout } from 'node:process';

interface SubagentStopInput {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
  stop_hook_active: boolean;
  agent_id: string;
  agent_type: string;
  agent_transcript_path: string;
  last_assistant_message?: string;
}

interface SubagentTimingEvent {
  timestamp: string;
  agent: string;
  phase: string;
  started_at: string;
  finished_at: string;
  tool_calls_count: number;
}

// Map agent_type to phase name
function agentTypeToPhase(agentType: string): string | null {
  const mapping: Record<string, string> = {
    'tdd-test-writer': 'RED',
    'tdd-implementer': 'GREEN',
    'tdd-refactorer': 'REFACTOR',
    'tdd-code-reviewer': 'CODE_REVIEW',
    'tdd-architect-reviewer': 'ARCH_REVIEW',
    'tdd-documenter': 'DOCS',
    'tdd-telemetry-reporter': 'TELEMETRY',
  };
  return mapping[agentType] || null;
}

function getProjectRoot(cwd: string): string {
  let current = cwd;
  for (let i = 0; i < 10; i++) {
    if (existsSync(join(current, '.claude'))) {
      return current;
    }
    const parent = join(current, '..');
    if (parent === current) break;
    current = parent;
  }
  return cwd;
}

function logTimingEvent(event: SubagentTimingEvent, projectRoot: string): void {
  try {
    const logPath = join(projectRoot, 'airefinement/artifacts/traces/timings.jsonl');
    mkdirSync(dirname(logPath), { recursive: true });
    appendFileSync(logPath, JSON.stringify(event) + '\n');
  } catch {
    // Telemetry must not break the hook or block subagent termination
  }
}

function main(): void {
  try {
    const inputData = JSON.parse(readFileSync(0, 'utf-8')) as SubagentStopInput;

    const hookEventName = inputData.hook_event_name || '';
    const agentType = inputData.agent_type || '';

    // Only process SubagentStop events
    if (hookEventName !== 'SubagentStop') {
      stdout.write(JSON.stringify({}));
      process.exit(0);
    }

    // Only log for tdd-* agents
    if (!agentType.startsWith('tdd-')) {
      stdout.write(JSON.stringify({}));
      process.exit(0);
    }

    const phase = agentTypeToPhase(agentType);
    if (!phase) {
      // Unknown tdd-* agent type, skip logging
      stdout.write(JSON.stringify({}));
      process.exit(0);
    }

    // Get project root
    const projectRoot = getProjectRoot(inputData.cwd);

    // Create timing event
    const now = new Date().toISOString();
    const event: SubagentTimingEvent = {
      timestamp: now,
      agent: agentType,
      phase: phase,
      started_at: '', // Not available from SubagentStop input
      finished_at: now,
      tool_calls_count: 0, // Not available from SubagentStop input
    };

    // Log the event
    logTimingEvent(event, projectRoot);

    // Return empty object to allow subagent to stop
    stdout.write(JSON.stringify({}));
    process.exit(0);
  } catch {
    // On unexpected failure, return empty object and allow subagent to stop
    // Telemetry failure should not block normal operation
    stdout.write(JSON.stringify({}));
    process.exit(0);
  }
}

main();
