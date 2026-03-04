#!/usr/bin/env npx tsx
/**
 * TDD Telemetry Hook - Records timing events when subagents complete
 *
 * Runs on SubagentStop hook event.
 * Logs SubagentTimingEvent for tdd-* agents to track phase execution times.
 * Does not block agent termination (telemetry is informational only).
 */

import { readFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { stdout } from 'node:process';
import { detectEnvironment } from './lib/guard-core';

export interface SubagentStopInput {
  session_id?: string;
  transcript_path?: string;
  cwd: string;
  permission_mode?: string;
  hook_event_name: string;
  stop_hook_active?: boolean;
  agent_id?: string;
  agent_type?: string;
  subagent_type?: string;
  agent_transcript_path?: string;
  last_assistant_message?: string;
  duration?: number;
}

export interface SubagentTimingEvent {
  timestamp: string;
  agent: string;
  phase: string;
  started_at: string;
  finished_at: string;
  tool_calls_count: number;
  environment?: 'claude-code' | 'cursor';
}

// Map agent_type to phase name
export function agentTypeToPhase(agentType: string): string | null {
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

export function getProjectRoot(cwd: string): string {
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

export function logTimingEvent(event: SubagentTimingEvent, projectRoot: string): void {
  try {
    const logPath = join(projectRoot, 'airefinement/artifacts/traces/timings.jsonl');
    mkdirSync(dirname(logPath), { recursive: true });
    const enrichedEvent = { ...event, environment: event.environment || detectEnvironment() };
    appendFileSync(logPath, JSON.stringify(enrichedEvent) + '\n');
  } catch {
    // Telemetry must not break the hook or block subagent termination
  }
}

function exitOk(): never {
  stdout.write(JSON.stringify({}));
  process.exit(0);
}

export function main(): void {
  try {
    const inputData = JSON.parse(readFileSync(0, 'utf-8')) as SubagentStopInput;

    const hookEventName = (inputData.hook_event_name || '').toLowerCase();
    const agentType = inputData.agent_type || inputData.subagent_type || '';

    if (hookEventName !== 'subagentstop') exitOk();
    if (!agentType.startsWith('tdd-')) exitOk();

    const phase = agentTypeToPhase(agentType);
    if (!phase) exitOk();

    const projectRoot = getProjectRoot(inputData.cwd);
    const now = new Date().toISOString();
    const startedAt = inputData.duration
      ? new Date(Date.now() - inputData.duration).toISOString()
      : '';
    const event: SubagentTimingEvent = {
      timestamp: now,
      agent: agentType,
      phase: phase,
      started_at: startedAt,
      finished_at: now,
      tool_calls_count: 0,
      environment: detectEnvironment(),
    };

    logTimingEvent(event, projectRoot);
    exitOk();
  } catch {
    // Telemetry failure must not block subagent termination
    exitOk();
  }
}

if (!process.env.JEST_WORKER_ID) {
  main();
}
