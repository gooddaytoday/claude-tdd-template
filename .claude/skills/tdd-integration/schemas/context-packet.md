# Context Packet Schema

Standard input context assembled once in Pre-Phase and passed to every subsequent phase without modification (except `accumulated_files` and `phase_history`, updated by the orchestrator between phases).

## Purpose

Eliminates context drift between phases. Every subagent receives the same authoritative context instead of free-form retelling.

## Structure

```
## Context Packet

### Task
- Task ID: [parent task ID]
- Subtask ID: [current subtask ID, or "none" if top-level task]
- Parent title: [parent task title]
- Parent description: [parent task description]
- Parent testStrategy: [parent testStrategy field, or "none"]

### Feature
- Description: [feature description from user request]
- Test type: unit | integration | both
- Type source: directive | task-master | heuristics | user
- Scope restriction: Work ONLY on subtask [ID]. Do NOT implement other subtasks.

### Accumulated State (updated by orchestrator between phases)
- Changed files:
  - RED: [list or "pending"]
  - GREEN: [list or "pending"]
  - REFACTOR: [list or "pending"]
  - CODE_REVIEW: [list or "pending"]
  - ARCH_REVIEW: [list or "pending"]
  - DOCS: [list or "pending"]
- Phase history:
  - RED: [status] (orchestrator-verified: [yes/no])
  - GREEN: [status] (orchestrator-verified: [yes/no])
  - REFACTOR: [status] (orchestrator-verified: [yes/no])
  - CODE_REVIEW: [status]
  - ARCH_REVIEW: [status]
  - DOCS: [status]
- Test command: [exact command, set after RED phase]
- Test file: [path, set after RED phase]
- TestIntent: [from RED Phase Packet, forwarded to GREEN]
```

## Assembly Rules

1. **Pre-Phase** assembles the Context Packet from:
   - User request (feature description)
   - Task-master MCP (task/subtask context)
   - Test type detection result (from `.claude/utils/detect-test-type.md` algorithm)

2. **Orchestrator updates** between phases:
   - `Changed files` — append files from the completed phase's Phase Packet
   - `Phase history` — record status and orchestrator verification result
   - `Test command` / `Test file` — set after RED phase, carried forward
   - `TestIntent` — set after RED phase, forwarded to GREEN phase

3. **Subagents** receive the Context Packet as-is. They MUST NOT modify it — they return a Phase Packet with their results.

## Context Packet in Phase Delegation

When delegating to a subagent, include the Context Packet as a clearly delineated block:

```
Task: [subagent name]
Prompt: [phase-specific prompt]

--- Context Packet ---
[full Context Packet content]
--- End Context Packet ---

[additional phase-specific instructions]
```

## Parent Task Context Usage

Parent task context (title, description, testStrategy) serves ONLY as background:
- Use it to understand the broader goal and architecture
- Use it to ensure subtask aligns with parent task's vision
- DO NOT implement other subtasks mentioned in parent task
- DO NOT expand scope beyond current subtask
