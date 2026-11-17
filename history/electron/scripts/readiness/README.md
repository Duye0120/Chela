# Chela Readiness JS Gate

`run-readiness-report.ts` is the JS-only offline gate for sanitized Chela readiness JSONL. It reads `ReadinessTraceEvent` JSONL, computes deterministic metrics and scenario assertions in TypeScript, and writes JSON + Markdown reports.

## Boundary

It does:

- read sanitized `ReadinessTraceEvent` JSONL
- compute deterministic readiness metrics
- run Mini Eval scenario assertions
- write JSON and Markdown reports
- detect suspicious secret markers without printing raw values

Runtime control stays in the existing harness:

- tool allow / confirm / deny
- approval and run state
- raw prompt / code / file content / API keys
- network and AI model calls

## Usage

Run the full offline gate:

```bash
pnpm run chela:harness:eval
```

Run a custom fixture:

```bash
pnpm exec tsx scripts/readiness/run-readiness-report.ts \
  --input tests/fixtures/readiness/sample-readiness.jsonl \
  --json-out artifacts/readiness/sample-report.json \
  --md-out artifacts/readiness/sample-report.md \
  --fail-on-secret-leak
```

Default output:

- `artifacts/readiness/eval-latest.json`
- `artifacts/readiness/eval-latest.md`

Exit code:

- `0`: report verdict is `pass` or `warn`
- `1`: report verdict is `fail`
- `2`: suspicious secret markers were found with `--fail-on-secret-leak`

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

Each event keeps the basic trace envelope: `scenarioId`, `schemaVersion: 1`, `traceId`, `runId`, `sessionId`, `eventId`, `eventType`, `component`, `ts`, and `status`. Fixtures stay sanitized and avoid raw prompt, code, file content, API key, token, cookie, password, or authorization values.

Run focused regressions:

```bash
pnpm exec tsx tests/harness-readiness-report-regression.test.ts
pnpm exec tsx tests/readiness-runner-regression.test.ts
```
