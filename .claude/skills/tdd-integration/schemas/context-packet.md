# Context Packet Schema

Standard input context assembled once in Pre-Phase and passed to every subsequent phase without modification (except `Accumulated State`, `Behavior Plan` status, and `phase_history`, updated by the orchestrator between phases/iterations).

## Purpose

Eliminates context drift between phases. Every subagent receives the same authoritative context instead of free-form retelling.

## Structure

```
## Context Packet

### Task
- Task ID: [current task ID]
- Parent ID: [parent task ID, or "none"]
- Parent title: [parent task title, or "none"]
- Parent description: [parent task description, or "none"]
- Parent testStrategy: [parent testStrategy field, or "none"]

### Feature
- Description: [feature description from user request]
- Test type: unit | integration | both
- Type source: directive | task-master | heuristics | user
- Scope restriction: Work ONLY on subtask [ID]. Do NOT implement other subtasks.

### Slicing Mode
- Mode: vertical | horizontal
- Source: argument | default

### Behavior Plan (vertical slicing only, populated in PLAN phase)
- Total behaviors: [N]
- Current behavior: [i of N]
- Behaviors:
  1. [tracer] [description] — status: [pending | red | green]
  2. [description] — status: [pending | red | green]
  ...

### Accumulated State (updated by orchestrator between phases/iterations)
- Changed files:
  - RED[1]: [list or "pending"]
  - GREEN[1]: [list or "pending"]
  - RED[2]: [list or "pending"]
  - GREEN[2]: [list or "pending"]
  - ...
  - REFACTOR: [list or "pending"]
  - CODE_REVIEW: [list or "pending"]
  - ARCH_REVIEW: [list or "pending"]
  - DOCS: [list or "pending"]
- Phase history:
  - RED[1]: [status] (orchestrator-verified: [yes/no])
  - GREEN[1]: [status] (orchestrator-verified: [yes/no])
  - RED[2]: [status] (orchestrator-verified: [yes/no])
  - GREEN[2]: [status] (orchestrator-verified: [yes/no])
  - ...
  - REFACTOR: [status] (orchestrator-verified: [yes/no])
  - CODE_REVIEW: [status]
  - ARCH_REVIEW: [status]
  - DOCS: [status]
- Test command: [exact command, set after RED phase — updated per iteration in vertical mode]
- Test file: [path, set after RED phase]
- TestIntent: [from latest RED Phase Packet, forwarded to corresponding GREEN]
```

### Horizontal Mode Simplified Structure

When `Mode = horizontal`, the Behavior Plan section is omitted and Accumulated State uses flat keys:

```
### Accumulated State
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
```

## Assembly Rules

1. **Pre-Phase** assembles the Context Packet from:
   - User request (feature description)
   - Task-master MCP (task/subtask context)
   - Test type detection result (from `.claude/utils/detect-test-type.md` algorithm)
   - Slicing mode (from argument or default)

2. **PLAN phase** (vertical only) populates the Behavior Plan with behaviors and sets `Current behavior: 1 of N`.

3. **Orchestrator updates** between phases/iterations:
   - `Changed files` — append files from the completed phase's Phase Packet (keyed by `RED[i]`/`GREEN[i]` in vertical, `RED`/`GREEN` in horizontal)
   - `Phase history` — record status and orchestrator verification result per iteration
   - `Test command` / `Test file` — set after each RED iteration, carried to corresponding GREEN
   - `TestIntent` — set after each RED iteration, forwarded to corresponding GREEN
   - `Current behavior` — incremented after successful GREEN[i] (vertical only)
   - `Behavior status` — updated to `red` after RED[i], `green` after GREEN[i]

4. **Subagents** receive the Context Packet as-is. They MUST NOT modify it — they return a Phase Packet with their results.

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
