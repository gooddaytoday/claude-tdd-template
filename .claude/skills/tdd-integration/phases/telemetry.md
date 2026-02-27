# Phase 7: TELEMETRY — Record Run Report

This phase runs after the DOCS phase and before transitioning to the DONE state.
Invoke the `tdd-telemetry-reporter` subagent to generate a structured JSON Run Report.
Gate: JSON file exists in `airefinement/artifacts/runs/` and is valid JSON (orchestrator checks with `cat` + `node -e "JSON.parse(...)"`).

## Delegation

```
Task: tdd-telemetry-reporter
Prompt: Collect phase results from the completed TDD cycle and write a structured JSON Run Report.

--- Context Packet Summary ---
[Accumulated Context Packet summary]
--- End Context Packet Summary ---

--- Phase Packets Summaries ---
[All Phase Packets summaries]
--- End Phase Packets Summaries ---
```

## Expected Phase Packet

Minimal confirmation that the file was written:
- Confirmation message indicating success.
- The path to the written JSON file in `airefinement/artifacts/runs/<run-id>.json`.

## Gate Verification

The orchestrator must verify that the file was successfully written and is valid JSON.
```bash
cat airefinement/artifacts/runs/<run-id>.json | node -e "JSON.parse(require('fs').readFileSync(0, 'utf-8'))"
```

## Failure Playbook

| Problem | Action |
|---|---|
| File not written or invalid JSON | Re-invoke once. If persistent, ignore the failure and proceed to DONE (telemetry must not block the user workflow). |
