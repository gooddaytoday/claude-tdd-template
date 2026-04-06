# Phase 2: GREEN — Make It Pass

Invoke `tdd-implementer` subagent. Gate: test MUST pass (orchestrator-verified).

In vertical slicing mode, this phase runs once per behavior. The implementer writes **only** the minimal code for the current behavior, without anticipating future behaviors.

## Delegation

### Vertical Slicing (per-behavior)

```
Task: tdd-implementer
Prompt: Implement minimal code to pass the test for behavior [i of N]: [behavior description]
Test command: [exact command from RED phase]
Feature context: [what we're building]

Do NOT implement behaviors not yet tested. Only behavior [i]: "[description]"

TestIntent:
  Summary: [from RED Phase Packet]
  Contract surface: [expected exports — implement exactly these]
  Non-goals: [do NOT implement these, including future behaviors]

Previous implementations: [list of files changed in GREEN[1..i-1]]

--- Context Packet ---
[full Context Packet with RED[i] results and previous iteration state]
--- End Context Packet ---
```

### Horizontal Slicing

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
- `Behavior`: [i of N] (vertical slicing only)

## Orchestrator Verification (MANDATORY)

### Vertical slicing: verify ALL tests

```
Run: [Test command that covers ALL behaviors implemented so far (1..i)]
Expect: zero exit code (ALL tests must pass — current + all previous)
Expect: test names for ALL behaviors appear in passing output
If non-zero exit code:
  - If current behavior's test fails: return to tdd-implementer
  - If a PREVIOUS behavior's test fails: return to tdd-implementer with note about regression
Record: VerifiedTestStatus=passed, VerifiedBy=orchestrator
```

### Horizontal slicing: verify current tests

```
Run: [Test command from Phase Packet]
Expect: zero exit code (test must pass)
Expect: test name appears in passing output
If non-zero exit code: do NOT proceed to REFACTOR — return to tdd-implementer
Record: VerifiedTestStatus=passed, VerifiedBy=orchestrator
```

## Context Packet Update

After successful GREEN verification:
- Record: `GREEN[i]: passed (orchestrator-verified: yes)` (or `GREEN: passed` for horizontal)
- Append changed files to `Changed files -> GREEN[i]`
- Update Behavior Plan: behavior i status → `green`
- If more behaviors remain (i < N): proceed to RED[i+1]
- If all behaviors done (i = N): proceed to REFACTOR

## Failure Playbook

| Problem | Action |
|---|---|
| Test still fails after implementation | Return to tdd-implementer with failure output. Max 3 retries before escalating. |
| Previous behavior's test regressed | Return to tdd-implementer: "Implementation for behavior [i] broke behavior [j]. Fix without modifying tests." |
| Status: needs-diagnosis | Read diagnostic summary. If root cause is clear, provide clarification and re-invoke. If unclear, escalate to user with diagnostic. |
| Implementation modifies test files | Guard will block this automatically. If somehow bypassed, reject and re-invoke. |
| TypeScript compilation errors | Return to tdd-implementer: "Fix TypeScript errors: [errors]. Run `npx tsc --noEmit` to verify." |
| Over-implementation (future behaviors) | Return to tdd-implementer: "Only implement behavior [i]. Remove code for untested behaviors." |
