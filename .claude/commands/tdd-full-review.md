---
name: tdd-full-review
description: Trigger Full Task Review for the last subtask — architecture review across all subtasks + final documentation
---

# TDD Full Review Command

Trigger a Full Task Review cycle for the **last subtask** of a parent task. This runs the ARCHITECTURE REVIEW phase with Full Task Review enabled, followed by DOCUMENTATION.

## Usage

```
/tdd-full-review --task=<subtask-id>
```

## When to Use

- You are working on the **last subtask** (highest ID in parent.subtasks array, format X.Y)
- All previous subtasks are complete (status: done)
- You want to verify full integration across ALL subtasks before closing the parent task

## What This Command Does

1. **Retrieves parent task context** from task-master (parent + all subtasks)
2. **Gathers files from ALL completed subtasks** by parsing the `details` payload.
   - Expected shape: `details.modifiedFiles: Array<{file: string, phase?: string, subtaskId?: string}>` (where `file` is required).
   - Validates presence and structure of `details.modifiedFiles`.
   - Emits a warning and falls back to grep-based file discovery or git diff if missing/malformed.
3. **Invokes `tdd-architect-reviewer`** with:
   - `Last subtask: yes`
   - Full list of files from all subtasks
   - Full Task Review algorithm (see `forms/architect-full-task-review.md`)
4. **Builds integration matrix**: Component -> Type -> Used By -> Status
5. **Creates integration subtask** if any component is ORPHANED
6. **Invokes `tdd-documenter`** for final documentation:
   - Creates/updates module `CLAUDE.md` files for all affected modules
   - Updates root `CLAUDE.md` with module links

## Implementation

This command invokes `Skill(tdd-integration)` with the last-subtask context:

```
Use Skill(tdd-integration)

Context:
- Task: [parent task ID from --task argument, extract parent from X.Y format]
- Subtask: [the --task argument itself]
- Last subtask: yes
- Skip RED/GREEN/REFACTOR/CODE_REVIEW phases
- Run ARCHITECTURE REVIEW (Full Task Review mode) → DOCUMENTATION only

Instructions:
1. Read phases/arch-review.md for delegation details
2. Set "Last subtask: yes" in delegation to tdd-architect-reviewer
3. Architect will follow forms/architect-full-task-review.md algorithm
4. After ARCH REVIEW completes, run DOCUMENTATION phase per phases/docs.md
5. Report cycle summary with Full Task Review results
```

## Output

```
## Full Task Review Summary

**Parent Task**: [ID] - [Title]
**Subtask**: [ID] (last)
**Subtasks analyzed**: [N]
**Files reviewed**: [N] across [M] subtasks

### Integration Matrix
| Component | Type | Used By | Status |
|-----------|------|---------|--------|
| [name] | Service | [handler] | INTEGRATED |
| [name] | Utility | nowhere | ORPHANED |

### Architecture Verdict
- Structure: [passed/issues]
- Integration: [all connected / N orphaned]
- Integration subtask: [created X.Y / not needed]

### Documentation
- Module CLAUDE.md: [created/updated for N modules]
- Root CLAUDE.md: [N links added/verified]
```

## Related

- Full review algorithm: `.claude/skills/tdd-integration/forms/architect-full-task-review.md`
- Architecture phase: `.claude/skills/tdd-integration/phases/arch-review.md`
- Documentation phase: `.claude/skills/tdd-integration/phases/docs.md`
