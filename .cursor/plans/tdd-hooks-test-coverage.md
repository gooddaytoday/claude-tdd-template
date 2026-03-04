# Test Coverage Plan: TDD Agent Harness Hooks

Пошаговый план покрытия unit-тестами всего .ts кода TDD agent harness **до** начала рефакторинга из `tdd-dual-use-implementation-tasks.md`.

Цель -- создать safety net, который зафиксирует текущее поведение и гарантирует отсутствие регрессий при extraction guard-core.ts, dual-format output и Cursor adaptation.

---

## [DONE] Phase 0: Test Infrastructure

### 0.1 Создать корневой `package.json`

В проекте нет root-level `package.json` (только `airefinement/package.json`). Хуки в `.claude/hooks/` -- самостоятельные скрипты, не часть airefinement module. Тесты для них должны жить отдельно.

```json
{
  "name": "claude-tdd-template",
  "private": true,
  "description": "TDD Integration Harness for Claude Code and Cursor IDE",
  "scripts": {
    "test": "jest --config jest.config.ts",
    "test:hooks": "jest --config jest.config.ts --testPathPattern=hooks",
    "test:hooks:watch": "jest --config jest.config.ts --testPathPattern=hooks --watch"
  },
  "devDependencies": {
    "@types/jest": "^30.0.0",
    "@types/node": "^22.0.0",
    "jest": "^30.1.3",
    "ts-jest": "^29.4.1",
    "tsx": "^4.21.0",
    "typescript": "^5.9.3"
  }
}
```

**Действие**: `npm install` в корне проекта.

---

### 0.2 Создать корневой `tsconfig.json`

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "moduleResolution": "node",
    "strict": true,
    "esModuleInterop": true,
    "isolatedModules": true,
    "noEmit": true,
    "types": ["jest", "node"],
    "baseUrl": ".",
    "rootDir": "."
  },
  "include": [".claude/hooks/**/*.ts", "tests/**/*.ts"],
  "exclude": ["airefinement/**", "node_modules"]
}
```

Хуки используют `import { readFileSync } from 'node:fs'` -- ES-style imports, но запускаются через `npx tsx`, который обрабатывает это без `"type": "module"`. Для jest будем использовать `ts-jest` с `commonjs` compilation.

---

### 0.3 Создать `jest.config.ts`

```typescript
import type { Config } from 'jest';

const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/tests/**/*.test.ts'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  clearMocks: true,
  restoreMocks: true,
};

export default config;
```

---

### 0.4 Создать структуру тестовых директорий

```
tests/
├── unit/
│   └── hooks/
│       ├── guard-logic.test.ts       (Phase 1)
│       ├── state-management.test.ts  (Phase 2)
│       ├── violation-logging.test.ts (Phase 3)
│       ├── prevent-test-edit.test.ts (Phase 4)
│       ├── telemetry-hook.test.ts    (Phase 5)
│       └── skill-eval.test.ts        (Phase 6)
├── integration/
│   └── hooks/
│       └── hook-stdio.test.ts        (Phase 7)
└── fixtures/
    └── hooks/
        └── helpers.ts                (Phase 0)
```

---

### 0.5 Создать `tests/fixtures/hooks/helpers.ts`

Фабрики для mock-данных, переиспользуемые всеми тестами.

```typescript
export interface MockHookInput {
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  cwd?: string;
  session_id?: string;
  agent_type?: string;
}

export function makePreToolUseInput(overrides: Partial<MockHookInput> = {}): MockHookInput {
  return {
    hook_event_name: 'PreToolUse',
    tool_name: 'Write',
    tool_input: {},
    cwd: process.cwd(),
    session_id: 'test-session-001',
    ...overrides,
  };
}

export function makeWriteToTestInput(filePath = 'tests/unit/foo.test.ts'): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Write',
    tool_input: { file_path: filePath, content: 'test content' },
  });
}

export function makeEditTestInput(filePath = 'tests/unit/foo.test.ts'): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Edit',
    tool_input: { file_path: filePath, new_string: 'updated', old_string: 'original' },
  });
}

export function makeBashInput(command: string): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Bash',
    tool_input: { command },
  });
}

export function makeTaskInput(subagentType: string): MockHookInput {
  return makePreToolUseInput({
    tool_name: 'Task',
    tool_input: { subagent_type: subagentType },
  });
}

export function makeSubagentStartInput(agentType: string): MockHookInput {
  return {
    hook_event_name: 'SubagentStart',
    agent_type: agentType,
    cwd: process.cwd(),
    session_id: 'test-session-001',
  };
}

export function makeSubagentStopInput(): MockHookInput {
  return {
    hook_event_name: 'SubagentStop',
    cwd: process.cwd(),
    session_id: 'test-session-001',
  };
}

export function makeSkillEvalInput(prompt: string): { hook_event_name: string; prompt: string; session_id: string } {
  return {
    hook_event_name: 'UserPromptSubmit',
    prompt,
    session_id: 'test-session-001',
  };
}

export function makeTelemetryInput(agentType: string): Record<string, unknown> {
  return {
    hook_event_name: 'SubagentStop',
    agent_type: agentType,
    session_id: 'test-session-001',
    cwd: process.cwd(),
    transcript_path: '/tmp/transcript',
    permission_mode: 'default',
    agent_id: 'agent-001',
    agent_transcript_path: '/tmp/agent-transcript',
  };
}
```

**Критерий готовности Phase 0**: `npx jest --config jest.config.ts --listTests` выводит пустой список (но не ошибку). Инфраструктура работает.

---

## [DONE] Phase 1: Guard Logic -- Path Matching & Pattern Detection

Тестирование чистых функций: вход → выход, без side effects.

### Файл: `tests/unit/hooks/guard-logic.test.ts`

Импортировать напрямую из `.claude/hooks/prevent-test-edit.ts`. Поскольку функции не экспортируются (private), есть два варианта:

**Вариант A (рекомендуемый)**: Перед написанием тестов добавить `export` к тестируемым функциям в `prevent-test-edit.ts` (не меняет поведение, только видимость). Функция `main()` остается единственной, вызывающейся при запуске скрипта, через `main()` в конце файла.

**Вариант B**: Использовать integration-тесты через stdin/stdout (Phase 7).

Рекомендуется **Вариант A** -- unit-тесты дают точную локализацию проблемы.

### 1.1 `isTestFile()` -- 10 test cases

```
describe('isTestFile', () => {
  // Positive matches
  it('matches tests/unit/foo.test.ts')
  it('matches tests/integration/bar.test.ts')
  it('matches ./tests/setup.ts')
  it('matches nested/path/tests/deep/file.ts')
  it('matches with backslashes: tests\\unit\\foo.test.ts')

  // Negative matches
  it('rejects src/tests-helper.ts (tests not a directory)')
  it('rejects src/utils/test-runner.ts')
  it('rejects contest/results.ts')
  it('rejects empty string')
  it('rejects src/main.ts')
})
```

### 1.2 `isJestConfigFile()` -- 8 test cases

```
describe('isJestConfigFile', () => {
  it('matches jest.config.ts')
  it('matches jest.config.js')
  it('matches jest.unit.config.ts')
  it('matches jest.integration.config.js')
  it('matches ./jest.config.ts')

  it('rejects jest-setup.ts')
  it('rejects src/jest.ts')
  it('rejects empty string')
})
```

### 1.3 `isEnforcementFile()` -- 8 test cases

```
describe('isEnforcementFile', () => {
  it('matches .claude/hooks/prevent-test-edit.ts')
  it('matches .claude/skills/tdd-integration/skill.md')
  it('matches .claude/settings.json')
  it('matches with backslashes')

  it('rejects .claude/agents/tdd-test-writer.md')
  it('rejects .claude/.guard-state.json')
  it('rejects src/.claude/hooks/fake.ts')
  it('rejects empty string')
})
```

### 1.4 `normalizePath()` -- 6 test cases

```
describe('normalizePath', () => {
  it('removes leading ./')
  it('removes leading ../')
  it('removes leading /')
  it('converts backslashes to forward slashes')
  it('handles multiple leading ./../')
  it('returns empty for empty input')
})
```

### 1.5 `contentHasSkipPatterns()` -- 10 test cases

```
describe('contentHasSkipPatterns', () => {
  it('detects describe.skip')
  it('detects it.skip')
  it('detects test.skip')
  it('detects describe.only')
  it('detects it.only')
  it('detects xdescribe')
  it('detects xit')
  it('detects xtest')
  it('detects if(false)')
  it('returns false for normal test content')
})
```

### 1.6 `bashCommandWritesToTests()` -- 12 test cases

```
describe('bashCommandWritesToTests', () => {
  it('detects: echo "x" > tests/unit/foo.ts')
  it('detects: echo "x" >> tests/unit/foo.ts')
  it('detects: tee tests/unit/foo.ts')
  it('detects: cp src/main.ts tests/unit/')
  it('detects: mv old.ts tests/unit/')
  it('detects: sed -i "s/x/y/" tests/unit/foo.ts')
  it('detects: cat foo | tee tests/unit/bar.ts')
  it('detects: cat heredoc >> tests/unit/foo.ts')

  it('allows: cat tests/unit/foo.ts (read-only)')
  it('allows: grep -r "pattern" tests/')
  it('allows: npm run test')
  it('allows: echo "hello" > src/main.ts')
})
```

### 1.7 `bashCommandWritesToJestConfig()` -- 6 test cases

```
describe('bashCommandWritesToJestConfig', () => {
  it('detects: echo "x" > jest.config.ts')
  it('detects: cp backup jest.unit.config.js')
  it('detects: sed -i "s/x/y/" jest.integration.config.ts')

  it('allows: cat jest.config.ts')
  it('allows: npm run test -- --config jest.config.ts')
  it('allows: echo "x" > src/jest-setup.ts')
})
```

### 1.8 `bashCommandWritesToEnforcementFiles()` -- 6 test cases

```
describe('bashCommandWritesToEnforcementFiles', () => {
  it('detects: echo "x" > .claude/hooks/new-hook.ts')
  it('detects: cp old .claude/skills/tdd-integration/skill.md')
  it('detects: sed -i "s/x/y/" .claude/settings.json')

  it('allows: cat .claude/hooks/prevent-test-edit.ts')
  it('allows: echo "x" > .claude/.guard-state.json')
  it('allows: echo "x" > .claude/agents/tdd-test-writer.md')
})
```

### 1.9 `redactSensitiveSegment()` -- 5 test cases

```
describe('redactSensitiveSegment', () => {
  it('redacts key=value secrets: API_KEY=abc123')
  it('redacts --token=xyz flag')
  it('redacts Bearer tokens')
  it('preserves non-sensitive content')
  it('handles empty string')
})
```

### 1.10 `sanitizeCommand()` -- 4 test cases

```
describe('sanitizeCommand', () => {
  it('returns sha256 hash of the command')
  it('returns command length')
  it('redacts secrets in prefix/suffix')
  it('normalizes whitespace')
})
```

### 1.11 `extractSubagentName()` -- 4 test cases

```
describe('extractSubagentName', () => {
  it('extracts subagent_type from tool input')
  it('returns null for missing subagent_type')
  it('returns null for empty object')
  it('returns null for non-string subagent_type')
})
```

**Итого Phase 1: ~79 test cases**

**Критерий готовности**: Все тесты зеленые. Code coverage для path-matching функций > 95%.

---

## [DONE] Phase 2: State Management

Тестирование `readState()` / `writeState()` -- filesystem interaction. Требует fs mock или tmpdir.

### Файл: `tests/unit/hooks/state-management.test.ts`

**Setup**: Перед каждым тестом создать tmp directory и мокнуть `getProjectRoot()` на этот tmpdir. После каждого теста -- очистить.

```typescript
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'guard-test-'));
  fs.mkdirSync(path.join(tmpDir, '.claude'), { recursive: true });
  // Mock getProjectRoot to return tmpDir
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});
```

### 2.1 `writeState()` -- 4 test cases

```
describe('writeState', () => {
  it('writes valid JSON to .claude/.guard-state.json')
  it('creates state file if it does not exist')
  it('overwrites existing state file')
  it('silently fails if directory is not writable')
})
```

### 2.2 `readState()` -- основные сценарии -- 5 test cases

```
describe('readState - basic', () => {
  it('reads valid state from file')
  it('returns { activeSubagent: "unknown" } when no file exists')
  it('returns { activeSubagent: "unknown" } when file is invalid JSON')
  it('returns { activeSubagent: "unknown" } when file is empty')
  it('preserves sessionId from state file')
})
```

### 2.3 `readState()` -- TTL behavior -- 4 test cases

```
describe('readState - TTL', () => {
  it('returns valid state when lastUpdated is within TTL (< 2 hours)')
  it('returns { activeSubagent: "unknown" } when lastUpdated is older than 2 hours')
  it('returns { activeSubagent: "unknown" } when lastUpdated is in the future (negative age)')
  it('returns { activeSubagent: "unknown" } when lastUpdated is not a valid date')
})
```

### 2.4 `readState()` -- session isolation -- 3 test cases

```
describe('readState - session isolation', () => {
  it('returns state as-is when sessionIds match')
  it('returns { activeSubagent: "main" } when sessionIds differ')
  it('returns state as-is when no currentSessionId provided')
})
```

### 2.5 `readState()` + `writeState()` roundtrip -- 3 test cases

```
describe('state roundtrip', () => {
  it('write then read returns identical state')
  it('state transitions: main -> tdd-implementer -> main')
  it('concurrent session writes are isolated by sessionId')
})
```

**Итого Phase 2: ~19 test cases**

**Критерий готовности**: Все тесты зеленые. Каждый fail-closed path проверен.

---

## [DONE] Phase 3: Violation Logging

### Файл: `tests/unit/hooks/violation-logging.test.ts`

**Setup**: tmpdir + mock `getProjectRoot()`.

### 3.1 `logViolationEvent()` -- 6 test cases

```
describe('logViolationEvent', () => {
  it('creates airefinement/artifacts/traces/ directory if absent')
  it('appends JSONL line to violations.jsonl')
  it('each line is valid JSON when parsed')
  it('preserves all ViolationEvent fields')
  it('does not throw on fs write failure')
  it('multiple calls append multiple lines')
})
```

### 3.2 Violation event structure -- 3 test cases

```
describe('ViolationEvent structure', () => {
  it('contains required fields: timestamp, agent, attempted_action, target_file, blocked, reason')
  it('optional fields command_hash and command_length are present for bash violations')
  it('timestamp is valid ISO string')
})
```

**Итого Phase 3: ~9 test cases**

---

## [DONE] Phase 4: prevent-test-edit.ts Handlers

Тестирование handler-функций в изоляции. Каждый handler получает tool_input и возвращает HookOutput. Зависимость от guard state контролируется через `writeState()` перед каждым тестом.

### Файл: `tests/unit/hooks/prevent-test-edit.test.ts`

**Setup**: tmpdir + mock `getProjectRoot()` + write initial state.

### 4.1 `handleFileEdit()` -- Write/Edit к test files -- 8 test cases

```
describe('handleFileEdit - test file protection', () => {
  it('DENY: Write to tests/unit/foo.test.ts when activeSubagent=tdd-implementer')
  it('DENY: Edit to tests/integration/bar.test.ts when activeSubagent=tdd-refactorer')
  it('DENY: Write to tests/ when activeSubagent=unknown (fail-closed)')
  it('ALLOW: Write to tests/ when activeSubagent=tdd-test-writer')
  it('ALLOW: Write to tests/ when activeSubagent=main')
  it('ALLOW: Write to src/main.ts when activeSubagent=tdd-implementer')
  it('ALLOW: Write to src/main.ts when activeSubagent=unknown')
  it('ALLOW: Write with no file_path in tool_input')
})
```

### 4.2 `handleFileEdit()` -- skip patterns -- 5 test cases

```
describe('handleFileEdit - skip pattern detection', () => {
  it('ASK: Write to tests/ with content containing describe.skip (even as tdd-test-writer)')
  it('ASK: Write with it.only pattern')
  it('ASK: Write with xdescribe pattern')
  it('ASK: Write with if(false) pattern')
  it('ALLOW: Write to tests/ with clean content as tdd-test-writer')
})
```

### 4.3 `handleFileEdit()` -- enforcement files -- 4 test cases

```
describe('handleFileEdit - enforcement file protection', () => {
  it('ASK: Edit .claude/hooks/prevent-test-edit.ts when activeSubagent=tdd-implementer')
  it('ASK: Edit .claude/skills/tdd-integration/skill.md when activeSubagent=tdd-refactorer')
  it('ASK: Edit .claude/settings.json when activeSubagent=tdd-code-reviewer')
  it('ALLOW: Edit .claude/hooks/ when activeSubagent=main')
})
```

### 4.4 `handleFileEdit()` -- jest config -- 3 test cases

```
describe('handleFileEdit - jest config protection', () => {
  it('ASK: Edit jest.config.ts when activeSubagent=tdd-implementer')
  it('ALLOW: Edit jest.config.ts when activeSubagent=tdd-test-writer')
  it('ALLOW: Edit jest.config.ts when activeSubagent=main')
})
```

### 4.5 `handleBashCommand()` -- 8 test cases

```
describe('handleBashCommand', () => {
  it('DENY: bash write to tests/ when activeSubagent=tdd-implementer')
  it('DENY: cp to tests/ when activeSubagent=tdd-refactorer')
  it('ALLOW: bash write to tests/ when activeSubagent=tdd-test-writer')
  it('ALLOW: bash write to tests/ when activeSubagent=main')
  it('ALLOW: bash read from tests/ (cat, grep)')
  it('ASK: bash write to jest config when not test-writer')
  it('ASK: bash write to enforcement files from subagent')
  it('ALLOW: empty command')
})
```

### 4.6 `handleTaskToolUse()` -- 4 test cases

```
describe('handleTaskToolUse', () => {
  it('writes activeSubagent=tdd-implementer to state when Task(tdd-implementer)')
  it('writes activeSubagent=tdd-test-writer to state when Task(tdd-test-writer)')
  it('returns allow decision')
  it('does not write state when subagent_type is missing')
})
```

### 4.7 `handleSubagentStart()` -- 3 test cases

```
describe('handleSubagentStart', () => {
  it('writes activeSubagent to state with provided agent_type')
  it('writes activeSubagent=unknown when agent_type is undefined')
  it('includes sessionId in written state')
})
```

### 4.8 `handleSubagentStop()` -- 3 test cases

```
describe('handleSubagentStop', () => {
  it('resets activeSubagent to "main"')
  it('preserves sessionId')
  it('returns empty object')
})
```

### 4.9 Violation logging from handlers -- 4 test cases

```
describe('handler violation logging', () => {
  it('handleFileEdit logs violation for denied test edits')
  it('handleFileEdit logs violation for skip pattern detection')
  it('handleBashCommand logs violation for denied bash writes to tests')
  it('logged violations contain correct agent, attempted_action, target_file')
})
```

**Итого Phase 4: ~42 test cases**

**Критерий готовности**: Все тесты зеленые. Каждая строка deny/ask/allow в handlers покрыта. Violation logging проверен.

---

## [DONE] Phase 5: tdd-telemetry-hook.ts

### Файл: `tests/unit/hooks/telemetry-hook.test.ts`

### 5.1 `agentTypeToPhase()` -- 9 test cases

```
describe('agentTypeToPhase', () => {
  it('maps tdd-test-writer to RED')
  it('maps tdd-implementer to GREEN')
  it('maps tdd-refactorer to REFACTOR')
  it('maps tdd-code-reviewer to CODE_REVIEW')
  it('maps tdd-architect-reviewer to ARCH_REVIEW')
  it('maps tdd-documenter to DOCS')
  it('maps tdd-telemetry-reporter to TELEMETRY')
  it('returns null for unknown agent type')
  it('returns null for empty string')
})
```

### 5.2 Timing event logging -- 5 test cases

```
describe('telemetry logging', () => {
  it('writes timing event to airefinement/artifacts/traces/timings.jsonl')
  it('skips non-SubagentStop events')
  it('skips non-tdd agents')
  it('timing event contains timestamp, agent, phase, finished_at')
  it('does not throw on fs write failure')
})
```

**Итого Phase 5: ~14 test cases**

---

## [DONE] Phase 6: user-prompt-skill-eval.ts

### Файл: `tests/unit/hooks/skill-eval.test.ts`

### 6.1 `classify()` -- override markers -- 4 test cases

```
describe('classify - overrides', () => {
  it('returns skip for --no-tdd')
  it('returns skip for "skip tdd"')
  it('returns activate for --tdd')
  it('returns activate for "use tdd"')
})
```

### 6.2 `classify()` -- override precedence -- 2 test cases

```
describe('classify - override precedence', () => {
  it('--no-tdd overrides ACTIVATE pattern: "implement feature --no-tdd" → skip')
  it('--tdd overrides SKIP pattern: "fix bug --tdd" → activate')
})
```

### 6.3 `classify()` -- SKIP patterns -- 9 test cases

```
describe('classify - SKIP patterns', () => {
  it('skip: "fix bug in login"')
  it('skip: "update documentation"')
  it('skip: "format code"')
  it('skip: "git commit changes"')
  it('skip: "refactor authentication module"')
  it('skip: "rename UserService"')
  it('skip: "remove deprecated endpoint"')
  it('skip: "explain how authentication works"')
  it('skip: "update dependency versions"')
})
```

### 6.4 `classify()` -- ACTIVATE patterns -- 7 test cases

```
describe('classify - ACTIVATE patterns', () => {
  it('activate: "implement user validation"')
  it('activate: "add feature for notifications"')
  it('activate: "create service for payments"')
  it('activate: "build api for users"')
  it('activate: "new service for auth"')
  it('activate: "integrate with Stripe"')
  it('activate: "add support for webhooks"')
})
```

### 6.5 `classify()` -- SUGGEST patterns -- 6 test cases

```
describe('classify - SUGGEST patterns', () => {
  it('suggest: "fix build errors"')
  it('suggest: "update api integration"')
  it('suggest: "refactor and add new validation"')
  it('suggest: "improve error handling"')
  it('suggest: "extend user model"')
  it('suggest: "change behavior of auth flow"')
})
```

### 6.6 `classify()` -- SKIP > ACTIVATE precedence -- 2 test cases

```
describe('classify - SKIP beats ACTIVATE', () => {
  it('skip: "fix bug and implement feature" (fix bug is SKIP, takes priority)')
  it('skip: "explain how to implement feature" (explain is SKIP)')
})
```

### 6.7 `classify()` -- default -- 2 test cases

```
describe('classify - default', () => {
  it('skip: empty string')
  it('skip: "hello, how are you?"')
})
```

### 6.8 Output format -- 3 test cases

```
describe('output format', () => {
  it('activate: stdout contains <user-prompt-submit-hook> with MANDATORY SKILL ACTIVATION')
  it('suggest: stdout contains <user-prompt-submit-hook> with SUGGESTION')
  it('skip: stdout is empty')
})
```

**Итого Phase 6: ~35 test cases**

**Критерий готовности**: Все тесты зеленые. Каждый regex pattern из SKIP/ACTIVATE/SUGGEST проверен минимум одним тестом.

---

## [DONE] Phase 7: Integration Tests (stdin/stdout)

Тестирование хуков как subprocess: pipe JSON в stdin, читать stdout + exit code.

### Файл: `tests/integration/hooks/hook-stdio.test.ts`

**Helper**:

```typescript
import { execSync } from 'node:child_process';

function runHook(hookPath: string, input: unknown): { stdout: string; exitCode: number } {
  const inputJson = JSON.stringify(input);
  try {
    const stdout = execSync(
      `echo '${inputJson.replace(/'/g, "'\\''")}' | npx tsx ${hookPath}`,
      { encoding: 'utf-8', timeout: 15000 }
    );
    return { stdout, exitCode: 0 };
  } catch (error: any) {
    return { stdout: error.stdout || '', exitCode: error.status || 1 };
  }
}
```

### 7.1 `prevent-test-edit.ts` full pipeline -- 6 test cases

```
describe('prevent-test-edit.ts stdio', () => {
  it('returns valid JSON for PreToolUse + Write to src/')
  it('returns deny JSON for PreToolUse + Write to tests/ (unknown state)')
  it('returns allow JSON for PreToolUse + Task(tdd-test-writer)')
  it('returns empty JSON for SubagentStop')
  it('returns ask JSON for invalid/corrupt stdin')
  it('exits with code 0 for all cases')
})
```

### 7.2 `tdd-telemetry-hook.ts` full pipeline -- 3 test cases

```
describe('tdd-telemetry-hook.ts stdio', () => {
  it('returns empty JSON and writes timing for SubagentStop + tdd-implementer')
  it('returns empty JSON and skips for non-tdd agent')
  it('returns empty JSON on invalid stdin')
})
```

### 7.3 `user-prompt-skill-eval.ts` full pipeline -- 3 test cases

```
describe('user-prompt-skill-eval.ts stdio', () => {
  it('outputs activation text for "implement user auth"')
  it('outputs suggestion text for "fix build errors"')
  it('outputs nothing for "fix bug"')
})
```

### 7.4 State file side effects -- 3 test cases

```
describe('state side effects', () => {
  it('Task(tdd-implementer) creates .guard-state.json with activeSubagent=tdd-implementer')
  it('SubagentStop resets .guard-state.json to activeSubagent=main')
  it('sequential Task + deny + Stop produces correct violation log + state transitions')
})
```

**Итого Phase 7: ~15 test cases**

**Критерий готовности**: Все тесты зеленые. Хуки работают как subprocess в точности как при вызове из Claude Code / Cursor.

---

## Порядок выполнения и зависимости

```
Phase 0 (infrastructure) ──→ Phase 1 (guard logic)
                          ──→ Phase 2 (state mgmt)
                          ──→ Phase 3 (violation log)

Phase 1 + 2 + 3 ──→ Phase 4 (prevent-test-edit handlers)

Phase 0 ──→ Phase 5 (telemetry hook)
Phase 0 ──→ Phase 6 (skill eval)

Phase 4 + 5 + 6 ──→ Phase 7 (integration tests)
```

Phases 1, 2, 3 можно делать параллельно после Phase 0.
Phases 5, 6 можно делать параллельно с Phases 1-4.

---

## Подготовка к экспорту функций

Для unit-тестирования (Phases 1-6) необходимо экспортировать приватные функции из хуков. Это безопасное изменение -- оно не влияет на поведение скриптов при запуске через `npx tsx`.

### `prevent-test-edit.ts`

Добавить `export` перед следующими функциями (не изменяя логику):

```
export function getProjectRoot()
export function redactSensitiveSegment()
export function sanitizeCommand()
export function logViolationEvent()
export function readState()
export function writeState()
export function extractSubagentName()
export function normalizePath()
export function isTestFile()
export function isJestConfigFile()
export function isEnforcementFile()
export function contentHasSkipPatterns()
export function bashCommandWritesToTests()
export function bashCommandWritesToJestConfig()
export function bashCommandWritesToEnforcementFiles()
export function handleBashCommand()
export function handleFileEdit()
export function handleTaskToolUse()
export function handleSubagentStart()
export function handleSubagentStop()
```

Также экспортировать константы и типы:

```
export const ALLOWED_TEST_WRITERS
export const STATE_FILE
export const STATE_TTL_MS
export type { GuardState, ViolationEvent, HookInput, HookOutput }
```

**Не экспортировать**: `main()`, `currentSessionId` (module state).

### `tdd-telemetry-hook.ts`

```
export function agentTypeToPhase()
export function getProjectRoot()
export function logTimingEvent()
export type { SubagentTimingEvent, SubagentStopInput }
```

### `user-prompt-skill-eval.ts`

```
export function classify()
export { SKIP_PATTERNS, ACTIVATE_PATTERNS, SUGGEST_PATTERNS }
export type { Decision }
```

---

## Сводка

| Phase | Файл теста | Test Cases | Зависимость |
|-------|-----------|------------|-------------|
| 0 | infrastructure setup | 0 | - |
| 1 | guard-logic.test.ts | ~79 | Phase 0 |
| 2 | state-management.test.ts | ~19 | Phase 0 |
| 3 | violation-logging.test.ts | ~9 | Phase 0 |
| 4 | prevent-test-edit.test.ts | ~42 | Phase 1+2+3 |
| 5 | telemetry-hook.test.ts | ~14 | Phase 0 |
| 6 | skill-eval.test.ts | ~35 | Phase 0 |
| 7 | hook-stdio.test.ts | ~15 | Phase 4+5+6 |
| **Total** | | **~213** | |

После выполнения этого плана -- каждая функция в `.claude/hooks/*.ts` покрыта unit-тестами. Это создает safety net для безопасного рефакторинга по плану `tdd-dual-use-implementation-tasks.md`.
