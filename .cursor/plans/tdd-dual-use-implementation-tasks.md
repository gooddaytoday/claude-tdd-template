# TDD Dual-Use Implementation Tasks

Пошаговая реализация адаптации TDD Integration Harness для одновременной работы в Claude Code CLI и Cursor IDE.

**Базовый план**: [tdd_dual-use_adaptation_7c687ba2.plan.md](./tdd_dual-use_adaptation_7c687ba2.plan.md)

---

## [DONE] Phase 1: Выделение guard-core.ts

### 1.1 Создать файл `.claude/hooks/lib/guard-core.ts`

**Цель**: Извлечь всю переиспользуемую логику из `prevent-test-edit.ts` в отдельный модуль.

**Что перенести**:

Interfaces:
- `GuardState` (строки 28-32 prevent-test-edit.ts)
- `ViolationEvent` (строки 34-43)

Constants:
- `ALLOWED_TEST_WRITERS` (строка 57)
- `STATE_FILE` (строка 60)
- `STATE_TTL_MS` (строка 63)
- `PROTECTED_TEST_PATHS` (строка 66)
- `JEST_CONFIG_PATHS` (строка 69)
- `ENFORCEMENT_PATHS` (строка 72)
- `BASH_WRITE_TEST_PATTERNS` (строки 77-88)
- `BASH_WRITE_JEST_PATTERNS` (строки 91-95)
- `BASH_WRITE_ENFORCEMENT_PATTERNS` (строки 98-105)
- `SKIP_PATTERNS` (строка 108)

Functions:
- `getProjectRoot()` (строки 110-121)
- `redactSensitiveSegment()` (строки 123-140)
- `sanitizeCommand()` (строки 142-153)
- `logViolationEvent()` (строки 158-167) -- добавить параметр `environment`
- `readState()` (строки 169-196) -- принимает `currentSessionId` параметром
- `writeState()` (строки 198-206)
- `extractSubagentName()` (строки 208-211)
- `normalizePath()` (строки 213-217)
- `isTestFile()` (строки 219-224)
- `isJestConfigFile()` (строки 226-231)
- `isEnforcementFile()` (строки 233-238)
- `contentHasSkipPatterns()` (строки 240-242)
- `bashCommandWritesToTests()` (строки 244-246)
- `bashCommandWritesToJestConfig()` (строки 248-250)
- `bashCommandWritesToEnforcementFiles()` (строки 252-254)

**Новый export для environment detection**:

```typescript
export function detectEnvironment(): 'claude-code' | 'cursor' {
  return process.env.CURSOR_VERSION ? 'cursor' : 'claude-code';
}
```

**Критерий готовности**: Файл экспортирует все перечисленные элементы. Компилируется без ошибок через `npx tsc --noEmit`.

---

### 1.2 Рефакторинг `prevent-test-edit.ts` на импорты из guard-core

**Цель**: Заменить все inline-определения на импорты. Файл содержит только I/O routing и format-specific output.

**Что остается в `prevent-test-edit.ts`**:
- `HookInput` interface (строки 19-26) -- специфичен для Claude Code протокола
- `HookOutput` interface (строки 45-55) -- специфичен для Claude Code протокола
- `currentSessionId` module-level variable (строка 156)
- `handleBashCommand()` -- использует функции из guard-core
- `handleFileEdit()` -- использует функции из guard-core
- `handleTaskToolUse()` -- использует функции из guard-core
- `handleSubagentStart()` -- использует функции из guard-core
- `handleSubagentStop()` -- использует функции из guard-core
- `main()` -- stdin parsing + handler routing

**Изменения в `main()`**:
- Добавить парсинг Cursor-формата input: поля `subagent_type` (Cursor) в дополнение к `agent_type` (Claude Code)
- Добавить определение `hook_event_name` из Cursor camelCase (`subagentStart`, `subagentStop`) наряду с Claude Code PascalCase (`SubagentStart`, `SubagentStop`)

**Критерий готовности**: `prevent-test-edit.ts` импортирует из `./lib/guard-core`. Все существующие тесты (если есть) и ручная проверка `echo '{"hook_event_name":"PreToolUse","tool_name":"Write","tool_input":{"file_path":"tests/unit/foo.test.ts"},"cwd":".","session_id":"test"}' | npx tsx .claude/hooks/prevent-test-edit.ts` возвращает deny.

---

### 1.3 Проверка: guard hook работает после рефакторинга

**Действия**:
1. Запустить хук с mock-input для каждого сценария:
   - PreToolUse + Write к `tests/**` (ожидание: deny при unknown state)
   - PreToolUse + Write к `src/**` (ожидание: allow)
   - PreToolUse + Bash с `cp file.ts tests/unit/` (ожидание: deny при unknown state)
   - PreToolUse + Task с `subagent_type: "tdd-implementer"` (ожидание: allow + state update)
   - SubagentStop (ожидание: state reset to main)
2. Проверить что violation logging пишет в `airefinement/artifacts/traces/violations.jsonl`

**Критерий готовности**: Все 5 сценариев возвращают ожидаемый результат. Файл violations.jsonl содержит записи от тест-запусков.

---

## [DONE] Phase 2: Dual-Format Output

### [DONE] 2.1 Добавить environment-aware output formatting в `prevent-test-edit.ts`

**Цель**: Хук автоматически определяет среду и возвращает ответ в правильном формате.

**Добавить в `prevent-test-edit.ts`**:

```typescript
import { detectEnvironment } from './lib/guard-core';

type PermissionDecision = 'allow' | 'deny' | 'ask';

interface FormattedOutput {
  json: string;
  exitCode: number;
}

function formatOutput(decision: PermissionDecision, reason?: string): FormattedOutput {
  const env = detectEnvironment();

  if (env === 'cursor') {
    return {
      json: JSON.stringify({
        decision: decision === 'ask' ? 'deny' : decision,
        reason: reason || '',
      }),
      exitCode: decision === 'deny' ? 2 : 0,
    };
  }

  return {
    json: JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: decision,
        ...(reason ? { permissionDecisionReason: reason } : {}),
      },
    }),
    exitCode: 0,
  };
}
```

**Заменить все конструкции** вида:
```typescript
return {
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'deny',
    permissionDecisionReason: '...',
  },
};
```
на вызовы `formatOutput('deny', '...')`.

**Изменить `main()` для использования exit code**:
```typescript
const formatted = formatOutput(decision, reason);
stdout.write(formatted.json);
process.exit(formatted.exitCode);
```

**Количество замен**: 11 мест в файле (подсчитано по количеству `permissionDecision` в handlers + fallback).

**Критерий готовности**: При `CURSOR_VERSION=1.0` хук возвращает `{ decision: "deny", reason: "..." }` и exit code 2. Без `CURSOR_VERSION` -- возвращает Claude Code формат с exit code 0.

**Статус**: DONE (2026-03-04)

**Реализация**:

Изменённые файлы:
- `.claude/hooks/prevent-test-edit.ts` — GREEN/REFACTOR
- `tests/unit/hooks/prevent-test-edit.test.ts` — RED

Что добавлено в `prevent-test-edit.ts`:
- `export type PermissionDecision = 'allow' | 'deny' | 'ask'` — экспортируемый тип решения
- `export interface FormatOutputResult { json: string; exitCode: number }` — результат форматирования
- `export function formatOutput(decision, reason?)` — форматирует ответ под среду:
  - Cursor (`CURSOR_VERSION` установлен): `{decision, reason}` JSON; `'ask'` → `'deny'`; exitCode 2 для deny, 0 иначе
  - Claude Code: `{hookSpecificOutput:{hookEventName:'PreToolUse', permissionDecision, permissionDecisionReason?}}` JSON; exitCode всегда 0

Архитектурные решения:
- `formatOutput` — pure function без side effects, тестируется в изоляции
- `'ask'` нормализуется в `'deny'` для Cursor (Cursor не поддерживает `ask`)
- `exitCode: 2` сигнализирует Cursor о блокировке (отличный от 0 = fail-closed)
- Интеграция с `main()` (замена прямых `stdout.write` + `process.exit`) отложена на subtask 2.2
- `HookOutput.permissionDecision` inline-тип должен быть заменён на `PermissionDecision` в subtask 2.2

---

### [DONE] 2.2 Расширить input parsing для Cursor-совместимости

**Цель**: Хук корректно читает input как от Claude Code, так и от Cursor.

**Статус**: ✅ Реализовано (RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW — все фазы пройдены)

**Изменённые файлы**:
- `.claude/hooks/prevent-test-edit.ts` — нормализация input parsing + интеграция `formatOutput()` в `main()`
- `tests/integration/hooks/hook-stdio.test.ts` — интеграционные тесты stdio поведения хука

#### Что реализовано

**1. `HookInput` interface** — расширен Cursor-специфичными полями:
```typescript
interface HookInput {
  hook_event_name: string;
  tool_name: string;
  tool_input: Record<string, unknown>;
  cwd: string;
  session_id?: string;       // Claude Code
  agent_type?: string;       // Claude Code
  conversation_id?: string;  // Cursor: вместо session_id
  subagent_type?: string;    // Cursor: вместо agent_type
}
```

**2. Нормализация input в `main()`**:
```typescript
const hookEventName = inputData.hook_event_name || '';
const normalizedEvent = hookEventName.toLowerCase(); // camelCase + PascalCase оба работают
const rawToolName = inputData.tool_name || '';
const toolName = rawToolName === 'Shell' ? 'Bash' : rawToolName; // Cursor использует Shell
currentSessionId = inputData.session_id || inputData.conversation_id || undefined;
const agentType = inputData.agent_type || inputData.subagent_type || undefined;
```

**3. Routing по нормализованному событию** (lowercase сравнение):
```typescript
if (normalizedEvent === 'subagentstart') { ... }   // SubagentStart и subagentStart оба работают
else if (normalizedEvent === 'subagentstop') { ... }
```

**4. Интеграция `formatOutput()` в `main()`**:
- Когда `permissionDecision` присутствует: вызывает `formatOutput()` → Cursor получает `{decision, reason}` + exitCode 2/0; Claude Code получает `hookSpecificOutput` + exitCode 0
- Когда нет `permissionDecision` (SubagentStop/Start): передаёт result напрямую, exitCode 0

**5. Catch block** использует `formatOutput('ask', ...)` вместо захардкоженного JSON

#### Архитектурные решения
- Нормализация через `.toLowerCase()` устраняет необходимость дублирования условий для camelCase/PascalCase вариантов
- `Shell` → `Bash` маппинг обеспечивает прозрачную совместимость без изменения downstream логики
- `session_id || conversation_id` — fallback цепочка без изменения типа `currentSessionId`
- Catch block теперь использует единый `formatOutput()` путь, обеспечивая корректный формат для обоих окружений даже при ошибках

**Критерий готовности**: Хук принимает и Claude Code, и Cursor JSON input. Тест с `{ "hook_event_name": "subagentStart", "subagent_type": "tdd-implementer" }` корректно устанавливает guard state.

---

### 2.3 Добавить поле `environment` в violation events

**Цель**: airefinement различает источник violation/timing events.

**Изменения в `guard-core.ts`**:

Расширить `ViolationEvent`:
```typescript
export interface ViolationEvent {
  timestamp: string;
  agent: string;
  attempted_action: string;
  target_file: string;
  blocked: boolean;
  reason: string;
  command_hash?: string;
  command_length?: number;
  environment?: 'claude-code' | 'cursor';
}
```

В `logViolationEvent()` автоматически добавлять `environment`:
```typescript
export function logViolationEvent(event: ViolationEvent): void {
  const enrichedEvent = {
    ...event,
    environment: event.environment || detectEnvironment(),
  };
  // ... existing logic with enrichedEvent
}
```

**Критерий готовности**: Записи в `violations.jsonl` содержат поле `environment: "claude-code"` или `environment: "cursor"`.

---

### [DONE] 2.4 Обновить `tdd-telemetry-hook.ts` для dual-environment

**Цель**: Telemetry hook корректно работает в обеих средах.

**Изменения**:

1. Импортировать `detectEnvironment` и `getProjectRoot` из guard-core
2. Расширить input parsing:
   ```typescript
   // Cursor: subagent_type; Claude Code: agent_type
   const agentType = inputData.agent_type || inputData.subagent_type || '';
   
   // Cursor: hook_event_name is camelCase
   const hookEventName = (inputData.hook_event_name || '').toLowerCase();
   if (hookEventName !== 'subagentstopp') { ... }
   ```
3. Добавить `environment` в `SubagentTimingEvent`:
   ```typescript
   interface SubagentTimingEvent {
     timestamp: string;
     agent: string;
     phase: string;
     started_at: string;
     finished_at: string;
     tool_calls_count: number;
     environment: 'claude-code' | 'cursor';
   }
   ```
4. Использовать `detectEnvironment()` при создании event
5. Читать `duration` из Cursor input (если доступно) для `started_at` расчета

**Критерий готовности**: Записи в `timings.jsonl` содержат `environment`. Хук работает при запуске с Cursor-форматом input.

**Статус**: ✅ Реализовано (RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW — все фазы пройдены, 2026-03-04)

**Изменённые файлы**:
- `.claude/hooks/tdd-telemetry-hook.ts` — GREEN/REFACTOR
- `tests/unit/hooks/telemetry-hook.test.ts` — RED

#### Что реализовано

1. **Импорт `detectEnvironment`** из `./lib/guard-core` (вместо дублирования)
2. **`SubagentStopInput`** — добавлены `subagent_type?` и `duration?`; все поля кроме `cwd` и `hook_event_name` опциональны для Cursor-совместимости
3. **`SubagentTimingEvent.environment`** — обязательное поле `'claude-code' | 'cursor'`
4. **`logTimingEvent()`** — обогащает event через `event.environment || detectEnvironment()` перед записью
5. **`main()`**:
   - `hook_event_name.toLowerCase()` — принимает и `SubagentStop`, и `subagentStop`
   - `agent_type || subagent_type` — fallback для Cursor
   - `started_at = new Date(Date.now() - duration).toISOString()` — вычисляется из `duration` (если есть)
6. **`exitOk()` helper** — извлечён для устранения 5× дублирования
7. **Удалён** мёртвый экспорт `setProjectRootForTest`

#### Архитектурные решения
- `detectEnvironment` импортируется из guard-core (единый источник, не дублируется)
- `started_at` остаётся пустой строкой если `duration` не передан — избегает фантомных временных меток
- `exitOk()` гарантирует что telemetry никогда не блокирует завершение субагента
- `environment` — required в интерфейсе, не optional, чтобы гарантировать присутствие в логах

---

## [DONE] Phase 2: Dual-Format Output — ЗАВЕРШЕНА

**Дата завершения**: 2026-03-04

**Итог Phase 2**: Все три hooks-файла теперь работают в dual-environment режиме.

| Subtask | Файл | Результат |
|---|---|---|
| 2.1 | `prevent-test-edit.ts` | `formatOutput()` — dual-format output функция |
| 2.2 | `prevent-test-edit.ts` | Input normalization + `formatOutput()` в `main()` |
| 2.3 | `lib/guard-core.ts` | `ViolationEvent.environment` + обогащение в `logViolationEvent()` |
| 2.4 | `tdd-telemetry-hook.ts` | `SubagentTimingEvent.environment` + Cursor input parsing |

**Документация модуля**: `.claude/hooks/CLAUDE.md` создан (2026-03-04)

---

## [DONE] Phase 3: Cursor Hooks Configuration

### [DONE] 3.1 Создать `.cursor/hooks.json`

**Цель**: Нативные Cursor hooks для покрытия зазоров third-party compatibility.

**Содержимое**:
```json
{
  "version": 1,
  "hooks": {
    "subagentStart": [
      {
        "command": "npx tsx .claude/hooks/prevent-test-edit.ts",
        "timeout": 10
      }
    ],
    "sessionStart": [
      {
        "command": "npx tsx .claude/hooks/cursor-session-init.ts",
        "timeout": 5
      }
    ]
  }
}
```

**Зачем `subagentStart`**: Third-party compatibility не маппит `SubagentStart` из `.claude/settings.json`. Этот хук заполняет зазор -- устанавливает guard state при запуске субагента в Cursor.

**Зачем `sessionStart`**: Компенсирует `user-prompt-skill-eval.ts` (auto-activation), который не работает в Cursor из-за несовместимого I/O формата. Инъектирует TDD контекст в начало каждой сессии.

**Критерий готовности**: Файл создан, валидный JSON, Cursor подхватывает при перезагрузке (проверить через Cursor Settings > Hooks tab).

---

### [DONE] 3.2 Создать `.claude/hooks/cursor-session-init.ts`

**Цель**: Инъекция TDD контекста в начало Cursor сессий + сброс guard state.

**Содержимое** (~30 строк):

```typescript
#!/usr/bin/env npx tsx
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';
import { writeState, detectEnvironment } from './lib/guard-core';

interface SessionStartInput {
  session_id: string;
  is_background_agent: boolean;
  composer_mode?: string;
  hook_event_name: string;
  conversation_id: string;
}

function main(): void {
  try {
    const input = JSON.parse(readFileSync(0, 'utf-8')) as SessionStartInput;

    writeState({
      activeSubagent: 'main',
      lastUpdated: new Date().toISOString(),
      sessionId: input.session_id || input.conversation_id,
    });

    const response = {
      additional_context: [
        'This project uses strict TDD (Test-Driven Development) with a 7-phase cycle.',
        'For new features: use Task tool with subagent_type tdd-test-writer (RED), tdd-implementer (GREEN), tdd-refactorer (REFACTOR), etc.',
        'Tests in tests/** are READ-ONLY outside RED phase. TDD Guard hook enforces this technically.',
        'See .claude/skills/tdd-integration/skill.md for the full orchestration protocol.',
        'See CLAUDE.md for TDD philosophy and rules.',
      ].join(' '),
      env: {},
    };

    stdout.write(JSON.stringify(response));
    process.exit(0);
  } catch {
    stdout.write(JSON.stringify({}));
    process.exit(0);
  }
}

main();
```

**Критерий готовности**: При запуске `echo '{"session_id":"test","hook_event_name":"sessionStart","conversation_id":"c1","is_background_agent":false}' | npx tsx .claude/hooks/cursor-session-init.ts` возвращает JSON с `additional_context`. Guard state сброшен в `main`.

**Статус**: DONE (2026-03-04)

**Реализация**:

Изменённые/созданные файлы:
- `.claude/hooks/cursor-session-init.ts` — новый хук (GREEN/REFACTOR)
- `tests/unit/hooks/cursor-session-init.test.ts` — unit тесты (RED)
- `tests/integration/hooks/hook-stdio.test.ts` — integration тесты добавлены в конец (RED)

Что добавлено в `cursor-session-init.ts`:
- `export interface SessionStartInput` — Cursor sessionStart input schema
- `export function buildSessionResponse(input)` — чистая функция для unit-тестирования; возвращает `{ response: { additional_context, env }, state: { activeSubagent: 'main', lastUpdated, sessionId } }`
- `main()` — stdin parse, вызов `buildSessionResponse`, `writeState()`, stdout write; catch → `{}` и exit 0

Тест-покрытие: 6 unit тестов + 4 integration теста, все зелёные.

---

## Phase 4: Cursor Rules

### [DONE] 4.1 Создать `.cursor/rules/tdd-guard.mdc`

**Цель**: Always-applied правило с TDD discipline enforcement. Поведенческий слой поверх технических hooks.

**Формат**: `.mdc` файл с YAML frontmatter.

**Содержимое** (~40 строк):

```markdown
---
alwaysApply: true
---

# TDD Guard Policy

This project enforces strict Test-Driven Development. Technical hooks in `.claude/hooks/prevent-test-edit.ts` block violations automatically.

## Absolute Rules

1. NEVER modify files in `tests/**` unless you are the `tdd-test-writer` subagent in the RED phase.
2. NEVER add `.skip`, `.only`, `xdescribe`, `xit`, `xtest`, or `if(false)` to test files.
3. NEVER modify `.claude/hooks/**`, `.claude/skills/**`, or `.claude/settings.json` during a TDD cycle.
4. NEVER write implementation code before a failing test exists.
5. NEVER skip phases or proceed without verifying gate conditions.

## Phase Permissions

| Phase | Can modify tests/** | Can modify src/** |
|-------|--------------------|--------------------|
| RED (tdd-test-writer) | YES | NO |
| GREEN (tdd-implementer) | NO | YES |
| REFACTOR (tdd-refactorer) | NO | YES |
| CODE REVIEW (tdd-code-reviewer) | NO | NO (read-only) |
| ARCH REVIEW (tdd-architect-reviewer) | NO | NO (read-only) |
| DOCS (tdd-documenter) | NO | YES (CLAUDE.md only) |
| TELEMETRY (tdd-telemetry-reporter) | NO | NO (artifacts only) |

## Source of Truth

Full guard policy: `.claude/skills/tdd-integration/policies/guard-rules.md`
Full orchestration: `.claude/skills/tdd-integration/skill.md`
```

**Критерий готовности**: Файл создан с `alwaysApply: true`. Cursor показывает правило в Settings > Rules.

---

### [DONE] 4.2 Создать `.cursor/rules/tdd-workflow.mdc`

**Цель**: Agent Requested правило, активируемое при запросах на реализацию новых features. Компенсирует отсутствие auto-activation hook в Cursor.

**Содержимое** (~50 строк):

```markdown
---
alwaysApply: false
description: "TDD workflow for implementing new features. Activates for: implement, add feature, build, create, develop."
---

# TDD Integration Workflow

## When to Use TDD

Activate TDD cycle when the user asks to:
- Implement a feature or functionality
- Add a new endpoint, handler, service, or module
- Build or create new capabilities
- Develop new integrations

Do NOT use TDD for: bug fixes, documentation, configuration, pure refactoring, git operations.

## 7-Phase Cycle

1. **PRE-PHASE**: Determine test type (unit/integration/both) and gather task context
2. **RED**: Invoke `tdd-test-writer` -- write failing test. Gate: test MUST fail with assertion error
3. **GREEN**: Invoke `tdd-implementer` -- minimal implementation. Gate: test MUST pass
4. **REFACTOR**: Invoke `tdd-refactorer` -- improve quality. Gate: tests stay green
5. **CODE REVIEW**: Invoke `tdd-code-reviewer` -- quality check. Fix-routing if issues found
6. **ARCH REVIEW**: Invoke `tdd-architect-reviewer` -- integration check. Full Task Review on last subtask
7. **DOCS**: Invoke `tdd-documenter` -- save details to task-master
8. **TELEMETRY**: Invoke `tdd-telemetry-reporter` -- write run report

## How to Execute in Cursor

Use the Task tool with the appropriate `subagent_type` for each phase. The orchestrator (main agent) manages transitions and gate verification.

Read `.claude/skills/tdd-integration/skill.md` for the complete orchestration protocol before starting.
Read the relevant phase file from `.claude/skills/tdd-integration/phases/` for delegation details.

## Verification Protocol

After RED, GREEN, and REFACTOR phases, the orchestrator MUST independently run tests:
- After RED: `npm run test:unit -- <test-file>` or `npm run test:integration -- <test-file>` -- expect failure
- After GREEN: same command -- expect success
- After REFACTOR: same command -- expect success

Do NOT trust Phase Packet status without running the test command yourself.
```

**Критерий готовности**: Файл создан с `alwaysApply: false` и `description`. Cursor показывает правило при релевантных запросах.

---

## [DONE] Phase 5: Infrastructure

### 5.1 Создать `.cursor/mcp.json`

**Цель**: Wiring Task Master MCP для Cursor IDE. Обеспечивает единый orchestration backend для CLI и IDE.

**Содержимое**:
```json
{
  "mcpServers": {
    "taskmaster-ai": {
      "command": "npx",
      "args": ["-y", "task-master-ai"],
      "env": {
        "ANTHROPIC_API_KEY": "${ANTHROPIC_API_KEY}"
      }
    }
  }
}
```

**Критерий готовности**: Cursor показывает `taskmaster-ai` в Settings > MCP Servers. Вызовы Task Master из Cursor работают.

---

### 5.2 Создать `.cursorignore`

**Цель**: Зеркало security exclusions из `.claude/settings.json` deny-list. Предотвращает попадание чувствительных файлов в LLM контекст.

**Содержимое**:
```
# Secrets and environment
.env
.env.*
secrets/
.git/config

# Build artifacts
node_modules/
dist/

# Large trace files (not useful in LLM context)
airefinement/artifacts/traces/
```

**Критерий готовности**: Файл создан. Cursor не индексирует `.env` и traces.

---

### 5.3 Создать `AGENTS.md`

**Цель**: Кросс-платформенная документация для AI agents. Стандарт `AGENTS.md` поддерживается и Claude Code, и Cursor.

**Содержимое** (~30 строк):

```markdown
# Agent Instructions

This repository uses a dual-use TDD Integration Harness that works in both Claude Code CLI and Cursor IDE.

## Source of Truth

All orchestration logic, subagent definitions, hooks, and policies live in `.claude/`:

- **Orchestrator**: `.claude/skills/tdd-integration/skill.md`
- **Subagents**: `.claude/agents/tdd-*.md` (7 agents for 7 TDD phases)
- **Guard hooks**: `.claude/hooks/prevent-test-edit.ts` (technical enforcement)
- **Policies**: `.claude/skills/tdd-integration/policies/`
- **Phase details**: `.claude/skills/tdd-integration/phases/`

See `CLAUDE.md` for TDD philosophy, commands, and module documentation.

## Cursor IDE Setup

1. Enable **Third-party skills** in Cursor Settings > Features
2. Restart Cursor to load hooks from `.claude/settings.json`
3. Task Master MCP is configured in `.cursor/mcp.json`
4. TDD rules are in `.cursor/rules/tdd-guard.mdc` and `.cursor/rules/tdd-workflow.mdc`

## Task Master

Task orchestration uses Task Master AI (MCP). Both CLI and Cursor connect to the same backend.
See `.claude/TASKMASTER_WORKFLOW.md` for the recommended task lifecycle.
```

**Критерий готовности**: Файл создан в корне репозитория. Содержимое не дублирует `CLAUDE.md`, а дополняет его cross-platform инструкциями.

---

## [DONE] Phase 6: airefinement Compatibility

### 6.1 Верификация единых путей артефактов

**Цель**: Убедиться что оба окружения пишут артефакты в одни и те же пути.

**Проверить**:
1. Violation events → `airefinement/artifacts/traces/violations.jsonl` (guard-core.ts `logViolationEvent`)
2. Timing events → `airefinement/artifacts/traces/timings.jsonl` (tdd-telemetry-hook.ts `logTimingEvent`)
3. Run reports → `airefinement/artifacts/runs/` (tdd-telemetry-reporter subagent)

**Действия**:
- Запустить guard hook в обеих средах (через mock input), проверить что violations пишутся в один файл
- Запустить telemetry hook, проверить timings
- Проверить что `environment` поле присутствует в каждой записи

**Критерий готовности**: Один и тот же `violations.jsonl` содержит записи с `environment: "claude-code"` и `environment: "cursor"`. airefinement CLI команды (`analyze`, `eval`, `report`) работают без изменений.

---

## Phase 7: Обновление CLAUDE.md

### 7.1 Добавить секцию Cursor IDE Compatibility

**Цель**: Пользователи знают как настроить Cursor для работы с TDD harness.

**Добавить после секции "Skill Architecture"**:

```markdown
## Cursor IDE Compatibility

This TDD harness works in both Claude Code CLI and Cursor IDE.

### Setup in Cursor

1. **Enable Third-party skills**: Cursor Settings > Features > Third-party skills
2. **Restart Cursor**: Hooks from `.claude/settings.json` are loaded automatically
3. **Task Master**: Configured in `.cursor/mcp.json` (same backend as CLI)

### What Works Automatically

- TDD Guard (`prevent-test-edit.ts`) blocks test modifications outside RED phase
- Telemetry hook records timing events
- Guard state tracking via `.claude/.guard-state.json`

### Cursor-Specific Additions

- `.cursor/hooks.json` — native `subagentStart` hook (gap-fill for third-party mapping)
- `.cursor/rules/tdd-guard.mdc` — always-applied TDD discipline rules
- `.cursor/rules/tdd-workflow.mdc` — TDD workflow guidance for feature implementation
- `.cursorignore` — security exclusions mirroring `.claude/settings.json` deny-list

### Differences from Claude Code CLI

- **Auto-activation**: In CLI, `user-prompt-skill-eval.ts` auto-activates TDD skill. In Cursor, `tdd-workflow.mdc` rule provides equivalent guidance, and `sessionStart` hook injects TDD context.
- **Permissions**: CLI has granular per-tool permissions. Cursor uses `.cursorignore` + rules.
- **SubagentStart**: Third-party compatibility doesn't map `SubagentStart`. Native `.cursor/hooks.json` covers this.

See `AGENTS.md` for cross-platform setup instructions.
```

**Критерий готовности**: Секция добавлена в `CLAUDE.md`. Ссылки на файлы корректны.

---

## Phase 8: Validation

### 8.1 Проверить TDD Guard в Claude Code CLI

**Сценарии**:

1. **Deny test edit в GREEN**: запустить TDD cycle, после RED перейти в GREEN. Попробовать субагентом tdd-implementer записать в `tests/` → ожидание: deny с сообщением.
2. **Allow test edit в RED**: tdd-test-writer должен успешно создавать тесты.
3. **State reset на SubagentStop**: после завершения субагента state возвращается в `main`.
4. **Violation logging**: проверить что `violations.jsonl` содержит запись с `environment: "claude-code"`.

**Критерий готовности**: Все 4 сценария проходят. Поведение идентично до рефакторинга.

---

### 8.2 Проверить TDD Guard в Cursor IDE

**Предусловия**: Third-party skills включены, Cursor перезагружен.

**Сценарии**:

1. **Third-party hooks загружены**: проверить в Cursor Settings > Hooks tab что hooks из `.claude/settings.json` видны.
2. **preToolUse deny**: попросить агента записать файл в `tests/` при active subagent != test-writer → ожидание: блокировка.
3. **subagentStart state update**: вызвать Task tool с tdd-implementer → проверить `.claude/.guard-state.json` обновлен.
4. **sessionStart context**: начать новую сессию → проверить что TDD контекст инъектирован в начало.
5. **Violation logging**: проверить `violations.jsonl` с `environment: "cursor"`.
6. **Rules visible**: проверить что `tdd-guard.mdc` и `tdd-workflow.mdc` видны в Cursor Settings > Rules.

**Критерий готовности**: Все 6 сценариев проходят. Guard enforcement работает в Cursor.

---

### 8.3 Проверить Task Master MCP в Cursor

**Сценарии**:

1. **MCP server видим**: Cursor Settings > MCP Servers показывает `taskmaster-ai`.
2. **Task list**: вызвать Task Master tool для получения списка задач → ожидание: те же задачи что в CLI.
3. **Task update**: обновить задачу через Cursor → проверить изменения видны в CLI.

**Критерий готовности**: Task Master работает одинаково в обоих окружениях.

---

### 8.4 Проверить airefinement pipeline

**Сценарии**:

1. **Mixed artifacts**: после тестов 8.1 и 8.2, `violations.jsonl` содержит записи из обоих окружений.
2. **airefinement analyze**: запустить `npm run airefinement:analyze` → ожидание: обработка записей из обоих окружений без ошибок.
3. **airefinement report**: сгенерировать отчет → ожидание: environment breakdown в отчете (если поддерживается).

**Критерий готовности**: airefinement pipeline принимает данные из обоих окружений без регрессий.

---

## Итоговая структура новых/измененных файлов

### Новые файлы

| Файл | Строк | Назначение |
|------|-------|------------|
| `.claude/hooks/lib/guard-core.ts` | ~200 | Shared guard logic (extracted) |
| `.claude/hooks/cursor-session-init.ts` | ~30 | Cursor sessionStart context injection |
| `.cursor/hooks.json` | ~15 | Native Cursor hooks (subagentStart + sessionStart) |
| `.cursor/rules/tdd-guard.mdc` | ~40 | Always-applied TDD discipline |
| `.cursor/rules/tdd-workflow.mdc` | ~50 | TDD workflow guidance |
| `.cursor/mcp.json` | ~12 | Task Master MCP config |
| `.cursorignore` | ~10 | Security exclusions |
| `AGENTS.md` | ~30 | Cross-platform agent docs |

### Измененные файлы

| Файл | Характер изменений |
|------|--------------------|
| `.claude/hooks/prevent-test-edit.ts` | Import из guard-core, dual-format output, normalized input parsing |
| `.claude/hooks/tdd-telemetry-hook.ts` | Import detectEnvironment, dual input parsing, environment field |
| `CLAUDE.md` | Новая секция "Cursor IDE Compatibility" |

### Итого
- ~160 строк Cursor-специфичного кода
- ~200 строк extracted guard-core (не новый код, а перенос)
- ~30 строк cursor-session-init
- ~30 строк обновлений в CLAUDE.md
- 0 строк дублирования agent definitions, skill, phases, schemas, policies
