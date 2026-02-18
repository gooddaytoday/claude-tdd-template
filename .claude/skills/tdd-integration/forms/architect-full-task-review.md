# Full Task Review Algorithm (tdd-architect-reviewer)

This file is referenced by `tdd-architect-reviewer` when processing the **last top-level subtask** (format X.Y, position = last in subtasks array).

## When to Apply

**SCOPE CHECK FIRST:**
- Full Task Review ONLY applies to **first-level subtasks** (format: "X.Y")
- If subtask ID has more than one dot (e.g., "5.1.2"), **skip** Full Task Review
- Example: "5.2" → eligible, "5.2.1" → NOT eligible

**Algorithm to determine if last subtask:**
```typescript
function shouldPerformFullTaskReview(currentSubtaskId, parentTask) {
  const parts = currentSubtaskId.split('.');
  if (parts.length !== 2) {
    return false; // Nested subtasks (X.Y.Z) not eligible
  }
  const subtasks = parentTask.subtasks;
  const currentNumericId = parseInt(parts[1]);
  const currentIndex = subtasks.findIndex(s => s.id === currentNumericId);
  return currentIndex === subtasks.length - 1; // Last by position
}
```

## Step 1: Gather Files from ALL Completed Subtasks

For each subtask in `parentTask.subtasks`:

1. Read subtask details field from task-master: `mcp__task_master_ai__get_task({ id: "<subtask-id>" })`
2. Parse "Modified Files" section from details (format saved by tdd-documenter):
   ```
   ### Module: services
   **Modified Files:**
   - src/services/CreditService.ts - Credit management
   ```
3. Extract file paths using pattern: lines starting with `- src/` or `- tests/`
4. Collect unique paths across all subtasks into a master list

**Fallback if no structured file list in details:**
```bash
# Use git to find files modified in src/
git diff --name-only HEAD~20 -- src/ | sort -u

# Or find recently modified files
find src -type f -name "*.ts" -mmin -120 | sort
```

## Step 2: Read and Analyze All Collected Files

For each unique file path:

1. Read the file using Read tool
2. Identify component type:
   - `src/services/*.ts` → Service (class with business logic)
   - `src/handlers/*.ts` → Handler (request/command handler function)
   - `src/models/*.ts` → Model (data schema)
   - `src/utils/*.ts` → Utility (pure helper functions)
3. Extract exports: Look for `export class`, `export function`, `export const`
4. Extract imports: Look for `import { ... } from`
5. Build dependency map

## Step 3: Verify Full Integration

Build integration matrix:

| Component | Type | Used By | Status |
|-----------|------|---------|--------|
| CreditService | Service | paymentHandler.ts | ✅ INTEGRATED |
| paymentHandler | Handler | app/index.ts | ✅ REGISTERED |
| UserModel | Model | CreditService.ts | ✅ USED |
| NewUtil | Utility | nowhere | ❌ ORPHANED |

**Integration requirements by type:**

| Component Type | Integration Requirement |
|----------------|------------------------|
| Service | Must be imported in ≥1 handler OR another service |
| Handler | Must be registered in entry point or handlers/index.ts |
| Model | Must be imported in ≥1 service |
| Utility | Must be imported somewhere (or documented as future use) |

**Verification commands:**
```bash
# For each new service, check if imported anywhere
grep -r "import.*ServiceName" src/handlers/ src/services/

# For each new handler, check if registered
grep -r "ServiceName\|handlerName" src/index.ts src/handlers/index.ts

# For each new model, check if used
grep -r "import.*ModelName" src/services/
```

## Step 4: Create Integration Subtask if Gaps Found

If ANY component is ORPHANED and integration is required:

```typescript
mcp__task_master_ai__add_subtask({
  parent: "<parent-task-id>",
  title: "Integrate all components from [Parent Task Title]",
  description: "Connect all implemented components to the main application flow.",
  details: `
## Components Requiring Integration

### Orphaned Components (not connected to system)
- src/utils/newHelper.ts → Needs import in appropriate service/handler
- src/services/NewService.ts → Needs handler to expose functionality

### Integration Tasks
1. Import [NewService] in [appropriate handler]
2. Register [newHandler] in src/index.ts
3. Export new utility from src/utils/index.ts
4. Add new model to src/models/index.ts exports

### Files from All Previous Subtasks
[List all files collected from all subtasks]

### Verification
- Run full test suite
- Verify no orphaned code remains
- Test end-to-end flow
  `,
  status: "pending"
})
```

**Do NOT create integration subtask if:**
- All components are already integrated
- Component is a utility documented for future use
- This is not the last subtask

## Step 5: Output

Return in the standard ARCHITECTURE REVIEW Output Contract format, with Full Task Review results section:

```
### Full Task Review Results
**Subtasks analyzed**: M subtasks
**Files reviewed across all subtasks**: N files

| Subtask | Files |
|---------|-------|
| 5.1 | src/models/Payment.ts, src/services/PaymentService.ts |
| 5.2 | src/handlers/paymentHandler.ts |
| 5.N (current) | src/services/PaymentValidator.ts |

### Integration Matrix
[table with Component / Type / Used By / Status columns]

### Integration Subtask Created (if applicable)
ID: X.Y — "Integrate all components from [Task Title]"
```
