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
    ↓ Gate: тест ДОЛЖЕН упасть (assertion error, не syntax/import error)
Phase 2 (GREEN): tdd-implementer → минимальная реализация
    ↓ Gate: тест ДОЛЖЕН пройти
Phase 3 (REFACTOR): tdd-refactorer → улучшение качества кода
    ↓ Gate: тесты ДОЛЖНЫ остаться зелёными
Phase 4 (CODE REVIEW): tdd-code-reviewer → проверка качества
    ↓ Gate: нет critical/major issues (fix-routing через main orchestrator по FixRequest[], max 3 цикла)
Phase 5 (ARCHITECTURE REVIEW): tdd-architect-reviewer → проверка интеграции
    ↓ Gate: код интегрирован в проект (fix-routing через main orchestrator, max 3 цикла; на последнем subtask — Full Task Review)
Phase 6 (DOCUMENTATION): tdd-documenter → сохранение в task-master + CLAUDE.md
    ↓
DONE → переход к следующему subtask
```

**Распределение моделей по агентам (текущее):**

| Агент | Модель | Роль | Tools |
|-------|--------|------|-------|
| tdd-architect-reviewer | opus | Архитектурный анализ, Full Task Review; **read-only, возвращает IntegrationVerdict + FixRequest[]** | Read, Glob, Grep, Bash, task-master MCP |
| tdd-test-writer | sonnet | Написание failing тестов | Read, Glob, Grep, Write, Edit, Bash, AskUserQuestion |
| tdd-implementer | sonnet | Минимальная реализация | Read, Glob, Grep, Write, Edit, Bash |
| tdd-code-reviewer | sonnet | Code quality review; **полностью read-only, возвращает FixRequest[]** | Read, Glob, Grep, Bash |
| tdd-refactorer | sonnet | Рефакторинг кода | Read, Glob, Grep, Write, Edit, Bash |
| tdd-documenter | haiku | Документация | Read, Glob, Grep, Write, Edit, Bash, task-master MCP |

**TDD Guard — техническое enforcement:**

Хук `prevent-test-edit.ts` (PreToolUse + SubagentStop) обеспечивает жёсткое ограничение:
- Отслеживает активного субагента через `.claude/.guard-state.json` (runtime-only, gitignored)
- При вызове Task tool — записывает имя субагента в state
- При вызове Write/Edit — проверяет, модифицируется ли файл в `tests/**`
- Разрешает модификацию тестов ТОЛЬКО для `tdd-test-writer` и `main` агента
- GREEN/REFACTOR/CODE REVIEW/ARCHITECTURE/DOCUMENTATION фазы — тесты read-only
- **При SubagentStop — сбрасывает state обратно в `main`** (SubagentStop hook добавлен в settings.json)
- **Защита jest.config файлов**: при попытке редактирования `jest.*.config.[jt]s` вне RED/main — возвращает `'ask'` (предупреждение, не hard block)
- **Fail-closed**: при ошибках парсинга хук возвращает `'ask'` вместо `'allow'`

**FixRequest-паттерн и fix-routing:**

Центральное архитектурное изменение MR #1: ревьюеры не делегируют фиксы напрямую, а возвращают структурированный `FixRequest[]`. Main orchestrator (skill.md) выполняет маршрутизацию.

```
FixRequest формат:
- file: src/services/PaymentService.ts
- location: line 42
- severity: critical | major | minor
- category: type-safety | error-handling | security | clean-code | style | structure | duplication
- description: Function uses 'any' return type
- proposedFix: Define PaymentResult interface, set return type to Promise<PaymentResult>
- verificationCommand: npm run test:unit -- tests/unit/payment.test.ts
- routeTo: implementer | refactorer
```

Fix-routing в skill.md:
1. Парсит `FixRequest[]` из output ревьюера
2. Группирует по `routeTo`: `implementer` (type/logic/security) vs `refactorer` (structure/duplication/SRP)
3. Вызывает субагент с инструкциями по фиксу
4. После фикса — прогоняет тесты
5. Повторно вызывает ревьюера (re-review)
6. Максимум 3 цикла; при превышении — эскалация к пользователю

Architecture FixRequests всегда маршрутизируются к `implementer`.

**Phase Packet handoff-контракты:**

Каждый агент возвращает стандартизированный Phase Packet, который main orchestrator парсит для принятия решений о переходе к следующей фазе:

| Фаза | Ключевые поля Phase Packet |
|------|---------------------------|
| RED | `Phase, AgentTaskStatus, TestRunStatus` (должен быть `failed`), `Test file, Test command, Changed files` |
| GREEN | `Phase, Status` (`passed`), `Test file, Test command, Changed files, Diff inventory` |
| REFACTOR | `Phase, Status, Test file, Test command, Changed files, Preserved Invariants` |
| CODE_REVIEW | `Phase, Status` (`passed\|needs-fix`), `Files reviewed, FixRequest` (`none\|array`) |
| ARCHITECTURE | `Phase, Status` (`passed\|needs-fix\|integration-subtask-created`), `IntegrationVerdict, FixRequest` |
| DOCUMENTATION | `Phase, Status, Modules documented, Task-master update` |

Примечание: в RED-фазе `AgentTaskStatus` и `TestRunStatus` — два разных поля (split в коммите f249a3f). `TestRunStatus` всегда `failed` как gate-условие.

**Self-Verification Checklists:**

Все 6 агентов выполняют обязательный Self-Verification Checklist перед возвратом результата:
- **tdd-test-writer**: файл существует и синтаксически корректен; тест падает с assertion error (не syntax/import); существующие тесты не затронуты
- **tdd-implementer**: тест проходит; файлы тестов не изменены; реализация минимальна; TypeScript компилируется
- **tdd-refactorer**: baseline green → changes → still green; нет новых behaviors; `Preserved Invariants` точен
- **tdd-code-reviewer**: все файлы прочитаны; тесты зелёные (excerpt); FixRequest поля полны; фиксы не требуют изменения тест-ассертов
- **tdd-architect-reviewer**: task-master контекст получен; grep-проверки выполнены; Full Task Review при last subtask; FixRequest поля полны
- **tdd-documenter**: task-master update сохранён; все файлы упомянуты; CLAUDE.md ссылки существуют; root CLAUDE.md обновлён при last subtask

**Автоактивация TDD Skill:**

Хук `user-prompt-skill-eval.ts` (UserPromptSubmit) инжектирует инструкцию оценки при каждом промпте пользователя:
- Если запрос на implement/add feature/build/create — автоматически активирует `Skill(tdd-integration)`
- Если bug fix/docs/config — пропускает TDD

**Task Master AI интеграция:**

- Основной скилл `.claude/skills/tdd-integration/skill.md` оркестрирует весь цикл
- 48+ команд в `.claude/commands/tm/` для управления задачами
- Контекст parent task передаётся через все 6 фаз для subtask'ов
- На последнем subtask — tdd-architect-reviewer выполняет Full Task Review (алгоритм вынесен в forms/)
- При обнаружении orphaned code — автоматическое создание integration subtask
- tdd-documenter сохраняет implementation details в task-master и создаёт module CLAUDE.md

**Система permissions (.claude/settings.json):**

- Granular allow/deny/ask permissions для файлов и bash-команд
- Отдельные permissions для каждого субагента через `Task(tdd-*:*)`
- Deny list: секреты (.env), destructive git/docker операции
- Ask list: git push, rebase, merge, package-lock.json
- **SubagentStop hook добавлен** рядом с PreToolUse (тот же скрипт `prevent-test-edit.ts`)

**Ключевые файлы репозитория:**

| Файл | Назначение |
|------|-----------|
| `.claude/agents/tdd-*.md` | 6 определений субагентов |
| `.claude/skills/tdd-integration/skill.md` | Основной TDD skill (оркестратор, fix-routing) |
| `.claude/hooks/prevent-test-edit.ts` | TDD Guard (PreToolUse + SubagentStop hook) |
| `.claude/hooks/user-prompt-skill-eval.ts` | Автоактивация skill (UserPromptSubmit hook) |
| `.claude/settings.json` | Permissions, hooks config, env |
| `.claude/utils/detect-test-type.md` | Алгоритм автоопределения типа тестов |
| `.claude/commands/tm/*.md` | 48+ Task Master команд |
| `.claude/commands/tdd-integration.md` | Ручной триггер TDD цикла |
| `.claude/skills/tdd-integration/forms/architect-full-task-review.md` | Подробный алгоритм Full Task Review |
| `.claude/skills/tdd-integration/forms/code-review-checklist.md` | Расширенный checklist для code review |
| `.claude/skills/tdd-integration/forms/documenter-templates.md` | Шаблоны документации |
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
- feedback loops и проверка артефактов после каждого шага *(частично реализовано: Phase Packets + fix-routing loops; исследовать надёжность парсинга LLM-output)*
- self-verification/error correction в фазах RED/GREEN/REFACTOR *(реализовано: Self-Verification Checklists во всех 6 агентах; исследовать: что происходит, когда checklist пропускает ошибку?)*
- incremental progress и artifact management в long-running сессиях
- **[НОВОЕ]** эффективность FixRequest routing: корректность routeTo `implementer` vs `refactorer`, предотвращение неверной маршрутизации
- **[НОВОЕ]** оптимальный лимит циклов fix-routing (текущий: 3) — обоснован ли, нужна ли адаптивная стратегия?
- **[НОВОЕ]** каскадные сбои между фазами (failure propagation) — как Phase Packet gate failures влияют на весь цикл

## Ссылки по теме направления

- https://dev.to/alonoparag/building-with-ai-coding-agents-in-tandem-with-tdd-a-case-study-25ji
- https://www.linkedin.com/pulse/test-driven-agentic-development-how-tdd-can-enable-coding-monnette-2k80f
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk

## Важные фокусные вопросы для подисследования

1. Какие TDD-ритуалы для AI-агентов дают наименьший риск обхода RED/GREEN gates? *(SubagentStop hook и jest.config protection добавлены; нужна валидация: насколько устойчивы к новым векторам обхода?)*
2. Какие verification checkpoints обязательны перед переходом между фазами? *(частично решён: Self-Verification Checklists добавлены; исследовать: достаточно ли этих checkpoints или нужны внешние валидаторы?)*
3. Как формализовать test intent, чтобы implementer не «угадывал» требования? *(частично решён: Phase Packets с `Test command`, `Failure Excerpt`, `What tests verify`; исследовать: best practices для передачи семантики теста)*
4. Какие anti-patterns чаще всего ломают TDD в multi-agent workflow и как их блокировать? *(найден delegation anti-pattern — субагент не может вызывать субагент; что ещё? Какие паттерны обхода guard наиболее вероятны?)*
5. Какие артефакты (trace, decisions, failing evidence) нужно сохранять после каждой фазы? *(решён: Phase Packets определяют набор; исследовать: достаточен ли текущий набор полей для диагностики регрессий?)*
6. **[НОВЫЙ]** Как измерять точность FixRequest routing? Какие метрики качества TDD-цикла собирать для непрерывного улучшения harness?
7. **[НОВЫЙ]** Какие практики защищают от «галлюцинаций» в Phase Packets — ситуации, когда агент возвращает `Status: passed`, но тесты фактически не прошли?
