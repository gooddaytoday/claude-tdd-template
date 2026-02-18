# Deep research prompt

Я настроил полный цикл разработки через Task Master AI и Claude Code CLI / Cursor IDE в моём template репозитории [https://github.com/gooddaytoday/claude-tdd-template](https://github.com/gooddaytoday/claude-tdd-template). Основной SKILL для работы над текущей задачей — [https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md](https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md).

Репозитории в которых можно подсмотреть лучшие практики:

[https://github.com/VoltAgent/voltagent](https://github.com/VoltAgent/voltagent)
[https://github.com/code-yeongyu/oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
[https://github.com/obra/superpowers](https://github.com/obra/superpowers)
[https://github.com/VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)
[https://github.com/hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
[https://github.com/lodetomasi/agents-claude-code](https://github.com/lodetomasi/agents-claude-code)
[https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering)
[https://github.com/wshobson/agents](https://github.com/wshobson/agents)

Другие ресурсы по теме:

- https://www.anthropic.com/engineering/
- https://www.anthropic.com/engineering/building-effective-agents
- https://skills.sh/

## Задача: оптимизация Субагентов и всего цикла разработки над ними

Субагенты: 

.claude/agents/tdd-architect-reviewer.md
.claude/agents/tdd-code-reviewer.md
.claude/agents/tdd-documenter.md
.claude/agents/tdd-implementer.md
.claude/agents/tdd-refactorer.md
.claude/agents/tdd-test-writer.md

Основной TDD SKILL: .claude/skills/tdd-integration/skill.md

Также смотри CLAUDE.md в корне репозитория, там есть описание философии TDD и всех субагентов.

### Текущая архитектура (AS-IS)

Текущая реализация представляет собой 6-фазный TDD цикл с выделенными субагентами, Task Master AI оркестрацией и техническим enforcement через hooks. Ниже -- полное описание архитектуры для контекста.

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

### Контекст исследования

Исследуйте и синтезируйте лучшие практики для оптимизации TDD-ориентированного agent harness, используемого в репозитории https://github.com/gooddaytoday/claude-tdd-template. Система работает как в Claude Code CLI, так и в Cursor IDE. Текущий набор из 6 субагентов (tdd-architect-reviewer, tdd-code-reviewer, tdd-documenter, tdd-implementer, tdd-refactorer, tdd-test-writer) оркестрируется через TDD Integration Skill и Task Master AI. Полная архитектура описана в разделе "Текущая архитектура (AS-IS)" выше. Цель — максимальное качество каждого компонента harness согласно актуальным практикам 2025-2026.[^1_4][^1_5]

### Направления исследования

**1. Архитектура и паттерны субагентов (2025-2026)**

Проанализируйте следующие аспекты:

- Эффективные структуры system prompts для специализированных агентов[^1_3][^1_6]
- Паттерны single-responsibility для каждого типа агента (architect, reviewer, implementer, test-writer, refactorer, documenter)[^1_5]
- Механизмы изоляции контекста и управления token budget между субагентами[^1_2][^1_3]
- Стратегии automatic delegation vs explicit invocation для TDD workflow[^1_7][^1_4]
- Programmatic Tool Calling для оркестрации сложных TDD циклов[^1_8]

**2. TDD-специфичные практики для AI агентов**

Исследуйте:

- Интеграцию Test-Driven Development с agentic workflows (red-green-refactor cycle)[^1_9][^1_10]
- Specification-as-code подходы: behavioral test suites, contract definitions, architectural fitness functions[^1_10]
- Паттерны feedback loops: gather context → take action → verify work → repeat[^1_3]
- Стратегии self-verification и error correction в TDD контексте[^1_7][^1_3]
- Механизмы incremental progress и artifact management для long-running sessions[^1_1]

**3. Context Engineering и оптимизация производительности**

Изучите:

- Техники context compaction и summarization для длительных TDD сессий[^1_1][^1_3]
- Стратегии filtering данных перед попаданием в model context[^1_11]
- Code execution with MCP для эффективного использования контекста[^1_11]
- Паттерны Tool Search Tool для on-demand загрузки инструментов[^1_8]
- Memory systems и progress tracking между сессиями[^1_1]
- Информационная плотность system prompts: текущий tdd-architect-reviewer содержит ~620 строк, tdd-documenter ~450 строк. Каков оптимальный размер system prompt для максимальной эффективности субагента?[^1_16]
- Effective context engineering patterns: structured prompt templates, role-specific context injection, progressive detail loading[^1_16]
- Оптимальное соотношение between instructions, examples и constraints в system prompt каждого агента

**4. Коммуникационные протоколы между агентами**

Проанализируйте:

- Inter-agent communication protocols для TDD workflow
- Паттерны orchestrator-subagent delegation[^1_6][^1_2]
- Механизмы parallel execution для independent задач (например, множественные test suites)[^1_2]
- Стратегии aggregation результатов от субагентов[^1_7]
- Handoff rules между этапами TDD цикла[^1_5]

**5. Tool permissions и security**

Исследуйте:

- Минимальные необходимые permissions для каждого типа TDD агента:
    - Architect-reviewer: Read, Grep, Glob (read-only analysis)
    - Test-writer: Read, Write, Edit, Bash (создание и запуск тестов)
    - Implementer: Read, Write, Edit, Bash (код и выполнение)
    - Code-reviewer: Read, Grep, Glob (анализ без изменений)
    - Refactorer: Read, Write, Edit, Bash (модификация существующего кода)
    - Documenter: Read, Write, Edit, Glob, Grep (документация)[^1_5]
- Granular tool access control для предотвращения capability drift[^1_12]

**6. Skills и Hooks интеграция**

Изучите:

- Эффективные паттерны Skills для TDD workflows[^1_13]
- Hooks для автоматизации repetitive TDD tasks
- Интеграция custom slash commands для ускорения циклов[^1_14]
- Reusable context patterns и common mistakes capture[^1_13]

**7. Evaluation и continuous improvement**

Проанализируйте:

- Eval frameworks для измерения качества работы TDD агентов[^1_15]
- Metrics для оценки effectiveness субагентов
- Iterative refinement strategies на основе real task performance[^1_12]
- A/B testing patterns для улучшения agent configurations[^1_15]

**8. Real-world implementation patterns**

Исследуйте примеры из:

- VoltAgent awesome-claude-code-subagents (100+ специализированных агентов)
- oh-my-opencode patterns
- obra/superpowers workflows
- muratcankoylan/Agent-Skills-for-Context-Engineering
- lodetomasi/agents-claude-code
- wshobson/agents

**9. Task Master AI и оркестрация задач**

Текущая реализация использует Task Master AI как ядро оркестрации. Исследуйте:

- Оптимальные patterns для потока parent task → subtask → TDD cycle → next subtask[^1_30]
- Стратегии complexity analysis и автоматической декомпозиции задач на subtasks[^1_30]
- Паттерны передачи контекста между subtasks через details field (текущий подход: tdd-documenter сохраняет Modified Files и Architectural Decisions в details каждого subtask)
- Автоматизация переходов: smart-workflow, command-pipeline, auto-implement-tasks
- Автогенерация integration subtask при обнаружении orphaned code на последнем subtask (текущий подход: tdd-architect-reviewer создаёт subtask через MCP)
- Full Task Review pattern: сбор файлов из details ВСЕХ завершённых subtasks и проверка integration matrix
- Оптимальная структура task description и testStrategy field для максимально точного автоопределения типа тестов
- Координация между task-master MCP tools и bash-командами `task-master` CLI

**10. Стратегия выбора моделей для максимального качества**

Текущее распределение: opus для architect-reviewer, sonnet для 4 агентов, haiku для documenter. Исследуйте:

- Какие модели (claude-4.6-opus, claude-4.5-sonnet, claude-4.5-haiku и т.д.) дают наилучший результат для каждой роли:
    - Test writing: глубина покрытия edge cases, качество assertion patterns
    - Implementation: корректность минимальной реализации, следование test intent
    - Refactoring: качество структурных улучшений без behaviour changes
    - Code review: глубина обнаружения проблем (type safety, security, clean code)
    - Architecture review: точность интеграционного анализа, quality of Full Task Review
    - Documentation: полнота и точность описания implementation details
- Extended thinking capabilities: когда и для каких фаз использование extended thinking даёт значимый прирост качества
- Dynamic model selection: стратегии выбора модели на основе сложности конкретной задачи (complexity score из task-master)
- Token budget allocation: оптимальное распределение контекстного окна между system prompt, task context и working memory для каждого агента
- Model-specific prompt optimization: различия в prompt engineering для opus vs sonnet vs haiku

**11. Адаптация под Cursor IDE**

Текущий шаблон проектировался для Claude Code CLI, но используется также в Cursor IDE. Исследуйте:

- Различия в архитектуре агентов: Claude Code CLI subagents (`.claude/agents/`) vs Cursor Agent mode
- Портируемость `.claude/` конфигурации: какие элементы работают в Cursor нативно, какие требуют адаптации
- Cursor rules (`.cursor/rules/`) как дополнение или замена `.claude/agents/` — когда использовать какой механизм
- MCP серверы в Cursor: интеграция task-master-ai и других MCP через Cursor settings
- Cursor-специфичные возможности для TDD workflow:
    - Background agents для параллельного выполнения независимых фаз
    - Subagents в Cursor Agent mode (`.cursor/agents/`) vs Claude Code subagents (`.claude/agents/`)
    - Multi-file editing capabilities
    - Agent skills в Cursor (`.cursor/skills/`) vs Claude Code skills (`.claude/skills/`)
    - Hooks в Cursor vs Claude Code — различия в lifecycle events
- Оптимальная конфигурация для dual-use: один шаблон, работающий и в Claude Code CLI, и в Cursor IDE
- Cursor-специфичные MCP серверы (browser-use, chrome-devtools) для расширения возможностей TDD цикла


### Фокусные вопросы

**По архитектуре субагентов:**
1. Какие system prompt patterns дают максимальное качество для каждого из 6 TDD субагентов? Текущие промпты содержат 80-620 строк — это оптимально или можно улучшить структуру?
2. Стоит ли объединять CODE REVIEW (Phase 4) и ARCHITECTURE REVIEW (Phase 5) в одного агента, или разделение даёт лучшее качество? Какие есть данные/практики?
3. Какие verification mechanisms и self-correction patterns должны быть встроены в каждый субагент для повышения надёжности?

**По моделям и качеству:**
4. Какие модели дают максимальное качество для каждой из 6 ролей? Оправдано ли текущее распределение opus/sonnet/haiku?
5. Когда extended thinking даёт значимый прирост качества в TDD фазах? Для каких агентов его стоит включить?
6. Как оптимально распределить token budget между system prompt, task context и working memory для каждого агента?

**По оркестрации и Context Engineering:**
7. Как оптимизировать передачу контекста parent task через все 6 фаз TDD цикла? Текущий подход — передача через prompt delegation.
8. Какие artifacts и structured data должны передаваться между фазами для максимальной эффективности?
9. Как организовать parallel execution для независимых TDD задач (например, unit + integration тесты одновременно)?

**По Task Master интеграции:**
10. Какие patterns оркестрации parent task → subtask → TDD cycle наиболее эффективны?
11. Как оптимизировать Full Task Review на последнем subtask — сбор файлов, integration matrix, обнаружение gaps?

**По Cursor IDE:**
12. Как адаптировать `.claude/` конфигурацию для одновременной работы в Claude Code CLI и Cursor IDE?
13. Какие Cursor-специфичные возможности (background agents, rules, MCP) могут усилить TDD workflow?

**По Evaluation:**
14. Как измерять качество работы каждого субагента и итеративно улучшать их system prompts?

### Ожидаемый результат

Синтезированный отчёт с конкретными, actionable рекомендациями:

**1. Оптимизация каждого из 6 субагентов:**
- Конкретные рекомендации по улучшению system prompt каждого агента (что добавить, что убрать, что переструктурировать)
- Best practices с примерами реализации из найденных репозиториев
- Оптимизированные шаблоны system prompts или key sections для каждой роли

**2. Матрица "агент → оптимальная модель":**
- Рекомендация по модели для каждого из 6 агентов, обоснованная бенчмарками или практическим опытом
- Рекомендации по использованию extended thinking для конкретных фаз

**3. Архитектурные рекомендации:**
- Обоснованный анализ: стоит ли объединять/разделять текущие 6 фаз
- Communication protocols и handoff patterns между агентами
- Рекомендации по структуре передачи контекста через фазы

**4. Task Master оркестрация:**
- Оптимальные patterns для parent task → subtask → TDD cycle flow
- Рекомендации по улучшению Full Task Review и integration subtask creation

**5. Cursor IDE адаптация:**
- Конкретные паттерны для работы `.claude/` конфигурации в Cursor IDE
- Рекомендации по использованию Cursor-специфичных возможностей (rules, background agents, MCP)
- Стратегия dual-use: один шаблон для Claude Code CLI и Cursor

**6. Context Engineering:**
- Рекомендации по оптимальному размеру и структуре system prompt для субагентов
- Паттерны для context management в длительных TDD сессиях
- Стратегии memory и artifact management между сессиями

**7. Evaluation framework:**
- Eval criteria для каждого типа агента
- Metrics для измерения качества работы субагентов
- Iterative refinement strategies

**8. Implementation plan:**
- Приоритизированный список изменений (quick wins → structural improvements)
- Actionable план интеграции найденных практик в текущий шаблон


### Приоритетные источники

Сфокусируйтесь на материалах 2025-2026 года:

- Anthropic Engineering blog (effective harnesses, multi-agent systems, code execution with MCP, context engineering, agent skills)
- VoltAgent/awesome-claude-code-subagents (реальные примеры специализированных агентов)
- Актуальные практики из Claude Code documentation (subagents, hooks, skills, permissions)
- Community-driven patterns из awesome-claude-code
- TDD-specific agentic approaches из dev.to и Medium публикаций
- Cursor IDE documentation: rules, agent mode, MCP integration, background agents (https://docs.cursor.com/)
- Task Master AI documentation и best practices (https://github.com/eyaltoledano/claude-task-master)
- Claude model capabilities и benchmarks: сравнение качества моделей для coding tasks
- Context Engineering patterns: оптимальные размеры и структуры промптов для агентов[^1_16]

***

Этот prompt структурирован для глубокого анализа с фокусом на практическое применение. Он покрывает 11 направлений исследования: архитектуру субагентов, TDD-специфичные практики, Context Engineering, коммуникационные протоколы, tool permissions, Skills и Hooks, evaluation, real-world patterns, Task Master оркестрацию, стратегию выбора моделей и адаптацию под Cursor IDE.[^1_4][^1_6][^1_10][^1_2][^1_3][^1_5][^1_7][^1_1][^1_16][^1_17][^1_18][^1_19][^1_20][^1_22][^1_23][^1_24][^1_25][^1_26][^1_27][^1_28][^1_29][^1_30][^1_31]

[^1_1]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

[^1_2]: https://www.anthropic.com/engineering/multi-agent-research-system

[^1_3]: https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk

[^1_4]: https://code.claude.com/docs/en/sub-agents

[^1_5]: https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/

[^1_6]: https://sparkco.ai/blog/mastering-claude-agent-best-practices-for-2025

[^1_7]: https://www.cometapi.com/how-to-create-and-use-subagents-in-claude-code/

[^1_8]: https://www.anthropic.com/engineering/advanced-tool-use

[^1_9]: https://dev.to/alonoparag/building-with-ai-coding-agents-in-tandem-with-tdd-a-case-study-25ji

[^1_10]: https://www.linkedin.com/pulse/test-driven-agentic-development-how-tdd-can-enable-coding-monnette-2k80f

[^1_11]: https://www.anthropic.com/engineering/code-execution-with-mcp

[^1_12]: https://superprompt.com/blog/best-claude-code-agents-and-use-cases

[^1_13]: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

[^1_14]: https://apidog.com/blog/claude-code-cli-commands/

[^1_15]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents

[^1_16]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

[^1_17]: https://www.anthropic.com/engineering

[^1_18]: https://github.com/VoltAgent/voltagent/blob/main/README.md

[^1_19]: https://www.anthropic.com/engineering/claude-code-sandboxing

[^1_20]: https://www.anthropic.com/engineering/claude-think-tool

[^1_21]: https://github.com/VoltAgent/voltagent/blob/main/i18n/README-jp.md

[^1_22]: https://www.eesel.ai/blog/claude-code-subagents

[^1_23]: https://dev.to/necatiozmen/10-claude-code-subagents-every-developer-needs-in-2025-2ho

[^1_24]: https://mcpmarket.com/tools/skills/claude-code-workflow-optimizer

[^1_25]: https://www.reddit.com/r/ClaudeCode/comments/1mjg1m1/i_got_obsessed_with_making_ai_agents_follow_tdd/

[^1_26]: https://www.reddit.com/r/ClaudeAI/comments/1p1vy31/i_finally_found_a_claude_code_workflow_that/

[^1_27]: https://www.youtube.com/watch?v=dk0kn2evY38

[^1_28]: https://www.tdd-agent.vilosia.com

[^1_29]: https://docs.cursor.com/

[^1_30]: https://github.com/eyaltoledano/claude-task-master

[^1_31]: https://docs.cursor.com/context/rules
