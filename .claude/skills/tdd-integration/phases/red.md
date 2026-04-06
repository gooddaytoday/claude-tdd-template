# Phase 1: RED — Write Failing Test

Invoke `tdd-test-writer` subagent. Gate: test MUST fail with assertion error (not syntax/import error).

In vertical slicing mode, this phase runs once per behavior from the Behavior Plan. In horizontal mode, it runs once for all behaviors.

## Delegation

### Vertical Slicing (per-behavior)

```
Task: tdd-test-writer
Prompt: Write ONE failing test for behavior [i of N]: [behavior description]
Expected behavior: [what this specific behavior should do]
Test type: unit | integration | both
Source: [argument | task-master | heuristics]
Existing test file: [path to test file from previous iterations, or "none"]
Previous behaviors implemented: [list of completed behaviors with status]

--- Context Packet ---
[full Context Packet with Behavior Plan and iteration state]
--- End Context Packet ---
```

### Horizontal Slicing

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
- `Behavior`: [i of N] (vertical slicing only)

## Orchestrator Verification (MANDATORY)

```
Run: [Test command from Phase Packet]
Expect: non-zero exit code (test must fail)
Expect: output contains assertion/expectation error (NOT import/syntax/module-not-found error)
If exit code is 0: do NOT proceed to GREEN — test is not actually failing
If error is import/syntax: do NOT proceed — test is broken, return to tdd-test-writer
```

### Vertical slicing additional check

After RED[i] where i > 1: also verify that previously passing tests (behaviors 1..i-1) still pass. The new test must not break existing tests.

## Context Packet Update

After successful RED verification:
- Set `Test command` in Context Packet
- Set `Test file` in Context Packet
- Set `TestIntent` from Phase Packet
- Record: `RED[i]: failed (orchestrator-verified: yes)` (or `RED: failed` for horizontal)
- Append changed files to `Changed files -> RED[i]`
- Update Behavior Plan: behavior i status → `red`

## Both Test Types

If `test_type = both`, run RED phase twice:
1. First for unit tests
2. Then for integration tests

Each invocation gets the same Context Packet.

In vertical slicing mode, `both` applies per behavior: each behavior gets unit RED→GREEN, then integration RED→GREEN.

## Failure Playbook

| Problem | Action |
|---|---|
| Test passes instead of failing | Return to tdd-test-writer: "Test does not fail. Ensure assertions test behavior that is NOT yet implemented." |
| Import/syntax error instead of assertion error | Return to tdd-test-writer: "Test has import/syntax error: [error]. Fix the test so failure is a meaningful assertion error." |
| tdd-test-writer returns AgentTaskStatus=failed | Examine error. If recoverable, re-invoke with clarification. If not, escalate to user. |
| Existing tests break | Return to tdd-test-writer: "New test broke existing tests. Ensure test is isolated and does not affect previously implemented behaviors." |
| Test duplicates existing behavior | Return to tdd-test-writer: "This behavior is already tested. Write a test for the NEW behavior: [description]." |
