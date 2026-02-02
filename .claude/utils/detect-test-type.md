# Test Type Detection Reference

This document defines the rules for automatically determining whether to write unit or integration tests.

## Priority Chain

```
1. Explicit argument (--test-type=unit|integration|both)
   ↓ not provided
2. Task-master testStrategy field parsing
   ↓ ambiguous or missing
3. Keyword heuristics analysis
   ↓ inconclusive (equal scores)
4. Ask user via AskUserQuestion
   ↓ (always resolves)
5. Default to unit (only if user skips question)
```

## Task-Master testStrategy Parsing

Scan the `testStrategy` field for these patterns:

| Pattern | Detected Type |
|---------|---------------|
| `Unit test` (case-insensitive) | unit |
| `Integration test` (case-insensitive) | integration |
| Both patterns present | both |
| Neither pattern | proceed to heuristics |

### Examples

```json
// → unit
"testStrategy": "Unit tests for configuration loading and validation."

// → integration
"testStrategy": "Integration test for MongoDB connection and CRUD operations."

// → both
"testStrategy": "Unit tests for validation logic. Integration tests for database layer."

// → heuristics (no clear indicator)
"testStrategy": "Verify all functionality works correctly."
```

## Keyword Heuristics

### Integration Test Indicators

These keywords suggest the feature involves external systems or cross-module behavior:

| Category | Keywords | Weight |
|----------|----------|--------|
| **Database** | `database`, `MongoDB`, `mongoose`, `model`, `schema`, `collection`, `query`, `CRUD`, `findOne`, `save`, `update`, `delete` | High |
| **API/Network** | `API`, `endpoint`, `handler`, `route`, `middleware`, `request`, `response`, `HTTP`, `REST`, `fetch`, `axios` | High |
| **External Services** | `external`, `service`, `client`, `connection`, `socket`, `WebSocket` | Medium |
| **Queue/Jobs** | `queue`, `worker`, `job`, `task`, `processing`, `async job` | Medium |
| **File System** | `file`, `fs`, `read file`, `write file`, `stream` | Medium |

### Unit Test Indicators

These keywords suggest pure logic that can be tested in isolation:

| Category | Keywords | Weight |
|----------|----------|--------|
| **Utilities** | `util`, `helper`, `tool`, `pure function`, `utility` | High |
| **Transformations** | `parser`, `validator`, `formatter`, `converter`, `serializer`, `deserializer` | High |
| **Configuration** | `config`, `settings`, `constants`, `env`, `environment` | High |
| **Calculations** | `calculate`, `compute`, `transform`, `convert`, `format`, `normalize` | High |
| **Type Definitions** | `type`, `interface`, `enum`, `mapping`, `schema validation` | High |
| **String Operations** | `string`, `regex`, `pattern`, `match`, `replace` | Medium |

## Decision Algorithm

```typescript
type DetectionResult = 
  | { type: 'unit' | 'integration' | 'both'; confidence: 'high' | 'medium' }
  | { type: 'ask-user'; reason: string };

function detectTestType(
  description: string,
  testStrategy?: string
): DetectionResult {

  // 1. Parse testStrategy if available
  if (testStrategy) {
    const hasUnit = /unit\s+test/i.test(testStrategy);
    const hasIntegration = /integration\s+test/i.test(testStrategy);

    if (hasUnit && hasIntegration) return { type: 'both', confidence: 'high' };
    if (hasUnit) return { type: 'unit', confidence: 'high' };
    if (hasIntegration) return { type: 'integration', confidence: 'high' };
  }

  // 2. Count keyword matches
  const text = description.toLowerCase();

  const integrationKeywords = [
    'database', 'mongodb', 'mongoose', 'model', 'schema',
    'api', 'endpoint', 'handler', 'route', 'middleware',
    'external', 'http', 'fetch', 'request', 'response',
    'queue', 'worker', 'job', 'connection'
  ];

  const unitKeywords = [
    'util', 'helper', 'pure', 'function',
    'parser', 'validator', 'formatter', 'converter',
    'config', 'settings', 'constants', 'env',
    'calculate', 'transform', 'convert', 'format',
    'type', 'interface', 'enum', 'mapping'
  ];

  const integrationScore = integrationKeywords.filter(k => text.includes(k)).length;
  const unitScore = unitKeywords.filter(k => text.includes(k)).length;
  const scoreDiff = Math.abs(integrationScore - unitScore);

  // 3. Decision based on confidence levels (🔴 CRITICAL FIX APPLIED)
  
  // High confidence: score difference > 3
  if (integrationScore > unitScore && integrationScore >= 2 && scoreDiff > 3) {
    return { type: 'integration', confidence: 'high' };
  }
  if (unitScore > integrationScore && unitScore >= 2 && scoreDiff > 3) {
    return { type: 'unit', confidence: 'high' };
  }

  // Medium confidence: score difference 1-3
  if (integrationScore > unitScore && integrationScore >= 2 && scoreDiff >= 1) {
    return { type: 'integration', confidence: 'medium' };
  }
  if (unitScore > integrationScore && unitScore >= 2 && scoreDiff >= 1) {
    return { type: 'unit', confidence: 'medium' };
  }

  // 🔴 CRITICAL FIX: Score difference = 0 (equal scores, including both zero)
  // Do NOT silently default to 'unit'! Ask the user instead!
  if (scoreDiff === 0) {
    return {
      type: 'ask-user',
      reason: `Keyword analysis produced equal scores (unit: ${unitScore}, integration: ${integrationScore}). Unable to determine with confidence.`
    };
  }

  // Final fallback
  return {
    type: 'ask-user',
    reason: 'Unable to determine test type from available signals.'
  };
}
```

## Confidence Levels

| Score Difference | Confidence | Action |
|------------------|------------|--------|
| > 3 | High | Auto-select without note |
| 1-3 | Medium | Auto-select, note in output |
| 0 | Low | **🔴 Ask user via AskUserQuestion (NOT silent default)** |

## User Fallback (AskUserQuestion)

When confidence is LOW (score diff = 0), use AskUserQuestion tool:

```typescript
// AskUserQuestion parameters
{
  questions: [{
    question: "What type of test should I write for this feature?",
    header: "Test type",
    multiSelect: false,
    options: [
      {
        label: "Unit test",
        description: "Fast, isolated, mock all external dependencies"
      },
      {
        label: "Integration test",
        description: "Real DB/API connections, slower, with setup/teardown"
      },
      {
        label: "Both",
        description: "Write unit tests first, then integration tests"
      }
    ]
  }]
}
```

**When to ask:**
- No explicit `--test-type` argument
- testStrategy doesn't contain clear indicators
- Keyword heuristics produce equal scores

**When NOT to ask:**
- Any source provides clear direction
- Score difference >= 1 (even weak signal is enough)

## Implementation Guide

When calling `detectTestType()`, **always handle the response** according to its type:

```typescript
const result = detectTestType(description, testStrategy);

if (result.type === 'ask-user') {
  // 🔴 CRITICAL: Confidence is too low → ask the user!
  const userChoice = await AskUserQuestion({
    questions: [{
      question: "What type of test should I write for this feature?",
      header: "Test type",
      multiSelect: false,
      options: [
        { 
          label: "Unit test", 
          description: "Fast, isolated, mock all external dependencies" 
        },
        { 
          label: "Integration test", 
          description: "Real DB/API connections, slower, with setup/teardown" 
        },
        { 
          label: "Both", 
          description: "Write both unit and integration tests" 
        }
      ]
    }]
  });
  
  // Map user choice back to test type
  const choice = userChoice[0];
  const testType: 'unit' | 'integration' | 'both' = 
    choice.toLowerCase() === 'both' 
      ? 'both' 
      : choice.toLowerCase().split(' ')[0] as 'unit' | 'integration';
  
  return testType;
} else {
  // Auto-select the detected type
  if (result.confidence === 'medium') {
    console.log(`Auto-selecting ${result.type} test (medium confidence). Consider reviewing if unsure.`);
  }
  // High confidence: select silently
  return result.type;
}
```

## Examples

### Example 1: Clear Unit Test

**Feature**: "Implement date formatting utility"
**Keywords found**: `util`, `format` (unit: 2, integration: 0)
**Score diff**: 2 (>= 1 but NOT > 3)
**Return**: `{ type: 'unit', confidence: 'medium' }`
**Action**: Auto-select unit, note in output

### Example 2: Clear Integration Test

**Feature**: "Add MongoDB user creation handler with connection pooling"
**Keywords found**: `mongodb`, `handler`, `connection` (integration: 3, unit: 0)
**Score diff**: 3 (>= 1 but NOT > 3)
**Return**: `{ type: 'integration', confidence: 'medium' }`
**Action**: Auto-select integration, note in output

### Example 3: Very High Confidence

**Feature**: "Create API endpoint with database queries, external service calls, and WebSocket support"
**Keywords found**: `api`, `endpoint`, `handler`, `database`, `external`, `socket` (integration: 6, unit: 0)
**Score diff**: 6 (> 3 ✓)
**Return**: `{ type: 'integration', confidence: 'high' }`
**Action**: Auto-select silently, no note

### Example 4: 🔴 Ambiguous — Equal Scores (THE FIX)

**Feature**: "Implement new data processor"
**Keywords found**: none (unit: 0, integration: 0)
**Score diff**: 0 (EQUAL!)
**Return**: `{ type: 'ask-user', reason: '...' }`
**Action**: 🔴 **ASK USER via AskUserQuestion** (NOT silent `unit` default)
**Decision**: [user's choice]

### Example 5: Mixed Signals with Difference

**Feature**: "Create API endpoint for config updates"
**Keywords found**: `api`, `endpoint` (integration: 2), `config` (unit: 1)
**Score diff**: 1 (>= 1 ✓, avoid ask-user)
**Return**: `{ type: 'integration', confidence: 'medium' }`
**Action**: Auto-select integration, note in output (no ask needed because diff > 0)

## Quick Reference Card

```
┌─────────────────────────────────────────────────────────┐
│               TEST TYPE DECISION FLOW                    │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  Step 1: Call detectTestType(description, testStrategy) │
│                                                          │
│  Step 2: Check result type                              │
│  ┌─ result.type === 'ask-user'?                         │
│  │  └── YES → 🔴 USE AskUserQuestion (ask user!)        │
│  │                                                       │
│  └─ result.type === 'unit|integration|both'?            │
│     └── YES → Check confidence level:                   │
│         └── 'high'   → Auto-select silently             │
│         └── 'medium' → Auto-select + note user          │
│                                                          │
│  Priority Chain (what detectTestType checks):           │
│  1. Explicit --test-type argument (before this func)    │
│  2. testStrategy field (inside detectTestType)          │
│  3. Keyword heuristics (inside detectTestType)          │
│  4. 🔴 Ask user if score diff = 0 (FIXED!)             │
│  5. NO more silent defaults to 'unit'!                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

## What Was Fixed

| Issue | Before | After |
|-------|--------|-------|
| **Equal score handling** | Silently returned `'unit'` | Returns `{ type: 'ask-user', reason: '...' }` |
| **Contradiction** | Algorithm contradicted documentation | Algorithm now matches documentation perfectly |
| **Low confidence** | No way to express uncertainty | Can now signal uncertainty via `ask-user` type |
| **User input** | Never asked when scores equal | **Now asks user when scores equal (score diff = 0)** |
| **Return type** | Only `'unit'\|'integration'\|'both'` | Now `DetectionResult` union (auto-select + ask-user) |
| **Implementation path** | Unclear how to handle responses | Clear implementation guide with full code example |