# Pre-Phase: Determine Test Type and Build Context Packet

Execute before RED phase. Assembles the Context Packet that all subsequent phases receive.

## Step 1: Get Current Task

```bash
# If --task=<id> provided, use that ID
task-master next   # or: task-master show <id>
```

## Step 2: Detect Subtask and Get Parent Task (MANDATORY)

If the current task ID contains a dot (e.g., "5.2"), this is a **subtask**:
- Extract parent ID from the current ID (e.g., "5" from "5.2")
- Retrieve parent task using: `task-master show <parentId>`
- Store parent task context (title, description, details, testStrategy) for Context Packet

## Step 3: Determine Test Type

**Priority Chain (use first match):**

1. **Explicit argument**: If `--test-type=unit|integration|both` provided, use it
2. **Task-master context**: Get current task and parse `testStrategy` field
   - Check both current task AND parent task (if subtask) for `testStrategy`
   - Prefer current subtask's testStrategy if available
3. **Keyword heuristics**: Analyze feature description for indicators (see `.claude/utils/detect-test-type.md`)
4. **Default**: If unclear, prefer `unit` for isolated logic, `integration` for I/O

**Parse `testStrategy` field:**
- Contains "Unit test" -> `test_type = unit`
- Contains "Integration test" -> `test_type = integration`
- Contains both -> `test_type = both` (write unit first, then integration)
- Unclear -> apply keyword heuristics

**Keyword Heuristics (when testStrategy is ambiguous):**

| Indicators -> Integration | Indicators -> Unit |
|--------------------------|-------------------|
| database, MongoDB, mongoose | util, helper, pure function |
| API, endpoint, handler | parser, validator, formatter |
| external service, HTTP | config, settings, constants |
| queue, worker, job | calculate, transform, convert |
| connection, client | type, interface, schema |

## Step 4: Assemble Context Packet

Build the Context Packet per schema defined in `schemas/context-packet.md`:

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
- Test type: [unit | integration | both]
- Type source: [directive | task-master | heuristics | user]
- Scope restriction: Work ONLY on subtask [ID]. Do NOT implement other subtasks.

### Accumulated State
- Changed files: (all pending)
- Phase history: (all pending)
- Test command: (pending — set after RED)
- Test file: (pending — set after RED)
- TestIntent: (pending — set after RED)
```

## Output

Pass `Context Packet` and `test_type` to RED phase delegation.

## Failure Playbook

| Problem | Action |
|---|---|
| Task-master unreachable | Proceed without parent context. Note in Context Packet: "Parent context unavailable." |
| Test type ambiguous (equal heuristic scores) | Ask user via AskUserQuestion (see `.claude/utils/detect-test-type.md`) |
| No task ID available | Use feature description only. Set Task ID and Parent ID to "none". |
