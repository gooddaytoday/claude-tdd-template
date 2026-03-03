# Deep Research Prompt 11: Адаптация под Cursor IDE

## Общая задача

Адаптировать Claude Code CLI TDD-ориентированный agent harness в репозитории `https://github.com/gooddaytoday/claude-tdd-template` для работы в Cursor IDE, сохранив полную текущую работоспособность в Claude Code CLI.

Основной SKILL для работы — [https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md](https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md).

## Архитектура (AS-IS)

**7-фазный TDD цикл (+ Pre-Phase):**

```
Pre-Phase: Determine test type + Get parent task context from Task Master
    ↓
Phase 1 (RED): tdd-test-writer → пишет failing тесты
    ↓ Gate: тест ДОЛЖЕН упасть
Phase 2 (GREEN): tdd-implementer → минимальная реализация
    ↓ Gate: тест ДОЛЖЕН пройти
Phase 3 (REFACTOR): tdd-refactorer → улучшение качества кода
    ↓ Gate: тесты ДОЛЖНЫ остаться зелёными
Phase 4 (CODE REVIEW): tdd-code-reviewer → проверка качества
    ↓ Gate: нет critical/major issues (auto-fix через tdd-implementer/tdd-refactorer)
Phase 5 (ARCHITECTURE REVIEW): tdd-architect-reviewer → проверка интеграции
    ↓ Gate: код интегрирован в проект (на последнем subtask — Full Task Review)
Phase 6 (DOCUMENTATION): tdd-documenter → сохранение в task-master + CLAUDE.md
    ↓ Gate: документация синхронизирована с результатом цикла
Phase 7 (TELEMETRY): tdd-telemetry-reporter → сбор Run Report (JSON) + артефактов
    ↓ Gate: отчёт сохранён/валидирован (или soft-fail с retry и переходом в DONE)
    ↓
DONE → переход к следующему subtask
```

**Распределение моделей по агентам (текущее):**

| Агент | Модель | Роль | Tools |
|-------|--------|------|-------|
| tdd-architect-reviewer | opus | Архитектурный анализ, Full Task Review | Read, Glob, Grep, Bash, task-master MCP |
| tdd-test-writer | sonnet | Написание failing тестов | Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion |
| tdd-implementer | sonnet | Минимальная реализация | Read, Glob, Grep, Write, Edit, Bash |
| tdd-code-reviewer | sonnet | Code quality review | Read, Glob, Grep, Bash, Task |
| tdd-refactorer | sonnet | Рефакторинг кода | Read, Glob, Grep, Write, Edit, Bash |
| tdd-documenter | sonnet | Документация | Read, Glob, Grep, Write, Edit, Bash, Task, task-master MCP |
| tdd-telemetry-reporter | haiku | Сбор telemetry run report | Read, Bash, Write |

**TDD Guard — техническое enforcement:**

Хук `prevent-test-edit.ts` (PreToolUse + SubagentStart + SubagentStop) обеспечивает жёсткое ограничение:

- Отслеживает активного субагента через `.claude/.guard-state.json` (runtime-only, gitignored), с `sessionId` и TTL
- При `SubagentStart`/Task tool — записывает имя субагента в state
- При вызове Write/Edit/MultiEdit — проверяет, модифицируется ли файл в `tests/**`
- Разрешает модификацию тестов ТОЛЬКО для `tdd-test-writer` и `main` агента
- GREEN/REFACTOR/CODE REVIEW/ARCHITECTURE/DOCUMENTATION фазы — тесты read-only
- Защищает enforcement-файлы (`.claude/hooks/**`, `.claude/skills/**`, `.claude/settings.json`) от изменений субагентами
- Отслеживает семантическое отключение тестов (`.skip`, `.only`, `xdescribe`, `xit`, `if(false)`)
- Логирует нарушения в `airefinement/artifacts/traces/violations.jsonl`
- При SubagentStop — сбрасывает state обратно в `main`

**Автоактивация TDD Skill:**

Хук `user-prompt-skill-eval.ts` (UserPromptSubmit) инжектирует инструкцию оценки при каждом промпте пользователя:

- Если запрос на implement/add feature/build/create — автоматически активирует `Skill(tdd-integration)`
- Если bug fix/docs/config — пропускает TDD

**Task Master AI интеграция:**

- Основной скилл `.claude/skills/tdd-integration/skill.md` оркестрирует весь цикл
- 45 команд в `.claude/commands/tm/` (+ `tm-next`, `tm-done`, `tm-check`, `tdd-integration`, `tdd-full-review`)
- Контекст parent task передаётся через все фазы для subtask'ов
- На последнем subtask — tdd-architect-reviewer выполняет Full Task Review всех файлов
- При обнаружении orphaned code — автоматическое создание integration subtask
- tdd-documenter сохраняет implementation details в task-master и создаёт module CLAUDE.md
- `TASKMASTER_WORKFLOW.md` фиксирует lifecycle `next -> in-progress -> done -> next`

**Система permissions (.claude/settings.json):**

- Granular allow/deny/ask permissions для файлов и bash-команд
- Отдельные permissions для каждого субагента через `Task(tdd-*:*)`
- Deny list: секреты (.env), destructive git/docker операции
- Ask list: git push, rebase, merge, package-lock.json

**Ключевые файлы репозитория:**

| Файл | Назначение |
|------|-----------|
| `.claude/agents/tdd-*.md` | 7 определений субагентов (включая `tdd-telemetry-reporter`) |
| `.claude/skills/tdd-integration/skill.md` | Основной TDD skill (оркестратор) |
| `.claude/hooks/prevent-test-edit.ts` | TDD Guard (PreToolUse hook) |
| `.claude/hooks/tdd-telemetry-hook.ts` | Telemetry hook (SubagentStop timing events) |
| `.claude/hooks/user-prompt-skill-eval.ts` | Автоактивация skill (UserPromptSubmit hook) |
| `.claude/skills/tdd-integration/phases/*.md` | Модульные инструкции по фазам (включая `telemetry.md`) |
| `.claude/skills/tdd-integration/schemas/*.md` | Контракты Context/Phase Packet |
| `.claude/skills/tdd-integration/policies/*.md` | Guard/auto-activation политики |
| `.claude/skills/tdd-integration/forms/*.md` | Чеклисты и шаблоны review/documentation |
| `.claude/settings.json` | Permissions, hooks config, env |
| `.claude/utils/detect-test-type.md` | Алгоритм автоопределения типа тестов |
| `.claude/commands/tm/*.md` | 45 Task Master команд |
| `.claude/commands/tdd-integration.md` | Ручной триггер TDD цикла |
| `.claude/TASKMASTER_WORKFLOW.md` | Рекомендованный workflow для Task Master |
| `airefinement/**` | Модуль continuous refinement и eval TDD harness |
| `CLAUDE.md` | Философия TDD, модульная документация |

## Task Master AI интеграция и направленность

- Поток: `parent task -> subtask -> pre-phase + 7-phase TDD cycle -> next subtask`
- Контекст parent task проходит через все фазы, включая TELEMETRY
- На финальном subtask: Full Task Review + создание integration subtask при orphaned code
- Документирование результатов обратно в task-master и `CLAUDE.md`
- Telemetry phase формирует run-level артефакты для `airefinement` анализа

## Основные ссылки в репозитории

- Субагенты: `.claude/agents/tdd-*.md`
- Основной skill: `.claude/skills/tdd-integration/skill.md`
- Guard hook: `.claude/hooks/prevent-test-edit.ts`
- Автоактивация skill: `.claude/hooks/user-prompt-skill-eval.ts`
- Permissions: `.claude/settings.json`
- Detect test type: `.claude/utils/detect-test-type.md`
- Команды Task Master: `.claude/commands/tm/*.md`
- TDD command: `.claude/commands/tdd-integration.md`
- Философия и правила: `CLAUDE.md`

## airefinement — AI Refinement Module

- `airefinement/` — отдельная система непрерывного улучшения TDD harness
- CLI команды: `analyze`, `refine`, `eval`, `report`, `metrics`
- Артефакты: `airefinement/artifacts/runs/`, `airefinement/artifacts/traces/`, `airefinement/artifacts/reports/`
- Eval stack: Golden Dataset + deterministic graders + LLM-judge + calibration + composite scoring
- Refinement loop: диагностика деградаций/регрессий и генерация улучшений в ограниченном scope (`.claude/agents|skills|hooks`)
- Связь с TDD циклом: TELEMETRY и guard violations feed данные в eval/refinement pipeline

## Репозитории лучших практик

- https://github.com/VoltAgent/voltagent
- https://github.com/code-yeongyu/oh-my-opencode
- https://github.com/obra/superpowers
- https://github.com/VoltAgent/awesome-claude-code-subagents
- https://github.com/hesreallyhim/awesome-claude-code
- https://github.com/lodetomasi/agents-claude-code
- https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering
- https://github.com/wshobson/agents

## Приоритетные источники

- Anthropic Engineering: https://www.anthropic.com/engineering/
- Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Multi-agent research systems: https://www.anthropic.com/engineering/multi-agent-research-system
- Building agents with Claude Agent SDK: https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk
- Building effective agents: https://www.anthropic.com/engineering/building-effective-agents
- Effective context engineering: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Advanced tool use: https://www.anthropic.com/engineering/advanced-tool-use
- Code execution with MCP: https://www.anthropic.com/engineering/code-execution-with-mcp
- Equipping agents with Agent Skills: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills
- Demystifying evals for AI agents: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents
- Claude Think tool: https://www.anthropic.com/engineering/claude-think-tool
- Claude Code sandboxing: https://www.anthropic.com/engineering/claude-code-sandboxing
- Subagents docs: https://code.claude.com/docs/en/sub-agents
- Best practices for Claude Code sub-agents: https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/
- Mastering Claude agent best practices: https://sparkco.ai/blog/mastering-claude-agent-best-practices-for-2025
- How to create and use subagents: https://www.cometapi.com/how-to-create-and-use-subagents-in-claude-code/
- Claude Code CLI commands: https://apidog.com/blog/claude-code-cli-commands/
- Best Claude Code agents and use cases: https://superprompt.com/blog/best-claude-code-agents-and-use-cases
- Awesome Claude Code: https://github.com/hesreallyhim/awesome-claude-code
- VoltAgent: https://github.com/VoltAgent/voltagent
- Skills.sh: https://skills.sh/
- Task Master AI: https://github.com/eyaltoledano/claude-task-master
- Cursor docs: https://docs.cursor.com/
- Cursor rules: https://docs.cursor.com/context/rules

## Контекст исследования

Исследуйте и синтезируйте лучшие практики для оптимизации TDD-ориентированного agent harness. Система должна одинаково работать как в Claude Code CLI, так и в Cursor IDE. Текущий набор из 7 субагентов оркестрируется через TDD Integration Skill и Task Master AI, с отдельной TELEMETRY фазой и downstream контуром `airefinement`. Цель — максимальное качество каждого компонента harness согласно актуальным практикам 2025-2026.

## Основное направление исследования

Cursor adaptation of current `.claude/` TDD-integration SKILL configuration:

- `.claude/agents` (source of truth) vs отсутствие `.cursor/agents` в репозитории
- `.claude/skills` (source of truth) vs отсутствие `.cursor/skills` в репозитории
- hooks lifecycle differences
- Cursor rules (`.cursor/rules/*.mdc`) как дополнение/компенсация части `.claude/` логики
- optimal dual-use configuration
- граница ответственности: project-level `.claude/*` vs IDE-level Cursor MCP/skills

## Ссылки по теме направления

- https://docs.cursor.com/
- https://docs.cursor.com/context/rules
- https://code.claude.com/docs/en/sub-agents
- https://github.com/eyaltoledano/claude-task-master

## Важные фокусные вопросы для подисследования

1. Какие элементы `.claude/` конфигурации можно централизовать как source-of-truth, а какие лучше дублировать в Cursor?
2. Как формализовать mapping между `.claude` hooks/permissions и возможностями Cursor (без прямого hook-lifecycle parity)?
3. Как организовать единый Task Master orchestration поток для Claude Code CLI и Cursor IDE, если MCP и skills в Cursor частично IDE-level?
4. Какие Cursor-функции (skills, background agents, multi-file editing, browser MCP, context7 MCP) дают максимальный прирост качества именно для RED/GREEN/REFACTOR/CODE_REVIEW/ARCH_REVIEW/DOCS/TELEMETRY?
5. Какая dual-use структура репозитория минимизирует maintenance overhead при наличии `airefinement` feedback loop?
