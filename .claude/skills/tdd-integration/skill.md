---
name: tdd-integration
description: Enforce Test-Driven Development with strict Red-Green-Refactor-Review cycle. Auto-triggers on "implement", "add feature", "build", "create functionality". Includes code review and architecture review phases. Does NOT trigger for bug fixes, docs, or config.
---

# TDD Integration Skill

Enforce strict Test-Driven Development using Red-Green-Refactor-Review cycle with dedicated subagents.

## Arguments (Optional)

- `--test-type=unit` — Force unit tests only
- `--test-type=integration` — Force integration tests only
- `--test-type=both` — Write both unit and integration tests
- `--task=<id>` — Use specific task-master task ID for context

Examples:
```
/tdd-integration implement user validation --test-type=unit
/tdd-integration add payment processing --test-type=integration
/tdd-integration create config loader --task=2.4
```

## When to Trigger

**ACTIVATE for:**
- "implement [feature]", "add [functionality]", "create [new feature]"
- "build [capability]", "develop [feature]"
- Any new feature development

**DO NOT ACTIVATE for:**
- Bug fixes, documentation updates, configuration changes
- Refactoring existing code (outside TDD cycle), test-only changes

Full activation rules: `policies/auto-activation-rules.md`

## State Machine

```
PRE-PHASE → RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS → DONE
                                          |               |
                                          ↓               ↓
                                      fix-routing     fix-routing
                                     (impl/refac)     (impl only)
                                          |               |
                                          ↓               ↓
                                    re-invoke         re-invoke
                                    reviewer          reviewer
```

### Phase Transitions

| From | To | Gate Condition |
|---|---|---|
| PRE-PHASE | RED | Context Packet assembled, test type determined |
| RED | GREEN | Test FAILS with assertion error (orchestrator-verified) |
| GREEN | REFACTOR | Test PASSES (orchestrator-verified) |
| REFACTOR | CODE_REVIEW | Tests remain green (orchestrator-verified) |
| CODE_REVIEW | ARCH_REVIEW | Status=passed (no critical/major issues) |
| ARCH_REVIEW | DOCS | Status=passed OR integration-subtask-created |
| DOCS | DONE | Documentation saved |

### Retry Transitions

| From | Back To | Condition |
|---|---|---|
| RED verification | RED | Test passes (should fail) or import/syntax error |
| GREEN verification | GREEN | Test still fails (max 3 retries, then escalate) |
| REFACTOR verification | REFACTOR | Tests broke (rollback + retry) |
| CODE_REVIEW | fix → CODE_REVIEW | needs-fix (adaptive limit: 3-5 cycles) |
| ARCH_REVIEW | fix → ARCH_REVIEW | needs-fix (adaptive limit: 3-5 cycles) |

## Safety Mechanisms

**TDD Guard Hook** (`.claude/hooks/prevent-test-edit.ts`):
- Blocks test file modifications outside RED phase
- Session-scoped state with TTL (fail-closed)
- Semantic test-disabling detection
- Enforcement file protection

Full policy: `policies/guard-rules.md`

## Phase Execution

For each phase, read the corresponding phase file for delegation details, expected output, and failure playbooks.

### Pre-Phase: Context Assembly
Read `phases/pre-phase.md`. Assembles Context Packet (see `schemas/context-packet.md`).

### Phase 1: RED — Write Failing Test
Read `phases/red.md`. Invoke `tdd-test-writer`. Gate: test must FAIL.

### Phase 2: GREEN — Make It Pass
Read `phases/green.md`. Invoke `tdd-implementer`. Gate: test must PASS.

### Phase 3: REFACTOR — Improve Quality
Read `phases/refactor.md`. Invoke `tdd-refactorer`. Gate: tests stay GREEN.

### Phase 4: CODE REVIEW — Verify Quality
Read `phases/code-review.md`. Invoke `tdd-code-reviewer`. Gate: no critical/major issues. Fix-routing handled by orchestrator.

### Phase 5: ARCHITECTURE REVIEW — Ensure Integration
Read `phases/arch-review.md`. Invoke `tdd-architect-reviewer`. Gate: code integrated. On last subtask: Full Task Review (see `forms/architect-full-task-review.md`).

### Phase 6: DOCUMENTATION — Save Details
Read `phases/docs.md`. Invoke `tdd-documenter`. Gate: documentation saved.

## Orchestrator Verification Protocol

**CRITICAL: The orchestrator MUST verify test outcomes independently after RED, GREEN, and REFACTOR phases.**

Phase Packets from subagents are summaries — NOT the source of truth. The orchestrator's own test run IS the source of truth.

### Verification commands

After **RED**: run test command, expect non-zero exit + assertion error (not import/syntax).
After **GREEN**: run test command, expect zero exit + test name in passing output.
After **REFACTOR**: run test command, expect zero exit.
After **fix-routing**: run test command after each fix subagent completes.

### Fix-Routing Protocol (CODE_REVIEW and ARCH_REVIEW)

Both review phases use the same adaptive fix-routing:

1. Parse `FixRequest[]` from reviewer output
2. Sort by severity DESC, then dependsOn (dependencies first)
3. Route to appropriate subagent (implementer or refactorer)
4. Run tests after each fix to confirm green
5. Re-invoke reviewer
6. Repeat until passed or cycle limit reached

**Adaptive cycle limit:**
- Base: 3 cycles
- Clear progress (decreasing FixRequest count): up to 5
- No progress (same FixRequest 2x): escalate immediately
- Tests break after fix: rollback + escalate

Details in `phases/code-review.md` and `phases/arch-review.md`.

## Workflow for Multiple Features

Complete full cycle for EACH feature:
```
Feature 1: RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS
Feature 2: RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS
```

## Phase Violations (CRITICAL — never do this)

- Write implementation before test
- Proceed without orchestrator verification at any gate
- Skip any phase (including REFACTOR evaluation)
- Modify tests during GREEN, REFACTOR, CODE_REVIEW, ARCH_REVIEW, or DOCS phases
- Ignore needs-fix status from reviewers
- Route fixes from within reviewer subagents (orchestrator's job)
- Trust Phase Packet status without running the test command yourself
- Start new feature before current cycle completes

## Known Anti-Patterns

- **Spec drift**: Rewriting tests instead of fixing implementation (guard blocks this)
- **Silent test disabling**: `.skip`/`.only`/`xdescribe`/`if(false)` to bypass failing tests
- **Status hallucination**: Claiming "tests pass" without running them
- **Phase jumping**: Skipping phases or premature delegation
- **Over-implementation**: Features not required by current failing test
- **Guard tampering**: Modifying enforcement files during TDD cycle
- **Subset testing**: Running only some tests to get "green" while others are red
- **Fabricated excerpts**: Fake test output in Phase Packets

## Status Reporting

After each complete TDD cycle, report:

```
## TDD Cycle Summary

**Feature**: [feature name]
**Status**: Complete
**Task Context**: Task [ID], Subtask [ID]

| Phase | Status | Subagent | Output |
|-------|--------|----------|--------|
| RED | Done | tdd-test-writer | [test file] |
| GREEN | Done | tdd-implementer | [impl files] |
| REFACTOR | Done | tdd-refactorer | [changes/none] |
| CODE REVIEW | Done | tdd-code-reviewer | [issues: X fixed] |
| ARCHITECTURE | Done | tdd-architect-reviewer | [integration: verified] |
| DOCUMENTATION | Done | tdd-documenter | [saved to task-master] |

**Tests**: All passing (orchestrator-verified)
**Code Quality**: Approved (no critical/major issues)
**Architecture**: Integrated with project structure
**Documentation**: Saved and indexed
**Ready for next feature**: Yes
```

If integration subtask created, add:
```
**Architecture**: Integration subtask added (X.Y)
**Next**: Subtask X.Y will integrate implemented features
```

## Module Documentation

- Phase details: `phases/*.md`
- Data contracts: `schemas/phase-packet.md`, `schemas/context-packet.md`
- Guard policy: `policies/guard-rules.md`
- Activation rules: `policies/auto-activation-rules.md`
- Review checklist: `forms/code-review-checklist.md`
- Full task review: `forms/architect-full-task-review.md`
- Doc templates: `forms/documenter-templates.md`
- Test type detection: `.claude/utils/detect-test-type.md`
