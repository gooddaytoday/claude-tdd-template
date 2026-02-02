Run full quality check and auto-fix all issues

This command runs compilation, linting, and formatting with automatic fixes.

Steps:

1. Run TypeScript compilation: `npm run build`
2. If compilation fails:
   - Analyze all type errors in the output
   - Create a todo list of all type errors that need fixing
   - Fix each type error systematically using the Edit tool
   - Re-run `npm run build` after each fix or batch of fixes
   - Continue until compilation succeeds
3. Run ESLint with auto-fix: `npm run lint:fix`
4. If lint errors remain:
   - Analyze remaining errors
   - Fix each error using the Edit tool
   - Re-run `npm run lint:fix` to verify
5. Run Prettier formatting: `npm run format`
6. Run final verification: `npm run build && npm run lint`
7. Report summary:
   - Number of type errors fixed
   - Number of lint errors fixed
   - Current build status
   - Any remaining issues

This ensures the codebase is clean and ready for development or deployment.
