export interface MockHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
  session_id?: string;
  agent_type?: string;
}

export function makePreToolUseInput(overrides: Partial<MockHookInput> = {}): MockHookInput {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: {},
    cwd: process.cwd(),
    session_id: 'test-session-001',
    ...overrides,
  };
}

export function makeWriteToTestInput(filePath = 'tests/unit/foo.test.ts'): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: 'test content' },
  });
}

export function makeEditTestInput(filePath = 'tests/unit/foo.test.ts'): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Edit',
    tool_input: { file_path: filePath, new_string: 'updated', old_string: 'original' },
  });
}

export function makeBashInput(command: string): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Bash',
    tool_input: { command },
  });
}

export function makeTaskInput(subagentType: string): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Task',
    tool_input: { subagent_type: subagentType },
  });
}

export function makeSubagentStartInput(agentType: string): MockHookInput {
  return {
    hook_event_name: 'SubagentStart',
    agent_type: agentType,
    cwd: process.cwd(),
    session_id: 'test-session-001',
  };
}

export function makeSubagentStopInput(): MockHookInput {
  return {
    hook_event_name: 'SubagentStop',
    cwd: process.cwd(),
    session_id: 'test-session-001',
  };
}

export function makeSkillEvalInput(prompt: string): { hook_event_name: string; prompt: string; session_id: string } {
  return {
    hook_event_name: 'UserPromptSubmit',
    prompt,
    session_id: 'test-session-001',
  };
}

export function makeTelemetryInput(agentType: string): Record<string, unknown> {
  return {
    hook_event_name: 'SubagentStop',
    agent_type: agentType,
    session_id: 'test-session-001',
    cwd: process.cwd(),
    transcript_path: '/tmp/transcript',
    permission_mode: 'default',
    agent_id: 'agent-001',
    agent_transcript_path: '/tmp/agent-transcript',
  };
}
