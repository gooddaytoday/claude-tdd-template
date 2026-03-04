# Hooks Module — CLAUDE.md

TDD Guard & Telemetry hooks. Run by Claude Code (via `.claude/settings.json`) and Cursor (via `.cursor/hooks.json`) on tool use events.

## Overview

Three files, one library:

| File | Role | Hook events |
|---|---|---|
| `prevent-test-edit.ts` | Guard: blocks unauthorized test modifications | `PreToolUse`, `SubagentStart`, `SubagentStop` |
| `tdd-telemetry-hook.ts` | Telemetry: records TDD phase timing | `SubagentStop` |
| `lib/guard-core.ts` | Shared library: state, types, pure functions | — (no entry point) |

## Dual-Environment Architecture

Both hooks run identically in Claude Code CLI and Cursor IDE. Environment detection is automatic:

```typescript
// lib/guard-core.ts
export function detectEnvironment(): 'claude-code' | 'cursor' {
  return process.env.CURSOR_VERSION ? 'cursor' : 'claude-code';
}
```

**Input normalization** (both hooks):
- `hook_event_name` → `.toLowerCase()` to accept both `SubagentStop` (Claude Code) and `subagentStop` (Cursor)
- `agent_type || subagent_type` — Claude Code sends `agent_type`, Cursor sends `subagent_type`
- `session_id || conversation_id` — Claude Code sends `session_id`, Cursor sends `conversation_id`
- `tool_name: 'Shell'` → normalized to `'Bash'` (Cursor uses `Shell`)

**Output format** (`prevent-test-edit.ts` only):

| Environment | Format | Exit code |
|---|---|---|
| Claude Code | `{ hookSpecificOutput: { hookEventName, permissionDecision, permissionDecisionReason? } }` | Always `0` |
| Cursor | `{ decision: 'allow'\|'deny', reason: string }` | `2` for deny, `0` otherwise |

Note: `'ask'` is normalized to `'deny'` in Cursor output (Cursor does not support `ask`).

## lib/guard-core.ts

Shared library. No `main()`. All exports are pure functions or constants.

### Exports

**Types:**
- `GuardState` — `{ activeSubagent, lastUpdated, sessionId? }`
- `ViolationEvent` — structured violation record, includes `environment?: 'claude-code' | 'cursor'`

**Constants:**
- `ALLOWED_TEST_WRITERS` — `['tdd-test-writer', 'main']`
- `STATE_FILE` — `.claude/.guard-state.json`
- `STATE_TTL_MS` — 2 hours
- `PROTECTED_TEST_PATHS`, `JEST_CONFIG_PATHS`, `ENFORCEMENT_PATHS` — path regexps
- `BASH_WRITE_TEST_PATTERNS`, `BASH_WRITE_JEST_PATTERNS`, `BASH_WRITE_ENFORCEMENT_PATTERNS` — bash command regexps

**Key functions:**

| Function | Purpose |
|---|---|
| `detectEnvironment()` | Returns `'claude-code'` or `'cursor'` based on `CURSOR_VERSION` env var |
| `getProjectRoot()` | Walks up from `cwd` to find directory containing `.claude/` |
| `readState(sessionId?)` | Reads `.guard-state.json`; TTL-guards stale state; session-scoped |
| `writeState(state)` | Writes state; silent fail (best-effort) |
| `logViolationEvent(event)` | Appends to `airefinement/artifacts/traces/violations.jsonl`; auto-enriches `environment` |
| `isTestFile(path)` | Matches `tests/**` |
| `isJestConfigFile(path)` | Matches `jest*.config.[jt]s` |
| `isEnforcementFile(path)` | Matches `.claude/hooks/**`, `.claude/skills/**`, `.claude/settings.json` |
| `contentHasSkipPatterns(content)` | Detects `.skip`, `.only`, `xdescribe`, `xit`, `if(false)` |
| `bashCommandWritesToTests(cmd)` | Detects bash writes to `tests/` |
| `sanitizeCommand(cmd)` | Redacts secrets; returns hash + prefix/suffix for safe logging |
| `redactSensitiveSegment(value)` | Redacts `--token=`, `Bearer `, `password=`, etc. |

## prevent-test-edit.ts

TDD Guard hook. Entry point: `main()`. Guards 4 categories:

**A1 — Bash writes to tests** (`handleBashCommand`): deny if `activeSubagent` not in `ALLOWED_TEST_WRITERS`

**A2 — File writes to tests** (`handleFileEdit`): fail-closed — `unknown` state also blocks

**A3 — Skip pattern detection** (`handleFileEdit`): warns on `.skip`/`.only` in content written to test files even when allowed (asks, not denies)

**A4 — Enforcement file protection** (`handleFileEdit`, `handleBashCommand`): asks when any subagent (including `unknown`) tries to modify `.claude/hooks/**` etc.

**State tracking:**
- `handleTaskToolUse` → writes active subagent name to state on Task tool invocation
- `handleSubagentStart` → writes subagent name from `SubagentStart` event
- `handleSubagentStop` → resets state to `main`

**Additional exports** (re-exported from `guard-core` for test access):
`detectEnvironment`, `getProjectRoot`, `formatOutput`, `readState`, `writeState`, `isTestFile`, `isJestConfigFile`, `isEnforcementFile`, and all guard functions.

### formatOutput(decision, reason?)

```typescript
export function formatOutput(decision: PermissionDecision, reason?: string): FormatOutputResult
```

Pure function. Produces environment-correct JSON + exit code. Used in `main()` and the catch block.

## tdd-telemetry-hook.ts

Timing telemetry. Only acts on `SubagentStop` for `tdd-*` agents. Never blocks termination — all errors are caught and silently skipped.

**Flow:**
1. Parse input; normalize `hook_event_name.toLowerCase()`
2. Resolve `agentType = agent_type || subagent_type`
3. `agentTypeToPhase(agentType)` → phase name (e.g., `'tdd-implementer'` → `'GREEN'`)
4. Compute `started_at = Date.now() - duration` (if `duration` present in Cursor input)
5. Build `SubagentTimingEvent` with `environment: detectEnvironment()`
6. `logTimingEvent()` → append to `airefinement/artifacts/traces/timings.jsonl`

**Agent → Phase mapping:**

| Agent type | Phase |
|---|---|
| `tdd-test-writer` | RED |
| `tdd-implementer` | GREEN |
| `tdd-refactorer` | REFACTOR |
| `tdd-code-reviewer` | CODE_REVIEW |
| `tdd-architect-reviewer` | ARCH_REVIEW |
| `tdd-documenter` | DOCS |
| `tdd-telemetry-reporter` | TELEMETRY |

### SubagentTimingEvent

```typescript
interface SubagentTimingEvent {
  timestamp: string;      // ISO: when hook ran
  agent: string;          // agent_type value
  phase: string;          // mapped phase name
  started_at: string;     // ISO: computed from duration, or '' if unknown
  finished_at: string;    // ISO: same as timestamp
  tool_calls_count: number; // always 0 (not tracked yet)
  environment: 'claude-code' | 'cursor';
}
```

## Guard State

State file: `.claude/.guard-state.json` (git-ignored, runtime only).

```json
{
  "activeSubagent": "tdd-implementer",
  "lastUpdated": "2026-03-04T10:00:00.000Z",
  "sessionId": "abc123"
}
```

- TTL: 2 hours. Expired state → treated as `unknown` → fail-closed (denies test writes)
- Session-scoped: different `sessionId` → treated as `main` (parallel sessions don't interfere)
- `unknown` state → denies test writes (same as non-allowed subagent)

## Files Structure

```
.claude/hooks/
├── CLAUDE.md                  ← this file
├── prevent-test-edit.ts       ← TDD Guard hook entrypoint
├── tdd-telemetry-hook.ts      ← Telemetry hook entrypoint
└── lib/
    └── guard-core.ts          ← Shared library (no entrypoint)
```

## Changelog

### Phase 2: Dual-Format Output (2026-03-04)

**guard-core.ts:**
- Added `detectEnvironment()` function
- Extended `ViolationEvent` with optional `environment` field
- `logViolationEvent()` now auto-enriches `environment` field before writing

**prevent-test-edit.ts:**
- Added `formatOutput()` — dual-format output (Claude Code / Cursor)
- `main()` now uses `formatOutput()` for all outputs including catch block
- Input normalization: `hook_event_name.toLowerCase()`, `Shell` → `Bash`, `conversation_id` fallback, `subagent_type` fallback
- Extracted `PermissionDecision` type and `FormatOutputResult` interface as exports

**tdd-telemetry-hook.ts:**
- Added `detectEnvironment` import from `./lib/guard-core`
- `SubagentTimingEvent.environment` — required field, set to `detectEnvironment()` result
- Input parsing: `agent_type || subagent_type`, `hook_event_name.toLowerCase()`
- `started_at` computed from `duration` field (Cursor provides it)
- Extracted `exitOk()` helper (removed 5× duplication)
- Removed dead `setProjectRootForTest` export
