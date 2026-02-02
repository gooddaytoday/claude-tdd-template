#!/usr/bin/env npx tsx
import { readFileSync } from 'node:fs';
import { stdout } from 'node:process';

function main(): void {
  // Consume stdin (required for hooks)
  readFileSync(0, 'utf-8');

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
}

main();
