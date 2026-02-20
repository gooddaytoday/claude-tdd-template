# Phase 3: REFACTOR — Improve Quality

Invoke `tdd-refactorer` subagent. Gate: tests MUST remain green (orchestrator-verified).

## Delegation

```
Task: tdd-refactorer
Prompt: Evaluate and refactor implementation for: [test file path]
Test command: [exact command from RED phase]
Implementation files: [list from GREEN phase Changed files]

--- Context Packet ---
[full Context Packet with RED + GREEN results]
--- End Context Packet ---
```

## Expected Phase Packet

Per `schemas/phase-packet.md`, REFACTOR phase output includes:
- `Status`: passed
- `Changed files`: list of refactored files, or "none"
- `Refactorings Applied`: what was improved and why
- `Preserved Invariants`: SPECIFIC list of unchanged public APIs (not generic phrases)
- `Test Verification Excerpt`: 5-15 lines of passing test output

## Orchestrator Verification (MANDATORY)

```
Run: [Test command from Phase Packet]
Expect: zero exit code (tests must still pass)
If non-zero exit code: reject refactoring — request rollback from tdd-refactorer
Record: VerifiedTestStatus=passed, VerifiedBy=orchestrator
```

## Context Packet Update

After successful REFACTOR verification:
- Record: `REFACTOR: passed (orchestrator-verified: yes)`
- Append changed files to `Changed files -> REFACTOR` (or record "none")

## Failure Playbook

| Problem | Action |
|---|---|
| Tests fail after refactoring | Return to tdd-refactorer: "Tests fail after refactoring. Revert all changes and return Phase Packet with status=passed and Changed files=none." |
| Refactorer modifies test files | Guard will block automatically. If somehow bypassed, reject and re-invoke. |
| Refactorer adds new behavior | This is a violation. Return: "Refactoring must not change behavior. Revert additions and only restructure existing code." |
