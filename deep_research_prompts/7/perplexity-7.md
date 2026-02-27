# Evaluation Framework и Continuous Improvement для TDD Agent Harness

## Executive Summary

Построение evaluation framework для 6-фазного TDD agent harness требует трёхуровневого подхода: role-specific метрики для каждого субагента, pipeline-level KPIs для end-to-end цикла, и инфраструктура для итеративного улучшения через A/B тестирование и регрессионный контроль. Anthropic рекомендует начинать с 20–50 задач из реальных сбоев, использовать комбинацию детерминированных и LLM-based graders, и строить eval-driven development (EDD) цикл, где каждое изменение промпта или конфигурации проходит через eval suite перед деплоем.[^1][^2]

Ключевой принцип: оценивать **результат** (outcome), а не путь (trajectory) — агенты регулярно находят валидные подходы, которые проектировщик не предвидел. Но trajectory-метрики незаменимы для диагностики: они показывают *почему* агент провалился, а не только *что* провалилось.[^3][^1]

***

## Role-Specific Метрики для 6 Субагентов

Каждая фаза TDD цикла имеет чётко определённую ответственность. Метрики должны отражать как качество выхода фазы, так и эффективность процесса. Anthropic подчёркивает: для coding-агентов детерминированные тесты (код проходит? тесты зелёные?) — это первая линия оценки, а LLM-rubric для качества кода — вторая.[^1]

### tdd-test-writer (Phase 1: RED)

| Метрика | Описание | Целевое значение | Grader |
|---------|----------|-------------------|--------|
| Failing Test Rate | % тестов, которые действительно fail на пустой реализации | 100% | Code-based: run tests |
| Mutation Score | Устойчивость тестов к мутациям кода (mutation testing) | ≥80%[^4] | Code-based: mutation runner |
| Test Relevance | Тесты покрывают заявленные acceptance criteria | ≥0.9 | LLM-judge rubric |
| Specification Clarity | Тест-кейсы читабельны как спецификация | ≥0.8 | LLM-judge rubric |
| Edge Case Coverage | Наличие edge cases и error scenarios | ≥3 edge cases / task | Code-based + LLM |
| Token Efficiency | Токены, потраченные на написание тестов | Downward trend | Transcript analysis |
| Code-to-Test Ratio | Соотношение тестового кода к финальной реализации | ~1:1[^5] | Code-based |

### tdd-implementer (Phase 2: GREEN)

| Метрика | Описание | Целевое значение | Grader |
|---------|----------|-------------------|--------|
| Tests Pass Rate | % тестов, проходящих после реализации | 100% | Code-based: test runner |
| Implementation Minimality | Отсутствие избыточного кода поверх тестов | High | LLM-judge: "minimal implementation" rubric |
| Time-to-Green | Время от начала фазы до прохождения тестов | Downward trend | Transcript timing |
| No Test Modifications | Тесты не были изменены (TDD Guard) | 0 violations | Code-based: git diff on tests/ |
| Build Success | Проект компилируется / lint-free | 100% | Code-based: lint + type check |
| Retry Count | Количество итераций до зелёного состояния | ≤3 | Transcript analysis |

### tdd-refactorer (Phase 3: REFACTOR)

| Метрика | Описание | Целевое значение | Grader |
|---------|----------|-------------------|--------|
| Tests Remain Green | Тесты остаются зелёными после рефакторинга | 100% | Code-based: test runner |
| Cyclomatic Complexity | Снижение или поддержание сложности | <10 per method[^4] | Static analysis |
| Code Duplication | % дублирования в реализации | <3%[^4] | Static analysis: jscpd/PMD |
| Improvement Delta | Измеримое улучшение vs Phase 2 | Positive | LLM-judge + static analysis diff |
| No Test Modifications | TDD Guard enforcement | 0 violations | Code-based |
| Dead Code Elimination | Удаление неиспользуемого кода | 0 unused exports | Static analysis: ts-prune |

### tdd-code-reviewer (Phase 4: CODE REVIEW)

| Метрика | Описание | Целевое значение | Grader |
|---------|----------|-------------------|--------|
| Critical Issues Found | Обнаружение реальных critical/major проблем | ≥1 on seeded bugs (capability eval) | Code-based: comparison with known issues |
| False Positive Rate | % ложных сообщений о проблемах | <10% | Human calibration |
| Coverage Breadth | Категории проверки: security, performance, style, correctness | ≥4 dimensions | LLM-judge rubric |
| Actionability | Рекомендации конкретны и исполнимы | ≥0.85 | LLM-judge rubric |
| Auto-fix Success | % issues, исправленных через auto-fix loop | ≥80% | Code-based: before/after test run |
| Review Consistency | Повторяемость выводов на одном и том же коде | pass^3 ≥ 70%[^1] | Multi-trial analysis |

### tdd-architect-reviewer (Phase 5: ARCHITECTURE REVIEW)

| Метрика | Описание | Целевое значение | Grader |
|---------|----------|-------------------|--------|
| Integration Validation | Код интегрируется в существующую архитектуру | Pass | Code-based: build + import checks |
| Orphaned Code Detection | Обнаружение неинтегрированного кода | 100% recall on known orphans | Code-based + LLM |
| Dependency Correctness | Зависимости соответствуют архитектурным границам | 0 violations | Static analysis: dependency-cruiser |
| Full Task Review Quality | Полнота ревью на финальном subtask | ≥0.85 | LLM-judge with checklist |
| Context Utilization | Использование parent task context | Evidence of task master reads | Transcript: tool_calls check |

### tdd-documenter (Phase 6: DOCUMENTATION)

| Метрика | Описание | Целевое значение | Grader |
|---------|----------|-------------------|--------|
| Task Master Update | Implementation details записаны в task-master | 100% | Code-based: API call verification |
| CLAUDE.md Update | Module documentation обновлена | When applicable | Code-based: file diff |
| Documentation Accuracy | Документация соответствует реализации | ≥0.9 | LLM-judge: cross-reference code vs docs |
| Completeness | Все ключевые решения задокументированы | ≥0.85 | LLM-judge rubric |
| Conciseness | Без избыточных деталей | Token count within budget | Code-based: word/token count |

***

## Pipeline-Level KPIs (End-to-End TDD Цикл)

Локальный успех фазы не гарантирует системный результат. Anthropic подчёркивает: multi-agent системы имеют эмерджентное поведение — малые изменения lead-агента непредсказуемо меняют поведение субагентов. Pipeline KPIs фиксируют здоровье всего цикла.[^1]

### Outcome Metrics (Что получилось)

| KPI | Формула | Целевое значение | Источник |
|-----|---------|-------------------|----------|
| **Task Success Rate (TSR)** | Задачи, прошедшие полный цикл без ручного вмешательства / Total tasks | ≥80%[^6] | End-state evaluation |
| **pass@1** | Вероятность успешного завершения с первой попытки | ≥70% | Multi-trial stats[^1] |
| **pass^3** | Вероятность 3 последовательных успехов | ≥50% | Multi-trial stats[^1] |
| **Code Quality Score** | Композитный: tests pass + static analysis + LLM rubric | ≥0.85 | Weighted grader ensemble |
| **Defect Escape Rate** | Баги, найденные после Phase 5 | <5% | Post-deployment tracking |

### Trajectory Metrics (Как получилось)

| KPI | Формула | Целевое значение | Источник |
|-----|---------|-------------------|----------|
| **Total Tokens per Task** | Суммарные токены по всем 6 фазам | Downward trend | Transcript analysis[^1] |
| **Total Tool Calls** | Количество вызовов инструментов за цикл | Monitor, not minimize | Transcript analysis |
| **Cycle Time** | Время от начала Phase 1 до конца Phase 6 | Downward trend | Timestamp analysis |
| **Gate Failure Rate** | % фаз, не прошедших gate с первой попытки | <20% per phase | Gate logs |
| **Retry Loops** | Количество auto-fix циклов (Phase 4 → implementer/refactorer) | ≤2 per task | Transcript analysis |
| **Plan Execution Efficiency (PEE)** | Actual steps / Optimal planned steps | ≤1.3[^6] | Trajectory comparison |

### System Health Metrics

| KPI | Описание | Целевое значение |
|-----|----------|-------------------|
| **TDD Guard Violations** | Попытки модификации тестов вне tdd-test-writer | 0[^1] |
| **Context Pollution Index** | Деградация качества при росте context window | Stable across compactions |
| **Flake Rate** | % нестабильных тестов в CI | <2%[^5] |
| **Auto-activation Accuracy** | Корректность user-prompt-skill-eval.ts | ≥95% (balanced precision/recall)[^1] |

***

## Baseline Benchmark: Создание и Поддержка

### Шаг 0: Golden Dataset

Anthropic рекомендует начинать с 20–50 задач из реальных use cases. Для TDD harness это означает:[^1]

1. **Seed Tasks** — 10–15 реальных feature-задач, ранее выполненных через harness (с сохранёнными transcripts)
2. **Edge Cases** — 5–10 задач со сложными паттернами: вложенные зависимости, async код, кросс-модульные интеграции
3. **Regression Seeds** — 5–10 задач из прошлых сбоев (bug где Phase 2 ломала код Phase 1, или Phase 4 пропустила critical issue)
4. **Adversarial Cases** — 3–5 задач с намеренно сложными условиями: неоднозначные требования, conflicting constraints

Формат хранения — JSON с чёткой структурой, как рекомендовано Anthropic (модели менее склонны искажать JSON по сравнению с Markdown):[^1]

```json
{
  "id": "feat-auth-bypass-01",
  "description": "Fix authentication bypass when password field is empty",
  "parent_task": "Implement auth module",
  "subtask_index": 3,
  "test_type": "unit",
  "acceptance": {
    "tests_must_fail_initially": true,
    "tests_must_pass_after_green": true,
    "no_test_modifications_in_green": true,
    "static_analysis_clean": true,
    "architecture_check": "no_orphaned_imports"
  },
  "reference_solution": "solutions/feat-auth-bypass-01/",
  "graders": ["deterministic_tests", "static_analysis", "llm_rubric"],
  "difficulty": "medium"
}
```

### Шаг 1: Baseline Run

Зафиксировать текущее состояние harness (все промпты, модели, permissions) и прогнать весь golden dataset 3 раза (для учёта non-determinism). Записать:[^1]

- pass@1, pass^3 по каждой задаче
- Агрегированные метрики по каждому субагенту
- Полные transcripts для будущей диагностики
- Token usage и timing per phase

### Шаг 2: Version Pinning

Eval-driven development требует version-pinning всех компонентов: dataset, prompt templates, model IDs, judge config, scoring rubrics. При регрессии через месяц можно воспроизвести точные условия предыдущего успешного run.[^2]

Рекомендуемая структура версионирования:

```
.claude/evals/
├── datasets/
│   ├── golden-v1.0.jsonl
│   └── golden-v1.1.jsonl
├── rubrics/
│   ├── test-writer-quality.md
│   ├── code-review-accuracy.md
│   └── implementation-minimality.md
├── results/
│   ├── baseline-2026-02-22.json
│   └── experiment-opus-refactorer-2026-02-25.json
└── config/
    ├── models.json
    └── thresholds.json
```

***

## A/B Тестирование Конфигураций Агентов

### Принципы Контролируемого Эксперимента

Исследования показывают, что вариации промптов могут давать разницу в производительности до 40%. Для изоляции эффекта необходимо менять только одну переменную за раз:[^7]

- **Промпт субагента** (например, более детальная инструкция для tdd-code-reviewer)
- **Модель субагента** (sonnet → opus для tdd-refactorer)
- **Tool set** (добавление/удаление инструмента)
- **Permission scope** (расширение bash permissions)
- **Gate threshold** (строгость gate проверки)

### Протокол A/B Эксперимента

```
1. HYPOTHESIS: "Переход tdd-refactorer на Opus улучшит Code Quality Score на ≥10%"
2. CONTROL: Текущая конфигурация (Sonnet для tdd-refactorer)
3. VARIANT: Только tdd-refactorer → Opus (все остальное идентично)
4. DATASET: Golden dataset v1.0 (зафиксирован)
5. TRIALS: N=3 прогона каждой конфигурации (min для раннего этапа)
6. METRICS: Code Quality Score, Cyclomatic Complexity delta, Token Usage, Cycle Time
7. ANALYSIS: Сравнение средних + стандартных отклонений
8. DECISION: Принять если качество ≥10% при допустимом росте cost/token
```

### Simulation-Based Pre-Testing

Перед запуском на полном golden dataset, валидировать на 3–5 seed задачах для быстрой проверки гипотезы. Это позволяет отсеять плохие варианты до вложения ресурсов в полный прогон.[^7]

### Документирование

Каждый эксперимент фиксируется с полной lineage:[^2]

```json
{
  "experiment_id": "exp-2026-02-25-opus-refactorer",
  "hypothesis": "Opus improves refactoring quality",
  "variant_description": "tdd-refactorer model: sonnet → opus",
  "dataset_version": "golden-v1.0",
  "control_results": {"code_quality": 0.82, "tokens": 45000, "cycle_time": "12m"},
  "variant_results": {"code_quality": 0.91, "tokens": 68000, "cycle_time": "18m"},
  "decision": "accept_with_caveat",
  "notes": "Quality +11%, but token cost +51%. Consider for complex tasks only."
}
```

### Предотвращение Искажений

Anthropic отмечает несколько anti-patterns в eval экспериментах:[^6][^1]

- **Score theater** — оптимизация промпта judge вместо промпта агента
- **Eval drift** — сравнение runs с разными версиями KB/codebase
- **One-number fetish** — маскировка slice failures за глобальными средними
- **Unbounded loops** — отсутствие step/time бюджетов, eval зависает

Для TDD harness специфично: убедиться, что golden dataset tasks не используют git history от предыдущих trial'ов (shared state bias).[^1]

***

## Автоматические Триггеры Prompt-Refinement

### Когда Запускать Итерацию

Eval-driven development определяет три типа триггеров:[^3][^2]

**1. Commit-Based (при изменении промптов/конфигурации)**
- Любое изменение в `.claude/agents/tdd-*.md` или `.claude/skills/tdd-integration/`
- Модификация hooks (`prevent-test-edit.ts`, `user-prompt-skill-eval.ts`)
- Обновление `settings.json` permissions
- → Запуск subset eval suite (5–10 задач) как CI gate

**2. Schedule-Based (периодический мониторинг drift)**
- Еженедельный прогон полного golden dataset
- Обнаружение деградации от невидимых изменений (обновление модели провайдером, изменение Task Master API)
- → Если метрика упала >5% от baseline → alert + investigation

**3. Event-Driven (по аномалиям)**
- Gate failure rate превысил порог (>30% за сессию)
- TDD Guard violations (любое количество > 0)
- Token usage аномально высокий (>2σ от среднего)
- User feedback: ручное вмешательство потребовалось >2 раз подряд
- → Автоматическая генерация диагностического отчёта + предложение prompt fix

### Self-Improvement Loop

Anthropic обнаружила, что Claude 4 модели являются отличными prompt engineers — при получении промпта и failure mode они диагностируют причину и предлагают улучшения, что привело к 40% снижению времени выполнения задач. Встраивание этого паттерна в harness:[^1]

```
1. Eval run обнаружил: tdd-test-writer fail rate на edge cases = 40%
2. Собрать 5 худших transcripts
3. Передать Opus-агенту: "Вот промпт tdd-test-writer и 5 failure transcripts.
   Диагностируй почему тесты не покрывают edge cases и предложи исправление промпта."
4. Opus генерирует variant prompt
5. A/B test: original vs variant на golden dataset
6. Если variant лучше → merge, обновить baseline
```

### Gate Logic для Auto-Refinement

```yaml
auto_refinement_triggers:
  immediate:
    - guard_violation: any  # TDD Guard breach
    - gate_failure_streak: 3  # 3 consecutive gate failures same phase
  
  weekly_check:
    - tsr_drop: ">5% vs baseline"
    - token_inflation: ">20% vs baseline"
    - new_flaky_tests: ">2%"
  
  on_commit:
    - paths: [".claude/agents/*", ".claude/skills/**", ".claude/hooks/*"]
    - action: "run subset eval (10 tasks)"
    - block_if: "any Layer-1 metric below threshold"
```

***

## Регрессионный Контроль Изменений Harness

### Capability vs Regression Evals

Anthropic чётко разделяет два типа:[^1]

- **Capability evals** — начинают с низкого pass rate, дают «холм для восхождения». Пример: "Может ли tdd-test-writer генерировать property-based тесты?" (текущий pass rate: 20%)
- **Regression evals** — должны иметь ~100% pass rate. Падение = что-то сломалось. Пример: "Все golden dataset задачи по-прежнему проходят полный цикл"

По мере улучшения capability evals с высоким pass rate «выпускаются» в regression suite. Задачи, которые раньше измеряли "можем ли мы это вообще?", теперь измеряют "можем ли мы это надёжно?".[^1]

### CI/CD Integration

```
PR с изменением .claude/ файлов
  │
  ├─ [Gate 1: Subset Eval] ─── 10 задач из golden dataset
  │   └─ Block if: TSR < 80% или любая Phase gate fail rate > 30%
  │
  ├─ [Gate 2: Full Regression] ─── Полный golden dataset (на merge в main)
  │   └─ Block if: Любая регрессия > 5% от baseline
  │
  └─ [Gate 3: Capability Check] ─── Capability eval suite
      └─ Report only (не блокирует), фиксирует прогресс
```

Eval gates должны блокировать деплой при падении метрик ниже порогов — это ключевой принцип EDD. Каждый прогон записывает полную lineage: dataset version, prompt version, model config, judge settings.[^2]

### Практический Workflow Регрессионного Тестирования

1. **Snapshot** — перед изменением зафиксировать baseline через `results/baseline-YYYY-MM-DD.json`
2. **Change** — внести модификацию (один diff за раз)
3. **Eval** — прогнать regression suite
4. **Compare** — side-by-side diff: какие задачи регрессировали и на сколько[^2]
5. **Decide** — если net positive и нет critical regressions → accept; иначе → revert или iterate
6. **Graduate** — если новый capability eval достиг стабильного >90% pass rate → перевести в regression suite[^1]

### Transcript Review

Anthropic инвестировала в tooling для просмотра eval transcripts и регулярно их читает. Для TDD harness критично:[^1]

- При fail — определить: агент ошибся или eval неправильно оценил валидное решение?
- Искать паттерны: одна фаза систематически проблемная? TDD Guard некорректно блокирует?
- Мониторить eval saturation: если regression suite на 100% — он отслеживает регрессии, но не даёт сигнала для улучшения[^1]

***

## Grader Architecture для TDD Harness

### Три Типа Graders

Anthropic рекомендует комбинировать три подхода:[^1]

| Тип | Применение в TDD Harness | Сильные стороны | Ограничения |
|-----|--------------------------|-----------------|-------------|
| **Code-based** | Test runner (pass/fail), static analysis (lint, type check, complexity), git diff (no test modifications), tool call verification | Быстрый, дешёвый, объективный, воспроизводимый[^1] | Хрупкий к валидным вариациям |
| **LLM-judge** | Test quality rubric, implementation minimality, code review accuracy, documentation completeness | Оценка субъективных измерений, гибкость | Требует калибровки, дороже[^3] |
| **Human** | Периодическая калибровка LLM judges, edge case аудит | Ловит то, что автоматика пропускает[^1] | Не масштабируется |

### LLM-Judge Calibration

LLM-as-judge graders должны регулярно калибоваться против human judgment:[^3][^2]

1. Собрать 50–100 representative outputs от каждого субагента
2. 2–3 эксперта независимо оценивают по rubric
3. Рассчитать Spearman correlation между human consensus и LLM judge
4. Целевое значение: ≥0.80[^3]
5. При drift (<0.75) — пересмотреть rubric prompt и recalibrate

Для снижения bias в LLM judges:[^3]
- Явные disclaimers: "Do not favor responses based on length"
- Multiple replications с фиксированными parameters
- Ensemble из 2–3 judges с majority vote
- Minority-veto для critical safety issues

### Пример Rubric для tdd-test-writer

```yaml
judge_prompt: |
  You are evaluating test code generated by a TDD test-writer agent.
  
  Rubric (score each 0-2):
  1) Specification Clarity: Are tests readable as a behavioral specification?
     0=cryptic, 1=understandable but verbose, 2=clear and concise
  2) Edge Case Coverage: Does the test suite cover boundary conditions?
     0=only happy path, 1=some edges, 2=comprehensive
  3) Assertion Quality: Are assertions specific and meaningful?
     0=trivial assertions, 1=reasonable, 2=precise and descriptive
  4) Independence: Tests don't depend on execution order or shared state?
     0=coupled, 1=mostly independent, 2=fully isolated
  
  Return JSON: {"clarity":int,"edges":int,"assertions":int,"independence":int,
                "total":float,"rationale":"..."}
```

***

## Холистическая Оценка: Сочетание Методов

Anthropic рекомендует комбинировать automated evals с другими методами для полной картины:[^1]

| Метод | Когда использовать | Частота |
|-------|-------------------|---------|
| Automated Evals | До каждого release, в CI/CD | Каждый commit в .claude/ |
| Production Monitoring | Post-launch drift detection | Непрерывно |
| A/B Testing | Значительные изменения конфигурации | По мере гипотез |
| Transcript Review | Диагностика failures, калибровка judges | Еженедельно |
| Human Evaluation | Калибровка LLM judges, edge case audit | Ежемесячно |

### Deployment Pipeline

Для TDD harness применима четырёхступенчатая модель:[^6]

1. **Pre-prod** — полный offline eval suite; должен пройти все gates
2. **Shadow** — параллельный прогон новой конфигурации на реальных задачах без применения результатов; сравнение дельт
3. **Canary** — 1–2 реальные задачи через новую конфигурацию; rollback при breach
4. **GA** — постепенный переход; мониторинг SLOs и safety sentinels

***

## Рекомендуемая Файловая Структура

```
.claude/evals/
├── datasets/
│   ├── golden-v1.0.jsonl          # Baseline golden dataset
│   ├── capability-property-tests.jsonl  # Capability eval: property-based tests
│   └── adversarial-v1.0.jsonl     # Edge cases, ambiguous requirements
├── rubrics/
│   ├── test-writer-quality.md     # LLM judge rubric
│   ├── implementation-minimality.md
│   ├── code-review-accuracy.md
│   ├── architecture-integration.md
│   └── documentation-completeness.md
├── graders/
│   ├── deterministic.ts           # Test runner, static analysis, git diff
│   ├── llm-judge.ts               # LLM-based rubric evaluation
│   └── composite.ts               # Weighted ensemble of graders
├── results/
│   ├── baseline-YYYY-MM-DD.json   # Pinned baseline
│   └── experiments/               # A/B test results
├── config/
│   ├── thresholds.json            # Gate thresholds per phase
│   ├── models.json                # Model versions for reproducibility
│   └── triggers.yaml              # Auto-refinement trigger rules
├── scripts/
│   ├── run-eval.ts                # Eval runner orchestrator
│   ├── compare-results.ts         # Side-by-side diff analyzer
│   └── generate-report.ts         # Dashboard/report generator
└── README.md                      # Eval framework documentation
```

***

## Ключевые Принципы Реализации

**Начать рано и просто.** 20 задач из реальных use cases — достаточно для первого baseline. Ранние изменения harness дают большие effect sizes, поэтому малые выборки допустимы.[^1]

**Оценивать результат, не путь.** Агенты регулярно находят валидные подходы, не предвиденные проектировщиком. Rigidное проверка последовательности tool calls даёт хрупкие тесты.[^1]

**Partial credit.** Агент, прошедший Phase 1–3 но провалившийся на Phase 4, значимо лучше агента, провалившегося на Phase 1. Результаты должны отражать этот континуум.[^1]

**Eval как спецификация.** Eval suite определяет, что harness должен делать. Изменение требований → изменение eval criteria → оптимизация промптов.[^2]

**Judge drift monitoring.** LLM judges постепенно теряют калибровку. Периодическое сравнение с human annotations и recalibration — обязательны.[^2]

**Читать transcripts.** Единственный способ убедиться, что eval измеряет то, что действительно важно. Invest in tooling для просмотра и навигации по eval transcripts.[^1]

---

## References

1. [Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) - 19 дей 1404 г. перс. год — Once evals exist, you get baselines and regression tests for free: latenc...

2. [What is eval-driven development: How to ship high-quality ...](https://www.braintrust.dev/articles/eval-driven-development) - Eval-driven development is a methodology where evaluations serve as the working specification for LL...

3. [Agent Evaluation Framework 2026: Metrics, Rubrics & ...](https://galileo.ai/blog/agent-evaluation-framework-metrics-rubrics-benchmarks) - Build agent evaluation frameworks with trajectory metrics, hierarchical rubrics, and LLM-as-judge sy...

4. [test-driven development with agent - for typescript ...](https://marabesi.com/tdd/test-driving-with-agents.html) - 25 бахман 1404 г. перс. год — Learn how to configure and use AI agents like GitHub Copilot and Claud...

5. [Test-Driven Development (TDD) Guide for Mobile-App QA 2025](https://quashbugs.com/blog/test-driven-development-tdd-guide) - 25 шахривер 1404 г. перс. год — TDD shrinks feedback cycles and guides architecture. AI agents + sol...

6. [A Practical Framework for Evaluating Conversational ...](https://proagenticworkflows.ai/evaluating-conversational-agentic-ai-workflows) - A production-ready framework to evaluate agentic conversational systems—task outcomes, conversation ...

7. [How to Implement Effective A/B Testing for AI Agent Prompts](https://www.getmaxim.ai/articles/how-to-implement-effective-a-b-testing-for-ai-agent-prompts/) - Optimize AI agent prompts with A/B testing. Compare variants, cut hallucinations, boost UX, and iter...

