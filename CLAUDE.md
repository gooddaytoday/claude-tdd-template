# Claude Code Instructions Template

**This is a reusable template. See SETUP.md for usage instructions.**

## Task Master AI Instructions (Optional)
**If using Task Master, create `.taskmaster/CLAUDE.md` in your project and uncomment the import below.**
<!-- @./.taskmaster/CLAUDE.md -->

## Testing Guidelines (Optional)
**If using custom test setup, create `tests/CLAUDE.md` in your project and uncomment the import below.**
<!-- @./tests/CLAUDE.md -->

## TDD Philosophy (Test-Driven Development)

This project uses strict TDD with Red-Green-Refactor cycle using isolated subagents.

### Core Principles
- **Test First**: ALWAYS write failing tests before implementation
- **Minimal Implementation**: Write only what tests require
- **Tests are Sacred**: NEVER modify tests to make them pass
- **Context Isolation**: Each TDD phase uses dedicated subagent

### TDD Workflow
1. **RED Phase** (`tdd-test-writer`): Write failing test first
2. **GREEN Phase** (`tdd-implementer`): Implement minimal code to pass
3. **REFACTOR Phase** (`tdd-refactorer`): Improve code quality

### Commands
- `/tdd-integration` - Invoke full TDD cycle for feature implementation
- Subagents are automatically delegated by the skill

### Test Structure
- Unit tests: `tests/unit/` - Fast, isolated, mock external dependencies
- Integration tests: `tests/integration/` - Cross-module behavior

### Test Type Auto-Detection

The TDD system automatically determines whether to write unit or integration tests:

**Priority Chain:**
1. **Explicit argument**: `--test-type=unit|integration|both`
2. **Task-master context**: Parse `testStrategy` field for "Unit test" / "Integration test"
3. **Keyword heuristics**: Analyze feature description for indicators
4. **User fallback**: Ask via AskUserQuestion when uncertain

**Quick Decision Guide:**
| Feature Type | Test Type |
|--------------|-----------|
| Database, MongoDB, models | Integration |
| API, endpoints, handlers | Integration |
| External service clients, SDKs | Integration |
| Utils, helpers, pure functions | Unit |
| Parsers, validators, formatters | Unit |
| Config, settings, constants | Unit |

**Reference**: See `.claude/utils/detect-test-type.md` for full algorithm.

### Phase Gates
- **RED**: Test must FAIL before proceeding to GREEN
- **GREEN**: Test must PASS before proceeding to REFACTOR
- **REFACTOR**: Tests must stay GREEN after changes

### When to Use TDD
- New feature implementation
- New functionality development
- Adding new modules or components

### When NOT to Use TDD
- Bug fixes (direct implementation)
- Documentation updates
- Configuration changes
- Pure refactoring (outside TDD cycle)

### TDD Guard Protection

The project has **technical enforcement** of TDD discipline:

- **Hooks**:
  - `PreToolUse`: `.claude/hooks/prevent-test-edit.ts` intercepts Write/Edit operations
  - `SubagentStop`: Same hook resets state when subagent completes
- **State Tracking**: `.claude/.guard-state.json` tracks which subagent is active
  - Updated when Task tool invokes subagent
  - Reset to `'main'` when subagent finishes
  - Ignored by git (runtime state only)
- **Enforcement Rules**:
  - ✅ `tdd-test-writer` can modify `tests/**` (RED phase)
  - ✅ `main` agent can modify `tests/**` (when no subagent active)
  - ❌ `tdd-implementer` CANNOT modify `tests/**` (GREEN phase blocked)
  - ❌ `tdd-refactorer` CANNOT modify `tests/**` (REFACTOR phase blocked)

If any subagent tries to modify test files outside RED phase, the hook will automatically deny the Write/Edit operation with a clear error message.

**This is not a guideline—it's a hard technical restriction.**

## Module Documentation

This section is for project-specific module documentation. Create CLAUDE.md files in your modules and link them here.

<!-- Example structure:
- [Services Module](src/services/CLAUDE.md) - Business logic services
- [Handlers Module](src/handlers/CLAUDE.md) - Request/command handlers
- [Models Module](src/models/CLAUDE.md) - Data models and schemas
- [API Routes](src/routes/CLAUDE.md) - API endpoint definitions
- [Utils Module](src/utils/CLAUDE.md) - Utility functions and helpers
-->
