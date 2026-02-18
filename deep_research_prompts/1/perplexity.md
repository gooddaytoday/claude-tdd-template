Оптимальная стратегия для твоего TDD‑harness’а — **сохранить 6‑фазную архитектуру, но сильно уплотнить промпты, ввести более строгие артефакты handoff между фазами, дать Opus/extended thinking ключевые роли (архитектура, сложные тесты, Full Task Review), а Sonnet/Haiku — быстрые циклы реализации, рефакторинга и документации, + поверх этого повесить явный eval‑контур по каждому агенту.**[^1][^2][^3][^4][^5][^6]

Ниже — структурированный отчёт и конкретные рекомендации по каждому блоку.

***

## 1. Оптимизация 6 TDD‑субагентов

### 1.1. Общие паттерны system prompt’ов

Anthropic в контекст‑инжиниринге подчёркивает, что **лучший контекст — это “минимальный набор высокосигнальных токенов”**, а system prompt должен быть на “правильной высоте”: не сверх‑детализированная «процедура», но и не размытая философия. Репозитории с крупными наборами субагентов (VoltAgent, awesome‑claude‑code‑subagents, supatest‑ai) показывают, что успешные агенты обычно укладываются в 1–3 экрана текста (~700–1 500 токенов), разделённых на чёткие секции и чек‑листы.[^2][^7][^8][^6][^9]

PubNub и официальная дока по subagents рекомендуют для каждого агента: 1 цель, 1 вход, 1 выход, 1 правило handoff + явное Definition of Done в конце промпта.[^4][^5]

**Рекомендации по структуре промпта для всех 6 агентов:**

- Верхний блок: 5–10 строк — роль, контекст (TDD‑цикл + Task Master), жёсткие запреты (например, не менять тесты вне tdd‑test‑writer).[^1][^2][^4]
- Блок “Когда вызываться”: 3–7 маркеров “Use this agent when…”, выровненных с фазой (RED/GREEN/REFACTOR/…).[^5][^4]
- Input/Output‑контракт: чётко описать, какие артефакты агент должен получить (task.description, testStrategy, modified files, previous‑phase notes) и что обязан вернуть (список файлов, статусы, summary).[^10][^11][^1]
- Чек‑лист Definition of Done (DoD) — 5–10 пунктов, которыми агент обязан пройтись перед завершением.[^4][^1]
- Раздел “Self‑check \& error recovery”: как агент перепроверяет себя и что делает при неуверенности/ошибках (вернуть тесты, запустить bash‑команду, запросить уточнение через Task MCP и т.п.).[^12][^3][^1]

При текущем размере 450–620 строк отдельные агенты явно выше «золотой зоны» по Anthropic — часть правил лучше вынести в Skills/CLAUDE.md/Task Master, а в system prompt оставить только “ядро”.[^13][^14][^2]

***

### 1.2. tdd‑test‑writer (RED)

**Цель:** спецификация‑как‑код + красный тест, максимально точно отражающий intent задачи.[^3][^1]

Лучшие практики TDD‑агентов и статьи о test‑driven agents подчёркивают, что тестирующий агент должен думать как “spec author”, а не как “помощник разработчика”, и всегда начинать с фиксации поведения, а не реализации.[^15][^3][^1]

**Что усилить в промпте:**

- Явно описать приоритеты:
    - максимальное покрытие критичных веток + edge‑cases для текущего subtask;
    - один новый failing тест как минимальный инкремент, но разрешить добавление нескольких тесно связанных тестов.[^3][^1]
- Жёстко запретить:
    - модификацию производственного кода;
    - ослабление или удаление существующих тестов;
    - “false green” (делать тесты тривиальными).[^14][^1]
- Добавить шаблон артефакта:
    - `tdd/test-plan.md` или JSON‑объект с перечнем кейсов (название, сценарий, ожидаемый результат, статус: planned/implemented).[^16][^1]
- Встроить self‑check:
    - прогнать `npm test`/`pytest` и убедиться, что хотя бы один новый тест **падает**, а существующие — зелёные; при зелёных новых тестах — пересмотреть assert’ы.[^12][^1]

***

### 1.3. tdd‑implementer (GREEN)

Anthropic в “Effective harnesses…” рекомендует требовать **инкрементальный прогресс по одной фиче, плюс “чистое состояние” в конце сессии (тесты зелёные, код в разумном виде для merge).**[^1]

**Рекомендации по промпту:**

- Ограничить зону ответственности: реализовать **ровно то поведение**, которое зафиксировано failing тестами и test‑plan для текущего subtask — без упреждающих фич.[^12][^1]
- DoD:
    - все новые тесты зелёные;
    - нет предупреждений линтеров/типизации (если есть соответствующие команды в bash);
    - обновлённый список modified files для Task Master и документации.[^17][^10][^1]
- Self‑verification:
    - запуск только минимально нужных команд (например, таргетные тест‑суиты), а не “всё подряд”, чтобы экономить время и токены;[^18][^16]
    - в случае повторных падений тестов — переключаться в режим “диагностика”, логируя причины в отдельный summary‑артефакт для refactorer/code‑reviewer.[^3][^1][^12]

***

### 1.4. tdd‑refactorer (REFACTOR)

Refactorer в TDD‑агентных workflow типично отвечает за **структурные улучшения без изменения поведения**, с постоянной опорой на тесты как оракул.[^4][^1][^3]

**Что закрепить:**

- Явное правило: “Если после рефакторинга тесты падают — первым делом откатиться (git/редактирование), затем попытаться локализовать проблему и только потом снова рефакторить.”[^18][^1]
- Чек‑лист изменений:
    - улучшение читаемости и модульности;
    - удаление дублирующегося кода;
    - соблюдение стиля/архитектурных guardrails (например, слоистая архитектура, запреты на кросс‑слойные зависимости).[^8][^6][^4]
- Ограничить инструменты:
    - никаких изменений в `tests/**` (и это уже обеспечивается твоим Guard hook’ом, что отлично сочетается с best practices sandboxing/permissions).[^19][^20][^4]

***

### 1.5. tdd‑code‑reviewer (CODE REVIEW)

Материалы про subagents и лучшие практики подчёркивают пользу отдельного **“качество кода / QA”‑агента**, который не пишет код, а только анализирует и формирует actionable feedback.[^6][^8][^4]

**Промпт‑паттерны:**

- Ориентировать на **минимальный набор высокоценностных замечаний**: безопасность, инварианты домена, нарушения архитектурных правил, очевидные performance‑проблемы.[^15][^8]
- Ввести структуру вывода:
    - Critical/Major/Minor категории;
    - для каждого issue: краткое описание, пример кода, рекомендуемое изменение, можно ли авто‑исправить через tdd‑implementer/tdd‑refactorer.[^8][^4]
- Self‑check:
    - убедиться, что рекомендации **не противоречат тестам** и не требуют ослабления тестовых утверждений.[^1][^3]

***

### 1.6. tdd‑architect‑reviewer (ARCHITECTURE REVIEW)

Anthropic в статьях про multi‑agent системы и long‑running harnesses описывает пользу отдельного “ведущего архитектора/координатора”, который опирается на сжатые артефакты субагентов и делает интеграционный анализ.[^21][^2][^1]

**Рекомендации:**

- Свести system prompt к:
    - роли: интеграционный архитектор поверх Task Master task graph;
    - входам: список subtasks, их `details` (modified files, ADR/decisions, testStrategy), текущее состояние тестов;
    - целям: обнаружить orphaned code, нарушенные инварианты модульных границ, несовместимые решения.[^11][^10][^1]
- Full Task Review:
    - агент должен собирать файлы *не напрямую* по glob, а через структурированные списки из Task Master (см. ниже про артефакты между фазами).[^10][^11]
- Self‑verification:
    - проверять свои выводы против реальных тест‑результатов и, по возможности, запускать лёгкие smoke‑тесты/интеграционные сценарии (через bash/MCP) перед тем как создавать integration subtask.[^16][^18][^1]

***

### 1.7. tdd‑documenter (DOCUMENTATION)

Agent Skills и community‑агенты показывают, что documenter эффективнее, когда он думает как “док‑инженер” (docs‑as‑code, структурированные знания), а не как генератор длинного текста.[^22][^13][^16][^8]

**Что улучшить:**

- Структурировать вывод:
    - краткий summary subtask’а;
    - список Modified Files с кратким описанием каждой правки;
    - Architectural Decisions (ADR‑стиль: context, decision, consequences);
    - TDD notes: какой тест был добавлен/обновлён, какие инварианты он проверяет.[^17][^11][^10][^1]
- Чётко разделить:
    - что пишется в Task Master `details`;
    - что добавляется в модульные CLAUDE.md (архитектурные гайды по папкам).[^11][^10]
- Убрать из system prompt любую “обучающую” часть, которая дублирует CLAUDE.md — вместо этого ссылаться: “прочитай соответствующий модульный CLAUDE.md, если он есть”. Это как раз паттерн прогрессивного раскрытия в Skills.[^13][^16]

***

## 2. CODE REVIEW vs ARCHITECTURE REVIEW: разделять или объединять?

PubNub, superprompt и multi‑agent research от Anthropic рекомендуют **явно разделять роли “качество конкретного куска кода” и “системная архитектура/интеграция”**.[^21][^15][^8][^4]

Аргументы в пользу разделения:

- Разное “масштабирование внимания”: code‑reviewer смотрит на паттерны внутри файла/модуля, architect‑reviewer — на связи между модулями, границы bounded contexts и соответствие решению задачам из Task Master.[^2][^21][^15]
- Разный контекст: архитектурному агенту нужен сжатый обзор множества subtasks и файлов; code‑reviewеру — локальный diff и тесты.[^2][^21][^3]
- Разные критерии успеха: у code‑reviewer — отсутствие багов, стиля и smell’ов; у архитектурного — отсутствие “архитектурного долга”, излишних связей и orphaned code.[^8][^4]

При этом multi‑agent research подчёркивает цену лишних handoff’ов и сложность координации — иногда один более мощный агент с extended thinking даёт лучшую стоимость/качество.[^21][^18]

**Рекомендация для твоего случая:**

- **Оставить 2 агента**, но:
    - сделать code‑reviewer более “локальным” (файл/дифф + тесты + локальный CLAUDE.md), с компактным промптом;
    - сделать architect‑reviewer более “агрегирующим”, использовать Opus+extended thinking и оперировать только структурированными артефактами (task graph, lists of modified files, ADR).[^10][^2][^21][^1]

***

## 3. Verification \& self‑correction в каждом агенте

Практика Anthropic и блог по evals подчёркивают, что **“агент, который умеет проверять свою работу, надёжнее по определению”**.[^12][^3][^1]

**По фазам:**

- Test‑writer:
    - всегда убеждается, что новый тест действительно падает и проверяет правильную вещь (не тривиальный assert);
    - при подозрении на “ложный зелёный” тест — усиливает assert или разбивает тест на более атомарные.[^3][^1]
- Implementer:
    - помимо запуска тестов, может иметь маленький built‑in check‑лист: инварианты доменной модели, отсутствие логики в view и т.п. (с привязкой к CLAUDE.md/архитектурным правилам).[^15][^8]
- Refactorer:
    - сначала запускает тесты, затем выполняет рефакторинг, затем **снова** тесты; при падении — откат + сохранение диагностической заметки для architect/code‑reviewer (pattern из long‑running harness: закрывать каждый шаг “clean state”).[^18][^1]
- Code‑reviewer:
    - прогоняет “ментальный симулятор”: как предложенные изменения ломают или усиливают текущие тесты; явно помечает предложения, которые требуют изменения тестов, и отдаёт такие задачи обратно в TDD‑цикл.[^4][^3]
- Architect‑reviewer:
    - верифицирует свои выводы против интеграционных/енд‑ту‑енд тестов (или хотя бы smoke‑suite) и визуально проверяет матрицу “subtask → files → tests”.[^11][^21][^1]
- Documenter:
    - сверяет документацию с фактическими файлами и тестами (например, по assert‑сообщениям), чтобы избежать рассинхрона; этот паттерн рекомендуется в коллекциях субагентов, где есть documentation‑engineer.[^22][^8]

***

## 4. Матрица “агент → оптимальная модель”

Task Master уже демонстрирует паттерн “основная модель + research‑модель (более мощная) + fallback”, и даёт SWE‑оценки для Sonnet/Opus (Sonnet ~0.727, Opus ~0.725 в их конфигурации), что указывает на схожую raw‑coding‑способность при разных затратах/стоимости. Anthropic и community‑репозитории описывают Opus как оптимальный для сложных, многоконтекстных задач и Sonnet как сбалансированную рабочую лошадку; лёгкие модели используются для быстрых, менее критичных задач.[^17][^22][^15][^8]

**Рекомендованная матрица (исходя из твоего TDD‑цикла):**


| Агент | Основная модель | Extended thinking | Обоснование |
| :-- | :-- | :-- | :-- |
| tdd‑test‑writer | Sonnet (иногда Opus для сложных доменов) | Включать опционально для сложных интеграционных/property‑based сценариев | Требуется тонкое понимание требований и edge‑cases, но контекст локален (текущий модуль + task/testStrategy). Sonnet даёт отличное покрытие при нормальной цене, Opus нужен лишь для очень сложных доменных задач.[^1][^12][^17] |
| tdd‑implementer | Sonnet | Обычно не нужен | Основная работа — локальная реализация, где важнее точность и следование тестам, чем глобальное рассуждение. Extended thinking редко окупается.[^12][^16] |
| tdd‑refactorer | Sonnet | Включать только для крупных рефакторингов | Рефакторинг по месту с опорой на тесты — типичная задача для Sonnet. Extended thinking полезен, когда меняются целые подсистемы.[^1][^18][^8] |
| tdd‑code‑reviewer | Sonnet | Опционально для security/complex performance review | Классический code review в стиле “senior dev” большинству проектов достаточно Sonnet; extended thinking полезен для глубокого анализа безопасности/производительности.[^15][^8][^4] |
| tdd‑architect‑reviewer | Opus | **Рекомендовано включать** для Full Task Review и сложных интеграций | Здесь больше всего выигрыша от мощной модели и extended thinking: нужно интегрировать множество subtasks, анализировать архитектуру, обнаруживать орфанные куски и планировать integration subtasks.[^1][^21][^2] |
| tdd‑documenter | Лёгкая модель (Haiku/аналог) + при необходимости Sonnet | Обычно не нужен | Документация опирается на уже принятые решения и артефакты. Лёгкая модель достаточно хорошо справляется, особенно при хорошей структуре артефактов. В редких случаях можно переключать на Sonnet для сложных ADR.[^13][^16][^8] |

Extended thinking Anthropic рекомендует включать именно там, где ценность глубокой, глобальной дедукции выше, чем время/стоимость — архитектурные решения, сложные планировщики, многошаговые рассуждения и критичные проверки.[^23][^18][^3]

**Token budget:**

- Системный промпт: целиться в ~15–25 % окна модели, с высокой информационной плотностью и минимумом повторов.[^14][^2]
- Task‑контекст (описание задачи, testStrategy, history subtasks): ещё ~25–35 %, но в сжатом виде (summary по паттерну compaction).[^2][^21][^1]
- Рабочая память (последние tool‑outputs, локальные файлы): остальное.[^16][^2]

***

## 5. Оркестрация и контекст через 6 TDD‑фаз

Anthropic для long‑running агентов рекомендует двухшаговый подход: **initializer агент**, который подготавливает окружение (init‑скрипты, файл прогресса, feature‑list как спецификацию), и **coding агент**, который делает инкрементальную работу и обновляет артефакты. В твоём случае роль initializer распределена между Task Master и документатором/архитектором.[^1]

**Оптимизация передачи parent task контекста:**

- Задать **единый “task‑state schema”** в Task Master `details`:
    - `modifiedFiles`: список файлов с фазой и subtaskId;
    - `tests`: какие тесты добавлены/изменены;
    - `decisions`: ADR‑объекты (id, context, decision, rationale);
    - `integrationRisks`: список потенциальных зазоров, выявленных архитектурным агентом.[^10][^11][^1]
- Каждая фаза:
    - читает это состояние в начале (через MCP/CLI);
    - обновляет только свои поля в конце (строго по схеме, чтобы архитектурный агент и documenter могли агрегировать).[^16][^17][^10]

**Артефакты и структурированные данные между фазами:**

- Между RED и GREEN:
    - test‑plan (список кейсов + статусы) + failing test names.[^3][^1]
- Между GREEN и REFACTOR:
    - diff или список затронутых модулей + базовые метрики сложности.[^18][^8]
- Между REFACTOR и CODE REVIEW:
    - краткое описание сделанных структурных изменений, чтобы reviewer не тратил контекст на реконструирование.[^2][^4]
- Между CODE REVIEW и ARCHITECTURE REVIEW:
    - список критичных замечаний, особенно связанных с архитектурой, для агрегации на уровне системы.[^21][^4]
- Между ARCHITECTURE REVIEW и DOCUMENTATION:
    - integration matrix (task → subtasks → files → tests) + список integration subtasks, если они созданы.[^11][^10][^1]

**Параллельное исполнение независимых задач:**

Multi‑agent research и недавний кейс “компилятор C с командой параллельных Claude’ов” показывают, что **параллельные субагенты дают крупный выигрыш там, где подзадачи действительно независимы**, особенно в breadth‑first сценариях.[^21][^18]

Для TDD:

- Параллелить:
    - разные feature‑subtasks одного parent task, если они не касаются одних и тех же модулей;
    - разные типы тестов (unit vs e2e), но с жёстким gate на merge через общий тестовый прогон.[^1][^21]
- Серилизовать:
    - всё, что меняет архитектурные границы, схему данных, контракты API.[^8][^4]

***

## 6. Task Master: parent task → subtask → TDD цикл

Task Master уже реализует много рекомендованных паттернов: task graph, complexity analysis, поля `testStrategy`, расширяемый `details`, и поддерживает Cursor/Claude Code через MCP.[^24][^25][^17][^10]

**Рекомендованные паттерны:**

- Complexity‑driven decomposition:
    - использовать встроенный `analyze-complexity` Task Master, чтобы автоматически определять количество subtasks и тип работ (feature, refactor, integration).[^17][^10]
    - на основе complexity score выбирать модель (Opus vs Sonnet) и включать/выключать extended thinking, как выше.[^17][^3]
- Поток:
    - parent task → автоматический сплит на subtasks с заполненным `testStrategy` и ожидаемыми артефактами (tests, docs, ADR);
    - для feature‑subtasks: auto‑trigger `Skill(tdd-integration)` (что ты уже делаешь через hook), для bug/docs — обход TDD.[^26][^10][^17]
- Full Task Review:
    - архитектор при последнем subtask’е собирает из всех `details`:
        - объединённый список modified files;
        - объединённый список tests/decisions;
    - строит integration matrix и проверяет:
        - есть ли файлы без явного покрытия тестами;
        - есть ли subtasks, которые модифицировали один и тот же модуль с противоречивыми решениями.[^10][^11][^1]
- Orphaned code:
    - если обнаружены файлы, не привязанные к ни одному subtask’у или к ни одному тесту — автоматически создаётся integration subtask через Task Master MCP.[^16][^10]

***

## 7. Dual‑use для Claude Code CLI и Cursor IDE

Cursor Rules и AGENTS.md дают Cursor собственный слой контекста, аналогичный `.claude/agents`, но с другим жизненным циклом. Task Master и MCP уже оптимизированы под Cursor.[^25][^27][^28][^29][^24][^10]

**Ключевые моменты:**

- Портируемость `.claude/`:
    - `.claude/agents/` и `.claude/skills/` нативно понимает Claude Code, но Cursor предпочитает `.cursor/rules/` и AGENTS.md как источник постоянных инструкций.[^27][^5]
    - Практика Nvidia NeMo и Cursor docs: держать “правду” в обычной документации, а Rules/AGENTS.md — как тонкую выжимку под агентов.[^28][^27]
- Рекомендуемая структура для dual‑use:
    - оставить `.claude/agents/` и `.claude/skills/` как primary source для Claude Code;
    - добавить:
        - `AGENTS.md` в корень с обзором твоего TDD‑harness’а, ролями агентов и ключевыми командами Task Master;[^30][^27]
        - `.cursor/rules/tdd-harness.mdc` с коротким описанием: “при фичах используй TDD‑цикл через Task Master + subagents, не редактируй тесты руками и т.д.”;[^27][^28]
        - при необходимости `.cursor/agents/` с зеркальными агентами (test‑writer, implementer, …), встроенными в Cursor Agent mode, но с упрощёнными промптами, которые отсылают к `.claude/agents/`/CLAUDE.md как источнику деталей.[^31][^27]
- MCP в Cursor:
    - использовать те же Task Master MCP‑конфиги в `.cursor/mcp.json`, что и для Claude Code/desktop, как описано в Task Master README и fork’ах.[^25][^10]

**Cursor‑специфичные усиления TDD‑workflow:**

- Background/parallel agents:
    - запускать документирующего/архитектурного агента в фоне для предыдущих subtasks, пока ты/Claude работаешь над следующим subtask’ом (паттерн параллельных агентов для независимых веток).[^31][^18][^21]
- Rules как “минимальный слой”:
    - всё, что сейчас зашито в огромные system prompts субагентов, частично вынести в `.cursor/rules` (архитектурные принципы, конвенции TDD, правила работы с Task Master); на стороне агента оставлять только роль‑специфичные инструкции.[^28][^27][^2]

***

## 8. Context Engineering и размер промптов

Статья Anthropic по context engineering прямо предупреждает об опасности “контекстного разложения”, когда слишком большие prompts и история снижают точность моделей; ключевой принцип — **“самый маленький набор высокосигнальных токенов”**. Коллекции субагентов и best‑practice статьи (PubNub, superprompt, VoltAgent) показывают, что успешные агенты используют:[^7][^2]

- чёткие заголовки и списки;
- разделение инструкций, примеров и ограничений;
- использование отдельных файлов‑примеров/форм (forms.md) в Skills для прогрессивной подгрузки, вместо вшивания примеров прямо в system prompt.[^23][^6][^13][^4]

**Рекомендации для твоих субагентов:**

- Целиться в ~700–1 500 токенов system prompt для большинства агентов (test‑writer, implementer, refactorer, reviewer, documenter), и ~1 500–2 500 токенов для architect‑reviewer при использовании Opus.[^14][^2][^21]
- Вынести:
    - философию TDD и общие принципы в корневой CLAUDE.md и `.cursor/rules`;
    - детальные чек‑листы и форматы отчётов — в Skill‑файлы (например, `.claude/skills/tdd-integration/forms.md`), которые подгружаются “по требованию” (паттерн progressive disclosure в Skills).[^13][^14][^16]
- Использовать “just‑in‑time контекст”:
    - вместо того чтобы всегда класть в контекст все Task Master детали, позволять агенту через MCP/CLI запросить нужный subtask или список файлов, как это делает Claude Code с glob/grep.[^13][^2][^16]
- Компакция и заметки:
    - по аналогии с `claude-progress.txt` Anthropic: завести один или несколько файлов (`tdd-progress.json`, `architecture-notes.md`) и периодически сжимать туда историю сессий, чтобы не тащить всё в контекст.[^2][^1]

***

## 9. Evaluation framework и continuous improvement

Anthropic в “Demystifying evals for AI agents” рекомендует строить eval‑фреймворк как набор **реалистичных задач + автоматическая проверка качества выполнения**. Для твоих субагентов это отлично ложится на TDD.[^3]

**Критерии по агентам:**

- Test‑writer:
    - покрытие сценариев (доля известных edge‑cases, отражённых в тестах);
    - частота “ложно зелёных” тестов (тесты, не ловящие реальные регрессии).[^1][^3]
- Implementer:
    - доля задач, решённых без дополнительных правок после code review;
    - среднее число итераций “тесты красные → правка → зелёные”.[^12][^3]
- Refactorer:
    - частота регрессий после рефакторинга;
    - изменение метрик сложности/coupling на модуль.[^18][^8]
- Code‑reviewer:
    - доля реально полезных замечаний (по пост‑фактум оценке);
    - сколько багов/антипаттернов он ловит vs внешний ground truth.[^15][^3]
- Architect‑reviewer:
    - количество найденных integration‑gaps и orphaned code;
    - доля архитектурных проблем, предотвращённых до продакшена.[^21][^1]
- Documenter:
    - согласованность документации с кодом и тестами (например, через периодические проверки/определённый eval‑набор).[^22][^13]

**Паттерны улучшения:**

- Логировать в Task Master:
    - outcome по каждой фазе (успешно/ошибка/требовалась ручная коррекция);
    - ключевые сбои (непонятный промпт, неверная модель, нехватка контекста).[^24][^10][^3]
- Периодически запускать batch‑eval:
    - набор задач (репрезентативный для твоего стека), прогоняемых через весь TDD‑цикл;
    - сравнение конфигураций агентов/моделей A/B (например, Sonnet vs Opus на architect‑reviewer).[^15][^17][^3]
- Интегрировать выводы обратно в Skills:
    - по рекомендациям Agent Skills: фиксировать “успешные подходы” и “типичные ошибки” прямо в Skill‑файлах, а не только в промптах.[^13][^16]

***

## 10. План внедрения (quick wins → структурные изменения)

**Быстрые выигрыши (можно сделать сразу):**

1. Для каждого агента:
    - дописать явный DoD‑чек‑лист и секцию Self‑check в конец system prompt (без увеличения объёма, выкинув дубли).[^4][^12]
2. Для architect‑reviewer:
    - переключить на Opus + extended thinking для Full Task Review и интеграционных задач.[^18][^17][^21]
3. В Task Master:
    - стандартизировать структуру `details` (modifiedFiles/tests/decisions), и заставить tdd‑documenter и архитектора строго следовать ей.[^11][^10]

**Среднесрочные изменения:**

4. Переразбить длинные системные промпты:
    - вынести общие TDD/архитектурные принципы в CLAUDE.md + `.cursor/rules`;
    - перевести часть подробных форматов в Skill‑файлы для прогрессивной подгрузки.[^27][^14][^13][^2]
5. Встроить артефакты:
    - test‑plan, tdd‑progress, architecture‑notes как отдельные файлы, обновляемые соответствующими агентами.[^16][^1]
6. Настроить параллельное выполнение:
    - позволить Task Master выдавать несколько subtasks параллельно по независимым модулям с TDD‑циклом на каждый.[^10][^21][^18]

**Структурные улучшения (долгосрочно):**

7. Внедрить eval‑фреймворк:
    - создать набор типовых задач + автоматический runner, который прогоняет твой 6‑фазный TDD‑цикл и собирает метрики.[^15][^3]
8. Довести dual‑use до единого шаблона:
    - собрать “AGENTS/TDD‑HARNESS.md” (или AGENTS.md) с описанием субагентов, TDD‑цикла и Task Master интеграции как центральный артефакт для любой IDE (Claude Code, Cursor, Windsurf).[^30][^25][^22]
9. Пересмотреть permissions:
    - на основе sandboxing best practices ещё раз пройтись по tool‑permissions для субагентов, гарантируя минимум доступов (особенно Bash) и отсутствие capability drift.[^20][^19][^4]

Если хочешь, можно дальше пройтись по каждому твоему конкретному файлу (конфигам агентов/скиллов/hook’ам) и на основе этих рекомендаций составить patch‑план: диффы для `.claude/agents/*.md`, Skill‑файлов и Task Master команд.
<span style="display:none">[^32][^33][^34][^35][^36][^37][^38][^39][^40][^41][^42][^43][^44][^45][^46][^47][^48][^49][^50]</span>

<div align="center">⁂</div>

[^1]: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents

[^2]: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents

[^3]: https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents

[^4]: https://www.pubnub.com/blog/best-practices-for-claude-code-sub-agents/

[^5]: https://code.claude.com/docs/en/sub-agents

[^6]: https://github.com/VoltAgent/awesome-claude-code-subagents

[^7]: https://howaiworks.ai/blog/anthropic-context-engineering-for-agents

[^8]: https://superprompt.com/blog/best-claude-code-agents-and-use-cases

[^9]: https://github.com/supatest-ai/awesome-claude-code-sub-agents

[^10]: https://github.com/eyaltoledano/claude-task-master/blob/main/README-task-master.md

[^11]: https://github.com/eyaltoledano/claude-task-master/blob/main/docs/task-structure.md

[^12]: https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk

[^13]: https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills

[^14]: https://sparkco.ai/blog/mastering-claude-agent-best-practices-for-2025

[^15]: https://www.anthropic.com/engineering/building-effective-agents

[^16]: https://www.anthropic.com/engineering/code-execution-with-mcp

[^17]: https://github.com/eyaltoledano/claude-task-master/blob/main/docs/examples/claude-code-usage.md

[^18]: https://www.anthropic.com/engineering/building-c-compiler

[^19]: https://www.anthropic.com/engineering/claude-code-sandboxing

[^20]: https://www.youtube.com/watch?v=nkJXADeI62c

[^21]: https://www.anthropic.com/engineering/multi-agent-research-system

[^22]: https://github.com/rahulvrane/awesome-claude-agents

[^23]: https://wmedia.es/en/writing/claude-code-subagents-guide-ai

[^24]: https://github.com/eyaltoledano/claude-task-master/blob/main/README.md

[^25]: https://github.com/eighty9nine/task-master

[^26]: https://www.youtube.com/watch?v=s0Mx6gsWcTM

[^27]: https://docs.cursor.com/en/context/rules

[^28]: https://docs.nvidia.com/nemo/agent-toolkit/1.2/extend/cursor-rules-developer-guide.html

[^29]: https://cursor.com/docs/context/rules

[^30]: https://github.com/microsoft/ai-agents-for-beginners/issues/357

[^31]: https://cursor.com/docs

[^32]: https://www.anthropic.com/engineering

[^33]: https://www.anthropic.com/engineering/writing-tools-for-agents

[^34]: https://www.anthropic.com/engineering/advanced-tool-use

[^35]: https://joshuaberkowitz.us/blog/news-1/anthropic-shows-us-how-to-master-context-engineering-to-build-smarter-ai-agents-1353

[^36]: https://www.linkedin.com/posts/anthropicresearch_effective-harnesses-for-long-running-agents-activity-7399550329031180288-xR_w

[^37]: https://www.linkedin.com/posts/prithvi72_effective-harnesses-for-long-running-agents-activity-7399569533772144640-ZULs

[^38]: https://www.linkedin.com/posts/simonhodgkins_effective-harnesses-for-long-running-agents-activity-7399564157299314688-bDRy

[^39]: https://www.linkedin.com/posts/rakeshgohel01_effective-context-engineering-for-ai-agents-activity-7379133268954157057-YYhT

[^40]: https://github.com/VoltAgent/voltagent

[^41]: https://github.com/eyaltoledano/claude-task-master/releases

[^42]: https://github.com/eyaltoledano/claude-task-master/issues

[^43]: https://github.com/eyaltoledano/claude-task-master/blob/main/docs/tutorial.md

[^44]: https://github.com/eyaltoledano

[^45]: https://github.com/eyaltoledano/claude-task-master/issues/963

[^46]: https://github.com/eyaltoledano/claude-task-master/activity

[^47]: https://dev.to/necatiozmen/your-top-10-claude-code-subagents-for-instant-productivity-4nh3

[^48]: https://dev.to/voltagent/100-claude-code-subagent-collection-1eb0

[^49]: https://forum.cursor.com/t/consensus-on-using-actual-cursor-rules-vs-docs-folder/149507

[^50]: https://github.com/eyaltoledano/claude-task-master/milestone/15
