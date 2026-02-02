---
name: tdd-integration
description: Manually trigger TDD Integration workflow with Red-Green-Refactor-Review cycle (5 phases)
---

# TDD Integration Command

Manually trigger the TDD Integration skill for developing new features through Test-Driven Development with automated quality and architecture reviews.

## Usage

```
/tdd-integration [feature description] [options]
```

## Options

- `--test-type=unit` — Force unit tests only
- `--test-type=integration` — Force integration tests only
- `--test-type=both` — Write both unit and integration tests
- `--task=<id>` — Use specific task-master task ID for context

## Examples

```bash
/tdd-integration implement user validation --test-type=unit
/tdd-integration add payment processing --test-type=integration
/tdd-integration create config loader --task=2.4
```

## What This Command Does

This command manually triggers the `tdd-integration` skill, which enforces a strict 6-phase TDD cycle:

1. **Pre-Phase**: Determines test type and gets parent task context
   - Priority: explicit argument → testStrategy from task-master → keyword heuristics → user prompt
   - If working with a subtask (ID format "X.Y"), automatically retrieves parent task context (title, description, details, testStrategy)
   - Parent task context is passed to all subsequent phases for better understanding of implementation goals

2. **RED Phase**: Invokes `tdd-test-writer` subagent
   - Writes a failing test that describes the expected behavior
   - Receives parent task context if current task is a subtask
   - Does not proceed until the test fails

3. **GREEN Phase**: Invokes `tdd-implementer` subagent
   - Writes minimal code to pass the test
   - Receives parent task context if current task is a subtask
   - Does not proceed until the test passes

4. **REFACTOR Phase**: Invokes `tdd-refactorer` subagent
   - Evaluates and improves the code and tests
   - Receives parent task context if current task is a subtask
   - Keeps all tests green

5. **CODE REVIEW Phase**: Invokes `tdd-code-reviewer` subagent
   - Reviews TypeScript typing, error handling, Clean Code principles, security
   - Receives parent task context if current task is a subtask
   - Auto-fixes critical/major issues by calling `tdd-implementer` or `tdd-refactorer`
   - Does not proceed until code quality approved

6. **ARCHITECTURE REVIEW Phase**: Invokes `tdd-architect-reviewer` subagent
   - Verifies code integrates with project architecture
   - Automatically retrieves and uses parent task context if current task is a subtask
   - Checks structure, imports, and no orphaned code
   - **On LAST subtask**: Performs FULL TASK REVIEW - gathers files from ALL completed subtasks, builds integration matrix for entire parent task
   - Creates integration subtask via task-master if needed (last subtask scenario)
   - Auto-fixes structure issues by calling `tdd-implementer`

7. **DOCUMENTATION Phase**: Invokes `tdd-documenter` subagent
   - Saves implementation details to the current subtask in task-master
   - Automatically retrieves and uses parent task context if current task is a subtask
   - Records how subtask implementation contributes to parent task goals

## Parent Task Context (Subtask Support)

**Automatic Parent Task Retrieval:**

When working with a subtask (task ID format "X.Y"), the skill **automatically**:
1. Detects that current task is a subtask
2. Extracts parent task ID ("X" from "X.Y")
3. Retrieves parent task details: title, description, details, testStrategy
4. Passes parent task context to **all phases** (RED through DOCUMENTATION)

This ensures that subagents understand:
- The broader feature/goal being implemented (parent task)
- How the current subtask contributes to the parent goal
- Any shared requirements or constraints from parent task
- Proper integration with parent task's architecture

**Example**: If working on subtask "5.2" under parent task "5 - Implement User Authentication", the skill will retrieve and pass parent task's full context to all subagents, helping them align the subtask work with the overall authentication feature goals.

**CRITICAL SCOPE RESTRICTION:**

When working with a subtask, the parent task context is provided **for reference only**:
- ✅ Use parent context to understand the overall feature goal
- ✅ Ensure your subtask implementation aligns with parent's architecture
- ❌ **DO NOT** implement other subtasks you see in parent task
- ❌ **DO NOT** expand scope beyond your current subtask

**Example**: Working on "5.1: Add validation logic" under "5: User Authentication"
- Parent shows subtasks: 5.1 (current), 5.2 (database), 5.3 (API), 5.4 (tests)
- ✅ Implement ONLY 5.1's validation logic
- ❌ Do NOT implement 5.2's database, 5.3's API, or 5.4's tests

## Automatic Activation

**Important**: The skill also activates **automatically** when you use phrases like:
- "implement [feature]"
- "add [functionality]"
- "create [new feature]"
- "build [capability]"
- "develop [feature]"

You don't need to explicitly type `/tdd-integration` — just say "implement user authentication" and the skill will start automatically.

## Safety Mechanisms

The skill uses a **TDD Guard Hook** (`.claude/hooks/prevent-test-edit.ts`) that:
- Blocks test modifications during GREEN, REFACTOR, CODE REVIEW, and ARCHITECTURE REVIEW phases
- Allows test modifications only in the RED phase (via `tdd-test-writer` subagent)
- Enforces the Red-Green-Refactor-Review cycle

## Auto-Fix Mechanism

**Code Review Phase:**
- Detects TypeScript type issues, missing error handling, Clean Code violations, security issues
- Automatically invokes `tdd-implementer` (for code fixes) or `tdd-refactorer` (for structure fixes)
- Re-runs tests after each fix to ensure green status

**Architecture Review Phase:**
- Detects structure violations, missing integration, orphaned code
- Automatically invokes `tdd-implementer` to fix structure issues
- Creates new integration subtask via `task-master add-subtask` if this is the last subtask and integration is missing

## Full Task Review (Last Subtask Feature)

When working on the **last subtask** of a first-level parent task (format X.Y), the architecture reviewer performs a comprehensive **Full Task Review**:

1. **Gathers files from ALL completed subtasks** - Parses the "Modified Files" sections from each subtask's details field in task-master
2. **Reads and analyzes all files** - Identifies services, handlers, models, utils created across the entire parent task
3. **Builds integration matrix** - Maps which components use which other components
4. **Detects orphaned code** - Finds components that are not connected to the system
5. **Creates integration subtask** - If any component is orphaned, automatically creates a new subtask to integrate it

**Example**: Parent task "5 - Payment System" has subtasks 5.1-5.4. When architect reviewer runs on 5.4 (last):
- Collects files from 5.1, 5.2, 5.3, 5.4
- Builds matrix showing PaymentService → used by paymentHandler → registered in bot/index.ts
- If PaymentService is orphaned (not imported anywhere), creates subtask 5.5 for integration

**Scope**: Only applies to first-level subtasks (X.Y format). Nested subtasks (X.Y.Z) skip full task review.

## Detailed Documentation

For complete information about the workflow, test type detection algorithms, delegation examples, and usage rules, see:

**📚 [.claude/skills/tdd-integration/skill.md](./.claude/skills/tdd-integration/skill.md)**

Additional resources:
- **Test type detection algorithm**: [.claude/utils/detect-test-type.md](./.claude/utils/detect-test-type.md)
- **Subagents**:
  - [.claude/agents/tdd-test-writer.md](./.claude/agents/tdd-test-writer.md)
  - [.claude/agents/tdd-implementer.md](./.claude/agents/tdd-implementer.md)
  - [.claude/agents/tdd-refactorer.md](./.claude/agents/tdd-refactorer.md)
  - [.claude/agents/tdd-code-reviewer.md](./.claude/agents/tdd-code-reviewer.md)
  - [.claude/agents/tdd-architect-reviewer.md](./.claude/agents/tdd-architect-reviewer.md)