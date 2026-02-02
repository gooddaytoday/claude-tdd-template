# Task Master Workflow with Automatic Checks

## New Commands

### `/tm-done <task-id>`
Completes a task and automatically runs all code quality checks:
- TypeScript compilation
- ESLint with auto-fix
- Prettier formatting
- Final verification

**Example:**
```bash
/tm-done 1.2
```

### `/tm-next`
Gets the next task after checking codebase cleanliness:
- Checks compilation before starting
- Fixes linter and formatting
- Sets task status to "in-progress"
- Shows task details

**Example:**
```bash
/tm-next
```

### `/tm-check`
Runs full quality check with auto-fix:
- TypeScript compilation with automatic type error fixing
- ESLint with auto-fix
- Prettier formatting
- Final verification

**Example:**
```bash
/tm-check
```

## Automatic Hook

After executing `task-master set-status --id=X --status=done`, the following runs automatically:
1. TypeScript compilation (`npm run build`)
2. ESLint auto-fix (`npm run lint:fix`)
3. Prettier formatting (`npm run format`)
4. Final check (`npm run build && npm run lint`)

## Recommended Workflow

1. **Starting work:**
   ```bash
   /tm-next
   ```

2. **During development:**
   - Implement functionality
   - Claude automatically monitors types and linter

3. **Completing a task:**
   ```bash
   /tm-done 1.2
   ```
   Automatically:
   - Marks task as completed
   - Fixes all type errors
   - Fixes all linter errors
   - Formats code
   - Shows next task

4. **Check at any time:**
   ```bash
   /tm-check
   ```

## Benefits

- **Automation**: All checks run automatically
- **Quality**: Code always passes checks before moving to next task
- **Time savings**: No need to manually run commands
- **Consistency**: Single process for all tasks
- **Error fixing**: Claude automatically fixes type and linter errors

## Settings

All settings are in `.claude/settings.json`:
- `hooks.after-bash`: automatic hook for task-master commands
- `permissions.allow`: permissions for automatic command execution

## Task Master Integration

Commands are fully integrated with Task Master:
- Use standard task-master commands
- Compatible with MCP tools
- Work with all Task Master features
