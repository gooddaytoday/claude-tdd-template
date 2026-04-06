# Plan Phase: Behavior Decomposition

Execute between PRE-PHASE and the first RED iteration. Performed by the **orchestrator** (not a subagent). Skipped when `--slice=horizontal`.

## Purpose

Decompose the feature into atomic, observable behaviors. Each behavior becomes one RED→GREEN iteration. This prevents horizontal slicing (writing all tests upfront), ensuring each test is informed by the previous implementation cycle.

## Step 1: Analyze Feature

From the Context Packet, extract:
- Feature description and expected capabilities
- Task-master context (parent task, subtask scope)
- Any existing code/interfaces in the target area

## Step 2: Design Interface

Identify the public interface (API surface) for the feature:
- Function/class/method signatures
- Input/output types
- Error handling contract

**Deep module principles:**
- Can the number of methods be reduced?
- Can parameters be simplified?
- Can more complexity be hidden behind a simpler interface?

**Testability principles:**
- Accept dependencies, don't create them (dependency injection)
- Return results over producing side effects
- Small surface area: fewer methods = fewer tests needed

## Step 3: Decompose into Behaviors

List **behaviors** — atomic units of observable, user-facing behavior:
- Each behavior is testable through the public interface
- Each behavior is independent enough to implement incrementally
- Behaviors describe WHAT the system does, not HOW

**Good behaviors:**
- "validates valid user data returns success"
- "rejects empty name with specific error message"
- "trims whitespace from string fields before validation"

**Bad behaviors (too implementation-coupled):**
- "calls validateEmail helper function"
- "stores data in the users Map"
- "sets isValid flag to true"

## Step 4: Select Tracer Bullet

Choose the first behavior — the **tracer bullet** — that proves the end-to-end path works:
- Should exercise the core capability of the feature
- Should require creating the primary module/function/class
- Should be the simplest "happy path" case

## Step 5: Order Behaviors

1. Tracer bullet first (happy path proving end-to-end)
2. Core variations (other valid inputs, primary use cases)
3. Error handling (invalid inputs, edge cases)
4. Secondary behaviors (formatting, trimming, defaults)

## Step 6: Confirm with User

Present the Behavior Plan and ask for confirmation via AskUserQuestion:

```
I've analyzed the feature and identified the following behaviors to implement using vertical slicing (one test → one implementation → repeat):

## Behavior Plan

### Interface
- `export function validateUser(data: UserInput): ValidationResult`

### Behaviors (ordered)
1. [tracer] validates valid user data returns success
2. rejects empty name with error message
3. rejects invalid email format
4. returns all errors for multiple invalid fields
5. trims whitespace from string fields

Shall I proceed with this plan, or would you like to adjust the behaviors?
```

Wait for user confirmation before proceeding to RED[1].

## Output

After confirmation, update the Context Packet with:

```
### Behavior Plan
- Total behaviors: [N]
- Current behavior: 1 of [N]
- Behaviors:
  1. [tracer] [description] — status: pending
  2. [description] — status: pending
  ...
```

## Failure Playbook

| Problem | Action |
|---|---|
| Feature too simple for decomposition (1 behavior) | Proceed with single RED→GREEN, effectively same as horizontal |
| User rejects plan | Adjust behaviors per feedback and re-confirm |
| Cannot identify clear interface | Ask user: "What should the public interface look like?" |
| Behaviors overlap significantly | Merge overlapping behaviors into one |
