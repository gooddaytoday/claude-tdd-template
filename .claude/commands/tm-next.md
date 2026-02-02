Find and start the next Task Master task with quality checks

This command gets the next task and verifies the codebase is ready for development.

Steps:

1. Run quality checks first to ensure clean starting state:
   - Run `npm run build` to verify compilation
   - If build fails, fix type errors before proceeding
   - Run `npm run lint:fix` to fix any linting issues
   - Run `npm run format` to ensure consistent formatting
2. Run `task-master next` to get the next available task
3. If a task is available:
   - Run `task-master show <id>` for full details
   - Set status to in-progress: `task-master set-status --id=<id> --status=in-progress`
   - Provide a summary of what needs to be implemented
   - Suggest the first implementation step
4. If no tasks available, show current project status with `task-master list`

Always start with a clean, error-free codebase.
