# Phase 4: CODE REVIEW — Verify Quality

Invoke `tdd-code-reviewer` subagent. Gate: no critical/major issues (Status != needs-fix).

## Delegation

```
Task: tdd-code-reviewer
Prompt: Review code quality for files modified in current subtask.
Test file: [test file path]
Modified files: [combined list from RED+GREEN+REFACTOR Changed files]
Test command: [exact command]
Upstream phases:
- RED: TestRunStatus=failed (orchestrator-verified)
- GREEN: VerifiedTestStatus=passed (orchestrator-verified)
- REFACTOR: VerifiedTestStatus=passed (orchestrator-verified)

--- Context Packet ---
[full Context Packet with RED + GREEN + REFACTOR results]
--- End Context Packet ---
```

## Expected Phase Packet

Per `schemas/phase-packet.md`, CODE_REVIEW phase output includes:
- `Status`: passed | needs-fix
- `Files reviewed`: N
- `Issues Found`: Critical: N | Major: N | Minor: N
- `FixRequest`: none | structured FixRequest items (see `schemas/phase-packet.md`)
- `Minor Issues`: non-blocking observations

## Fix-Routing Logic (orchestrator executes if Status = needs-fix)

```
Adaptive cycle limit:
- Base limit: 3 cycles (safe default)
- If critical severity and no progress after 2 cycles: escalate immediately to user
- If FixRequest count decreases each cycle (clear progress): allow up to 5 cycles
- If same FixRequest returns unchanged for 2 consecutive cycles: escalate (misroute)
- If tests break after a fix: rollback + escalate (stability > completion)

Routing steps:
1. Parse FixRequest[] from code-reviewer output
2. Sort by: severity DESC, then dependsOn (dependencies first)
3. Group by routeTo:
   - "implementer" items -> invoke tdd-implementer with fix instructions
   - "refactorer" items -> invoke tdd-refactorer with fix instructions
   - Items with dependsOn: execute dependency first, then dependent
4. ORCHESTRATOR: run test command after each fix subagent completes
   - If tests fail: count as failed attempt, do NOT proceed to reviewer
   - If tests pass: re-invoke tdd-code-reviewer with same file list
5. Repeat until Status = passed (or cycle limit -> escalate to user)
```

### Fix Delegation Template

```
Task: tdd-implementer | tdd-refactorer
Prompt: Fix issues identified by code reviewer:
[FixRequest details: file, location, description, proposedFix, confidence, rationale]
Verification: run [verificationCommand] after fix
Keep all existing tests passing.

--- Context Packet ---
[Context Packet — unchanged]
--- End Context Packet ---
```

## Context Packet Update

After CODE_REVIEW passes:
- Record: `CODE_REVIEW: passed`
- Append any fix-changed files to `Changed files -> CODE_REVIEW`

## Failure Playbook

| Problem | Action |
|---|---|
| Reviewer returns error (no file list) | Re-invoke with explicit file list from Context Packet accumulated files. |
| Cycle limit exceeded | Escalate to user with summary: "Code review found [N] issues after [M] fix cycles. Remaining issues: [list]. Please resolve manually or adjust requirements." |
| Fix breaks tests | Rollback fix. Count as failed attempt toward cycle limit. |
| All issues are minor | Status should be "passed" (minor issues don't block). Proceed to ARCH REVIEW. |
