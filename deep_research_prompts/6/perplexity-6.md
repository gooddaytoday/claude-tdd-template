<img src="https://r2cdn.perplexity.ai/pplx-full-logo-primary-dark%402x.png" style="height:64px;margin-right:32px"/>

# \# Deep Research Prompt 06: Skills и Hooks интеграция

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
| :-- | :-- | :-- | :-- |
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
- При вызове Write/Edit/MultiEdit — проверяет, модифицируется ли файл в `tests/**`
- При вызове Bash — перехватывает shell-команды записи в tests/ (cp, mv, sed -i, echo >, tee)
- Разрешает модификацию тестов ТОЛЬКО для `tdd-test-writer` и `main` агента
- GREEN/REFACTOR/CODE REVIEW/ARCHITECTURE/DOCUMENTATION фазы — тесты read-only
- При SubagentStop — сбрасывает state обратно в `main`
- Fail-closed: неизвестное/устаревшее состояние (TTL 2 часа) = deny
- Детектирует семантическое отключение тестов (.skip/.only/xdescribe/if(false))
- Защищает enforcement файлы (.claude/hooks, .claude/skills, .claude/settings.json) во время TDD циклов

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
| :-- | :-- |
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

- [https://github.com/VoltAgent/voltagent](https://github.com/VoltAgent/voltagent)
- [https://github.com/code-yeongyu/oh-my-opencode](https://github.com/code-yeongyu/oh-my-opencode)
- [https://github.com/obra/superpowers](https://github.com/obra/superpowers)
- [https://github.com/VoltAgent/awesome-claude-code-subagents](https://github.com/VoltAgent/awesome-claude-code-subagents)
- [https://github.com/hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- [https://github.com/lodetomasi/agents-claude-code](https://github.com/lodetomasi/agents-claude-code)
- [https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering](https://github.com/muratcankoylan/Agent-Skills-for-Context-Engineering)
- [https://github.com/wshobson/agents](https://github.com/wshobson/agents)


## Приоритетные источники

- Anthropic Engineering: [https://www.anthropic.com/engineering/](https://www.anthropic.com/engineering/)
- Effective harnesses for long-running agents: [https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)
- Multi-agent research systems: [https://www.anthropic.com/engineering/multi-agent-research-system](https://www.anthropic.com/engineering/multi-agent-research-system)
- Building agents with Claude Agent SDK: [https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk)
- Building effective agents: [https://www.anthropic.com/engineering/building-effective-agents](https://www.anthropic.com/engineering/building-effective-agents)
- Effective context engineering: [https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Advanced tool use: [https://www.anthropic.com/engineering/advanced-tool-use](https://www.anthropic.com/engineering/advanced-tool-use)
- Code execution with MCP: [https://www.anthropic.com/engineering/code-execution-with-mcp](https://www.anthropic.com/engineering/code-execution-with-mcp)
- Equipping agents with Agent Skills: [https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- Demystifying evals for AI agents: [https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- Claude Think tool: [https://www.anthropic.com/engineering/claude-think-tool](https://www.anthropic.com/engineering/claude-think-tool)
- Claude Code sandboxing: [https://www.anthropic.com/engineering/claude-code-sandboxing](https://www.anthropic.com/engineering/claude-code-sandboxing)
- Subagents docs: [https://code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)
- Best practices for Claude Code sub-agents: [https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/](https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/)
- Mastering Claude agent best practices: [https://sparkco.ai/blog/mastering-claude-agent-best-practices-for-2025](https://sparkco.ai/blog/mastering-claude-agent-best-practices-for-2025)
- How to create and use subagents: [https://www.cometapi.com/how-to-create-and-use-subagents-in-claude-code/](https://www.cometapi.com/how-to-create-and-use-subagents-in-claude-code/)
- Claude Code CLI commands: [https://apidog.com/blog/claude-code-cli-commands/](https://apidog.com/blog/claude-code-cli-commands/)
- Best Claude Code agents and use cases: [https://superprompt.com/blog/best-claude-code-agents-and-use-cases](https://superprompt.com/blog/best-claude-code-agents-and-use-cases)
- Awesome Claude Code: [https://github.com/hesreallyhim/awesome-claude-code](https://github.com/hesreallyhim/awesome-claude-code)
- VoltAgent: [https://github.com/VoltAgent/voltagent](https://github.com/VoltAgent/voltagent)
- Skills.sh: [https://skills.sh/](https://skills.sh/)
- Task Master AI: [https://github.com/eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master)
- Cursor docs: [https://docs.cursor.com/](https://docs.cursor.com/)
- Cursor rules: [https://docs.cursor.com/context/rules](https://docs.cursor.com/context/rules)


## Контекст исследования

Исследуйте и синтезируйте лучшие практики для оптимизации TDD-ориентированного agent harness. Система работает как в Claude Code CLI, так и в Cursor IDE. Текущий набор из 6 субагентов оркестрируется через TDD Integration Skill и Task Master AI. Цель — максимальное качество каждого компонента harness согласно актуальным практикам 2025-2026.

## Основное направление исследования

Интеграция skills/hooks/commands:

- шаблоны skill-композиций для многофазных workflows
- slash command pipelines для ускорения цикла


## Ссылки по теме направления

- [https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
- [https://apidog.com/blog/claude-code-cli-commands/](https://apidog.com/blog/claude-code-cli-commands/)
- [https://code.claude.com/docs/en/sub-agents](https://code.claude.com/docs/en/sub-agents)


## Важные фокусные вопросы для подисследования

1. Как структурировать `tdd-integration` skill, чтобы упростить поддержку и расширение?
2. Какие reusable templates для skills и slash commands дают лучший прирост скорости?
3. Как организовать безопасную автоактивацию skill по пользовательскому запросу?

Главный вектор оптимизации: превратить `tdd-integration` в тонкий оркестратор поверх набора более мелких skills и slash‑pipeline’ов, опираясь на progressive disclosure, явную модель фаз/состояний и минималистичные, безопасные hooks для автоактивации.  При этом TDD‑Guard остаётся источником истины по policy, а skill/commands лишь описывают workflow сверху.[^1][^2]

***

## Структура tdd-integration skill

1. **Разделить SKILL на «каркас» и фазовые модули.**
В `skill.md` оставить только: frontmatter (name, description, tags вроде `tdd`, `feature-flow`, `task-master`), «Когда вызывать» (типичные user‑запросы), high-level диаграмму 6 фаз и таблицу переходов состояний (RED → GREEN → …).  Детальные инструкции для каждой фазы вынести в отдельные файлы (`phase-red.md`, `phase-green.md`, `phase-refactor.md`, …) и подключать через progressive disclosure (явные ссылки и подсказки «прочитай файл X, если ты сейчас в фазе Y»).[^3][^4][^1]
2. **Явная модель состояния TDD‑цикла.**
Добавить в SKILL небольшой раздел «State machine», где текстом зафиксированы: допустимые состояния (`pre`, `red`, `green`, `refactor`, `review`, `arch-review`, `docs`), allowed transitions и «retry semantics» (что делать при фейле тестов, при major issue на code review и т.п.).  Это хорошо сочетается с уже существующим `.guard-state.json`: SKILL оперирует логическим состоянием, hook обеспечивает фактическое enforcement.[^5][^2]
3. **Развести роли orchestration vs. исполнители.**
В `tdd-integration` явно описать, что:
    - сам skill отвечает только за выбор субагента, постановку подзадач (через Task Master) и контроль перехода между фазами;
    - ответственность за стиль кода/стратегию тестирования/рефакторинг делегируется в `.claude/agents/tdd-*.md` и вспомогательные reference‑файлы (`detect-test-type.md` и т.п.).[^6][^5]
Это упрощает поддержку: изменения в фазовых инструкциях не требуют редактировать основной orchestration‑skill.

***

## Reusable skill-шаблоны для многофазных workflows

1. **Шаблон «multi-phase skill» (обобщение текущего TDD).**
На основе рекомендаций по Agent Skills стоит выделить generic‑skill‑паттерн: frontmatter с `phases`, `entry_phase`, `phase_goals`, `allowed_tools_per_phase`, а сам текст — это рецепт маршрутизации и чтения под-мануалов.  TDD‑интеграция тогда конкретизирует этот шаблон (6 фаз, свои агенты, свои guards), но сама структура пригодится для других workflows (например, CI‑setup, миграции БД, сложные refactor‑кампании).[^7][^4][^1]
2. **Шаблон «bridge-to-Task‑Master».**
По аналогии с готовыми шаблонами и template‑репами для Claude Code, имеет смысл вынести в отдельный skill краткое описание контрактов с Task Master AI: как выглядят parent/subtasks, какие команды `.claude/commands/tm/*` являются «стабильным API», каким образом передавать контекст в каждую фазу.  Тогда `tdd-integration` будет использовать этот bridge‑skill, а не напрямую вшивать знания о всех 48+ командах.[^8][^9][^7]
3. **Шаблон «guarded‑editing» как переиспользуемый паттерн.**
Сейчас TDD‑Guard реализован как отдельный hook, но смысл паттерна — «строгий read‑only на тесты и конфиг во всех фазах, кроме специализированных».  Имеет смысл описать этот паттерн в отдельном skill (концептуально: какие директории защищены, кто имеет право писать, как реагировать на попытку обхода), а сам hook оставить тонким техническим воплощением. Это облегчит перенос в другие проекты/репозитории.[^10][^6]

***

## Slash command pipelines для ускорения цикла

1. **Композиционные команды‑пайплайны вместо одного «толстого» TDD‑команда.**
Практика продвинутых шаблонов для Claude Code показывает, что несколько маленьких команд с чётким назначением часто удобнее, чем один монолитный workflow.  Для TDD‑harness это могут быть команды уровня:[^9][^11][^12]
    - `/tdd:feature` — запустить полный 6‑фазный цикл c автоопределением типа тестов и созданием subtask в Task Master;
    - `/tdd:red-green` — только первые две фазы (быстрый цикл для небольшой доработки);
    - `/tdd:refactor+review` — запустить только REFACTOR → CODE REVIEW над уже существующим кодом.
2. **Frontmatter‑аргументы как декларативный конфиг пайплайна.**
В slash‑команде через frontmatter (`argument-hint`, `allowed-tools`) можно описать параметры: тип задачи (feature/bugfix/spike), область кода (paths/globs), приоритет тестов (unit/integration/e2e).  Внутри markdown‑команды — минимальная процедура: вызвать Task(TDD Integration) с нужными аргументами, записать контекст в Task Master, при необходимости — явно подсказать использовать конкретные субагенты.[^11][^13][^14]
3. **Паттерн «project vs global commands».**
Для TDD‑команд, сильно завязанных на Task Master и Guard, лучше держать их в `.claude/commands/tdd-*` внутри репозитория, чтобы они версионировались вместе с кодом и были одинаковыми для всей команды.  Если захочется вынести общий TDD‑workflow на уровень личного окружения (вне этого репо), тогда он должен лишь вызывать project‑scoped команды текущего проекта, а не дублировать их логику.[^12][^11]

***

## Безопасная автоактивация skill по пользовательскому запросу

1. **Auto‑eval как очень тонкий router, а не «мини‑агент».**
Лучшие практики Skills и hooks подчёркивают, что логика приема решений об активации должна быть простой, проверяемой и легко аудируемой: чёткий список триггерных паттернов, fail‑closed, отсутствие сложной логики по файловой системе.  Имеет смысл:[^2][^1][^7]
    - держать в `user-prompt-skill-eval` только распознавание намерения (`implement / add feature / build / create` vs `bugfix/docs/config`) + проверку контекста проекта;
    - любые эвристики по коду (например, поиск orphaned code) оставлять внутри `tdd-architect-reviewer` и Task Master‑skill.
2. **Явный allow‑/deny‑лист фраз для авто-TDD.**
Чтобы не превратить автоактивацию в «частые ложные срабатывания», полезно завести внутри hook’а «словарь» фраз, для которых TDD‑skill **не** должен запускаться (например, запросы на чистый рефакторинг без изменения функционала, локальные эксперименты в песочнице, системные операции с Git).  И наоборот — список устойчивых шаблонов для включения TDD (добавить endpoint, новый доменный объект, интеграцию с внешним API).[^15][^2]
3. **Учёт разных сред: Claude Code CLI vs Cursor.**
Поскольку Skills — кроссплатформенный механизм (Claude Code, Agent SDK и др.), архитектурно полезно, чтобы `tdd-integration` не предполагал конкретный UI, а ориентировался только на: наличие Task Master MCP, Guard и доступных tools.  В Cursor IDE основную «магическую» часть (например, какие prompts подмешиваются в Rules) лучше зафиксировать как отдельный документ‑правило, а Skill оставить в том же формате, чтобы его без изменений можно было использовать в CLI.[^14][^1]
4. **Observability для автоактивации.**
По мотивам рекомендаций по long‑running harnesses, стоит явно логировать в Task Master каждый запуск TDD‑skill с указанием: исходного текста запроса пользователя, причины триггера (какое правило сработало), ID parent‑task.  Это упростит последующую отладку auto‑eval и позволит делать «ретро» на срабатываниях.[^2][^7]

***

## Что имеет смысл доработать в репозитории

1. **Рефакторинг `tdd-integration/skill.md` в сторону «тонкого» orchestration‑файла.**
Вынести фазовые плейбуки и advanced‑эвристики в отдельные файлы, оставить в SKILL только: метаданные, high‑level flow, таблицу фаз/агентов/allowed tools, ссылки на под‑manual’ы и bridge‑skill к Task Master.[^1][^5]
2. **Ввести обобщённый multi-phase‑skill шаблон и использовать его для TDD.**
Описать этот шаблон в отдельном SKILL как best practice и использовать его затем не только для TDD, но и для других сложных workflows (onboarding нового сервиса, миграция схемы БД, сложные интеграции).[^9][^7][^1]
3. **Добавить набор мелких slash‑pipeline’ов для типичных сценариев разработки.**
Минимальный набор: `/tdd:feature`, `/tdd:red-green`, `/tdd:refactor+review`, `/tdd:full-review` (для финального subtask).  Каждая команда должна быть тонкой оболочкой вокруг Task(TDD Integration) + Task Master‑команд, без дублирования логики Guard/skills.[^13][^11][^12]

Если понадобится, можно затем пройтись по самому репозиторию и предложить конкретный diff для `skill.md`, hook’ов и набора `/tdd:*` команд.
<span style="display:none">[^16][^17][^18][^19][^20][^21][^22][^23][^24][^25][^26][^27][^28]</span>

<div align="center">⁂</div>

[^1]: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

[^2]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

[^3]: https://joshuaberkowitz.us/blog/github-repos-8/teaching-ai-agents-real-world-skills-anthropic-s-revolutionary-skills-framework-1773

[^4]: https://www.linkedin.com/posts/kalyanksnlp_equipping-agents-for-the-real-world-with-activity-7384786367177920513-SU28

[^5]: https://github.com/ruvnet/claude-flow/wiki/CLAUDE-MD-TDD

[^6]: https://github.com/vanzan01/claude-code-sub-agent-collective

[^7]: https://github.com/davila7/claude-code-templates

[^8]: https://github.com/wshobson/agents

[^9]: https://github.com/myst10py/claude-code-template

[^10]: https://www.reddit.com/r/ClaudeAI/comments/1lzq1kp/tdd_with_claude_code_is_a_game_changer/

[^11]: https://github.com/artemgetmann/claude-slash-commands

[^12]: https://cloudartisan.com/posts/2025-04-14-claude-code-tips-slash-commands/

[^13]: https://www.producttalk.org/how-to-use-claude-code-features/

[^14]: https://code.claude.com/docs/en/slash-commands

[^15]: https://www.linkedin.com/posts/bijushoolapani_equipping-agents-for-the-real-world-with-activity-7386846691943129088-bMpx

[^16]: https://github.com/ruvnet/claude-flow/wiki/CLAUDE-MD-Templates

[^17]: https://www.anthropic.com/engineering/advanced-tool-use

[^18]: https://www.anthropic.com/engineering

[^19]: https://www.anthropic.com/engineering/claude-think-tool

[^20]: https://github.com/vijaythecoder/awesome-claude-agents

[^21]: https://github.com/supatest-ai/awesome-claude-code-sub-agents

[^22]: https://github.com/topics/claude-agents

[^23]: https://github.com/webdevtodayjason/sub-agents

[^24]: https://github.com/giorgeabdala/ai-agent-template-claudeai

[^25]: https://github.com/lodetomasi/agents-claude-code

[^26]: https://dev.to/s1infeb/equipping-agents-for-the-real-world-with-agent-skills-1kj1

[^27]: https://www.youtube.com/watch?v=52KBhQqqHuc

[^28]: https://www.linkedin.com/posts/anthropicresearch_equipping-agents-for-the-real-world-with-activity-7384662629363036160-4lQ9

