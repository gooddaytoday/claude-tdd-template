Complete a Task Master task and run quality checks: $ARGUMENTS

This command completes a task and automatically runs compilation, linting, and fixes any issues.

Steps:

1. Review the current task with `task-master show $ARGUMENTS` to verify completion
2. Mark the task as done: `task-master set-status --id=$ARGUMENTS --status=done`
3. Run TypeScript compilation: `npm run build`
4. If compilation fails:
   - Read the error messages carefully
   - Fix type errors automatically using the Edit tool
   - Re-run `npm run build` to verify fixes
   - Repeat until compilation succeeds
5. Run ESLint with auto-fix: `npm run lint:fix`
6. If lint errors remain that couldn't be auto-fixed:
   - Read the error messages
   - Fix the remaining errors using the Edit tool
   - Re-run `npm run lint:fix` to verify
7. Run Prettier formatting: `npm run format`
8. Verify all checks pass by running `npm run build && npm run lint` one final time
9. Report completion status and show the next available task with `task-master next`

Always ensure the codebase is in a clean, error-free state before moving to the next task.
