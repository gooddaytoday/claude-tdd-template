# Documentation Templates (tdd-documenter)

This file is referenced by `tdd-documenter` when creating module CLAUDE.md files on the last subtask.

## Module CLAUDE.md Template

File location: `src/<module>/CLAUDE.md`

```markdown
# [Module Name] Module Documentation

## Overview
[2-3 sentences describing module purpose and responsibility]

## Implementation Details

### Phase: [Feature/Subtask Name]
[Implementation details from completed subtasks in this parent task]

### Files Structure
- `[filename].ts` - [1 line purpose]
- `[filename].ts` - [1 line purpose]

### Classes and Interfaces
- `[ClassName]` - [brief description]
  - Key methods: method1(), method2()
  - Dependencies: [external dependencies]

- `[InterfaceName]` - [brief description]

### Functions
- `functionName()` - [brief description of purpose and parameters]

## Architecture

### Design Patterns
- [Pattern name]: [brief explanation of how/why used]

### Integration Points
- Used by: [which handlers/services use this module]
- Uses: [which models/services this module depends on]
- Other modules: [cross-module interactions]
- Database models: [if applicable]

### Error Handling
- Custom errors: [CustomError, ValidationError, etc.]
- Error scenarios: [list key error conditions handled]

## Testing

### Unit Tests
- Location: `tests/unit/[module]/`
- Key test files: [list main test files]

### Integration Tests
- Location: `tests/integration/[module]/`
- Coverage: [scenarios tested]

## Usage Examples

### Example 1: [Common use case]
```typescript
// Code example
```

## Related Tasks
- Task [ID]: [Title] - Related/prerequisite work

## Changelog

### [Date] - [Task ID]: [Title]
[Summary of changes/additions]
```

## Task-Master Update Format

Use this format when calling `mcp__task_master_ai__update_subtask`. Ensure your `details` payload includes the required `modifiedFiles` array for the architect reviewer, along with the markdown documentation.

```json
{
  "modifiedFiles": [
    { "file": "src/module1/File1.ts", "phase": "GREEN" },
    { "file": "src/module1/File2.ts", "phase": "REFACTOR" }
  ],
  "description": "## Implementation Details\n\n### Affected Modules\n- [module1] ([N] files)\n- [module2] ([N] files)\n\n### Module: [module1]\n**Modified Files:**\n- src/[module1]/File1.ts - [description]\n- src/[module1]/File2.ts - [description]\n\n**Key Components:**\n- [Component]: [description]\n\n**Architectural Decisions:**\n- [decision and rationale]\n\n### Module: [module2]\n[same structure]\n\n### Cross-Module Integration\n[How modules work together]\n\n### Testing Coverage\n- Unit tests: [what is covered]\n- Integration tests: [what is covered]"
}
```

## Module Name Mapping

| Directory | Module Name |
|-----------|-------------|
| `src/services/` | Services |
| `src/models/` | Models |
| `src/handlers/` | Handlers |
| `src/utils/` | Utils |
| `src/types/` | Types |
| `src/config/` | Config |

<!-- Add project-specific module mappings here -->
