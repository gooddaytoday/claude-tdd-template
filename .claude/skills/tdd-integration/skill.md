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
- `--slice=vertical` — Vertical slicing: one test → one implementation → repeat (default)
- `--slice=horizontal` — Horizontal slicing: all tests first, then all implementation (legacy)

Examples:
```
/tdd-integration implement user validation --test-type=unit
/tdd-integration add payment processing --test-type=integration
/tdd-integration create config loader --task=2.4
/tdd-integration implement order processing --slice=horizontal
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

### Vertical Slicing (default: `--slice=vertical`)

```
PRE-PHASE → PLAN → [RED₁ → GREEN₁ → RED₂ → GREEN₂ → ... → REDₙ → GREENₙ] → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS → TELEMETRY → DONE
                                                                                             |               |
                                                                                             ↓               ↓
                                                                                         fix-routing     fix-routing
                                                                                        (impl/refac)     (impl only)
```

The orchestrator loops RED→GREEN for each behavior from the Behavior Plan, then proceeds to REFACTOR after all behaviors are implemented. Each RED invokes `tdd-test-writer` for one behavior; each GREEN invokes `tdd-implementer` for that behavior.

### Horizontal Slicing (legacy: `--slice=horizontal`)

```
PRE-PHASE → RED → GREEN → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS → TELEMETRY → DONE
```

Single RED writes all tests; single GREEN implements all code. PLAN phase is skipped.

### Phase Transitions

| From | To | Gate Condition |
|---|---|---|
| PRE-PHASE | PLAN | Context Packet assembled, test type determined, slicing mode set |
| PLAN | RED[1] | Behavior Plan confirmed by user (vertical) |
| PLAN | RED | Skipped automatically (horizontal) |
| RED[i] | GREEN[i] | Test FAILS with assertion error (orchestrator-verified) |
| GREEN[i] | RED[i+1] | ALL tests PASS (orchestrator-verified), more behaviors remain |
| GREEN[N] | REFACTOR | ALL tests PASS (orchestrator-verified), no more behaviors |
| GREEN | REFACTOR | Test PASSES (orchestrator-verified) (horizontal mode) |
| REFACTOR | CODE_REVIEW | Tests remain green (orchestrator-verified) |
| CODE_REVIEW | ARCH_REVIEW | Status=passed (no critical/major issues) |
| ARCH_REVIEW | DOCS | Status=passed OR integration-subtask-created |
| DOCS | TELEMETRY | Documentation saved |
| TELEMETRY | DONE | Run report written to airefinement/artifacts/runs/ |

### Retry Transitions

| From | Back To | Condition |
|---|---|---|
| RED[i] verification | RED[i] | Test passes (should fail) or import/syntax error |
| GREEN[i] verification | GREEN[i] | Test still fails (max 3 retries, then escalate) |
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
Read `phases/pre-phase.md`. Assembles Context Packet (see `schemas/context-packet.md`). Determines slicing mode.

### Plan Phase: Behavior Decomposition (vertical slicing only)
Read `phases/plan.md`. Orchestrator decomposes feature into behaviors, selects tracer bullet, confirms with user. Skipped when `--slice=horizontal`.

### Phases 1..N: RED→GREEN Vertical Loop (vertical slicing)
For each behavior in the Behavior Plan:
1. Read `phases/red.md`. Invoke `tdd-test-writer` for **one behavior**. Gate: test must FAIL.
2. Read `phases/green.md`. Invoke `tdd-implementer` for **that behavior**. Gate: ALL tests must PASS.
3. Update Context Packet with iteration results.
4. If more behaviors remain, go to step 1 for next behavior.

### Phase 1: RED — Write Failing Test (horizontal slicing)
Read `phases/red.md`. Invoke `tdd-test-writer` for all behaviors at once. Gate: test must FAIL.

### Phase 2: GREEN — Make It Pass (horizontal slicing)
Read `phases/green.md`. Invoke `tdd-implementer`. Gate: test must PASS.

### Phase 3: REFACTOR — Improve Quality
Read `phases/refactor.md`. Invoke `tdd-refactorer`. Gate: tests stay GREEN. Runs after ALL behaviors are implemented (vertical) or after single GREEN (horizontal).

### Phase 4: CODE REVIEW — Verify Quality
Read `phases/code-review.md`. Invoke `tdd-code-reviewer`. Gate: no critical/major issues. Fix-routing handled by orchestrator.

### Phase 5: ARCHITECTURE REVIEW — Ensure Integration
Read `phases/arch-review.md`. Invoke `tdd-architect-reviewer`. Gate: code integrated. On last subtask: Full Task Review (see `forms/architect-full-task-review.md`).

### Phase 6: DOCUMENTATION — Save Details
Read `phases/docs.md`. Invoke `tdd-documenter`. Gate: documentation saved.

### Phase 7: TELEMETRY -- Record Run Report
Read `phases/telemetry.md`. Invoke `tdd-telemetry-reporter`. Gate: JSON file exists in airefinement/artifacts/runs/.

## Orchestrator Verification Protocol

**CRITICAL: The orchestrator MUST verify test outcomes independently after RED, GREEN, and REFACTOR phases.**

Phase Packets from subagents are summaries — NOT the source of truth. The orchestrator's own test run IS the source of truth.

### Verification commands

After **RED[i]**: run test command for behavior i, expect non-zero exit + assertion error (not import/syntax).
After **GREEN[i]**: run **ALL** test commands (all behaviors implemented so far + current), expect zero exit + all test names in passing output.
After **REFACTOR**: run all test commands, expect zero exit.
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
Feature 1: PLAN → [RED→GREEN]* → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS → TELEMETRY
Feature 2: PLAN → [RED→GREEN]* → REFACTOR → CODE_REVIEW → ARCH_REVIEW → DOCS → TELEMETRY
```

### Vertical Loop Detail (within one feature)
```
Behavior 1 (tracer bullet): RED[1] → verify-fail → GREEN[1] → verify-all-pass
Behavior 2:                 RED[2] → verify-fail → GREEN[2] → verify-all-pass
Behavior 3:                 RED[3] → verify-fail → GREEN[3] → verify-all-pass
→ REFACTOR → ...
```

## Phase Violations (CRITICAL — never do this)

- Write implementation before test
- Proceed without orchestrator verification at any gate
- Skip any phase (including PLAN and REFACTOR evaluation)
- Modify tests during GREEN, REFACTOR, CODE_REVIEW, ARCH_REVIEW, DOCS, or TELEMETRY phases
- Ignore needs-fix status from reviewers
- Route fixes from within reviewer subagents (orchestrator's job)
- Trust Phase Packet status without running the test command yourself
- Start new feature before current cycle completes
- Write all tests before any implementation (horizontal slicing in vertical mode)
- Anticipate future behaviors during GREEN — implement only what the current test requires

## Known Anti-Patterns

- **Horizontal slicing**: Writing all tests first, then all implementation — tests end up testing imagined behavior, not actual behavior. Use vertical slicing instead.
- **Spec drift**: Rewriting tests instead of fixing implementation (guard blocks this)
- **Silent test disabling**: `.skip`/`.only`/`xdescribe`/`if(false)` to bypass failing tests
- **Status hallucination**: Claiming "tests pass" without running them
- **Phase jumping**: Skipping phases or premature delegation
- **Over-implementation**: Features not required by current failing test
- **Future anticipation**: Implementing behaviors not yet tested during GREEN[i]
- **Guard tampering**: Modifying enforcement files during TDD cycle
- **Subset testing**: Running only some tests to get "green" while others are red
- **Fabricated excerpts**: Fake test output in Phase Packets

## Status Reporting

After each complete TDD cycle, report:

```
## TDD Cycle Summary

**Feature**: [feature name]
**Status**: Complete
**Slicing**: vertical | horizontal
**Task Context**: Task [ID], Subtask [ID]

### Vertical Loop (if vertical slicing)
| Behavior | RED | GREEN | Test |
|----------|-----|-------|------|
| 1. [tracer] [desc] | Done | Done | [test name] |
| 2. [desc] | Done | Done | [test name] |
| ... | ... | ... | ... |

### Phases
| Phase | Status | Subagent | Output |
|-------|--------|----------|--------|
| PLAN | Done | orchestrator | [N behaviors planned] |
| RED→GREEN | Done | tdd-test-writer / tdd-implementer | [N iterations] |
| REFACTOR | Done | tdd-refactorer | [changes/none] |
| CODE REVIEW | Done | tdd-code-reviewer | [issues: X fixed] |
| ARCHITECTURE | Done | tdd-architect-reviewer | [integration: verified] |
| DOCUMENTATION | Done | tdd-documenter | [saved to task-master] |
| TELEMETRY | Done | tdd-telemetry-reporter | [run report file] |

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
