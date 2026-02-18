---
name: tdd-integration
description: Enforce Test-Driven Development with strict Red-Green-Refactor-Review cycle. Auto-triggers on "implement", "add feature", "build", "create functionality". Includes code review and architecture review phases. Does NOT trigger for bug fixes, docs, or config.
---

# TDD Integration Skill

Enforce strict Test-Driven Development using Red-Green-Refactor-Review cycle with dedicated subagents.

## Arguments (Optional)

- `--test-type=unit` — Force unit tests only
- `--test-type=integration` — Force integration tests only
- `--test-type=both` — Write both unit and integration tests
- `--task=<id>` — Use specific task-master task ID for context

Examples:
```
/tdd-integration implement user validation --test-type=unit
/tdd-integration add payment processing --test-type=integration
/tdd-integration create config loader --task=2.4
```

## When to Trigger

**ACTIVATE for:**
- "implement [feature]"
- "add [functionality]"
- "create [new feature]"
- "build [capability]"
- "develop [feature]"
- Any new feature development

**DO NOT ACTIVATE for:**
- Bug fixes (use direct implementation)
- Documentation updates
- Configuration changes
- Refactoring existing code (outside TDD cycle)
- Test-only changes

## Safety Mechanisms

**TDD Guard Hook** (`.claude/hooks/prevent-test-edit.ts`):
- **State Management**:
  - `PreToolUse:Task` → Records which subagent is invoked
  - `SubagentStop` → Resets state to `'main'` when subagent completes
  - State stored in `.claude/.guard-state.json` (runtime only, not in git)
- **Enforcement**:
  - `PreToolUse:Write|Edit` → Blocks `tests/**` modifications if subagent is NOT `tdd-test-writer`
- **Phase Rules**:
  - GREEN phase (implementer): Cannot touch tests → automatic rejection
  - REFACTOR phase (refactorer): Cannot touch tests → automatic rejection
  - RED phase (test-writer): Can freely modify tests
  - Main agent (after subagent completes): Can modify tests

If a subagent receives a "TDD Guard" permission denial, the test edit is impossible—there is no way around it.

## Mandatory 6-Phase Workflow

EVERY feature MUST follow this cycle. Do NOT skip phases.

### Pre-Phase: Determine Test Type and Get Parent Task Context

Before starting RED phase, determine the appropriate test type AND obtain parent task context if working with a subtask:

**Step 1: Get Current Task**

```bash
# Get current task (if --task=<id> provided, use that ID)
task-master next   # or: task-master show <id>
```

**Step 2: Detect Subtask and Get Parent Task (MANDATORY)**

If the current task ID contains a dot (e.g., "5.2"), this is a **subtask**:
- Extract parent ID from the current ID (e.g., "5" from "5.2")
- Retrieve parent task using: `task-master show <parentId>`
- Store parent task context (title, description, details, testStrategy) for use in ALL phases

**CRITICAL: Parent Task Context Usage Rule**

Parent task context serves ONLY as background information:
- ✅ Use it to understand the broader goal and architecture
- ✅ Use it to ensure your subtask aligns with parent task's vision
- ❌ DO NOT implement other subtasks mentioned in parent task
- ❌ DO NOT expand scope beyond current subtask

**Step 3: Determine Test Type**

**Priority Chain (use first match):**

1. **Explicit argument**: If `--test-type=unit|integration|both` provided, use it
2. **Task-master context**: Get current task and parse `testStrategy` field
   - Check both current task AND parent task (if subtask) for `testStrategy`
   - Prefer current subtask's testStrategy if available
3. **Keyword heuristics**: Analyze feature description for indicators
4. **Default**: If unclear, prefer `unit` for isolated logic, `integration` for I/O

**Parse `testStrategy` field:**
- Contains "Unit test" → `test_type = unit`
- Contains "Integration test" → `test_type = integration`
- Contains both → `test_type = both` (write unit first, then integration)
- Unclear → apply keyword heuristics

**Keyword Heuristics (when testStrategy is ambiguous):**

| Indicators → Integration | Indicators → Unit |
|--------------------------|-------------------|
| database, MongoDB, mongoose | util, helper, pure function |
| API, endpoint, handler | parser, validator, formatter |
| external service, HTTP | config, settings, constants |
| queue, worker, job | calculate, transform, convert |
| connection, client | type, interface, schema |

**Output**: Pass `test_type` to RED phase delegation.

### Phase 1: RED - Write Failing Test

Invoke `tdd-test-writer` subagent with:
- Feature requirement from user request
- Expected behavior to test
- **Test type from Pre-Phase** (required)
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Green until test failure confirmed.

**Phase Packet to include in delegation:**
```
Task: tdd-test-writer
Prompt: Write failing tests for: [feature description]
Expected behavior: [what should happen]
Test type: unit | integration | both
Source: [argument | task-master | heuristics]
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
  - Title: [parent title]
  - Description: [parent description]
  - Strategy: [parent testStrategy]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

**Expected output from tdd-test-writer (Phase Packet):**
```
Phase: RED
Status: passed | failed (must be "passed" = test confirmed failing)
Test file: [path]
Test command: [exact command]
Changed files: [test files written]
Notes: [any observations]
```

**Note**: If `test_type = both`, run RED phase twice:
1. First for unit tests
2. Then for integration tests

### Phase 2: GREEN - Make It Pass

Invoke `tdd-implementer` subagent with:
- Test file path and test command from RED Phase Packet
- Feature requirement context
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Refactor until test passes.

**Phase Packet to include in delegation:**
```
Task: tdd-implementer
Prompt: Implement minimal code to pass tests in: [test file path]
Test command: [exact command from RED phase]
Feature context: [what we're building]
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

**Expected output from tdd-implementer (Phase Packet):**
```
Phase: GREEN
Status: passed
Test file: [path]
Test command: [command]
Changed files: [list of implementation files]
Diff inventory: [which exports/APIs changed]
Notes: [any observations]
```

### Phase 3: REFACTOR - Improve

Invoke `tdd-refactorer` subagent with:
- Test file path and test command from RED Phase Packet
- Implementation files from GREEN Phase Packet `Changed files`
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Code Review until refactoring complete and tests green.

**Phase Packet to include in delegation:**
```
Task: tdd-refactorer
Prompt: Evaluate and refactor implementation for: [test file path]
Test command: [exact command from RED phase]
Implementation files: [list from GREEN phase Changed files]
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

**Expected output from tdd-refactorer (Phase Packet):**
```
Phase: REFACTOR
Status: passed
Test file: [path]
Test command: [command]
Changed files: [list of refactored files, or "none"]
Preserved invariants: [list of architectural invariants not touched]
Notes: [rationale if no refactoring done]
```

### Phase 4: CODE REVIEW - Verify Quality

Invoke `tdd-code-reviewer` subagent with:
- Files modified across RED, GREEN, REFACTOR phases (combined `Changed files`)
- Test file path for context
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Architecture Review if `Status: needs-fix` returned.

**Phase Packet to include in delegation:**
```
Task: tdd-code-reviewer
Prompt: Review code quality for files modified in current subtask.
Test file: [test file path]
Modified files: [combined list from RED+GREEN+REFACTOR Changed files]
Test command: [exact command]
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

**Expected output from tdd-code-reviewer (Phase Packet):**
```
Phase: CODE_REVIEW
Status: passed | needs-fix
Test command: [command]
Changed files: [same list reviewed]
FixRequest: none | [structured FixRequest items]
Notes: [risks/debt observed]
```

**Fix-routing logic (execute in main orchestrator if Status = needs-fix):**

```
1. Parse FixRequest[] from code-reviewer output
2. Group by routeTo:
   - "implementer" items → invoke tdd-implementer with fix instructions
   - "refactorer" items → invoke tdd-refactorer with fix instructions
3. After each fix subagent completes:
   - Run test command to confirm tests still pass
   - If tests fail: invoke tdd-implementer again with diagnosis
4. Re-invoke tdd-code-reviewer with same file list
5. Repeat until Status = passed (max 3 cycles; escalate to user if exceeded)
```

**Delegation for fix:**
```
Task: tdd-implementer | tdd-refactorer
Prompt: Fix issues identified by code reviewer:
[FixRequest details: file, location, description, proposedFix]
Verification: run [verificationCommand] after fix
Keep all existing tests passing.
```

### Phase 5: ARCHITECTURE REVIEW - Ensure Integration

Invoke `tdd-architect-reviewer` subagent with:
- **Task-master context (current task + parent task if subtask)** - MANDATORY
- Files modified in all previous phases (combined `Changed files`)
- Whether this is the last subtask in parent task

**Gate**: Do NOT proceed to Documentation if `Status: needs-fix`. If `Status: integration-subtask-created`, the architecture phase is resolved — proceed to DOCUMENTATION (integration is deferred to the next TDD cycle via the created subtask).

**Phase Packet to include in delegation:**
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
    Example: [{id:1, title:"...", status:"done", details:"..."}, {id:2, ...}, ...]
Modified files (all phases): [combined Changed files from RED, GREEN, REFACTOR, CODE REVIEW]
Last subtask: [yes/no]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.

NOTE: If this is the LAST subtask (highest ID in parent.subtasks array),
      perform FULL TASK REVIEW per .claude/skills/tdd-integration/forms/architect-full-task-review.md
```

**Expected output from tdd-architect-reviewer (Phase Packet):**
```
Phase: ARCHITECTURE
Status: passed | needs-fix | integration-subtask-created
Context: Task [ID], Subtask [ID], Last subtask: Yes/No
Files reviewed: N
IntegrationVerdict: [summary]
FixRequest: none | [structured FixRequest items]
Notes: [architecture risks]
```

**Fix-routing logic (execute in main orchestrator if Status = needs-fix):**

```
1. Parse FixRequest[] from architect-reviewer output
2. All architecture FixRequests route to implementer (moving files, adding imports)
3. Invoke tdd-implementer with fix instructions
4. Run tests to confirm green
5. Re-invoke tdd-architect-reviewer
6. Repeat until Status = passed or integration-subtask-created
```

**If integration subtask created:**
- Architecture phase is complete — integration is deferred to next TDD cycle
- Proceed to DOCUMENTATION phase
- Report integration subtask ID in cycle summary

### Phase 6: DOCUMENTATION - Save Implementation Details

Invoke `tdd-documenter` subagent with:
- **Task-master context (current task + parent task if subtask)** - MANDATORY
- List of all files modified in all previous phases (combined)
- Whether this is the last subtask

**Gate**: Do NOT proceed to next subtask without documentation saved.

**Phase Packet to include in delegation:**
```
Task: tdd-documenter
Prompt: Document implementation for current subtask.
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
  - Title: [parent title]
  - Description: [parent description]
  - Details: [parent details]
Modified files: [combined list from all phases]
Is last subtask: [yes/no]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

**Expected output from tdd-documenter (Phase Packet):**
```
Phase: DOCUMENTATION
Status: passed
Modules documented: [list]
Task-master update: saved
Module CLAUDE.md: [created/updated/skipped]
Notes: [any documentation notes]
```

## Workflow for Multiple Features

Complete full cycle for EACH feature:
```
Feature 1: RED -> GREEN -> REFACTOR -> CODE REVIEW -> ARCHITECTURE REVIEW -> DOCUMENTATION
Feature 2: RED -> GREEN -> REFACTOR -> CODE REVIEW -> ARCHITECTURE REVIEW -> DOCUMENTATION
```

**Flow with fix-routing:**
```
RED -> GREEN -> REFACTOR -> CODE REVIEW
                              ↓ needs-fix
                 main: route FixRequest to implementer/refactorer
                              ↓ fixed + tests pass
                         re-invoke CODE REVIEW
                              ↓ passed
                       ARCHITECTURE REVIEW
                              ↓ needs-fix
                 main: route FixRequest to implementer
                              ↓ fixed
                    re-invoke ARCHITECTURE REVIEW
                              ↓ passed | integration-subtask-created
                        DOCUMENTATION
                              ↓ saved
                            DONE ✓
```

## Phase Violations (CRITICAL)

Never do this:
- Write implementation before test
- Proceed to Green without Red fail confirmed
- Skip Refactor evaluation
- Skip Code Review phase
- Skip Architecture Review phase
- Skip Documentation phase
- Start new feature before current cycle completes
- Modify tests during GREEN, REFACTOR, CODE REVIEW, ARCHITECTURE REVIEW, or DOCUMENTATION phases
- Ignore needs-fix status from reviewers
- Proceed to next subtask without documentation saved
- Route fixes from within reviewer subagents (that is the main orchestrator's job)

## Status Reporting

After each complete TDD cycle, report:

```
## TDD Cycle Summary

**Feature**: [feature name]
**Status**: Complete
**Task Context**: Task [ID], Subtask [ID]

| Phase | Status | Subagent | Output |
|-------|--------|----------|--------|
| RED | ✅ Done | tdd-test-writer | [test file] |
| GREEN | ✅ Done | tdd-implementer | [impl files] |
| REFACTOR | ✅ Done | tdd-refactorer | [changes/none] |
| CODE REVIEW | ✅ Done | tdd-code-reviewer | [issues: X fixed] |
| ARCHITECTURE | ✅ Done | tdd-architect-reviewer | [integration: verified] |
| DOCUMENTATION | ✅ Done | tdd-documenter | [saved to task-master] |

**Tests**: All passing
**Code Quality**: ✅ Approved (no critical/major issues)
**Architecture**: ✅ Integrated with project structure
**Documentation**: ✅ Saved and indexed
**Ready for next feature**: Yes
```

**If integration subtask created:**

```
## TDD Cycle Summary

**Feature**: [feature name]
**Status**: Complete (Integration subtask created)
**Task Context**: Task [ID], Subtask [ID] (last)

| Phase | Status | Subagent | Output |
|-------|--------|----------|--------|
| RED | ✅ Done | tdd-test-writer | [test file] |
| GREEN | ✅ Done | tdd-implementer | [impl files] |
| REFACTOR | ✅ Done | tdd-refactorer | [changes/none] |
| CODE REVIEW | ✅ Done | tdd-code-reviewer | [approved] |
| ARCHITECTURE | ⚠️ Integration needed | tdd-architect-reviewer | [subtask created: X.Y] |
| DOCUMENTATION | ✅ Done | tdd-documenter | [saved to task-master] |

**Tests**: All passing
**Code Quality**: ✅ Approved
**Architecture**: ⚠️ Integration subtask added
**Documentation**: ✅ Saved and indexed
**Next**: Subtask X.Y will integrate implemented features
```
