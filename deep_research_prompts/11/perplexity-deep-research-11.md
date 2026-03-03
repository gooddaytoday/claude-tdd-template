# Cursor Adaptation of Claude TDD Agent Harness

## Overview

This report analyzes how to adapt the existing `.claude/` TDD-oriented multi‑agent harness to run reliably in both Claude Code CLI and Cursor IDE, without regressing current behavior or weakening TDD enforcement. The goal is a dual‑use repository where `.claude` remains the orchestration and policy source of truth, while Cursor contributes IDE‑level rules, MCP wiring, and documentation to boost quality across all TDD phases.[^1][^2][^3][^4][^5]


## 1. Source‑of‑truth between `.claude` and Cursor

### 1.1 What should stay centralized in `.claude/`

Claude Code remains the only environment that understands agents, skills, hooks, permissions, and Task Master integration exactly as designed, so all executable orchestration must stay in `.claude/`.[^6][^1]
The existing structure with subagents, skills, hooks, policies, and Task Master commands is already aligned with Anthropic’s best practices for agent skills and long‑running harnesses.[^7][^2]

Concretely, the following should be treated as **canonical and not duplicated**:

- `.claude/agents/tdd-*.md` – definitions of the 7 phase subagents, including tool access and model mapping.[^6]
- `.claude/skills/tdd-integration/**` – SKILL.md, phase modules, forms, policies, and schemas; this is the orchestration contract for RED→GREEN→REFACTOR→REVIEW→ARCH_REVIEW→DOCS→TELEMETRY.[^7]
- `.claude/hooks/**` – in particular `prevent-test-edit` and telemetry hooks, which rely on Claude’s hook lifecycle (PreToolUse, SubagentStart/Stop, UserPromptSubmit).[^2]
- `.claude/settings.json` – permissions model for tools and file paths, tuned for the harness.[^8]
- `.claude/commands/**` – TDD and Task Master commands, which encapsulate the workflow entrypoints.[^5]
- `airefinement/**` – refinement/eval pipeline that consumes telemetry and violations emitted by the harness.[^2]

These elements should not be re‑implemented in Cursor; instead, Cursor should be taught to **respect and cooperate with** this harness, not to replace it.


### 1.2 What belongs on the Cursor side

Cursor does not expose a hook lifecycle, subagent config, or a skill system identical to Claude’s, but it does provide project rules (`.cursor/rules/*.mdc`), AGENTS.md style documentation, MCP integration, and @Docs indexing.[^9][^4][^10][^11]
Those capabilities map naturally to **persistent instructions and IDE‑level integrations**, not to executable orchestration.

Cursor should own:

- `.cursor/rules/*.mdc` – project rules encoding high‑level TDD policies, guardrails, and phase‑specific guidance.
- `.cursor/index.mdc` – an always‑applied project overview summarizing the harness, Task Master, and TDD expectations.[^12]
- `.cursor/mcp.json` – Task Master AI MCP config so Cursor and Claude Code CLI talk to the same Task Master backend.[^13][^14]
- `AGENTS.md` (optional but recommended) – a repo‑level “README for agents” that explains the multi‑agent TDD harness, how `.claude` and `.cursor` interact, and how Task Master is used.[^10]
- @Docs entries indexing Anthropic engineering posts, Task Master docs, and this project’s CLAUDE.md/airefinement docs to keep them in Cursor’s retrieval space.[^11][^15][^5]

The **source‑of‑truth split** is therefore:

| Concern | Source of Truth | Cursor Representation |
|--------|-----------------|------------------------|
| Subagent definitions, models, tools | `.claude/agents` | Referenced in AGENTS.md and rules, not duplicated[^6][^10] |
| TDD orchestration (phases, packets, policies) | `.claude/skills/tdd-integration` | Summarized as rules and docs[^7][^4] |
| Guard hooks, permissions enforcement | `.claude/hooks`, `.claude/settings.json` | Mirrored as **soft** rules and pre‑commit checks[^2][^8][^4] |
| Task Master workflow and config | Task Master repo + `.taskmaster` files | Shared MCP server + docs rules[^16][^5][^14] |
| IDE behavior and UX hints | Cursor (`.cursor/**`) | Project rules, @Docs, AGENTS.md[^4][^12][^11][^10] |


## 2. Mapping `.claude` hooks & permissions to Cursor capabilities

### 2.1 TDD Guard (`prevent-test-edit`) in Cursor terms

The existing TDD Guard uses Claude hooks to:

- Track active subagent in `.claude/.guard-state.json` and tie Write/Edit permissions to that agent.[^17]
- Block test modifications in `tests/**` except for `tdd-test-writer` and the main agent.[^17]
- Protect enforcement files (`.claude/hooks/**`, `.claude/skills/**`, `.claude/settings.json`) from edits.[^17]
- Detect semantic disabling of tests (skip/only/xdescribe/xit) and log violations.[^17]

Cursor cannot intercept file writes, but **rules can encode the same policies as high‑priority instructions** that are injected into every request or when relevant files are touched.[^4][^9]

Recommended mapping:

- Create `.cursor/rules/tdd-guard.mdc` as an **Always** rule with:
  - A concise summary of the TDD phases and which roles are allowed to edit tests.
  - Explicit instructions to Cursor’s agent to treat `tests/**` as read‑only unless the user explicitly says they are in RED phase and asking to modify tests.
  - A prohibition on adding `.skip`, `.only`, `xdescribe`, or `xit` except when a human explicitly requests disabling a specific test, with a requirement to explain the risk.
  - Instructions never to edit `.claude/hooks/**`, `.claude/skills/**`, `.claude/settings.json`, or `airefinement/**` unless the human explicitly asks for harness maintenance.

Cursor rules of type **Always** and **Auto Attached** are injected into the model’s context consistently, which makes them a good analogue for hook‑level policy, even if enforcement is “moral” rather than technical.[^9][^4]

Technical enforcement in Cursor can be partly recovered by:

- Adding a git pre‑commit hook that shells out to the existing TDD Guard CLI (or a small Node script using the same logic) to fail commits that violate test or harness invariants.
- Running the same guard script in CI so violations from either Claude Code CLI or Cursor are visible in `airefinement` artifacts.


### 2.2 Auto‑activation hook in Cursor terms

The `.claude/hooks/user-prompt-skill-eval.ts` hook auto‑activates the TDD skill when the user asks to implement features, and bypasses it for bug fixes/docs/config.
Claude Code hooks can actually modify the system prompt before each run, whereas Cursor has no equivalent event.[^4][^2]

In Cursor, mimic this behavior with **two layers**:

1. **Rule‑based prompting**
   - Create `.cursor/rules/tdd-workflow.mdc` (Always or AgentRequested) describing:
     - When a user describes a new feature, the agent should recommend starting the TDD Integration CLI command (`/tdd-integration` or `npx task-master ...`) instead of ad‑hoc coding.
     - For bugfix/docs/config, the agent may work directly but must still favor small, test‑driven edits.
   - Keep this file short and focused so Cursor can actually load it in context consistently.[^12][^9]

2. **Command‑level affordances**
   - Document in AGENTS.md and CLAUDE.md that the canonical way to start work on a feature is:
     - Use Task Master (`tm-next` or Task Master MCP) to pick the next subtask.
     - Run the TDD integration command, which will spin up subagents and phases through Claude Code CLI.
   - Encourage Cursor users to trigger the harness from the integrated terminal or via Task Master MCP tools in the sidebar, rather than via free‑form “implement X” prompts.

This preserves the intent of auto‑activation—**features go through TDD**—while acknowledging that Cursor cannot inject hooks into its own agent pipeline.


### 2.3 Permissions parity

`.claude/settings.json` gives very granular file and bash permissions per subagent, plus deny/ask lists for secrets and destructive git operations.[^8]
Cursor does not expose a tool permission model but does support:

- `.cursorignore` to keep sensitive or irrelevant files (like `.env`) out of context.[^9]
- Rules that warn against touching protected files or running dangerous commands.

Recommended mapping:

- Add `.cursorignore` mirroring `.claude/settings.json` deny‑list for secrets, build artifacts, and logs where reading them provides little value.[^4][^9]
- Add a `.cursor/rules/shell-guard.mdc` that instructs Cursor’s agent not to suggest `git push`, `rebase`, `merge`, or destructive `docker`/`rm -rf` commands unless the human explicitly asks and acknowledges the risk.[^18][^9]
- Cross‑link this rule with the TDD guard rule so both Claude Code and Cursor respect similar safety policies.


## 3. Unified Task Master orchestration across CLI and Cursor

### 3.1 Task Master as the orchestration backbone

Task Master AI is explicitly designed to work across Claude Code, Cursor, and other AI IDEs through both CLI and MCP, and uses a `.taskmasterconfig` (or `.taskmaster/config.json`) file as its central configuration.[^16][^14][^5]
It already supports a Claude Code provider that runs via Claude Code CLI without an API key, and a Cursor MCP integration that allows the same task commands to be run from the editor.[^19][^14]

For a unified flow:

- Keep a **single Task Master configuration** in the repo (`.taskmasterconfig` or `.taskmaster/config.json`).[^16][^5]
- Configure models for `main`, `research`, and `fallback` once, using Claude Code as provider where appropriate.[^19]
- Ensure both Claude Code CLI and Cursor MCP point to this same config so parent/subtask trees are shared.


### 3.2 Wiring in Claude Code CLI

On the Claude Code side:

- Install Task Master MCP with the recommended quick‑install: `claude mcp add taskmaster-ai -- npx -y task-master-ai`.[^13]
- Use the existing `.claude/commands/tm/*.md` commands as the human entrypoints for `next`, `done`, `check`, etc, which call the Task Master CLI or MCP tools as currently designed.[^5]
- Continue to have the TDD integration SKILL read parent task context from Task Master at pre‑phase and re‑write it at documentation/telemetry phases.

This requires no change for Cursor integration: Task Master remains the authoritative task engine, and Claude Code continues to treat it as such.


### 3.3 Wiring in Cursor IDE

On the Cursor side:

- Add Task Master to `.cursor/mcp.json` as `taskmaster-ai` using the documented MCP config, so the same Node CLI is invoked via MCP when Cursor’s agent calls Task Master tools.[^14][^5]
- Index Task Master’s own docs (`README-task-master.md`, tutorial, command reference) via @Docs so Cursor can explain the workflow and suggest the right commands.[^15][^11][^16][^5]
- Add a `.cursor/rules/task-master.mdc` rule (AgentRequested) describing when Cursor should:
  - Use Task Master tools to pick the next task.
  - Avoid inventing its own untracked TODOs.
  - Defer planning to Task Master rather than embedding subtasks in ad‑hoc prompts.

This yields a **single orchestrated flow**:

1. Human asks Cursor or Claude Code CLI: “What should I do next?”
2. Agent calls Task Master (CLI or MCP) to run `next`.
3. Task Master returns the parent task/subtask.
4. Human then invokes the TDD integration command in Claude Code CLI, which runs the 7‑phase cycle for that subtask.
5. Documentation and telemetry propagate back into Task Master and `airefinement`.

Cursor is therefore a **client** of Task Master, not a competing task system.


## 4. Cursor features that strengthen each TDD phase

Cursor exposes features such as project rules, background agents, multi‑file editing, @Docs, and rich documentation generation that can amplify each phase of the TDD loop when used intentionally.[^20][^21][^9]
The harness should treat Cursor as an assistant layer around the core `.claude` loop, not as a replacement for the loop itself.

### 4.1 RED (tdd-test-writer)

Most impactful Cursor features for the RED phase:

- **Test‑specific rules** – `.cursor/rules/tests-tdd.mdc` (Auto Attached to `tests/**`) that encodes:
  - Preferred test style, structure, and naming.
  - Requirements like AAA pattern, fixtures, parameterization, or Golden dataset usage.
  - Constraints on what a single test is allowed to cover.
- **@Docs for testing standards** – index project testing docs, CLAUDE.md test philosophy, and any `AI_DOCS/tdd-workflow.md`‑style guides so Cursor can pull them into context when asked to write tests.[^22][^11]
- **Scoped background agent** – use Cursor’s agent to refactor or sketch tests in scratch files or comments before the TDD harness actually writes them via `tdd-test-writer`, if a human wants exploratory help.

This mirrors approaches from dedicated TDD templates and test‑generator skills, which enforce project‑specific testing conventions before test generation.[^23][^22]


### 4.2 GREEN (tdd-implementer)

For GREEN, the goal is minimal code to make tests pass while preserving guardrails:

- **Multi‑file understanding** – Cursor’s agent is effective at understanding cross‑file dependencies when supported by @Docs indexing and rules that describe architecture patterns.[^15][^20]
- **Rules emphasizing “smallest change”** – a `.cursor/rules/tdd-green.mdc` that:
  - Reminds the agent to favor the smallest change that passes the current tests.
  - Prohibits adding new public APIs or changing unrelated modules during GREEN.
  - Pushes architectural reshaping to the REFACTOR phase, which the harness will handle via `tdd-refactorer`.

Anthropic’s guidance for effective tools and long‑running harnesses emphasizes small, verifiable steps with explicit verification loops; these rules help translate that into Cursor’s environment.[^2][^8]


### 4.3 REFACTOR (tdd-refactorer)

For REFACTOR, Cursor’s strength is safe, mechanical changes across multiple files:

- **Multi‑file editing and structured search/replace** – use Cursor’s refactor commands and multi‑file edits to apply patterns, such as extracting helpers or renaming symbols.
- **Rules for behavior preservation** – a `.cursor/rules/refactor-safety.mdc` that:
  - Explicitly distinguishes structural vs behavioral changes and bans new behavior during REFACTOR.[^23]
  - Requires running tests after each significant refactor step.
- **@Docs architecture guides** – index architecture overviews and module‑level CLAUDE.md files so Cursor can evaluate refactors against intended design.[^21][^11]

This aligns with “Tidy First” and disciplined REFACTOR phases described in other TDD harness templates.[^23]


### 4.4 CODE REVIEW (tdd-code-reviewer)

Cursor has built‑in “review this diff” and documentation tools that can complement the tdd‑code‑reviewer subagent:

- **Review rules** – `.cursor/rules/code-review-checklist.mdc` encoding:
  - Checklists for correctness, readability, test coverage, security, and performance.
  - Severity levels (critical/major/minor) matching the harness’ CODE REVIEW gate.
- **Diff‑based review** – use Cursor’s diff view and ask it to review just the TDD cycle diff before handing final review to `tdd-code-reviewer`.
- **@Docs for project conventions** – ensure code‑review rules point to project‑specific style and architecture guides.[^11][^21][^9]

Anthropic’s multi‑agent research system emphasizes subagents that independently gather evidence and return structured findings; Cursor’s review can act as an auxiliary reviewer whose findings are then checked by the dedicated tdd‑code‑reviewer subagent.[^3]


### 4.5 ARCHITECTURE REVIEW (tdd-architect-reviewer)

For architecture review and integration:

- **Architecture rules** – `.cursor/rules/architecture.mdc` describing the layering, module boundaries, and allowed dependencies, so Cursor can reason about integration choices.[^24][^25]
- **@Docs for external architecture docs** – index any external design docs or ADRs so Cursor can reference them like a human architect.[^11][^15]
- **Background agents for impact analysis** – let Cursor scan references and call external docs MCPs (e.g., Context7 or other RAG‑style MCPs) to understand broader impact of integration changes.[^25]

These features support the Full Task Review on the final subtask by helping identify orphaned or mis‑integrated code, which can then be formalized by the `tdd-architect-reviewer` subagent.


### 4.6 DOCUMENTATION (tdd-documenter)

Cursor’s documentation generation is directly applicable here:

- **Doc generation tools** – Cursor provides features for generating READMEs, API docs, and architecture overviews that reflect current code.[^21]
- **Rules for documentation style** – `.cursor/rules/docs-style.mdc` encoding:
  - Preferred tone, structure, and location of documentation.
  - Requirements that CLAUDE.md and Task Master documentation are updated after significant changes.
- **@Docs indexing of CLAUDE.md and module‑level docs** – ensure the doc generator is grounded in existing AI‑specific docs, not just code comments.[^11]

The `tdd-documenter` subagent remains in charge of updating Task Master and CLAUDE.md, while Cursor can assist humans with richer narrative docs and diagrams.


### 4.7 TELEMETRY (tdd-telemetry-reporter)

TELEMETRY is less about code and more about run‑level artifacts:

- **Terminal integration** – encourage users to run the existing telemetry commands and `airefinement` CLI within Cursor’s terminal.
- **Rules for telemetry discipline** – `.cursor/rules/telemetry.mdc` that:
  - Reminds agents to preserve and not overwrite `airefinement/artifacts/**` except through designated commands.
  - Suggests re‑running evals when large changes are made to `.claude/agents`, `.claude/skills`, or hooks.
- **@Docs for `airefinement`** – index the module’s docs to help Cursor explain how telemetry and evals fit into the loop.[^2][^11]

Cursor therefore augments observability and discipline but does not own telemetry logic.


## 5. Dual‑use repository structure

### 5.1 Proposed layout

A dual‑use layout that minimizes maintenance while giving Cursor enough context could look like:

```text
/ (repo root)
  README.md
  CLAUDE.md
  AGENTS.md              # optional, agent-focused overview
  .taskmasterconfig or .taskmaster/config.json

  .claude/
    agents/
    skills/
    hooks/
    commands/
    settings.json
    TASKMASTER_WORKFLOW.md

  .cursor/
    index.mdc            # Always-applied project overview & key rules
    mcp.json             # Task Master MCP wiring
    rules/
      tdd-guard.mdc
      tdd-workflow.mdc
      tests-tdd.mdc
      tdd-green.mdc
      refactor-safety.mdc
      code-review-checklist.mdc
      architecture.mdc
      docs-style.mdc
      telemetry.mdc

  airefinement/
    artifacts/
    ...
```

This structure follows Cursor’s guidance for project rules (index.mdc + scoped `.cursor/rules/*.mdc`) and AGENTS.md, while keeping all executable harness logic strictly under `.claude/`.[^10][^12][^4]


### 5.2 Minimizing duplication

To avoid drift between `.claude` and `.cursor`:

- Rules should **summarize** harness behavior, not restate phase prompts or full skill content.
- AGENTS.md should link to `.claude/skills/tdd-integration/skill.md`, CLAUDE.md, and TASKMASTER_WORKFLOW.md for details, rather than copying them.[^7][^10][^5]
- When `airefinement` proposes changes to agents/skills/hooks, the refinement scope should be explicitly limited to `.claude/**` and the AGENTS.md file; Cursor rules should be updated manually or through a small helper script that regenerates high‑level rule text from structured metadata.

This keeps `.claude` as the **only executable configuration** and treats Cursor as a thin, documentation‑driven adaptation layer.


## 6. Concrete implementation steps

The following incremental plan adapts the harness for Cursor while preserving existing Claude Code behavior:

1. **Stabilize `.claude` as canonical**
   - Audit `.claude/agents`, `.claude/skills/tdd-integration`, `.claude/hooks`, and `.claude/settings.json` to ensure they fully describe the current 7‑phase TDD loop and Task Master integration.[^1][^7][^2]
   - Ensure telemetry and TDD Guard violations flow into `airefinement/artifacts/**` as expected.[^2]

2. **Add Task Master cross‑editor wiring**
   - Confirm Task Master CLI and Claude Code provider are configured via `.taskmasterconfig` / `.taskmaster/config.json` as in official docs.[^16][^19]
   - Add `.cursor/mcp.json` config for `taskmaster-ai` so Cursor uses the same server.[^14]
   - Index Task Master docs via @Docs.

3. **Introduce AGENTS.md**
   - Create AGENTS.md at repo root following the agents.md conventions, explaining:
     - The main TDD integration orchestrator.
     - The 7 subagents and their phases.
     - The relationship between `.claude`, Task Master, and Cursor.[^10]

4. **Create base Cursor configuration**
   - Add `.cursor/index.mdc` with:
     - Short project overview.
     - High‑level TDD contract: all new features go through the TDD integration harness; tests are not edited outside RED, etc.[^12][^4]
   - Add `.cursorignore` mirroring secret and noise exclusions from `.claude/settings.json`.

5. **Implement phase‑aligned rules**
   - Add the rules outlined in section 4 (guard, tests, GREEN, REFACTOR, review, architecture, docs, telemetry), keeping each file focused and under ~100 lines as recommended for rule clarity.[^9][^12]
   - Make `tdd-guard.mdc` an Always rule; others can be Auto Attached or AgentRequested depending on scope.

6. **Wire @Docs and external context**
   - Index:
     - CLAUDE.md and module‑level docs.
     - TASKMASTER_WORKFLOW.md.
     - Anthropic’s key engineering posts on agents, context engineering, and tools.[^3][^24][^1][^8][^2]
     - Task Master docs.
   - This gives Cursor the same conceptual background the harness assumes.

7. **Run joint evals with `airefinement`**
   - Design `airefinement` runs that simulate mixed usage:
     - TDD cycles run entirely via Claude Code CLI.
     - TDD cycles where humans sometimes use Cursor for RED/GREEN/REFACTOR help while the orchestrator still runs in `.claude`.
   - Compare violation rates, test coverage, and regression scores before and after Cursor integration.[^3][^2]

8. **Iterate on rules based on telemetry**
   - Feed new violations (e.g., Cursor suggesting skipping tests, editing harness files, or bypassing Task Master) into the `airefinement` loop.
   - Tighten rules or add new ones to address recurring failure modes.

Following this plan yields a **dual‑use TDD harness** where:

- Claude Code CLI remains the orchestrator and enforcer.
- Task Master continues to manage parent/subtask lifecycles across tools.
- Cursor enhances each phase through rules, @Docs, and MCP integrations without forking the harness logic.
- `airefinement` evaluates the system end‑to‑end and guides further refinements over time.[^3][^2]

---

## References

1. [Building agents with the Claude Agent SDK](https://www.anthropic.com/engineering/building-agents-with-the-claude-agent-sdk) - The Claude Agent SDK's compact feature automatically summarizes previous messages when the context l...

2. [Effective harnesses for long-running agents - Anthropic](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents) - The Claude Agent SDK is a powerful, general-purpose agent harness adept at coding, as well as other ...

3. [How we built our multi-agent research system - Anthropic](https://www.anthropic.com/engineering/multi-agent-research-system) - Each Subagent independently performs web searches, evaluates tool results using interleaved thinking...

4. [Cursor – Rules](https://docs.cursor.com/en/context/rules) - Control how the Agent model behaves with reusable, scoped instructions.

5. [claude-task-master/README.md at main · eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master/blob/main/README.md) - An AI-powered task-management system you can drop into Cursor, Lovable, Windsurf, Roo, and others. -...

6. [Create custom subagents - Claude Code Docs](https://code.claude.com/docs/en/sub-agents) - Create and use specialized AI subagents in Claude Code for task-specific workflows and improved cont...

7. [Equipping agents for the real world with Agent Skills - Claude](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) - Finally, code can serve as both executable tools and as documentation. It should be clear whether Cl...

8. [Writing effective tools for AI agents—using AI agents - Anthropic](https://www.anthropic.com/engineering/writing-tools-for-agents) - Simply concatenate the transcripts from your evaluation agents and paste them into Claude Code. Clau...

9. [Mastering .cursorignore, .cursor/rules, and @Docs in Cursor IDE ...](https://swiftpublished.com/article/cursor-rules,-docs,-ignore) - Explore how Cursor IDE uses .cursorignore, .cursor/rules, and @Docs to control AI context and improv...

10. [Add AGENTS.md file · Issue #357 · microsoft/ai-agents-for-beginners](https://github.com/microsoft/ai-agents-for-beginners/issues/357) - AGENTS.md is a Markdown file that serves as a "README for agents" - a dedicated, predictable place t...

11. [Add your own docs to Cursor!](https://www.youtube.com/watch?v=Dvx5_DEReq0) - Learn more here: https://docs.cursor.com/context/@-symbols/@-docs

12. [Cursor IDE Rules for AI: Guidelines for Specialized AI Assistant](https://kirill-markin.com/articles/cursor-ide-rules-for-ai/) - My battle-tested Cursor IDE rules that enhance AI coding with tailored style, error handling, and wo...

13. [GitHub - eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master) - A task management system for AI-driven development with Claude, designed to work seamlessly with Cur...

14. [GitHub - kylantomita/task-master-ai](https://github.com/kylantomita/task-master-ai) - A task management system for AI-driven development with Claude, designed to work seamlessly with Cur...

15. [Exploring Cursor: Accessing External Documentation using @Doc](https://rudrank.com/exploring-cursor-accessing-external-documentation-using-doc) - Boost coding productivity with Cursor's @Doc feature. Learn how to index external documentation dire...

16. [claude-task-master/README-task-master.md at main · eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master/blob/main/README-task-master.md) - An AI-powered task-management system you can drop into Cursor, Lovable, Windsurf, Roo, and others. -...

17. [nizos/tdd-guard: Automated TDD enforcement for Claude ...](https://github.com/nizos/tdd-guard) - Automated TDD enforcement for Claude Code. Contribute to nizos/tdd-guard development by creating an ...

18. [PatrickJS/awesome-cursorrules - GitHub](https://github.com/PatrickJS/awesome-cursorrules) - .cursorrules files define custom rules for Cursor AI to follow when generating code, allowing you to...

19. [claude-task-master/docs/examples/claude-code-usage.md at main · eyaltoledano/claude-task-master](https://github.com/eyaltoledano/claude-task-master/blob/main/docs/examples/claude-code-usage.md) - An AI-powered task-management system you can drop into Cursor, Lovable, Windsurf, Roo, and others. -...

20. [Cursor Docs](https://cursor.com/docs) - Cursor is an AI editor and coding agent. Describe what you want to build or change in natural langua...

21. [Generating Documentation with Cursor | Cursor Docs](https://cursor.com/for/documentation) - Cursor reads your code and generates documentation that reflects what the code actually does: README...

22. [test-generator - Claude Skill | MCP Hub | Model Context Protocol Hub](https://www.aimcp.info/en/skills/ded3e45d-ea1a-4a82-80fd-147aa2799bd9) - Test Boilerplate Generator ⚠️ MANDATORY: Read Project Documentation First BEFORE generating tests, y...

23. [SwiftyJunnos/Claude-Code-with-TDD - GitHub](https://github.com/SwiftyJunnos/Claude-Code-with-TDD) - This template provides a structured workflow for TDD development with Claude as your pair programmin...

24. [Effective context engineering for AI agents - Anthropic](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) - Anthropic's agentic coding solution Claude Code uses this approach to perform complex data analysis ...

25. [VoltAgent/voltagent: AI Agent Engineering Platform built on ... - GitHub](https://github.com/VoltAgent/voltagent) - You can use the MCP server @voltagent/mcp-docs-server to teach your LLM how to use VoltAgent for AI-...

