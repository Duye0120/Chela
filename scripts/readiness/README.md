# Chela Readiness Python Sidecar

`readiness_report.py` is an offline analysis script for sanitized Chela readiness JSONL. `run-readiness-report.ts` is a thin Node runner that invokes the Python sidecar with argument arrays, separated stdout/stderr, a default 30s timeout, and an allowlisted environment.

## Boundary

It does:

- read sanitized `ReadinessTraceEvent` JSONL
- compute deterministic readiness metrics
- write JSON and Markdown reports
- detect suspicious secret markers without printing raw values

It does not:

- participate in tool allow / confirm / deny
- control approval or run state
- read raw prompt/code/file content/API keys
- call network or AI models by default
- require pandas/numpy or any third-party package

## Usage

```bash
python3 scripts/readiness/readiness_report.py \
  --input tests/fixtures/readiness/sample-readiness.jsonl \
  --json-out /tmp/chela-readiness-report.json \
  --md-out /tmp/chela-readiness-report.md
```

Fail when suspicious secrets are detected:

```bash
python3 scripts/readiness/readiness_report.py \
  --input tests/fixtures/readiness/sample-readiness.jsonl \
  --fail-on-secret-leak
```

## Metrics

- total events
- run count
- scenario count
- workflow success rate
- tool fail rate
- policy violation count
- approval recovery rate
- p95 latency
- secret leakage count
- hard section preserved rate

## Deterministic Mini Eval Scenarios

`tests/fixtures/readiness/scenarios/` contains sanitized JSONL fixtures for the current offline Mini Eval Gate:

- `dangerous-delete-denied`
- `file-overwrite-confirmed`
- `secret-redacted`
- `context-hard-section-preserved`
- `memory-conflict-detected`
- `tool-failure-recovered`
- `approval-resume`
- `provider-503-recorded`
- `long-task-monitored`
- `safe-shell-allowed`

Each event must keep the basic trace envelope: `scenarioId`, `schemaVersion: 1`, `traceId`, `runId`, `sessionId`, `eventId`, `eventType`, `component`, `ts`, and `status`. Fixtures must stay sanitized: no raw prompt/code/file content, API key, token, cookie, password, or authorization value.

Run all Python-side regressions:

```bash
python3 tests/readiness_report_regression.py
```

Run the TS wrapper regression without adding package scripts:

```bash
pnpm exec tsx tests/readiness-runner-regression.test.ts
```
