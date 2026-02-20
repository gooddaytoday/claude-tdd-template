# Phase 5: ARCHITECTURE REVIEW — Ensure Integration

Invoke `tdd-architect-reviewer` subagent. Gate: code integrates with project (Status != needs-fix).

## Delegation

```
Task: tdd-architect-reviewer
Prompt: Review architecture and integration for current subtask.

Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
  - Title: [parent title]
  - Description: [parent description]
  - Details: [parent details]
  - testStrategy: [parent testStrategy]
  - Subtasks: [FULL list of ALL subtasks with IDs, titles, statuses, and details fields]
Modified files (all phases): [combined Changed files from RED, GREEN, REFACTOR, CODE REVIEW]
Last subtask: [yes/no]
Upstream phases:
- RED: TestRunStatus=failed (orchestrator-verified)
- GREEN: VerifiedTestStatus=passed (orchestrator-verified)
- REFACTOR: VerifiedTestStatus=passed (orchestrator-verified)
- CODE_REVIEW: Status=passed

--- Context Packet ---
[full Context Packet with all previous results]
--- End Context Packet ---

NOTE: If this is the LAST subtask (highest ID in parent.subtasks array),
      perform FULL TASK REVIEW per .claude/skills/tdd-integration/forms/architect-full-task-review.md
```

## Expected Phase Packet

Per `schemas/phase-packet.md`, ARCHITECTURE phase output includes:
- `Status`: passed | needs-fix | integration-subtask-created
- `IntegrationVerdict`: structure compliance, integration status, Full Task Review status
- `FixRequest`: none | structured FixRequest items
- `Integration Subtask`: ID and details (if created)

## Fix-Routing Logic (orchestrator executes if Status = needs-fix)

```
Adaptive cycle limit (same rules as CODE REVIEW):
1. Parse FixRequest[] from architect-reviewer output
2. Sort by severity DESC, then dependsOn (dependencies first)
3. All architecture FixRequests route to implementer (moving files, adding imports)
4. Invoke tdd-implementer with fix instructions
5. ORCHESTRATOR: run tests to confirm green
6. Re-invoke tdd-architect-reviewer
7. Repeat until Status = passed or integration-subtask-created
   (max per adaptive limit; if exceeded: create integration-subtask
   via task-master and escalate to user)
```

## Integration Subtask Created

If `Status: integration-subtask-created`:
- Architecture phase is COMPLETE — integration is deferred to next TDD cycle
- Proceed to DOCUMENTATION phase
- Report integration subtask ID in cycle summary

## Context Packet Update

After ARCH_REVIEW completes:
- Record: `ARCH_REVIEW: [status]`
- Append any fix-changed files to `Changed files -> ARCH_REVIEW`

## Failure Playbook

| Problem | Action |
|---|---|
| Reviewer can't reach task-master | Re-invoke. If persistent, proceed with file-based analysis only and note in output. |
| Cycle limit exceeded | Create integration subtask for remaining issues. Set status to integration-subtask-created. |
| Orphaned code detected on last subtask | Architect creates integration subtask automatically. This is expected behavior. |
| Process violations noted | Log in cycle summary but do NOT block. Violations are informational. |
