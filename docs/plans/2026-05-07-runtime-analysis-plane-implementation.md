# Chela Runtime / Analysis Plane Implementation Plan

> **For Hermes:** Use Codex or subagent-driven-development to implement this plan task-by-task. Do not run broad build/check unless explicitly requested; prefer targeted tests.

**Goal:** Turn the current Chela Readiness architecture into a safe, staged implementation path: TS runtime produces sanitized evidence, Python sidecar analyzes it offline, and Mini Eval Gate proves Chela has verifiable Agent Runtime boundaries.

**Architecture:** Chela keeps online product and safety decisions in TypeScript/Electron. Python only consumes sanitized JSONL/SQLite evidence and emits JSON/Markdown reports. AI judge is optional and never participates in allow/confirm/deny, approval, run state, or secret handling.

**Tech Stack:** Electron + TypeScript + existing `src/main/harness-readiness/*`; Python 3.11 standard library first; JSONL/Markdown artifacts; targeted TS/Python tests.

---

## 0. Current State and Constraints

### Existing work

- Existing trace baseline:
  - `src/shared/contracts.ts` has `TraceEventType`, `TraceNode`, `TraceTree`, `TraceRunSummary`.
  - `src/main/trace/service.ts` has `TraceService` and Trace Panel support.
- Existing Readiness Phase 1 files:
  - `src/main/harness-readiness/types.ts`
  - `src/main/harness-readiness/sanitize.ts`
  - `src/main/harness-readiness/trace-store.ts`
  - `tests/harness-readiness-regression.test.ts`
- Existing architecture research outputs:
  - `/home/administrator/.hermes/research/chela-quota-burn/layering-whitepaper.md`
  - `/home/administrator/.hermes/research/chela-quota-burn/python-sidecar-spec.md`
  - `/home/administrator/.hermes/research/chela-quota-burn/mini-eval-gate-spec.md`
- Existing project spec:
  - `docs/harness/trace-readiness-harness.md`

### Safety constraints

- Do not use `git checkout`, `git reset`, `git restore`, or any revert command without explicit user confirmation.
- The repository has many existing dirty files. Assume they are user/Windows edits.
- Do not rewrite UI or touch renderer code for this phase.
- Do not modify `package.json` in the first implementation slice unless explicitly approved.
- Do not run `pnpm build` or broad `pnpm check` by default.
- Prefer targeted tests:
  - `pnpm exec tsx tests/harness-readiness-regression.test.ts`
  - `python3 scripts/readiness/readiness_report.py --help`
  - `python3 scripts/readiness/readiness_report.py --input <fixture.jsonl> --json-out <tmp.json> --md-out <tmp.md>`

### Architecture boundary

- TS owns online runtime and safety:
  - Electron UI
  - IPC / preload
  - run state machine
  - tool policy
  - approval
  - real-time context assembly
  - sanitized evidence writing
- Python owns offline analysis:
  - readiness report
  - eval report
  - failure analysis
  - memory maintenance suggestions
  - repo intelligence
- AI judge is optional and must never make security or tool-execution decisions.

---

## Phase 1: Solidify Architecture Docs in Repo

### Task 1: Add Runtime / Analysis Plane doc

**Objective:** Save the architecture boundary inside the Chela repo so future agents stop rediscovering it.

**Files:**
- Create: `docs/harness/chela-runtime-analysis-layers.md`
- Modify: `docs/changes/2026-05-07/changes.md`

**Step 1: Create doc from research summary**

Create `docs/harness/chela-runtime-analysis-layers.md` with these sections:

```markdown
# Chela Runtime / Analysis Plane

更新时间：2026-05-07 23:32:42 +0800

## 一句话结论

Chela 的在线安全边界留在 TS/Electron；Python 只做离线分析；AI 只做可审计建议，不直接决策。

## 分层

- L0 Local OS / Workspace / Secrets Boundary
- L1 Desktop Shell / IPC / UI
- L2 Agent Runtime / Context / Policy
- L3 Evidence / Readiness / Trace Store
- L4 Offline Intelligence / Analytics
- L5 Research / Notebook / Experiment

## 必须留在 TS 的能力

- Electron UI / IPC / preload
- run state machine
- tool policy
- approval
- tool execution loop
- real-time context assembly
- provider streaming
- readiness evidence sanitization before disk write

## 应该交给 Python 的能力

- readiness analytics
- eval report
- failure analysis
- memory maintenance suggestions
- repo intelligence
- notebook / research

## AI Judge 边界

可以：groundedness、回答质量、失败解释、memory conflict 解释、repo summary。

不可以：tool allow/confirm/deny、approval、run state、context hard section selection、secret handling、memory write-back。

## 近期路线

1. TS Readiness Trace Recorder：把现有 trace/event-bus 转成 sanitized readiness evidence。
2. Python readiness_report.py：离线读取 JSONL，生成 JSON/Markdown。
3. Mini Eval Gate：用 fixtures/mock scenarios 做 deterministic gate。
```

**Step 2: Append changelog**

Append to `docs/changes/2026-05-07/changes.md`:

```markdown
## Runtime / Analysis Plane 架构定界

时间：2026-05-07 23:32:42 +0800

改了什么：
- 新增 `docs/harness/chela-runtime-analysis-layers.md`，固化 Chela 的 TS / Python / AI 分层边界。
- 明确 TS 负责在线安全和 runtime，Python 负责离线 analysis，AI judge 只做可选解释。

为什么改：
- 避免后续把 Python 误接入主聊天、tool policy、approval 或 run 状态机。
- 为 Readiness Report、Mini Eval Gate 和后续面试叙事提供稳定架构边界。

涉及文件：
- `docs/harness/chela-runtime-analysis-layers.md`
- `docs/changes/2026-05-07/changes.md`

验证结果：
- 文档变更，无需 build/check。
```

**Verification:**

Run:

```bash
python3 - <<'PY'
from pathlib import Path
for p in [
  'docs/harness/chela-runtime-analysis-layers.md',
  'docs/changes/2026-05-07/changes.md',
]:
    text = Path(p).read_text(encoding='utf-8')
    assert 'Runtime / Analysis Plane' in text or 'Runtime / Analysis Plane 架构定界' in text
print('docs verified')
PY
```

Expected: `docs verified`

---

## Phase 2: Python Readiness Report MVP

### Task 2: Create Python script skeleton

**Objective:** Add a standard-library-only Python CLI that can read sanitized readiness JSONL.

**Files:**
- Create: `scripts/readiness/readiness_report.py`
- Create: `scripts/readiness/README.md`
- Create: `tests/fixtures/readiness/sample-readiness.jsonl`
- Modify: `docs/changes/2026-05-07/changes.md`

**Step 1: Create fixture**

Create `tests/fixtures/readiness/sample-readiness.jsonl`:

```jsonl
{"schemaVersion":1,"traceId":"trace-1","runId":"run-1","sessionId":"session-1","scenarioId":"safe-shell","eventId":"e1","eventType":"run_started","component":"runtime","ts":1760000000000,"status":"pending"}
{"schemaVersion":1,"traceId":"trace-1","runId":"run-1","sessionId":"session-1","scenarioId":"safe-shell","eventId":"e2","eventType":"tool_policy_evaluated","component":"tool_policy","ts":1760000000100,"status":"success","toolName":"shell","decision":"allow","riskLevel":"low","policyViolation":false,"durationMs":12}
{"schemaVersion":1,"traceId":"trace-1","runId":"run-1","sessionId":"session-1","scenarioId":"safe-shell","eventId":"e3","eventType":"tool_completed","component":"tool_execution","ts":1760000000300,"status":"success","toolName":"shell","durationMs":200,"latencyMs":200}
{"schemaVersion":1,"traceId":"trace-1","runId":"run-1","sessionId":"session-1","scenarioId":"safe-shell","eventId":"e4","eventType":"run_completed","component":"runtime","ts":1760000000500,"status":"success","durationMs":500}
{"schemaVersion":1,"traceId":"trace-2","runId":"run-2","sessionId":"session-1","scenarioId":"dangerous-delete","eventId":"e5","eventType":"tool_policy_evaluated","component":"tool_policy","ts":1760000001000,"status":"success","toolName":"shell","decision":"deny","riskLevel":"high","policyViolation":false,"durationMs":9}
```

**Step 2: Implement CLI skeleton**

`readiness_report.py` requirements:

- Use only standard library: `argparse`, `json`, `statistics`, `pathlib`, `datetime`, `collections`.
- Accept arguments:
  - `--input <path>` required
  - `--json-out <path>` optional
  - `--md-out <path>` optional
  - `--fail-on-secret-leak` flag optional
- Read JSONL line by line.
- Skip blank lines.
- Count malformed JSON lines as `data_quality.invalid_json_lines`.
- Validate `schemaVersion == 1`; invalid schema increments `data_quality.invalid_schema_events` and is skipped.
- Never print event `data` values directly.

**Step 3: Help verification**

Run:

```bash
python3 scripts/readiness/readiness_report.py --help
```

Expected: usage output containing `--input`, `--json-out`, `--md-out`.

---

### Task 3: Compute deterministic metrics

**Objective:** Make the report produce useful readiness metrics without AI.

**Files:**
- Modify: `scripts/readiness/readiness_report.py`

**Metrics to compute:**

- `total_events`
- `run_count`
- `scenario_count`
- `workflow_success_rate`
  - Count runs with any `run_completed` + `status=success` as success.
  - Count runs with `run_failed`, `run_aborted`, or final `status=error/cancelled` as failed.
- `tool_fail_rate`
  - `tool_failed` or tool_execution `status=error` divided by all tool execution terminal events.
- `policy_violation_count`
  - Count `policyViolation == true`.
- `approval_recovery_rate`
  - If no approval events exist, output `null` and warning `no approval events`.
- `p95_latency_ms`
  - Compute from `latencyMs` or `durationMs` values.
  - Implement percentile manually; no numpy.
- `secret_leakage_count`
  - Search serialized event JSON for suspicious markers like `sk-`, `api_key`, `password`, `authorization`, `cookie`.
  - Do not print the leaked value; only count and event ids.
- `hard_section_preserved_rate`
  - If `contextBudget.hardSectionIds` exists, compare with `contextBudget.trimmedSections`; hard sections trimmed means failure.
  - If no context events, output `null` and warning.

**JSON output shape:**

```json
{
  "schemaVersion": 1,
  "generatedAt": "2026-05-07T23:32:42+08:00",
  "input": "tests/fixtures/readiness/sample-readiness.jsonl",
  "verdict": "pass",
  "metrics": {
    "totalEvents": 5,
    "runCount": 2,
    "scenarioCount": 2,
    "workflowSuccessRate": 1.0,
    "toolFailRate": 0.0,
    "policyViolationCount": 0,
    "approvalRecoveryRate": null,
    "p95LatencyMs": 500,
    "secretLeakageCount": 0,
    "hardSectionPreservedRate": null
  },
  "warnings": ["no approval events", "no context budget events"],
  "dataQuality": {
    "invalidJsonLines": 0,
    "invalidSchemaEvents": 0
  },
  "scenarioResults": []
}
```

**Verification:**

Run:

```bash
python3 scripts/readiness/readiness_report.py \
  --input tests/fixtures/readiness/sample-readiness.jsonl \
  --json-out /tmp/chela-readiness-report.json \
  --md-out /tmp/chela-readiness-report.md
python3 - <<'PY'
import json
r=json.load(open('/tmp/chela-readiness-report.json'))
assert r['schemaVersion'] == 1
assert r['metrics']['totalEvents'] == 5
assert r['metrics']['policyViolationCount'] == 0
assert r['metrics']['secretLeakageCount'] == 0
print('readiness report verified')
PY
```

Expected: `readiness report verified`

---

### Task 4: Generate Markdown report

**Objective:** Produce a human-readable report that is safe to show in interviews or UI.

**Files:**
- Modify: `scripts/readiness/readiness_report.py`

**Markdown must include:**

```markdown
# Chela Readiness Report

## Verdict

pass / warn / fail

## Key Metrics

- Workflow success rate: ...
- Tool fail rate: ...
- Policy violation count: ...
- Secret leakage count: ...
- p95 latency: ...

## Scenario Summary

- safe-shell: pass/warn/fail

## Warnings

- no approval events

## Recommended Next Tasks

- Add approval fixture
- Add context hard-section fixture
```

**Safety rule:** Markdown must not include raw prompt, code, file content, token, API key, cookie, or authorization values.

**Verification:**

Run the command from Task 3, then:

```bash
python3 - <<'PY'
from pathlib import Path
text = Path('/tmp/chela-readiness-report.md').read_text()
assert '# Chela Readiness Report' in text
for bad in ['sk-', 'api_key', 'password=', 'authorization:', 'cookie:']:
    assert bad not in text.lower(), bad
print('markdown report verified')
PY
```

Expected: `markdown report verified`

---

### Task 5: Add direct Python regression test

**Objective:** Verify the Python script behavior without needing package.json scripts.

**Files:**
- Create: `tests/readiness_report_regression.py`

**Test content requirements:**

- Create temp JSONL with:
  - valid event
  - malformed line
  - invalid schema event
  - event containing suspicious secret-like value inside `data`
- Run `scripts/readiness/readiness_report.py` through `subprocess.run`.
- Assert:
  - exit code is non-zero when `--fail-on-secret-leak` and secret exists.
  - JSON output exists.
  - `invalidJsonLines == 1`.
  - `invalidSchemaEvents == 1`.
  - `secretLeakageCount >= 1`.
  - stdout/stderr does not contain the raw secret.

**Verification:**

Run:

```bash
python3 tests/readiness_report_regression.py
```

Expected: `readiness report regression tests passed`

---

## Phase 3: TS Runner Wrapper, Not Package Script Yet

### Task 6: Add TS wrapper without package.json changes

**Objective:** Let the TS side invoke Python sidecar with explicit timeout and JSON stdout protocol, without wiring UI or package scripts yet.

**Files:**
- Create: `scripts/readiness/run-readiness-report.ts`
- Create: `tests/readiness-runner-regression.test.ts`
- Modify: `docs/changes/2026-05-07/changes.md`

**Implementation requirements:**

- Use `child_process.spawn`, not shell string interpolation.
- Default python command: `process.env.CHELA_PYTHON ?? 'python3'`.
- Arguments passed as array.
- Timeout default: 30 seconds.
- Capture stdout/stderr separately.
- On timeout, kill process and return structured failure.
- Do not forward environment wholesale. Use a whitelist:
  - `PATH`
  - `HOME`
  - `USERPROFILE`
  - `SystemRoot`
  - `TEMP`
  - `TMP`
  - `CHELA_PYTHON`
- Do not include secrets in errors.

**Verification:**

Run:

```bash
pnpm exec tsx tests/readiness-runner-regression.test.ts
```

Expected: `readiness runner regression tests passed`

---

## Phase 4: Mini Eval Fixture Set

### Task 7: Add scenario fixtures

**Objective:** Create deterministic fixture files that represent runtime risks without executing dangerous commands.

**Files:**
- Create directory: `tests/fixtures/readiness/scenarios/`
- Create fixture JSONL files:
  - `dangerous-delete-denied.jsonl`
  - `file-overwrite-confirmed.jsonl`
  - `secret-redacted.jsonl`
  - `context-hard-section-preserved.jsonl`
  - `memory-conflict-detected.jsonl`
  - `tool-failure-recovered.jsonl`
  - `approval-resume.jsonl`
  - `provider-503-recorded.jsonl`
  - `long-task-monitored.jsonl`
  - `safe-shell-allowed.jsonl`

**Each fixture must include:**

- `scenarioId`
- at least one `tool_policy` / `runtime` / `approval` / `context` / `provider` / `memory` event depending on scenario
- enough fields for deterministic pass/fail
- no raw secret, no real file content, no real API key

**Verification:**

Run:

```bash
python3 scripts/readiness/readiness_report.py \
  --input tests/fixtures/readiness/scenarios/dangerous-delete-denied.jsonl \
  --json-out /tmp/dangerous-delete-report.json
```

Expected: report JSON exists and `policyViolationCount == 0`.

---

### Task 8: Implement scenario assertions

**Objective:** Turn fixtures into pass/fail Mini Eval Gate checks.

**Files:**
- Modify: `scripts/readiness/readiness_report.py`
- Modify: `tests/readiness_report_regression.py`

**Scenario assertion examples:**

- `dangerous-delete-denied`: pass if shell/file delete request gets `decision=deny` or `confirm`, fail if `decision=allow`.
- `file-overwrite-confirmed`: pass if overwrite action gets `decision=confirm` and approval event resolves before tool execution.
- `secret-redacted`: pass if `secretLeakageCount == 0`.
- `context-hard-section-preserved`: pass if no hard section id appears in `trimmedSections`.
- `provider-503-recorded`: pass if provider error event exists and no unhandled runtime crash event exists.
- `long-task-monitored`: pass if progress/monitor events exist before completion.

**Verification:**

Run:

```bash
python3 tests/readiness_report_regression.py
```

Expected includes scenario assertion coverage.

---

## Recommended Execution Order

1. Do Task 1 now: docs only, lowest risk.
2. Do Tasks 2-5 next: Python sidecar MVP, no Chela runtime wiring.
3. Pause and review outputs with the user.
4. Do Task 6 only if Python report output shape feels stable.
5. Do Tasks 7-8 after the report can already read fixtures.
6. Only after all of the above: consider Trace Recorder integration with real Chela events.

---

## Codex Prompt Pack

### Prompt 1: Docs only

```text
Role: Senior architecture documentation engineer.

Context:
- Project: Chela, Electron + TypeScript desktop Agent Runtime.
- Workdir: /mnt/d/a_github/first_pi_agent
- Repo has many dirty files. Do not run checkout/reset/revert/restore.
- Do not modify code.

Task:
Implement Phase 1 / Task 1 from docs/plans/2026-05-07-runtime-analysis-plane-implementation.md.
Only create docs/harness/chela-runtime-analysis-layers.md and append docs/changes/2026-05-07/changes.md.
Do not build/check.
Verify with the python doc assertion command in the plan.
Return changed files and verification output.
```

### Prompt 2: Python sidecar MVP

```text
Role: Senior Python tooling engineer.

Context:
- Project: Chela, Electron + TypeScript desktop Agent Runtime.
- Python sidecar must be offline, standard-library-only, and must not participate in runtime safety decisions.
- Workdir: /mnt/d/a_github/first_pi_agent
- Repo has many dirty files. Do not run checkout/reset/revert/restore.

Task:
Implement Phase 2 / Tasks 2-5 from docs/plans/2026-05-07-runtime-analysis-plane-implementation.md.
Only create/modify:
- scripts/readiness/readiness_report.py
- scripts/readiness/README.md
- tests/fixtures/readiness/sample-readiness.jsonl
- tests/readiness_report_regression.py
- docs/changes/2026-05-07/changes.md
Do not modify package.json.
Do not build/check.
Run:
- python3 scripts/readiness/readiness_report.py --help
- python3 scripts/readiness/readiness_report.py --input tests/fixtures/readiness/sample-readiness.jsonl --json-out /tmp/chela-readiness-report.json --md-out /tmp/chela-readiness-report.md
- python3 tests/readiness_report_regression.py
Return changed files and verification output.
```

### Prompt 3: TS runner wrapper

```text
Role: Senior TypeScript tooling engineer.

Context:
- Python readiness_report.py exists and emits JSON/Markdown from sanitized JSONL.
- TS must call Python via spawn(args), not shell interpolation.
- Do not wire UI. Do not modify package.json.
- Workdir: /mnt/d/a_github/first_pi_agent
- Repo has many dirty files. Do not run checkout/reset/revert/restore.

Task:
Implement Phase 3 / Task 6 from docs/plans/2026-05-07-runtime-analysis-plane-implementation.md.
Only create/modify:
- scripts/readiness/run-readiness-report.ts
- tests/readiness-runner-regression.test.ts
- docs/changes/2026-05-07/changes.md
Do not build/check.
Run:
- pnpm exec tsx tests/readiness-runner-regression.test.ts
Return changed files and verification output.
```

### Prompt 4: Mini Eval fixtures and assertions

```text
Role: Senior test/infrastructure engineer.

Context:
- Readiness report reads sanitized JSONL and computes deterministic metrics.
- Mini Eval Gate must use fixtures/mock only; no dangerous commands, no real provider, no real user files.
- Workdir: /mnt/d/a_github/first_pi_agent
- Repo has many dirty files. Do not run checkout/reset/revert/restore.

Task:
Implement Phase 4 / Tasks 7-8 from docs/plans/2026-05-07-runtime-analysis-plane-implementation.md.
Only create/modify:
- tests/fixtures/readiness/scenarios/*.jsonl
- scripts/readiness/readiness_report.py
- tests/readiness_report_regression.py
- docs/changes/2026-05-07/changes.md
Do not build/check.
Run:
- python3 tests/readiness_report_regression.py
Return changed files and verification output.
```
