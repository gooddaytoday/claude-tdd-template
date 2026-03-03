---
name: Continuous AI Agent Refinement Framework
overview: Создать подробный MD-файл с декомпозицией на подзадачи для разработки модуля airefinement — системы continuous improvement для TDD Agent Harness.
todos:
  - id: create-spec-md
    content: Создать файл airefinement/SPEC.md с полной декомпозицией на подзадачи для последовательной имплементации
    status: completed
isProject: false
---

# Plan: Создание SPEC.md для модуля airefinement

Создать файл `airefinement/SPEC.md` -- подробную спецификацию с декомпозицией на подзадачи для последовательной имплементации модуля Continuous AI Agent Harness Improvement.

## Что войдет в SPEC.md

Файл будет содержать полную архитектуру и подзадачи для 5 основных блоков системы. Ниже -- сводка того, что будет расписано.

### Блок 1. Инфраструктура проекта

Инициализация `airefinement/` как NodeJS/TypeScript проекта: `package.json`, `tsconfig.json`, структура каталогов, зависимости.

### Блок 2. Телеметрия (сбор артефактов)

Два канала сбора данных:

- **Отдельный субагент `tdd-telemetry-reporter`**: Вызывается оркестратором в конце TDD-цикла (после DOCS, перед переходом к DONE). Получает накопленный Context Packet и Phase Packets всех фаз. Записывает структурированный JSON Run Report в `airefinement/artifacts/runs/`. Не модифицирует код -- только read + write артефакта.
- **Хуки (`.claude/hooks/`)**: Модификация существующего `prevent-test-edit.ts` для логирования Guard violation events в JSONL-трассы (`airefinement/artifacts/traces/`). Новый хук `tdd-telemetry-hook.ts` на событие `SubagentStop` для записи фазовых таймингов.

Run Report JSON Schema (на основе Phase Packet + Context Packet):

```json
{
  "run_id": "uuid",
  "timestamp": "ISO",
  "task_id": "string",
  "subtask_id": "string",
  "feature": "string",
  "test_type": "unit|integration|both",
  "phases": [
    {
      "phase": "RED|GREEN|REFACTOR|CODE_REVIEW|ARCH_REVIEW|DOCS",
      "status": "passed|failed|skipped",
      "retries": 0,
      "gate_result": "pass|fail",
      "gate_failure_reason": "string|null",
      "changed_files": [],
      "duration_estimate": "string|null"
    }
  ],
  "fix_routing": {
    "code_review_cycles": 0,
    "arch_review_cycles": 0,
    "escalations": []
  },
  "guard_violations": [],
  "overall_status": "DONE|FAILED|ESCALATED",
  "partial_credit_score": 0.0
}
```

### Блок 3. Анализ и Триггеры

CLI-утилита `airefinement analyze`, которая читает `artifacts/runs/` и `artifacts/traces/` и выявляет:

Три типа триггеров (из исследования Perplexity):

- **Event-Driven (по аномалиям)**: Guard violations (любое > 0), Gate failure streak (3+ подряд в одной фазе), Token usage > 2sigma, ручное вмешательство > 2 раз подряд.
- **Trend-Based (деградация)**: TSR drop > 5% vs baseline, Token inflation > 20% vs baseline, рост Flake Rate > 2%.
- **Commit-Based**: Изменения в `.claude/agents/`*, `.claude/skills/`**, `.claude/hooks/`* -- запуск subset eval (10 задач).

Конфигурация триггеров в `airefinement/config/triggers.yaml`.

### Блок 4. AI Refinement Agent

Запуск Claude CLI в отдельной git-ветке `refinement/experiment-<timestamp>`:

- **Self-Improvement Loop** (паттерн из Anthropic): Claude как prompt engineer. Собрать N худших transcripts, передать агенту промпт субагента + failure data, получить variant prompt.
- Агент получает: промпты проблемных субагентов (`[.claude/agents/tdd-*.md](.claude/agents/tdd-*.md)`), файлы политик (`[.claude/skills/tdd-integration/](.claude/skills/tdd-integration/)`), Run Reports с ошибками, JSONL-трассы с violations.
- Ограничения: агент может модифицировать ТОЛЬКО файлы в `.claude/agents/`, `.claude/skills/`, `.claude/hooks/`.
- Коммит изменений в экспериментальную ветку.

### Блок 5. Evaluation Framework (A/B Testing + Regression)

**Golden Dataset** (`airefinement/datasets/golden-v1.jsonl`):

- Seed Tasks: 10-15 реальных feature-задач
- Edge Cases: 5-10 задач (async, вложенные зависимости, кросс-модульные)
- Regression Seeds: 5-10 задач из прошлых сбоев
- Adversarial Cases: 3-5 задач с неоднозначными требованиями

Формат задачи:

```json
{
  "id": "feat-auth-bypass-01",
  "description": "...",
  "parent_task": "...",
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

**Протокол A/B эксперимента** (8 шагов):

1. HYPOTHESIS (что проверяем)
2. CONTROL (текущая конфигурация main)
3. VARIANT (экспериментальная ветка)
4. DATASET (фиксированный golden dataset)
5. TRIALS (N=3 прогона для non-determinism)
6. METRICS (набор KPIs)
7. ANALYSIS (сравнение средних + std)
8. DECISION (accept/reject/accept_with_caveat)

**Грейдеры** -- три слоя:

- **Code-based (Layer 1)**: Test runner pass/fail, static analysis (lint, type check, complexity), git diff (no test mutations), Guard compliance.
- **LLM-judge (Layer 2)**: Rubrics для субъективных метрик. Пример rubric для tdd-test-writer (Specification Clarity, Edge Case Coverage, Assertion Quality, Independence -- каждый 0-2 балла). LLM-judge калибровка: Spearman correlation >= 0.80 vs human annotations.
- **Human (Layer 3)**: Периодическая калибровка, edge case audit.

**Capability vs Regression Evals**: capability evals (низкий pass rate, "холм для восхождения") vs regression evals (~100% pass rate, падение = сломалось). Graduation: capability eval с pass rate > 90% переходит в regression suite.

**Partial Credit**: агент, прошедший Phase 1-3 но провалившийся на Phase 4, получает больше баллов, чем провалившийся на Phase 1. Континуум вместо бинарного pass/fail.

**Version Pinning**: каждый эксперимент фиксирует dataset version, prompt version, model config, judge settings. Lineage для полной воспроизводимости.

**Anti-patterns**: Score theater, Eval drift, One-number fetish, Unbounded loops, Shared state bias.

### Блок 6. Метрики (Role-Specific + Pipeline KPIs)

**Role-Specific Metrics** (подробные таблицы из исследования Perplexity):

- tdd-test-writer: Failing Test Rate, Mutation Score, Test Relevance, Specification Clarity, Edge Case Coverage, Token Efficiency, Code-to-Test Ratio
- tdd-implementer: Tests Pass Rate, Implementation Minimality, Time-to-Green, No Test Modifications, Build Success, Retry Count
- tdd-refactorer: Tests Remain Green, Cyclomatic Complexity, Code Duplication, Improvement Delta, Dead Code Elimination
- tdd-code-reviewer: Critical Issues Found, False Positive Rate, Coverage Breadth, Actionability, Auto-fix Success, Review Consistency (pass^3)
- tdd-architect-reviewer: Integration Validation, Orphaned Code Detection, Dependency Correctness, Full Task Review Quality, Context Utilization
- tdd-documenter: Task Master Update, CLAUDE.md Update, Documentation Accuracy, Completeness, Conciseness

**Pipeline-Level KPIs**:

- Outcome: TSR, pass@1, pass^3, Code Quality Score, Defect Escape Rate
- Trajectory: Total Tokens per Task, Total Tool Calls, Cycle Time, Gate Failure Rate, Retry Loops, Plan Execution Efficiency
- System Health: TDD Guard Violations, Context Pollution Index, Flake Rate, Auto-activation Accuracy

Конфигурация порогов в `airefinement/config/thresholds.json`.

### Структура файлов проекта

```text
airefinement/
├── package.json
├── tsconfig.json
├── SPEC.md                        # <-- Подробная спецификация (создается сейчас)
├── bin/
│   └── cli.ts                     # CLI: analyze, refine, eval, report
├── src/
│   ├── telemetry/
│   │   ├── collector.ts           # Запись Run Reports в artifacts/runs/
│   │   └── schemas.ts             # TypeScript типы для Run Report, Trace Event
│   ├── triggers/
│   │   ├── analyzer.ts            # Выявление триггеров из артефактов
│   │   └── rules.ts               # Правила триггеров (event/trend/commit-based)
│   ├── eval/
│   │   ├── runner.ts              # Оркестратор Claude CLI для прогона Golden Dataset
│   │   ├── comparator.ts          # Side-by-side diff Control vs Variant
│   │   └── graders/
│   │       ├── deterministic.ts   # Code-based: test runner, static analysis, git diff
│   │       ├── llm-judge.ts       # LLM-based rubric evaluation через Claude CLI
│   │       └── composite.ts       # Weighted ensemble + partial credit
│   ├── refinement/
│   │   ├── agent-runner.ts        # Запуск Claude CLI для исправления промптов
│   │   └── prompt-templates.ts    # Шаблоны промптов для refinement агента
│   ├── metrics/
│   │   ├── role-metrics.ts        # Вычисление role-specific метрик из Run Reports
│   │   └── pipeline-kpis.ts       # Агрегация pipeline-level KPIs
│   └── utils/
│       ├── git.ts                 # Работа с ветками, checkout, commit
│       └── claude-cli.ts          # Обёртка для запуска Claude CLI процессов
├── config/
│   ├── thresholds.json            # Gate thresholds per phase + KPI targets
│   ├── triggers.yaml              # Правила триггеров auto-refinement
│   └── rubrics/                   # LLM-judge rubric промпты
│       ├── test-writer-quality.md
│       ├── implementation-minimality.md
│       ├── code-review-accuracy.md
│       ├── architecture-integration.md
│       └── documentation-completeness.md
├── datasets/
│   └── golden-v1.jsonl            # Базовые задачи для eval
└── artifacts/                     # Runtime data (gitignored)
    ├── runs/                      # JSON Run Reports от tdd-telemetry-reporter
    ├── traces/                    # JSONL от хуков (violations, timings)
    └── reports/                   # Результаты A/B экспериментов

.claude/
├── agents/
│   └── tdd-telemetry-reporter.md  # НОВЫЙ субагент для записи Run Reports
├── hooks/
│   ├── prevent-test-edit.ts       # МОДИФИКАЦИЯ: добавить логирование violations
│   └── tdd-telemetry-hook.ts      # НОВЫЙ хук: SubagentStop таймингов
└── skills/tdd-integration/
    ├── skill.md                   # МОДИФИКАЦИЯ: вызов tdd-telemetry-reporter
    └── phases/
        └── telemetry.md           # НОВАЯ фаза: описание делегирования
```
