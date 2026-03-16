# Agent Instructions

This repository uses a dual-use TDD Integration Harness that works in both Claude Code CLI and Cursor IDE.

## Source of Truth

All orchestration logic, subagent definitions, hooks, and policies live in `.claude/`:

- **Orchestrator**: `.claude/skills/tdd-integration/skill.md`
- **Subagents**: `.claude/agents/tdd-*.md` (7 agents for 7 TDD phases)
- **Guard hooks**: `.claude/hooks/prevent-test-edit.ts` (technical enforcement)
- **Policies**: `.claude/skills/tdd-integration/policies/`
- **Phase details**: `.claude/skills/tdd-integration/phases/`

See `CLAUDE.md` for TDD philosophy, commands, and module documentation.

## Cursor IDE Setup

1. Enable **Third-party skills** in Cursor Settings > Features
2. Restart Cursor to load hooks from `.claude/settings.json`
3. Task Master MCP is configured in `.cursor/mcp.json`
4. TDD rules are in `.cursor/rules/tdd-guard.mdc` and `.cursor/rules/tdd-workflow.mdc`

## Task Master

Task orchestration uses Task Master AI (MCP). Both CLI and Cursor connect to the same backend.
See `.claude/TASKMASTER_WORKFLOW.md` for the recommended task lifecycle.
