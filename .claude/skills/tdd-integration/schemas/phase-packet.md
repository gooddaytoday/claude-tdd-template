# Phase Packet Schema

Standard output contract for ALL TDD subagents. Every phase MUST return output conforming to this schema.

## Common Fields (required in every Phase Packet)

```
Phase: RED | GREEN | REFACTOR | CODE_REVIEW | ARCHITECTURE | DOCUMENTATION
Status: passed | failed | needs-fix | needs-diagnosis | integration-subtask-created
Test file: [path to test file]
Test command: [exact command to run tests]
Changed files:
- [file path] - [brief description of change]
```

## Phase-Specific Extensions

Each phase adds fields on top of the common set. See below.

### RED Phase Extensions

```
AgentTaskStatus: completed | failed
TestRunStatus: failed              (MUST be "failed" — test confirmed failing)
Test type: Unit | Integration
Type source: directive | task-master | heuristics | user
Confidence: high | medium

Type Selection Reasoning: [1-3 sentences]

Failure Excerpt (5-15 lines):
  [key lines of failing output showing assertion error]

What tests verify:
- Test 1: [description]
- Test 2: [description]

TestIntent:
  Summary: [one sentence]
  Given: [preconditions]
  When: [action]
  Then: [expected result]
  Contract surface: [expected exports: function names, classes, types]
  Non-goals: [what is NOT implemented in this cycle]
  Edge cases covered: [list]
```

### GREEN Phase Extensions

```
Diff inventory:
- New exports: [list]
- Modified exports: [list]
- Internal only: [list]

Success Excerpt (5-15 lines):
  [key lines of passing test output]
```

### REFACTOR Phase Extensions

```
Refactorings Applied:
- [type] in [file]: [what and why]

Preserved Invariants:
- Module interfaces: [SPECIFIC list of unchanged public APIs]
- Data structures: [unchanged types/interfaces]
- Side effects: [preserved behaviors]

Test Verification Excerpt (5-15 lines):
  [passing test output after refactoring]
```

If no refactoring needed:

```
Decision: No Refactoring Needed
- [specific reason]

Preserved Invariants:
- All module interfaces, exports, and data structures unchanged from GREEN phase
```

### CODE_REVIEW Phase Extensions

```
Files reviewed: N

Test Verification:
  [5-15 line excerpt of passing test output]

Issues Found:
  Critical: N | Major: N | Minor: N

FixRequest: none | [FixRequest blocks]

Minor Issues (non-blocking):
- [file:line] brief description
```

### ARCHITECTURE Phase Extensions

```
Context: Task [ID], Subtask [ID], Last subtask: Yes/No
Files reviewed: N

IntegrationVerdict:
- Structure compliance: passed | [issue]
- Integration status: all connected | [N] orphaned components
- Full Task Review: performed | skipped (not last subtask)

FixRequest: none | [FixRequest blocks]

Integration Subtask (if created):
  ID: X.Y
  Title: [title]
  Dependencies: [IDs]
```

### DOCUMENTATION Phase Extensions

```
Context: Task [ID], Subtask [ID]
Modules affected: [N] - [list]
Last subtask: Yes | No

Task-Master Update:
  Saved to subtask [ID]
  Files documented: [N] across [M] modules

Module Documentation (last subtask only):
  src/[module]/CLAUDE.md - [created | updated]

Root Documentation (last subtask only):
  [N] links in root CLAUDE.md - [added | updated | verified]
```

## FixRequest Format (used by CODE_REVIEW and ARCHITECTURE)

```
### FixRequest
- id: FR-1
- file: [path]
- location: [line or description]
- severity: critical | major | minor
- category: type-safety | error-handling | security | clean-code | style | integration | structure | circular-dep | convention
- description: [what is wrong]
- proposedFix: [how to fix]
- verificationCommand: [command to verify fix]
- routeTo: implementer | refactorer
- confidence: high | medium | low
- rationale: [1-2 sentences why this routeTo]
- dependsOn: none | FR-N
```

**routeTo decision rule:**
> "Will the proposed fix change any observable/external behavior (public API, types, error handling, security, or logic)?"
> - **Yes** -> `routeTo: implementer`
> - **No** (structure only: duplication, naming, SRP, extract private function) -> `routeTo: refactorer`

## Notes Field

Every Phase Packet MUST end with a `Notes` field containing:
- Observations about edge cases or ambiguities
- Risks for subsequent phases
- Anything the orchestrator should be aware of

If nothing noteworthy: `Notes: none`
