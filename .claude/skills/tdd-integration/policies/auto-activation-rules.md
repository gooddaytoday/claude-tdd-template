# Auto-Activation Rules (Policy-as-Data)

Decision rules for `user-prompt-skill-eval.ts` hook. Determines whether to activate TDD Integration Skill based on user prompt content.

## Three-State Decision Logic

```
User prompt → Match against rules → ACTIVATE | SKIP | SUGGEST
```

| Decision | Action |
|---|---|
| **ACTIVATE** | Inject mandatory skill invocation instruction |
| **SKIP** | Do not inject anything — proceed normally |
| **SUGGEST** | Inject soft recommendation (not mandatory) |

## ACTIVATE Patterns

User prompt matches ANY of these → activate TDD skill.

### Primary triggers (high confidence)

- `implement` + noun (implement user validation, implement payment flow)
- `add feature` / `add functionality` / `add capability`
- `create` + technical noun (create service, create handler, create endpoint, create module)
- `build` + technical noun (build API, build authentication)
- `develop` + noun (develop feature, develop integration)

### Secondary triggers (medium confidence, still activate)

- `add endpoint` / `add route` / `add handler`
- `new domain object` / `new service` / `new model`
- `integrate with` + external system
- `add support for` + capability
- `write` + feature description (write user registration)

### Regex patterns

```
\b(?:implement|develop)\s+\w+
\badd\s+(?:feature|functionality|capability|endpoint|route|handler|support)\b
\bcreate\s+(?:service|handler|endpoint|module|component|model|utility|function)\b
\bbuild\s+(?:api|auth|feature|system|module)\b
\bnew\s+(?:domain|service|model|handler|endpoint)\b
\bintegrate\s+with\b
```

## SKIP Patterns

User prompt matches ANY of these → do not activate TDD.

### Definite skip

- `fix bug` / `bugfix` / `fix issue` / `debug` / `hotfix`
- `update docs` / `update documentation` / `update README`
- `update config` / `change config` / `configure`
- `format code` / `lint` / `prettier`
- `git` operations (commit, push, pull, merge, rebase, stash)
- `refactor` (without adding new behavior)
- `rename` / `move file` / `reorganize`
- `update dependency` / `upgrade package` / `npm update`
- `remove` / `delete` / `deprecate` (removing, not adding)
- `explain` / `describe` / `what is` / `how does` (questions)

### Regex patterns

```
\b(?:fix|debug|hotfix)\s+(?:bug|issue|error|crash)\b
\b(?:update|edit|change)\s+(?:docs?|documentation|readme|config|configuration)\b
\b(?:format|lint|prettier|eslint)\b
\bgit\s+(?:commit|push|pull|merge|rebase|stash|checkout|branch)\b
\brefactor(?:ing)?\b
\b(?:rename|move|reorganize|restructure)\b
\b(?:remove|delete|deprecate)\b
\b(?:explain|describe|what\s+is|how\s+does)\b
```

## SUGGEST Patterns (Soft Recommendation)

User prompt matches these AND doesn't match ACTIVATE or SKIP → inject soft suggestion.

### Borderline cases

- `fix build` / `fix compilation` (might need test if behavior changes)
- `update` + integration (update API integration, update database schema)
- `refactor` + `add` (refactor AND add new behavior)
- `improve` + functional noun (improve validation, improve error handling)
- `extend` + existing feature (extend user model, extend API)
- `change behavior` / `modify logic` / `alter flow`

### Regex patterns

```
\b(?:fix)\s+(?:build|compilation|type\s*error)\b
\bupdate\s+(?:api|database|schema|integration)\b
\brefactor.*\badd\b
\bimprove\s+(?:validation|error|handling|performance|security)\b
\bextend\s+\w+
\b(?:change|modify|alter)\s+(?:behavior|logic|flow)\b
```

### Soft suggestion template

```
<user-prompt-submit-hook>
SUGGESTION: This request may benefit from TDD workflow.

Consider using Skill(tdd-integration) if you are adding new behavior or functionality.
If this is purely a refactoring or fix without new behavior, proceed without TDD.

You may invoke Skill(tdd-integration) manually, or proceed directly with implementation.
</user-prompt-submit-hook>
```

## Precedence Rules

1. If prompt matches SKIP → always skip (even if ACTIVATE also matches)
2. If prompt matches ACTIVATE → activate
3. If prompt matches SUGGEST → soft-suggest
4. If no match → skip (default: do not activate)

## Override Markers

User can force behavior with explicit markers in their prompt:

| Marker | Effect |
|---|---|
| `--no-tdd` or `skip tdd` | Force SKIP regardless of content |
| `--tdd` or `use tdd` | Force ACTIVATE regardless of content |
| `/tdd-integration` | Direct command invocation (bypasses hook entirely) |
