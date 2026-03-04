#!/usr/bin/env npx tsx
/**
 * Cursor Session Init Hook — initializes TDD guard state on session start
 *
 * Runs on SessionStart hook event in Cursor IDE.
 * Sets activeSubagent to 'main' and writes initial guard state.
 * Returns additional_context with TDD instructions.
 */

import { writeState } from './lib/guard-core';
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';

export interface SessionStartInput {
  session_id?: string;
  conversation_id?: string;
  is_background_agent?: boolean;
  composer_mode?: string;
  hook_event_name?: string;
}

const ADDITIONAL_CONTEXT = `This project uses TDD (Test-Driven Development) with strict Red-Green-Refactor cycle.

**TDD Workflow:**
1. RED phase (tdd-test-writer): Write failing tests first
2. GREEN phase (tdd-implementer): Implement minimal code to pass tests
3. REFACTOR phase (tdd-refactorer): Improve code quality

**Rules:**
- Always write tests before implementation
- Never modify tests to make them pass
- Use /tdd-integration command to invoke the full TDD cycle`;

export function buildSessionResponse(input: SessionStartInput): {
  response: { additional_context: string; env: Record<string, string> };
  state: { activeSubagent: 'main'; lastUpdated: string; sessionId: string | undefined };
} {
  const sessionId = input.session_id ?? input.conversation_id;
  const lastUpdated = new Date().toISOString();

  const state = {
    activeSubagent: 'main' as const,
    lastUpdated,
    sessionId,
  };

  return {
    response: {
      additional_context: ADDITIONAL_CONTEXT,
      env: {},
    },
    state,
  };
}

export function main(): void {
  try {
    const inputData = JSON.parse(readFileSync(0, 'utf-8')) as SessionStartInput;
    const { response, state } = buildSessionResponse(inputData);

    writeState(state);
    stdout.write(JSON.stringify(response));
    process.exit(0);
  } catch {
    stdout.write(JSON.stringify({}));
    process.exit(0);
  }
}

if (!process.env.JEST_WORKER_ID) {
  main();
}
