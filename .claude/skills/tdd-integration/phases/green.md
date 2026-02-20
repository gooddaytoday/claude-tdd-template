# Phase 2: GREEN — Make It Pass

Invoke `tdd-implementer` subagent. Gate: test MUST pass (orchestrator-verified).

## Delegation

```
Task: tdd-implementer
Prompt: Implement minimal code to pass tests in: [test file path]
Test command: [exact command from RED phase]
Feature context: [what we're building]

TestIntent:
  Summary: [from RED Phase Packet]
  Contract surface: [expected exports — implement exactly these]
  Non-goals: [do NOT implement these]

--- Context Packet ---
[full Context Packet with RED results]
--- End Context Packet ---
```

## Expected Phase Packet

Per `schemas/phase-packet.md`, GREEN phase output includes:
- `Status`: passed | needs-diagnosis
- `Changed files`: list of implementation files
- `Diff inventory`: new exports, modified exports, internal-only changes
- `Success Excerpt`: 5-15 lines of passing test output

## Orchestrator Verification (MANDATORY)

```
Run: [Test command from Phase Packet]
Expect: zero exit code (test must pass)
Expect: test name appears in passing output
If non-zero exit code: do NOT proceed to REFACTOR — return to tdd-implementer
Record: VerifiedTestStatus=passed, VerifiedBy=orchestrator
```

## Context Packet Update

After successful GREEN verification:
- Record: `GREEN: passed (orchestrator-verified: yes)`
- Append changed files to `Changed files -> GREEN`

## Failure Playbook

| Problem | Action |
|---|---|
| Test still fails after implementation | Return to tdd-implementer with failure output. Max 3 retries before escalating. |
| Status: needs-diagnosis | Read diagnostic summary. If root cause is clear, provide clarification and re-invoke. If unclear, escalate to user with diagnostic. |
| Implementation modifies test files | Guard will block this automatically. If somehow bypassed, reject and re-invoke. |
| TypeScript compilation errors | Return to tdd-implementer: "Fix TypeScript errors: [errors]. Run `npx tsc --noEmit` to verify." |
