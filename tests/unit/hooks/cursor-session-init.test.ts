import { buildSessionResponse } from '../../../.claude/hooks/cursor-session-init';

describe('cursor-session-init: buildSessionResponse', () => {
  it('returns additional_context containing TDD keywords', () => {
    const result = buildSessionResponse({});

    expect(result.response.additional_context).toContain('TDD');
    expect(result.response.additional_context).toContain('tdd-test-writer');
  });

  it('returns env as an empty object', () => {
    const result = buildSessionResponse({});

    expect(result.response.env).toEqual({});
  });

  it('returns state with activeSubagent set to "main"', () => {
    const result = buildSessionResponse({});

    expect(result.state.activeSubagent).toBe('main');
  });

  it('uses session_id as state.sessionId when provided', () => {
    const result = buildSessionResponse({ session_id: 'test-session-123' });

    expect(result.state.sessionId).toBe('test-session-123');
  });

  it('falls back to conversation_id as state.sessionId when session_id is absent', () => {
    const result = buildSessionResponse({ conversation_id: 'conv-456' });

    expect(result.state.sessionId).toBe('conv-456');
  });

  it('sets state.lastUpdated to a valid ISO timestamp', () => {
    const before = new Date().toISOString();
    const result = buildSessionResponse({});
    const after = new Date().toISOString();

    expect(result.state.lastUpdated).toBeDefined();
    expect(new Date(result.state.lastUpdated).toISOString()).toBe(result.state.lastUpdated);
    expect(result.state.lastUpdated >= before).toBe(true);
    expect(result.state.lastUpdated <= after).toBe(true);
  });
});
