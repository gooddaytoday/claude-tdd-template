# TDD Guard Rules (Policy-as-Data)

Machine-readable policy consumed by `prevent-test-edit.ts` hook. Defines who can modify what during TDD cycles.

## Role-Permission Matrix

| Path Pattern | tdd-test-writer | tdd-implementer | tdd-refactorer | tdd-code-reviewer | tdd-architect-reviewer | tdd-documenter | main | unknown |
|---|---|---|---|---|---|---|---|---|
| `tests/**` | write | deny | deny | deny | deny | deny | write | deny |
| `jest*.config.*` | write | ask | ask | deny | deny | deny | write | ask |
| `.claude/hooks/**` | deny | deny | deny | deny | deny | deny | ask | deny |
| `.claude/skills/**` | deny | deny | deny | deny | deny | deny | ask | deny |
| `.claude/settings.json` | deny | deny | deny | deny | deny | deny | ask | deny |
| `src/**` | deny | write | write | deny | deny | deny | write | ask |

**Legend**: `write` = allow, `deny` = block, `ask` = prompt user for confirmation

## Protected Test Paths

Regex pattern matching test file locations:

```
(?:^|[\\/])tests[\\/]
```

Matches:
- `tests/unit/feature.test.ts`
- `tests/integration/db.test.ts`
- `./tests/setup.ts`
- Any path containing `tests/` as a directory

## Protected Jest Config Paths

```
(?:^|[\\/])jest(?:\.[^/\\]*)?\.config\.[jt]s$
```

Matches: `jest.config.ts`, `jest.unit.config.js`, `jest.integration.config.ts`

## Protected Enforcement Paths

```
(?:^|[\\/])\.claude[\\/](?:hooks|skills|settings\.json)
```

Matches: `.claude/hooks/*`, `.claude/skills/*`, `.claude/settings.json`

## Bash Write Patterns

Shell commands that write to protected paths. Deny when targeting test files from unauthorized roles.

### Test file write patterns

```
(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*tests[\\/]
\b(?:cp|mv)\b.*\btests[\\/]
\bsed\s+(?:-[a-zA-Z]*i).*tests[\\/]
\b(?:echo|printf)\b.*(?:>>?|tee\s)\s*['"]?[^\s'"]*tests[\\/]
\bcat\b.*(?:>>?)\s+['"]?[^\s'"]*tests[\\/]
```

### Enforcement file write patterns

```
(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*\.claude[\\/](?:hooks|skills)[\\/]
(?:>>?|tee(?:\s+-a)?)\s+['"]?[^\s'"]*\.claude[\\/]settings\.json
\b(?:cp|mv)\b.*\.claude[\\/](?:hooks|skills)[\\/]
\b(?:cp|mv)\b.*\.claude[\\/]settings\.json
\bsed\s+(?:-[a-zA-Z]*i).*\.claude[\\/](?:hooks|skills)[\\/]
\bsed\s+(?:-[a-zA-Z]*i).*\.claude[\\/]settings\.json
```

## Semantic Test-Disabling Patterns

Patterns detected inside test file content that may silently disable tests:

```
\b(?:describe|it|test)\.(?:skip|only)\b
\bx(?:describe|it|test)\b
\bif\s*\(\s*false\s*\)
```

Action: `ask` (prompt user for confirmation, even from tdd-test-writer)

## State Management

- State file: `.claude/.guard-state.json` (runtime only, gitignored)
- TTL: 2 hours (7200000 ms) — stale state treated as `unknown` (fail-closed)
- Session isolation: state includes `sessionId` — mismatched session = treat as `main`
- Reset trigger: `SubagentStop` event resets state to `main`

## Fail-Closed Defaults

When state is unknown, stale, or corrupted:
- Test file modifications: **deny**
- Enforcement file modifications: **ask**
- All other files: **allow**

## Recovery Actions (included in deny messages)

| Denied Action | Recovery Instruction |
|---|---|
| Test edit in GREEN | "Return to orchestrator. If test needs changes, escalate to tdd-test-writer via RED phase." |
| Test edit in REFACTOR | "Revert your change. If tests need updating, the orchestrator must restart RED phase." |
| Test edit from unknown | "Guard state is stale or unknown. Complete current work, then restart TDD cycle." |
| Enforcement edit in cycle | "Finish TDD cycle first. Modify enforcement files only from main agent outside TDD." |
