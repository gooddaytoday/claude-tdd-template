#!/usr/bin/env npx tsx
/**
 * Auto-Activation Hook for TDD Integration Skill
 *
 * Three-state decision logic: ACTIVATE / SKIP / SUGGEST
 * Rules defined in: .claude/skills/tdd-integration/policies/auto-activation-rules.md
 *
 * Precedence:
 * 1. Override markers (--no-tdd, --tdd) take absolute priority
 * 2. SKIP patterns checked first (explicit non-TDD intent)
 * 3. ACTIVATE patterns checked next (clear TDD intent)
 * 4. SUGGEST patterns checked last (borderline cases)
 * 5. Default: SKIP (do not activate)
 */

import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';

interface HookInput {
  hook_event_name: string;
  user_prompt?: string;
  session_id?: string;
}

const SKIP_PATTERNS = [
  /\b(?:fix|debug|hotfix)\s+(?:bug|issue|error|crash)\b/i,
  /\b(?:update|edit|change)\s+(?:docs?|documentation|readme|config|configuration)\b/i,
  /\b(?:format|lint|prettier|eslint)\b/i,
  /\bgit\s+(?:commit|push|pull|merge|rebase|stash|checkout|branch)\b/i,
  /\brefactor(?:ing)?\b(?![\s\S]*\badd\b)/i,
  /\b(?:rename|move|reorganize|restructure)\b/i,
  /\b(?:remove|delete|deprecate)\b/i,
  /\b(?:explain|describe|what\s+is|how\s+does)\b/i,
  /\b(?:update|upgrade)\s+(?:dependency|dependencies|package|packages)\b/i,
];

const ACTIVATE_PATTERNS = [
  /\b(?:implement|develop)\s+(?:feature|endpoint|api|service|module|command|integration|\w+\s+\w+)/i,
  /\badd\s+(?:feature|functionality|capability|endpoint|route|handler|support)\b/i,
  /\bcreate\s+(?:service|handler|endpoint|module|component|model|utility|function)\b/i,
  /\bbuild\s+(?:api|auth|feature|system|module)\b/i,
  /\bnew\s+(?:domain|service|model|handler|endpoint)\b/i,
  /\bintegrate\s+with\b/i,
  /\badd\s+support\s+for\b/i,
];

const SUGGEST_PATTERNS = [
  /\b(?:fix)\s+(?:build|compilation|type\s*error)\b/i,
  /\bupdate\s+(?:api|database|schema|integration)\b/i,
  /\brefactor[\s\S]*\badd\b/i,
  /\bimprove\s+(?:validation|error|handling|performance|security)\b/i,
  /\bextend\s+\w+/i,
  /\b(?:change|modify|alter)\s+(?:behavior|logic|flow)\b/i,
];

type Decision = 'activate' | 'skip' | 'suggest';

function classify(prompt: string): Decision {
  if (/--no-tdd\b/i.test(prompt) || /\bskip\s+tdd\b/i.test(prompt)) {
    return 'skip';
  }
  if (/--tdd\b/i.test(prompt) || /\buse\s+tdd\b/i.test(prompt)) {
    return 'activate';
  }

  if (SKIP_PATTERNS.some(p => p.test(prompt))) return 'skip';
  if (ACTIVATE_PATTERNS.some(p => p.test(prompt))) return 'activate';
  if (SUGGEST_PATTERNS.some(p => p.test(prompt))) return 'suggest';

  return 'skip';
}

function main(): void {
  let inputData: HookInput;
  try {
    inputData = JSON.parse(readFileSync(0, 'utf-8')) as HookInput;
  } catch {
    return;
  }

  const prompt = inputData.user_prompt ?? '';
  const decision = classify(prompt);

  if (decision === 'activate') {
    const instruction = `
<user-prompt-submit-hook>
INSTRUCTION: MANDATORY SKILL ACTIVATION SEQUENCE

Step 1 - EVALUATE:
For each skill in <available_skills>, determine if it applies to this request:
- tdd-integration: YES if implementing new features/functionality, NO for bug fixes/docs/config

Step 2 - ACTIVATE:
IF tdd-integration is YES → Use Skill(tdd-integration) tool NOW
IF no skills are YES → State "No TDD skill needed" and proceed normally

Step 3 - IMPLEMENT:
Only after Step 2 is complete, proceed with implementation.

CRITICAL: You MUST invoke Skill() tool in Step 2 for feature implementation requests.
Do NOT skip to implementation without skill evaluation.

TDD REMINDER:
- New features REQUIRE: RED (test first) -> GREEN (implement) -> REFACTOR
- Each phase uses dedicated subagent with context isolation
- Tests are SACRED - never modify during GREEN phase
</user-prompt-submit-hook>
`;
    stdout.write(instruction.trim());
  } else if (decision === 'suggest') {
    const suggestion = `
<user-prompt-submit-hook>
SUGGESTION: This request may benefit from TDD workflow.

Consider using Skill(tdd-integration) if you are adding new behavior or functionality.
If this is purely a refactoring or fix without new behavior, proceed without TDD.

You may invoke Skill(tdd-integration) manually, or proceed directly with implementation.
</user-prompt-submit-hook>
`;
    stdout.write(suggestion.trim());
  }
  // decision === 'skip': output nothing
}

main();
