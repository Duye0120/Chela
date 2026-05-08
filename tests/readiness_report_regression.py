#!/usr/bin/env python3
from __future__ import annotations

import json
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "readiness" / "readiness_report.py"
FIXTURE_DIR = ROOT / "tests" / "fixtures" / "readiness"
SCENARIOS_DIR = FIXTURE_DIR / "scenarios"
ALL_SCENARIOS = FIXTURE_DIR / "all-scenarios-readiness.jsonl"
EXPECTED_SCENARIOS = {
    "dangerous-delete-denied",
    "file-overwrite-confirmed",
    "secret-redacted",
    "context-hard-section-preserved",
    "memory-conflict-detected",
    "tool-failure-recovered",
    "approval-resume",
    "provider-503-recorded",
    "long-task-monitored",
    "safe-shell-allowed",
}
REQUIRED_EVENT_FIELDS = {
    "scenarioId",
    "schemaVersion",
    "traceId",
    "runId",
    "sessionId",
    "eventId",
    "eventType",
    "component",
    "ts",
    "status",
}


def run_report(input_path: Path, json_out: Path, md_out: Path | None = None, fail_on_secret: bool = False) -> subprocess.CompletedProcess[str]:
    cmd = [
        sys.executable,
        str(SCRIPT),
        "--input",
        str(input_path),
        "--json-out",
        str(json_out),
    ]
    if md_out is not None:
        cmd.extend(["--md-out", str(md_out)])
    if fail_on_secret:
        cmd.append("--fail-on-secret-leak")
    return subprocess.run(cmd, text=True, capture_output=True, cwd=ROOT)


def read_jsonl(path: Path) -> list[dict[str, object]]:
    events: list[dict[str, object]] = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if line.strip():
            item = json.loads(line)
            assert isinstance(item, dict), path
            events.append(item)
    return events


def assert_scenario_fixtures_are_complete() -> None:
    fixture_files = sorted(SCENARIOS_DIR.glob("*.jsonl"))
    fixture_ids = {path.stem for path in fixture_files}
    assert fixture_ids == EXPECTED_SCENARIOS, fixture_ids

    for path in fixture_files:
        events = read_jsonl(path)
        assert events, path
        for event in events:
            missing = REQUIRED_EVENT_FIELDS - set(event)
            assert not missing, f"{path} missing {missing} in {event!r}"
            assert event["schemaVersion"] == 1, path
            assert event["scenarioId"] == path.stem, path


def assert_all_scenarios_pass() -> None:
    with tempfile.TemporaryDirectory(prefix="chela-readiness-scenarios-") as temp:
        temp_dir = Path(temp)
        json_out = temp_dir / "report.json"
        md_out = temp_dir / "report.md"
        result = run_report(ALL_SCENARIOS, json_out, md_out)
        assert result.returncode == 0, result.stderr
        report = json.loads(json_out.read_text(encoding="utf-8"))
        assert report["metrics"]["scenarioCount"] == len(EXPECTED_SCENARIOS)
        scenario_results = {item["scenarioId"]: item for item in report["scenarioResults"]}
        assert set(scenario_results) == EXPECTED_SCENARIOS
        for scenario_id, item in scenario_results.items():
            assert item["status"] == "pass", (scenario_id, item)
            assert isinstance(item["reason"], str) and item["reason"]
            assert item["eventCount"] > 0
        markdown = md_out.read_text(encoding="utf-8")
        assert "## Scenario Summary" in markdown
        assert "trace-" not in markdown
        assert "eventId" not in markdown


def assert_secret_fixture_does_not_leak() -> None:
    with tempfile.TemporaryDirectory(prefix="chela-readiness-secret-") as temp:
        temp_dir = Path(temp)
        json_out = temp_dir / "report.json"
        md_out = temp_dir / "report.md"
        secret_fixture = SCENARIOS_DIR / "secret-redacted.jsonl"
        result = run_report(secret_fixture, json_out, md_out, fail_on_secret=True)
        assert result.returncode == 0, result.stderr
        report = json.loads(json_out.read_text(encoding="utf-8"))
        assert report["metrics"]["secretLeakageCount"] == 0
        assert report["scenarioResults"][0]["status"] == "pass"
        combined_output = result.stdout + result.stderr + md_out.read_text(encoding="utf-8")
        assert "sk-" not in combined_output.lower()
        assert "api_key" not in combined_output.lower()
        assert "authorization" not in combined_output.lower()
        assert "cookie" not in combined_output.lower()


def assert_fail_on_secret_leak() -> None:
    with tempfile.TemporaryDirectory(prefix="chela-readiness-leak-") as temp:
        temp_dir = Path(temp)
        input_path = temp_dir / "leak.jsonl"
        json_out = temp_dir / "report.json"
        raw_secret = "sk-test-raw-secret"
        input_path.write_text(
            json.dumps({
                "schemaVersion": 1,
                "traceId": "trace-leak",
                "runId": "run-leak",
                "sessionId": "session-leak",
                "scenarioId": "secret-redacted",
                "eventId": "leak-1",
                "eventType": "tool_completed",
                "component": "tool_execution",
                "ts": 1,
                "status": "success",
                "data": {"credential": raw_secret},
            }) + "\n",
            encoding="utf-8",
        )
        result = run_report(input_path, json_out, fail_on_secret=True)
        assert result.returncode == 2, result
        assert json_out.exists()
        report = json.loads(json_out.read_text(encoding="utf-8"))
        assert report["metrics"]["secretLeakageCount"] == 1
        assert "leak-1" in report["secretLeakageEventIds"]
        assert raw_secret not in (result.stdout + result.stderr)


def assert_data_quality_regression() -> None:
    with tempfile.TemporaryDirectory(prefix="chela-readiness-quality-") as temp:
        temp_dir = Path(temp)
        input_path = temp_dir / "events.jsonl"
        json_out = temp_dir / "report.json"
        md_out = temp_dir / "report.md"
        input_path.write_text(
            "\n".join([
                json.dumps({
                    "schemaVersion": 1,
                    "traceId": "trace-quality",
                    "runId": "run-quality",
                    "sessionId": "session-quality",
                    "scenarioId": "safe-shell-allowed",
                    "eventId": "quality-1",
                    "eventType": "run_started",
                    "component": "runtime",
                    "ts": 1,
                    "status": "pending",
                }),
                "{not-json",
                json.dumps({"schemaVersion": 2, "eventId": "bad-schema"}),
            ]) + "\n",
            encoding="utf-8",
        )
        result = run_report(input_path, json_out, md_out)
        assert result.returncode == 0, result.stderr
        report = json.loads(json_out.read_text(encoding="utf-8"))
        assert report["dataQuality"]["invalidJsonLines"] == 1
        assert report["dataQuality"]["invalidSchemaEvents"] == 1


def main() -> None:
    assert_scenario_fixtures_are_complete()
    assert_all_scenarios_pass()
    assert_secret_fixture_does_not_leak()
    assert_fail_on_secret_leak()
    assert_data_quality_regression()
    print("readiness report regression tests passed")


if __name__ == "__main__":
    main()
