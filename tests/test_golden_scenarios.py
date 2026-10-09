"""
tests/test_golden_scenarios.py

Golden-File Regression Suite — Phase 1 (improvement_plan.md §4)

"Recorded telemetry scenarios → expected decisions with tolerances.
 This is the single highest-value test asset you will own."

Each golden file in packages/sim-models/scenarios/ defines a telemetry
snapshot and the expected decision envelope values (with tolerances). This
suite loads each file, runs the full reasoning pipeline through
twin_core.run_pipeline(), and asserts every declared expectation.

Design rules:
  - Pure: no MQTT, no WebSocket, no TensorFlow (LSTM skipped — predefined RUL
    from the golden file used directly to keep the suite fast and CI-safe).
  - Deterministic: given the same inputs, the pipeline must produce the same
    outputs. Stochastic elements (LSTM MC Dropout) are bypassed via a fixed
    predicted_rul injected into the window.
  - Tolerance-based: physics residuals and scores are compared within declared
    tolerance bands, not exact equality.
  - Self-documenting: failures name the field, the expected range, and the
    actual value so CI output is immediately actionable.

Running: pytest tests/test_golden_scenarios.py -v
"""

import sys
import os
import json
import glob
import unittest
from typing import Any, Dict, List

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BACKEND_DIR = os.path.join(ROOT, "backend")
TWIN_CORE_DIR = os.path.join(ROOT, "packages", "twin-core")
SCENARIOS_DIR = os.path.join(ROOT, "packages", "sim-models", "scenarios")

# Add twin-core and backend to path
for p in [TWIN_CORE_DIR, BACKEND_DIR, ROOT]:
    if p not in sys.path:
        sys.path.insert(0, p)

from twin_core.pipeline import run_pipeline  # noqa: E402


def load_scenarios() -> List[Dict[str, Any]]:
    """Load all scenario JSON files from the scenarios directory."""
    files = sorted(glob.glob(os.path.join(SCENARIOS_DIR, "SCN*.json")))
    scenarios = []
    for path in files:
        with open(path, "r") as f:
            scenarios.append(json.load(f))
    return scenarios


def run_scenario_pipeline(scenario: Dict[str, Any]) -> Dict[str, Any]:
    """
    Run run_pipeline() for a scenario.
    We inject a synthetic window to avoid needing TF/LSTM in CI:
    the window is pre-filled with window_size copies of a nominal norm vector
    so the pipeline has a full buffer but raw LSTM output is irrelevant —
    the golden file's true_rul drives the calibrated RUL path instead.
    """
    telemetry = scenario["telemetry"]
    # Build a minimal synthetic window — all normalized vectors at [0.5, 0.5, 0.5]
    # The calibrated RUL path uses true_rul from telemetry, not raw LSTM output,
    # so window content does not affect the result (only buffer_pct does).
    window = [[0.5, 0.5, 0.5]] * 50  # full 50-cycle window, no LSTM needed

    # Run with no models injected (LSTM path skipped, anomaly_detector re-instantiated)
    # For speed we supply a fresh AnomalyDetector from the backend
    import anomaly_detector as _ad
    ANOMALY_PATH = os.path.join(BACKEND_DIR, "anomaly_model.pkl")
    models = {"anomaly_detector": _ad.AnomalyDetector(ANOMALY_PATH, enable_hysteresis=False)}

    return run_pipeline(data=telemetry, window=window, models=models)


class GoldenScenarioMeta(type):
    """
    Metaclass that dynamically generates one TestCase per golden file.
    Each generated test class is named TestGolden_<scenario_id>.
    """
    pass


def _make_scenario_test(scenario: Dict[str, Any]) -> type:
    """Factory: returns a TestCase class for one scenario."""
    meta = scenario["metadata"]
    expected = scenario["expected_decisions"]
    scn_id = meta["id"]
    scn_desc = meta["description"]

    class ScenarioTest(unittest.TestCase):

        @classmethod
        def setUpClass(cls):
            cls.envelope = run_scenario_pipeline(scenario)

        def _assert_between(self, field_path: str, value: float, lo: float, hi: float):
            self.assertGreaterEqual(
                value, lo,
                f"[{scn_id}] {field_path}={value:.4f} is below minimum {lo}"
            )
            self.assertLessEqual(
                value, hi,
                f"[{scn_id}] {field_path}={value:.4f} is above maximum {hi}"
            )

        def test_envelope_version(self):
            self.assertEqual(self.envelope.get("envelope_version"), "1.0",
                             f"[{scn_id}] envelope_version must be '1.0'")

        def test_alert_matches_expected(self):
            expected_alert = expected["alert"]
            actual_alert = self.envelope.get("alert")
            self.assertEqual(
                actual_alert, expected_alert,
                f"[{scn_id}] alert: expected={expected_alert}, actual={actual_alert}"
            )

        def test_is_anomaly(self):
            if "is_anomaly" in expected:
                self.assertEqual(
                    bool(self.envelope.get("is_anomaly")),
                    bool(expected["is_anomaly"]),
                    f"[{scn_id}] is_anomaly mismatch"
                )

        def test_anomaly_score_range(self):
            score = float(self.envelope.get("anomaly_score", 0.0))
            if "anomaly_score_max" in expected:
                self.assertLessEqual(
                    score, expected["anomaly_score_max"],
                    f"[{scn_id}] anomaly_score={score:.4f} exceeds max {expected['anomaly_score_max']}"
                )
            if "anomaly_score_min" in expected:
                self.assertGreaterEqual(
                    score, expected["anomaly_score_min"],
                    f"[{scn_id}] anomaly_score={score:.4f} below min {expected['anomaly_score_min']}"
                )

        def test_health_index_range(self):
            hi = float(self.envelope.get("health", {}).get("health_index", 0.0))
            lo = expected.get("health_index_min", 0.0)
            hi_max = expected.get("health_index_max", 100.0)
            self._assert_between("health.health_index", hi, lo, hi_max)

        def test_predicted_rul_range(self):
            rul = float(self.envelope.get("predicted_rul", 0.0))
            lo = expected.get("predicted_rul_min", 0.0)
            hi = expected.get("predicted_rul_max", 10000.0)
            self._assert_between("predicted_rul", rul, lo, hi)

        def test_failure_probability_range(self):
            fp = float(self.envelope.get("failure_probability", 0.0))
            lo = expected.get("failure_probability_min", 0.0)
            hi = expected.get("failure_probability_max", 1.0)
            self._assert_between("failure_probability", fp, lo, hi)

        def test_twin_consistency_case(self):
            actual_case = self.envelope.get("twin_consistency", {}).get("case")
            if "twin_consistency_case" in expected:
                self.assertEqual(
                    actual_case,
                    expected["twin_consistency_case"],
                    f"[{scn_id}] twin_consistency.case: expected={expected['twin_consistency_case']}, actual={actual_case}"
                )
            elif "twin_consistency_case_options" in expected:
                self.assertIn(
                    actual_case,
                    expected["twin_consistency_case_options"],
                    f"[{scn_id}] twin_consistency.case={actual_case} not in {expected['twin_consistency_case_options']}"
                )

        def test_physics_sub_object(self):
            physics = self.envelope.get("physics", {})
            self.assertIn("brake_power_hp", physics,
                          f"[{scn_id}] physics.brake_power_hp missing")
            self.assertIn("residuals", physics,
                          f"[{scn_id}] physics.residuals missing")

        def test_sensor_integrity_score(self):
            si = self.envelope.get("sensor_integrity", {}).get("integrity_score", 0.0)
            self.assertGreaterEqual(si, 0.0,
                                    f"[{scn_id}] sensor_integrity.integrity_score < 0")
            self.assertLessEqual(si, 100.0,
                                 f"[{scn_id}] sensor_integrity.integrity_score > 100")

    ScenarioTest.__name__ = f"TestGolden_{scn_id}"
    ScenarioTest.__qualname__ = f"TestGolden_{scn_id}"
    return ScenarioTest


# ── Dynamically register test classes in the module namespace ─────────────────
_SCENARIOS = load_scenarios()

if not _SCENARIOS:
    raise RuntimeError(
        f"No golden scenario files found in {SCENARIOS_DIR}. "
        "Run the scenario recording script first."
    )

for _s in _SCENARIOS:
    _cls = _make_scenario_test(_s)
    globals()[_cls.__name__] = _cls
del _cls


class TestGoldenSuiteMetadata(unittest.TestCase):
    """Meta-tests for the golden suite itself."""

    def test_at_least_three_scenarios_loaded(self):
        self.assertGreaterEqual(
            len(_SCENARIOS), 3,
            f"Expected ≥3 golden scenarios, found {len(_SCENARIOS)}"
        )

    def test_scenarios_have_required_keys(self):
        for s in _SCENARIOS:
            sid = s.get("metadata", {}).get("id", "?")
            self.assertIn("metadata", s, f"Scenario {sid} missing 'metadata'")
            self.assertIn("telemetry", s, f"Scenario {sid} missing 'telemetry'")
            self.assertIn("expected_decisions", s, f"Scenario {sid} missing 'expected_decisions'")

    def test_scenarios_cover_all_alert_levels(self):
        alert_levels = {s["expected_decisions"]["alert"] for s in _SCENARIOS}
        self.assertIn("NOMINAL", alert_levels,
                      "Golden suite must include a NOMINAL scenario (SCN001)")
        self.assertIn("CRITICAL", alert_levels,
                      "Golden suite must include a CRITICAL scenario (SCN003)")


if __name__ == "__main__":
    unittest.main()
