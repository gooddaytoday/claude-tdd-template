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

Example:
```bash
# If current task is "5.2" (subtask)
# Extract parent ID: "5"
task-master show 5  # Get parent task context
```

**CRITICAL: Parent Task Context Usage Rule**

Parent task context serves ONLY as background information:
- ✅ Use it to understand the broader goal and architecture
- ✅ Use it to ensure your subtask aligns with parent task's vision
- ❌ DO NOT implement other subtasks mentioned in parent task
- ❌ DO NOT expand scope beyond current subtask

**Example**: If working on subtask "5.1: Write unit tests", parent task shows subtasks 5.2, 5.3, 5.4:
- ✅ Understand parent goal to write proper tests for 5.1
- ❌ DO NOT implement code from 5.2, 5.3, or 5.4
- Focus ONLY on 5.1's specific scope

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

**Decision Flowchart:**
```
┌─────────────────────────────────────┐
│  TDD Integration Skill Triggered    │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Get current task from task-master  │
└─────────────────┬───────────────────┘
                  ▼
┌─────────────────────────────────────┐
│  Is task ID format "X.Y"? (subtask) │
│  YES ───────────────────────────────┼──► Get parent task (ID "X")
└─────────────────┬───────────────────┘    Store parent context
                  │ NO (standalone)
                  ▼ (continue)
┌─────────────────────────────────────┐
│  --test-type argument provided?     │
│  YES ───────────────────────────────┼──► Use specified type
└─────────────────┬───────────────────┘
                  │ NO
                  ▼
┌─────────────────────────────────────┐
│  Check testStrategy in task+parent  │
│  Has clear indicator?               │
│  YES ───────────────────────────────┼──► Use detected type
└─────────────────┬───────────────────┘
                  │ NO/Ambiguous
                  ▼
┌─────────────────────────────────────┐
│  Apply keyword heuristics           │
│  Score diff > 0?                    │
│  YES ───────────────────────────────┼──► Use type with higher score
└─────────────────┬───────────────────┘
                  │ NO (equal scores)
                  ▼
┌─────────────────────────────────────┐
│  Ask user via AskUserQuestion       │
└─────────────────────────────────────┘
```

### Phase 1: RED - Write Failing Test

Invoke `tdd-test-writer` subagent with:
- Feature requirement from user request
- Expected behavior to test
- **Test type from Pre-Phase** (required)
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Green until test failure confirmed.

Example delegation:
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

**Note**: If `test_type = both`, run RED phase twice:
1. First for unit tests
2. Then for integration tests

### Phase 2: GREEN - Make It Pass

Invoke `tdd-implementer` subagent with:
- Test file path from RED phase
- Feature requirement context
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Refactor until test passes.

Example delegation:
```
Task: tdd-implementer
Prompt: Implement minimal code to pass tests in: [test file path]
Feature context: [what we're building]
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
  - Title: [parent title]
  - Description: [parent description]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

### Phase 3: REFACTOR - Improve

Invoke `tdd-refactorer` subagent with:
- Test file path
- Implementation files from GREEN phase
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Code Review until refactoring complete and tests green.

Example delegation:
```
Task: tdd-refactorer
Prompt: Evaluate and refactor implementation for: [test file path]
Implementation files: [list of files modified in GREEN phase]
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
  - Title: [parent title]
  - Description: [parent description]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

### Phase 4: CODE REVIEW - Verify Quality

Invoke `tdd-code-reviewer` subagent with:
- Files modified in GREEN and REFACTOR phases
- Test file path for context
- **Parent task context** (if current task is a subtask)

**Gate**: Do NOT proceed to Architecture Review if critical/major issues found.

The code reviewer will:
- Check TypeScript typing quality (no `any`, proper generics)
- Verify error handling (try/catch, custom errors)
- Validate Clean Code principles (SRP, DRY, naming)
- Check security issues (input validation, injection prevention)
- Auto-fix issues by invoking `tdd-implementer` or `tdd-refactorer`

Example delegation:
```
Task: tdd-code-reviewer
Prompt: Review code quality for files modified in current subtask.
Test file: [test file path]
Modified files: [list of implementation files]
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
  - Title: [parent title]
  - Description: [parent description]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
```

**If issues found:******
- Code reviewer automatically delegates fixes to appropriate subagent
- Re-runs tests to verify fixes
- Re-reviews until no critical/major issues remain

### Phase 5: ARCHITECTURE REVIEW - Ensure Integration

Invoke `tdd-architect-reviewer` subagent with:
- **Task-master context (current task + parent task if subtask)** - MANDATORY
- Files modified in all previous phases
- Project structure information

**Gate**: Do NOT complete cycle if code is not properly integrated.

**Obtaining Parent Task Context (if current task is a subtask):**

If current task ID is format "X.Y":
1. Extract parent ID "X"
2. Run: `task-master show X`
3. Include parent task full details in delegation

The architecture reviewer will:
- Verify code follows project structure conventions
- Check integration with existing services/models/handlers
- Validate no circular dependencies
- Confirm code is not "hanging in the air" unconnected
- Understand parent task context to ensure proper integration with parent's goals
- **On LAST subtask**: Perform FULL TASK REVIEW - gather files from ALL completed subtasks, build integration matrix
- Create integration subtask via task-master if needed (last subtask scenario)
- Auto-fix structure issues by invoking `tdd-implementer`

Example delegation:
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
Modified files (current cycle): [list of files modified in RED, GREEN, REFACTOR, CODE REVIEW phases]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.

NOTE: If this is the LAST subtask (highest ID in parent.subtasks array),
      perform FULL TASK REVIEW per Section 6 of architect reviewer instructions.
      This includes gathering files from ALL completed subtasks and building integration matrix.
```

**If this is the last subtask:**
- Architect reviewer performs FULL TASK REVIEW (Section 6)
- Reviews ALL files from ALL completed subtasks, not just current cycle
- Builds integration matrix for entire parent task
- Creates integration subtask if ANY component is orphaned

**If integration missing (last subtask):**
- Architect reviewer creates new subtask via `task-master add-subtask`
- New subtask will handle integration in next TDD cycle

### Phase 6: DOCUMENTATION - Save Implementation Details

Invoke `tdd-documenter` subagent with:
- **Task-master context (current task + parent task if subtask)** - MANDATORY
- List of all files modified in all previous phases
- All details from CODE REVIEW and ARCHITECTURE REVIEW phases

**Gate**: Do NOT proceed to next subtask without documentation saved.

**Obtaining Parent Task Context (if current task is a subtask):**

If current task ID is format "X.Y":
1. Extract parent ID "X"
2. Run: `task-master show X`
3. Include parent task full details in delegation

The documenter will:
- Save implementation details to the current subtask in task-master
- Record architectural decisions, patterns, and components
- Understand parent task context to document how this subtask contributes to parent goals
- For last subtask only: Create/update `src/<module>/CLAUDE.md` with comprehensive documentation
- For last subtask only: Add link to module documentation in root `CLAUDE.md`
- Detect module by analyzing modified files (use directory with most changes)

Example delegation:
```
Task: tdd-documenter
Prompt: Document implementation for current subtask.
Task context:
- Current: Task [ID] / Subtask [ID]
- Parent: Task [ID] (if subtask)
  - Title: [parent title]
  - Description: [parent description]
  - Details: [parent details]
Scope restriction: Work ONLY on current subtask [ID]. Do NOT implement other subtasks.
Modified files: [list of all files from all phases]
Is last subtask: [yes/no]
```

**Module Detection Logic:**
- Analyze only files in `src/**/*.ts`
- Ignore root files like `src/index.ts`
- Count files by first-level directory in `src/`
- Use directory with most modified files as module name
- If tie, use alphabetically first directory

**Documentation Output (for last subtask):**
- File: `src/<module>/CLAUDE.md`
- Contains: Overview, Implementation Details, Components, Architecture, Testing, Usage Examples, Related Tasks
- Root `CLAUDE.md` updated with link to module documentation

## Workflow for Multiple Features

Complete full cycle for EACH feature:
```
Feature 1: RED -> GREEN -> REFACTOR -> CODE REVIEW -> ARCHITECTURE REVIEW -> DOCUMENTATION
Feature 2: RED -> GREEN -> REFACTOR -> CODE REVIEW -> ARCHITECTURE REVIEW -> DOCUMENTATION
Feature 3: RED -> GREEN -> REFACTOR -> CODE REVIEW -> ARCHITECTURE REVIEW -> DOCUMENTATION
```

**Flow with auto-fixes:**
```
RED -> GREEN -> REFACTOR -> CODE REVIEW
                              ↓ issues found
                            GREEN (fix) -> REFACTOR (verify)
                              ↓ approved
                          ARCHITECTURE REVIEW
                              ↓ structure issues
                            GREEN (fix) -> verify
                              ↓ approved
                          DOCUMENTATION
                              ↓ saved
                            DONE ✓
```

## Phase Violations (CRITICAL)

Never do this:
- Write implementation before test
- Proceed to Green without Red fail
- Skip Refactor evaluation
- Skip Code Review phase
- Skip Architecture Review phase
- Skip Documentation phase
- Start new feature before current cycle completes
- Modify tests during GREEN, REFACTOR, CODE REVIEW, ARCHITECTURE REVIEW, or DOCUMENTATION phases
- Ignore critical/major issues from reviewers
- Proceed to next subtask without documentation saved

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
