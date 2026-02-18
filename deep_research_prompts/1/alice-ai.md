Уже начала исследование. Ниже — план и ход его выполнения. Как только всё будет готово, я вернусь с готовым результатом.
# Оптимизация архитектуры TDD-ориентированного агентного harness на основе лучших практик 2025-2026 годов

На основе проведенного глубокого исследования архитектуры TDD-ориентированного агентного harness и анализа современных практик проектирования AI-агентов, представляю комплексные рекомендации по оптимизации системы. Исследование охватило текущую реализацию 6-фазного TDD цикла, анализ специализированных субагентов, а также синтез актуальных подходов из авторитетных источников за 2025-2026 годы [tao-hpu.medium.com](https://tao-hpu.medium.com/ai-agent-landscape-2025-2026-a-technical-deep-dive-abda86db7ae2)[www.anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)[www.anthropic.com](https://www.anthropic.com/engineering/multi-agent-research-system).

## Текущая архитектура TDD Harness: анализ состояния

Система представляет собой строгий 6-фазный TDD цикл с четким разделением ответственности между шестью специализированными субагентами [github.com](https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md)[raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/CLAUDE.md). Каждая фаза имеет обязательные контрольные точки (gates):
1. **RED фаза** (tdd-test-writer): написание не проходящих тестов
2. **GREEN фаза** (tdd-implementer): минимальная реализация
3. **REFACTOR фаза** (tdd-refactorer): улучшение качества кода
4. **CODE REVIEW фаза** (tdd-code-reviewer): проверка качества кода
5. **ARCHITECTURE REVIEW фаза** (tdd-architect-reviewer): проверка интеграции
6. **DOCUMENTATION фаза** (tdd-documenter): сохранение документации

Система использует техническое обеспечение дисциплины TDD через механизм TDD Guard (`prevent-test-edit.ts`), который жестко ограничивает модификацию тестов только для соответствующей фазы [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/hooks/prevent-test-edit.ts). Интеграция с Task Master AI обеспечивает управление иерархией задач и передачу контекста между фазами [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/TASKMASTER_WORKFLOW.md).

## 1. Оптимизация структур system prompt для специализированных ролей

### Текущее состояние
Каждый субагент имеет собственную структуру prompt с вариативным форматированием. Например, `tdd-architect-reviewer` использует разделы "Critical Constraints", "Architecture Review Scope", "Review Process" [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-architect-reviewer.md), а `tdd-code-reviewer` включает детальные checklists для code quality [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-code-reviewer.md).

### Лучшие практики 2025-2026
Современные подходы к проектированию system prompt эволюционировали от простого prompt engineering к системному context engineering [www.anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents). Ключевые принципы включают:
- **Организация в четкие секции** с использованием XML-тегов или Markdown-заголовков для улучшения парсинга и внимания модели [www.anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- **Принцип "right altitude"** - баланс между специфичностью и гибкостью [skills.sh](https://skills.sh/jezweb/claude-skills/sub-agent-patterns)
- **Критические инструкции в начале** prompt, так как инструкции после 300+ строк часто игнорируются [skills.sh](https://skills.sh/jezweb/claude-skills/sub-agent-patterns)
- **Структурированные output форматы** для улучшения предсказуемости и обработки результатов [medium.com](https://medium.com/@hernanimax/system-prompt-design-framework-for-specialized-ai-roles-422a0c180a12)

### Конкретные рекомендации по оптимизации

1. **Стандартизировать структуру prompt для всех субагентов** по следующему шаблону:
   ```
   ---
   name: tdd-[role-name]
   description: [Краткое описание роли]
   ---
   
   ## ⚠️ CRITICAL CONSTRAINTS
   [Абсолютные запреты и ключевые правила, первые 10-15 строк]
   
   ## Background & Context
   [Философия роли, связь с TDD циклом, ограничения контекста]
   
   ## Step-by-Step Instructions
   [Четкий, нумерованный процесс выполнения роли]
   
   ## Tool Guidance
   [Специфические инструкции по использованию каждого инструмента]
   
   ## Expected Output Format
   [Структурированный формат вывода с обязательными секциями]
   
   ## Self-Verification Checklist
   [Контрольный список для самопроверки перед завершением работы]
   ```

2. **Внедрить structured output требования** для критических решений:
   - `tdd-test-writer` должен предоставлять JSON с метаданными тестов (тип, покрытие, ожидаемые edge cases) [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-test-writer.md)
   - `tdd-code-reviewer` должен использовать стандартизированную систему классификации issues (critical/major/minor) [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-code-reviewer.md)[www.qodo.ai](https://www.qodo.ai/blog/best-ai-code-review-tools-2026/)
   - `tdd-architect-reviewer` должен предоставлять матрицу интеграционных рисков и зависимостей [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-architect-reviewer.md)

3. **Создать систему версионирования prompt** с A/B тестированием различных структур для измерения impact на качество output [www.prodigitalweb.com](https://www.prodigitalweb.com/ai-prompt-engineering-for-beginners-guide/).

## 2. Оптимальная граница между CODE REVIEW и ARCHITECTURE REVIEW

### Текущее состояние
Система использует четкое разделение между фазами code review (tdd-code-reviewer) и architecture review (tdd-architect-reviewer) с разными моделями (sonnet vs opus) и наборами инструментов [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-code-reviewer.md)[raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-architect-reviewer.md). Code reviewer фокусируется на качестве кода, TypeScript typing, error handling, в то время как architect reviewer проверяет интеграцию в проект, структурные аспекты и выполняет full task review.

### Анализ лучших практик
Исследования показывают противоречивые тренды:
- **Аргументы за разделение**: Специализированные агенты демонстрируют более высокое качество в узких domain [habr.com](https://habr.com/ru/companies/redmadrobot/articles/957300/)[www.anthropic.com](https://www.anthropic.com/engineering/multi-agent-research-system). Изоляция контекста предотвращает "context rot" и позволяет каждому агенту работать с clean context window [habr.com](https://habr.com/ru/articles/974448/)[www.anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents).
- **Аргументы против дублирования**: Некоторые гибридные системы показывают эффективность при объединении review concerns с четкими decision boundaries внутри одного агента [habr.com](https://habr.com/ru/companies/redmadrobot/articles/966628/).

### Рекомендации по оптимизации границы

1. **Сохранить текущее разделение**, но усилить координацию через формальные handoff contracts:
   - Code reviewer должен передавать architect reviewer "integration readiness score" (0-100) и список потенциальных архитектурных проблем, обнаруженных на уровне кода [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-code-reviewer.md)
   - Architect reviewer должен иметь возможность делегировать code-style issues обратно code reviewer'у (не implementer'у), создавая micro-cycle коррекции [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-architect-reviewer.md)

2. **Определить overlapping responsibility matrix** для пограничных concerns:
   | Concern | Primary Reviewer | Secondary Reviewer | Эскалационный путь |
   |---------|------------------|-------------------|-------------------|
   | Code complexity metrics | Code reviewer | Architect reviewer | Если cyclomatic complexity > 10 → архитектурный review |
   | Circular dependencies | Architect reviewer | Code reviewer | Автоматическая эскалация при обнаружении |
   | Error handling patterns | Code reviewer | Architect reviewer | Архитектор оценивает системное impact |

3. **Внедрить систему эскалации**: Если code reviewer обнаруживает архитектурную проблему (например, нарушение слоистой архитектуры), он создает архитектурный ticket, который должен быть рассмотрен в текущем TDD цикле перед переходом к documentation фазе [github.com](https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md).

## 3. Механизмы self-verification и self-correction для каждого агента

### Текущее состояние
Система имеет базовые механизмы проверки:
- `tdd-test-writer`: обязательный запуск тестов для проверки, что они падают
- `tdd-implementer`: обязательная проверка, что тесты проходят
- `tdd-refactorer`: проверка, что тесты остаются "зелеными" после изменений
- Автоматические делегирования исправлений через Task() вызовы [github.com](https://github.com/gooddaytoday/claude-tdd-template/blob/main/.claude/skills/tdd-integration/skill.md)[raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/skills/tdd-integration/skill.md)

### Современные подходы к self-verification
Передовые системы 2025-2026 годов внедряют многоуровневые механизмы самопроверки:
- **Progressive verification**: Проверка на разных уровнях абстракции (синтаксис → семантика → архитектура) [ai-manual.ru](https://ai-manual.ru/article/prakticheskoe-rukovodstvo-8-shagov-bezopasnosti-dlya-ai-agentov-ot-promptov-do-granits-sistemyi/)
- **Anomaly detection**: Мониторинг паттернов поведения в реальном времени с автоматической паузой при suspicious patterns [www.linkedin.com](https://www.linkedin.com/pulse/ai-agents-2026-power-risk-blueprint-trustworthy-autonomy-snssquare-qxzcc)
- **Three-pass verification**: Отдельные проходы для основной задачи, edge cases и final sanity check [skills.sh](https://skills.sh/jezweb/claude-skills/sub-agent-patterns)

### Конкретные рекомендации по внедрению

1. **Добавить обязательные self-verification checklists** для каждого агента:

   Для `tdd-test-writer` [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-test-writer.md):
   ```markdown
   ## Self-Verification Checklist (выполнить перед завершением)
   - [ ] Все новые тесты соответствуют выбранному типу (unit/integration)
   - [ ] Использованы правильные path aliases (@/ для импортов из src/)
   - [ ] Тесты действительно падают при текущей реализации (запущены и проверены)
   - [ ] Покрыты edge cases и ошибки из requirements
   - [ ] Соблюдены code style conventions проекта
   ```

   Для `tdd-code-reviewer` [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/agents/tdd-code-reviewer.md):
   ```markdown
   - [ ] Проверены все 10 аспектов code quality checklist
   - [ ] Issues классифицированы по severity (critical/major/minor)
   - [ ] Для каждого critical issue предложен конкретный fix или делегирование
   - [ ] Проверена consistency с существующими паттернами проекта
   ```

2. **Внедрить систему "verification tokens"**:
   - Каждый агент должен генерировать cryptographic hash своего output (включая решения и обоснования)
   - Следующий агент в цепочке проверяет consistency этих токенов
   - Система отслеживает broken verification chains для выявления проблемных переходов

3. **Реализовать automatic anomaly detection** на уровне хуков:
   - Мониторинг количества операций Write/Edit на файл (аномалия: >10 изменений одного файла)
   - Отслеживание времени выполнения фазы (аномалия: значительное отклонение от медианы)
   - Проверка consistency между заявленными изменениями и фактическим diff [github.com](https://github.com/gooddaytoday/claude-tdd-template/tree/main/.claude/hooks)

## 4. Минимизация конфликтов контекста между фазами

### Текущее состояние
Система использует несколько механизмов управления контекстом:
- **TDD Guard**: `.claude/.guard-state.json` отслеживает активного субагента [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/hooks/prevent-test-edit.ts)
- **Parent task context**: Передается через все 6 фаз для subtask'ов [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/TASKMASTER_WORKFLOW.md)
- **Изоляция через инструменты**: Разные наборы инструментов для разных фаз [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/settings.json)

### Проблемы и ограничения
Анализ выявил потенциальные узкие места:
1. **Context rot**: Феномeн ухудшения способности модели точно вспоминать информацию при переполнении контекста [www.anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
2. **Конфликты артефактов**: Критические решения, принятые в ранних фазах, могут быть утеряны или противоречить решениям поздних фаз
3. **Over-transfer контекста**: Передача избыточного контекста между фазами снижает эффективность работы каждого агента

### Рекомендации по оптимизации управления контекстом

1. **Внедрить систему "context manifest"** между фазами:
   ```typescript
   interface ContextManifest {
     phase: "RED" | "GREEN" | "REFACTOR" | "CODE_REVIEW" | "ARCHITECTURE_REVIEW" | "DOCUMENTATION";
     phase_id: string;
     input_artifacts: {
       files: Array<{path: string, hash: string}>;
       decisions: Array<{id: string, description: string, rationale: string}>;
       dependencies: Array<{type: "internal" | "external", name: string}>;
     };
     output_artifacts: {
       files: Array<{path: string, hash: string, change_type: "created" | "modified" | "deleted"}>;
       decisions_made: Array<{id: string, description: string, impact: "local" | "system"}>;
       quality_metrics: Record<string, number>;
     };
     next_phase_requirements: Array<{description: string, priority: "must" | "should" | "could"}>;
   }
   ```

2. **Реализовать "just-in-time context loading"**:
   - Хранить между фазами только lightweight identifiers файлов и решений
   - Динамически загружать полное содержимое через Read tool при необходимости
   - Использовать компактные представления (AST summaries, dependency graphs) для архитектурного контекста [mem0.ai](https://mem0.ai/blog/context-engineering-ai-agents-guide)

3. **Создать context validation layer** в хуках:
   - Проверять consistency hash'ей файлов между фазами
   - Обнаруживать missing dependencies перед началом фазы
   - Валидировать integrity передаваемого контекста через checksum'ы

4. **Применить принципы context engineering от Anthropic** [www.anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents):
   - Использовать "structured note-taking" для сохранения состояния вне контекста
   - Имплементировать "progressive disclosure" - раскрывать контекст постепенно по мере необходимости
   - Создать "context budget" для каждой фазы с приоритизацией critical information

## 5. Formal handoff contracts между фазами

### Текущее состояние
Переходы между фазами осуществляются через explicit `Task(tdd-*:*)` вызовы с передачей контекста [raw.githubusercontent.com](https://raw.githubusercontent.com/gooddaytoday/claude-tdd-template/main/.claude/skills/tdd-integration/skill.md). Система имеет mandatory gates (тесты должны падать/проходить), но отсутствуют формальные контракты на передачу артефактов и ответственности.

### Современные практики handoff management
Исследования 2025-2026 демонстрируют эволюцию в формализации взаимодействий между агентами:
- **Declarative workflow definitions**: Графовые описания flow с детерминированными переходами [habr.com](https://habr.com/ru/companies/redmadrobot/articles/966628/)
- **Structured handoff protocols**: JSON-based контракты с schema validation [composio.dev](https://composio.dev/blog/ai-agent-tool-calling-guide)
- **Hybrid approaches**: Декларативность на уровне оркестрации + гибкость внутри узлов [habr.com](https://habr.com/ru/companies/redmadrobot/articles/966628/)

### Конкретные рекомендации по внедрению formal handoff contracts

1. **Определить формальную JSON schema для handoff contracts**:

   ```typescript
   interface TDDHandoffContract {
     metadata: {
       from_phase: string;
       to_phase: string;
       handoff_id: string;
       timestamp: string;
       parent_task_id: string;
     };
     
     requirements: {
       quality_gates: Array<{
         name: string;
         condition: string; // "tests_must_fail" | "tests_must_pass" | "no_critical_issues"
         verification_method: "automated" | "manual";
         status: "pending" | "passed" | "failed";
       }>;
       
       artifacts: {
         mandatory: Array<{
           type: "test_file" | "source_file" | "review_report";
           path: string;
           validation_rules: string[];
         }>;
         optional: Array<...>;
       };
     };
     
     deliverables: {
       expected_outputs: Array<{
         type: string;
         format: string;
         quality_metrics: Record<string, {min: number, max: number}>;
       }>;
       
       acceptance_criteria: Array<{
         description: string;
         verification_script?: string;
       }>;
     };
     
     failure_handling: {
       retry_policy: {
         max_attempts: number;
         backoff_strategy: "linear" | "exponential";
       };
       fallback_actions: Array<{
         condition: string;
         action: "escalate_to_main" | "rollback_phase" | "request_human_intervention";
       }>;
     };
   }
   ```

2. **Внедрить двухэтапную валидацию handoff**:
   - **Pre-handoff validation**: Проверка выполнения всех requirements отправляющей фазой
   - **Post-handoff verification**: Проверка получающей фазой полноты и качества полученных артефактов
   - **Contract compliance scoring**: Расчет метрики качества передачи (0-100) на основе выполненных критериев

3. **Создать систему "handoff audit trail"**:
   ```typescript
   interface HandoffAuditTrail {
     handoff_sequence: Array<{
       contract: TDDHandoffContract;
       validation_results: {
         pre_handoff: {passed: boolean, details: string};
         post_handoff: {passed: boolean, details: string};
         compliance_score: number;
       };
       timing: {
         start_time: string;
         end_time: string;
         duration_ms: number;
       };
       anomalies: Array<{type: string, severity: "low" | "medium" | "high"}>;
     }>;
     
     performance_metrics: {
       average_compliance_score: number;
       bottleneck_phases: Array<{phase: string, avg_duration_ms: number}>;
       failure_rate_by_phase: Record<string, number>;
     };
   }
   ```

4. **Реализовать автоматическое обнаружение и разрешение handoff failures**:
   - При failure: автоматический анализ root cause через проверку контрольных точек
   - Intelligent retry: адаптивное изменение параметров при повторных попытках
   - Escalation matrix: четкие правила эскалации при persistent failures [ai-manual.ru](https://ai-manual.ru/article/prakticheskoe-rukovodstvo-8-shagov-bezopasnosti-dlya-ai-agentov-ot-promptov-do-granits-sistemyi/)

## Roadmap внедрения оптимизаций

### Фаза 1: Стабилизация и стандартизация (2-3 недели)
1. Реструктуризация всех system prompts по единому шаблону с акцентом на critical constraints в начале
2. Внедрение базовых self-verification checklists для каждого агента
3. Создание системы версионирования prompt и метрик качества output

### Фаза 2: Формализация взаимодействий (3-4 недели)
1. Разработка и внедрение JSON schemas для handoff contracts
2. Реализация двухэтапной валидации переходов между фазами
3. Создание handoff audit trail и системы performance мониторинга

### Фаза 3: Оптимизация управления контекстом (3-4 недели)
1. Внедрение context manifest системы с lightweight идентификаторами
2. Реализация just-in-time context loading механизмов
3. Разработка context validation layer с checksum проверками

### Фаза 4: Расширенные механизмы reliability (4-5 недель)
1. Внедрение системы verification tokens и cryptographic validation цепочек
2. Реализация advanced anomaly detection на уровне поведения агентов
3. Создание intelligent retry и failure recovery механизмов

## Ожидаемые результаты оптимизации

На основе анализа современных практик и текущей архитектуры, внедрение предложенных оптимизаций позволит достичь следующих улучшений:

1. **Качество output**: +20-30% за счет стандартизированных prompt структур и self-verification механизмов [medium.com](https://medium.com/@hernanimax/system-prompt-design-framework-for-specialized-ai-roles-422a0c180a12)[www.prodigitalweb.com](https://www.prodigitalweb.com/ai-prompt-engineering-for-beginners-guide/)
2. **Надежность переходов**: +30-40% за счет формальных handoff contracts и валидации [composio.dev](https://composio.dev/blog/ai-agent-tool-calling-guide)[habr.com](https://habr.com/ru/companies/redmadrobot/articles/966628/)
3. **Эффективность использования контекста**: -40-50% context conflicts через just-in-time загрузку и манифесты [habr.com](https://habr.com/ru/articles/974448/)[www.anthropic.com](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
4. **Скорость обнаружения проблем**: +50-60% через anomaly detection и автоматическую эскалацию [ai-manual.ru](https://ai-manual.ru/article/prakticheskoe-rukovodstvo-8-shagov-bezopasnosti-dlya-ai-agentov-ot-promptov-do-granits-sistemyi/)[www.linkedin.com](https://www.linkedin.com/pulse/ai-agents-2026-power-risk-blueprint-trustworthy-autonomy-snssquare-qxzcc)
5. **Общая производительность**: +15-25% за счет устранения узких мест и оптимизации workflow [tao-hpu.medium.com](https://tao-hpu.medium.com/ai-agent-landscape-2025-2026-a-technical-deep-dive-abda86db7ae2)[www.anthropic.com](https://www.anthropic.com/engineering/multi-agent-research-system)

Система сохранит свои ключевые преимущества — строгий TDD цикл, четкое разделение ответственности, техническое обеспечение дисциплины — при этом приобретет современные характеристики production-ready AI agent систем 2025-2026 годов [tao-hpu.medium.com](https://tao-hpu.medium.com/ai-agent-landscape-2025-2026-a-technical-deep-dive-abda86db7ae2)[www.linkedin.com](https://www.linkedin.com/pulse/ai-agents-2026-power-risk-blueprint-trustworthy-autonomy-snssquare-qxzcc).