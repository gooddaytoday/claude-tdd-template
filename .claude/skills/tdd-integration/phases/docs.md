# Phase 6: DOCUMENTATION — Save Implementation Details

Invoke `tdd-documenter` subagent. Gate: documentation saved before proceeding to next subtask.

## Delegation

```
Task: tdd-documenter
Prompt: Document implementation for current subtask.

Task context:
- Task: [current Task ID]
- Parent: [Parent ID, or "none"]
  - Title: [parent title, or "none"]
  - Description: [parent description, or "none"]
  - Details: [parent details, or "none"]
Modified files: [combined list from ALL phases]
Is last subtask: [yes/no]

--- Context Packet ---
[full Context Packet with all phase results]
--- End Context Packet ---
```

## Expected Phase Packet

Per `schemas/phase-packet.md`, DOCUMENTATION phase output includes:
- `Status`: passed
- `Modules affected`: count and list
- `Last subtask`: yes/no
- `Task-Master Update`: confirmation of save
- `Module Documentation`: created/updated CLAUDE.md files (last subtask only)
- `Root Documentation`: updated links in root CLAUDE.md (last subtask only)

## Context Packet Update

After DOCS completes:
- Record: `DOCS: passed`
- Cycle is DONE.

## Failure Playbook

| Problem | Action |
|---|---|
| Task-master update fails | Re-invoke once. If persistent, log warning and proceed (documentation is non-blocking for cycle completion, but report in summary). |
| CLAUDE.md write fails | Log warning in cycle summary. Non-blocking. |
| Module detection ambiguous | Documenter uses first directory alphabetically. Acceptable behavior. |
