# Phase 1: RED — Write Failing Test

Invoke `tdd-test-writer` subagent. Gate: test MUST fail with assertion error (not syntax/import error).

## Delegation

```
Task: tdd-test-writer
Prompt: Write failing tests for: [feature description]
Expected behavior: [what should happen]
Test type: unit | integration | both
Source: [argument | task-master | heuristics]

--- Context Packet ---
[full Context Packet from Pre-Phase]
--- End Context Packet ---
```

## Expected Phase Packet

Per `schemas/phase-packet.md`, RED phase output includes:
- `AgentTaskStatus`: completed | failed
- `TestRunStatus`: failed (MUST be "failed")
- `TestIntent`: Summary, Given/When/Then, Contract surface, Non-goals, Edge cases
- `Test command`: exact command to reproduce failure
- `Failure Excerpt`: 5-15 lines of assertion error output

## Orchestrator Verification (MANDATORY)

```
Run: [Test command from Phase Packet]
Expect: non-zero exit code (test must fail)
Expect: output contains assertion/expectation error (NOT import/syntax/module-not-found error)
If exit code is 0: do NOT proceed to GREEN — test is not actually failing
If error is import/syntax: do NOT proceed — test is broken, return to tdd-test-writer
```

## Context Packet Update

After successful RED verification:
- Set `Test command` in Context Packet
- Set `Test file` in Context Packet
- Set `TestIntent` from Phase Packet
- Record: `RED: failed (orchestrator-verified: yes)`
- Append changed files to `Changed files -> RED`

## Both Test Types

If `test_type = both`, run RED phase twice:
1. First for unit tests
2. Then for integration tests

Each invocation gets the same Context Packet.

## Failure Playbook

| Problem | Action |
|---|---|
| Test passes instead of failing | Return to tdd-test-writer: "Test does not fail. Ensure assertions test behavior that is NOT yet implemented." |
| Import/syntax error instead of assertion error | Return to tdd-test-writer: "Test has import/syntax error: [error]. Fix the test so failure is a meaningful assertion error." |
| tdd-test-writer returns AgentTaskStatus=failed | Examine error. If recoverable, re-invoke with clarification. If not, escalate to user. |
| Existing tests break | Return to tdd-test-writer: "New test file broke existing tests. Ensure test is isolated and does not affect other test files." |
