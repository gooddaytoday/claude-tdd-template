# Claude Code Configuration Template

**This is a reusable configuration template for Claude Code CLI.**

This directory contains a complete Claude Code CLI setup with TDD workflow, Task Master integration, security policies, and TypeScript/Node.js tooling support. Copy this configuration to any project and customize as needed.

## Quick Setup

1. Copy the `.claude/` directory to your project
2. Follow the [SETUP.md](../SETUP.md) guide in the root directory
3. Customize npm scripts and paths for your project

## What's Included

- **TDD Workflow**: Red-Green-Refactor cycle with dedicated subagents
- **Task Master Integration**: Project management and task tracking
- **Security Policies**: Pre-configured permissions for safe AI assistance
- **TypeScript/Node.js Support**: npm scripts, linting, formatting
- **Docker Support**: Docker and docker-compose commands
- **Git Integration**: Safe git operations with confirmation prompts
- **Test Guard**: Prevents implementation agents from modifying tests

---

This directory contains the Claude Code CLI configuration for the project.

## Files

- **`settings.json`** - Main project configuration (committed to git)
  - Defines allowed tools and commands
  - Configured with `acceptEdits` mode to work without constant confirmations

- **`settings.local.json`** - Personal overrides (NOT committed, in .gitignore)
  - Use for local experiments and overriding settings

## Working Modes

### Current mode: `acceptEdits` (default)
```bash
claude
```
Automatically approves file changes, only requests confirmation for critical bash commands.

### Other modes

```bash
# Safe mode - requires confirmation for everything
claude --permission-mode default

# Planning mode - read-only, no changes
claude --permission-mode plan
```

## What's Automatically Allowed

✅ **File operations:**
- Read, Glob, Grep
- Edit and Write for src/**, tests/**, .taskmaster/**, configs

✅ **NPM commands:**
- npm run dev/build/lint/format
- npm install

✅ **Git commands:**
- git status/diff/log
- git add/commit
- git branch/checkout/pull

✅ **Task Master:**
- task-master * (all commands)
- Skill(tm:*) (all skills)

❓ **Requires confirmation:**
- git push/rebase/merge
- Editing package-lock.json, tsconfig.json

❌ **Denied:**
- Access to .env files
- rm -rf commands
- sudo, chmod 777
- git push --force, git reset --hard

## Customization Guide

### Common Customizations

**For different npm scripts:**
Edit `settings.json` permissions section to match your package.json scripts.

**For different directory structures:**
Update `Edit(src/**)` and `Write(src/**)` patterns in `settings.json` to match your project layout.

**For non-TypeScript projects:**
Remove TypeScript-specific commands (tsc, ts-node) from `settings.json`.

**For projects without Docker:**
Remove Docker-related permissions from `settings.json`.

**Personal preferences:**
Create `.claude/settings.local.json` to override settings without modifying the committed configuration.

### Key Configuration Files

- **`settings.json`** - Main configuration (model, permissions, hooks)
- **`settings.local.json`** - Personal overrides (not committed)
- **`hooks/`** - TypeScript hooks for TDD guard and skill evaluation
- **`agents/`** - TDD subagent definitions
- **`commands/`** - Custom command definitions (tdd-integration skill)

## Detailed Documentation

See [SETUP.md](../SETUP.md) in the root directory for complete setup instructions and troubleshooting.
