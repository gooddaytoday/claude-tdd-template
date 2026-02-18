# Deep Research Prompt 02: TDD-специфичные практики для AI-агентов
<!-- markdownlint-disable MD032 MD034 -->

## Общая задача

Оптимизировать TDD-ориентированный agent harness в репозитории `https://github.com/gooddaytoday/claude-tdd-template` для работы в Claude Code CLI и Cursor IDE. Основной SKILL для работы — [https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md](https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md).

## Архитектура (AS-IS)

**6-фазный TDD цикл:**

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
    ↓
DONE → переход к следующему subtask
```

**Распределение моделей по агентам (текущее):**

| Агент | Модель | Роль | Tools |
|-------|--------|------|-------|
| tdd-architect-reviewer | opus | Архитектурный анализ, Full Task Review | Read, Glob, Grep, Bash, Task, task-master MCP |
| tdd-test-writer | sonnet | Написание failing тестов | Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion |
| tdd-implementer | sonnet | Минимальная реализация | Read, Glob, Grep, Write, Edit, Bash |
| tdd-code-reviewer | sonnet | Code quality review | Read, Glob, Grep, Bash, Task |
| tdd-refactorer | sonnet | Рефакторинг кода | Read, Glob, Grep, Write, Edit, Bash |
| tdd-documenter | haiku | Документация | Read, Glob, Grep, Write, Edit, Bash, Task, task-master MCP |

**TDD Guard — техническое enforcement:**

Хук `prevent-test-edit.ts` (PreToolUse) обеспечивает жёсткое ограничение:
- Отслеживает активного субагента через `.claude/.guard-state.json` (runtime-only, gitignored)
- При вызове Task tool — записывает имя субагента в state
- При вызове Write/Edit — проверяет, модифицируется ли файл в `tests/**`
- Разрешает модификацию тестов ТОЛЬКО для `tdd-test-writer` и `main` агента
- GREEN/REFACTOR/CODE REVIEW/ARCHITECTURE/DOCUMENTATION фазы — тесты read-only
- При SubagentStop — сбрасывает state обратно в `main`

**Автоактивация TDD Skill:**

Хук `user-prompt-skill-eval.ts` (UserPromptSubmit) инжектирует инструкцию оценки при каждом промпте пользователя:
- Если запрос на implement/add feature/build/create — автоматически активирует `Skill(tdd-integration)`
- Если bug fix/docs/config — пропускает TDD

**Task Master AI интеграция:**

- Основной скилл `.claude/skills/tdd-integration/skill.md` оркестрирует весь цикл
- 48+ команд в `.claude/commands/tm/` для управления задачами
- Контекст parent task передаётся через все 6 фаз для subtask'ов
- На последнем subtask — tdd-architect-reviewer выполняет Full Task Review всех файлов
- При обнаружении orphaned code — автоматическое создание integration subtask
- tdd-documenter сохраняет implementation details в task-master и создаёт module CLAUDE.md

**Система permissions (.claude/settings.json):**

- Granular allow/deny/ask permissions для файлов и bash-команд
- Отдельные permissions для каждого субагента через `Task(tdd-*:*)`
- Deny list: секреты (.env), destructive git/docker операции
- Ask list: git push, rebase, merge, package-lock.json

**Ключевые файлы репозитория:**

| Файл | Назначение |
|------|-----------|
| `.claude/agents/tdd-*.md` | 6 определений субагентов |
| `.claude/skills/tdd-integration/skill.md` | Основной TDD skill (оркестратор) |
| `.claude/hooks/prevent-test-edit.ts` | TDD Guard (PreToolUse hook) |
| `.claude/hooks/user-prompt-skill-eval.ts` | Автоактивация skill (UserPromptSubmit hook) |
| `.claude/settings.json` | Permissions, hooks config, env |
| `.claude/utils/detect-test-type.md` | Алгоритм автоопределения типа тестов |
| `.claude/commands/tm/*.md` | 48+ Task Master команд |
| `.claude/commands/tdd-integration.md` | Ручной триггер TDD цикла |
| `CLAUDE.md` | Философия TDD, модульная документация |

## Task Master AI интеграция и направленность

- Поток: `parent task -> subtask -> 6-phase TDD cycle -> next subtask`
- Контекст parent task проходит через все 6 фаз
- На финальном subtask: Full Task Review + создание integration subtask при orphaned code
- Документирование результатов обратно в task-master и `CLAUDE.md`

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

Исследуйте и синтезируйте лучшие практики для оптимизации TDD-ориентированного agent harness. Система работает как в Claude Code CLI, так и в Cursor IDE. Текущий набор из 6 субагентов оркестрируется через TDD Integration Skill и Task Master AI. Цель — максимальное качество каждого компонента harness согласно актуальным практикам 2025-2026.

## Основное направление исследования

TDD-практики для agentic workflows:
- red-green-refactor как формальный state machine
- specification-as-code (behavioral tests, contracts, fitness functions)
- feedback loops и проверка артефактов после каждого шага
- self-verification/error correction в фазах RED/GREEN/REFACTOR
- incremental progress и artifact management в long-running сессиях

## Ссылки по теме направления

- https://dev.to/alonoparag/building-with-ai-coding-agents-in-tandem-with-tdd-a-case-study-25ji
- https://www.linkedin.com/pulse/test-driven-agentic-development-how-tdd-can-enable-coding-monnette-2k80f
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk

## Важные фокусные вопросы для подисследования

1. Какие TDD-ритуалы для AI-агентов дают наименьший риск обхода RED/GREEN gates?
2. Какие verification checkpoints обязательны перед переходом между фазами?
3. Как формализовать test intent, чтобы implementer не «угадывал» требования?
4. Какие anti-patterns чаще всего ломают TDD в multi-agent workflow и как их блокировать?
5. Какие артефакты (trace, decisions, failing evidence) нужно сохранять после каждой фазы?
