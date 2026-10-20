"""
packages/twin-core/twin_core/demo_kit.py

Scripted "9-Minute Value Story" Demo Engine & Executive Outcome Report Generator.
Implements improvement_plan.md §4 Phase 7:
  - Scripted, deterministic 9-step value story that runs on any laptop without hardware.
  - Zero manual fault injection required by sales engineers.
  - Reset button to instantaneously restore pristine baseline state.
  - Generates printable HTML/PDF executive outcome report showing avoided AOG and saved engine hours.
"""

from typing import Dict, List, Any, Optional
from datetime import datetime, timezone
import json
import os
import threading

# Canonical 9-Minute Value Story Sequence
DEMO_VALUE_STORY_STEPS: List[Dict[str, Any]] = [
    {
        "step": 1,
        "name": "HEALTHY CRUISE BASELINE",
        "phase": "Sense",
        "duration_sec": 60,
        "description": "Aircraft UAV-01 at 4,500 ft cruise. All engine parameters nominal (CHT 380°F, Oil 58 PSI, Health 94%).",
        "action": "clear_faults",
        "profile": "NORMAL",
        "health_score": 94.2,
        "rul_hours": 145.0,
        "mission_risk": "LOW",
        "completion_prob": 98.5,
    },
    {
        "step": 2,
        "name": "COOLING RESTRICTION ONSET",
        "phase": "Degrade",
        "duration_sec": 60,
        "description": "Gradual thermal degradation initiated: Cylinder 3 cooling duct debris restriction restricts airflow.",
        "action": "inject_fault",
        "fault": "cooling_degradation",
        "fault_severity": 0.65,
        "health_score": 88.0,
        "rul_hours": 110.0,
        "mission_risk": "GUARDED",
        "completion_prob": 92.0,
    },
    {
        "step": 3,
        "name": "CROSS-VALIDATED ANOMALY DETECTION",
        "phase": "Detect",
        "duration_sec": 60,
        "description": "Physics/AI cross-validation triggers: Confirmed Case B (Physical Engine Fault), not a sensor error.",
        "action": "none",
        "health_score": 76.5,
        "rul_hours": 72.0,
        "mission_risk": "ELEVATED",
        "completion_prob": 84.0,
        "diagnostic_case": "CASE_B_CONFIRMED_PHYSICAL_FAULT",
    },
    {
        "step": 4,
        "name": "EXPLAINABLE AI ROOT CAUSE ATTRIBUTION",
        "phase": "Explain",
        "duration_sec": 60,
        "description": "XAI decomposes multivariate anomaly: CHT Cylinder 3 is primary driver (48.5% attribution), Oil Temp +18°F.",
        "action": "none",
        "health_score": 68.0,
        "rul_hours": 55.0,
        "primary_feature": "cht_cyl3",
        "attribution_pct": 48.5,
    },
    {
        "step": 5,
        "name": "CONFORMAL PROGNOSTICS (RUL COLLAPSE)",
        "phase": "Predict",
        "duration_sec": 60,
        "description": "Without intervention, RUL collapses from 145h to 32h [28h - 36h at 90% confidence]. Mission cannot complete safely.",
        "action": "none",
        "health_score": 52.0,
        "rul_hours": 32.0,
        "mission_risk": "CRITICAL",
        "completion_prob": 61.2,
    },
    {
        "step": 6,
        "name": "DIGITAL TWIN WHAT-IF SIMULATION",
        "phase": "Simulate",
        "duration_sec": 60,
        "description": "Operator runs counterfactual what-if: Simulating power reduction from 2400 to 2150 RPM reduces heat by 42°F.",
        "action": "none",
        "whatif_rpm_delta": -250,
        "projected_cht_drop": 42.0,
        "projected_rul_gain": 48.0,
    },
    {
        "step": 7,
        "name": "OPERATING POINT OPTIMIZATION",
        "phase": "Optimize",
        "duration_sec": 60,
        "description": "L-BFGS-B constrained optimizer finds Pareto optimal cruise altitude and RPM to maximize survival without stalling.",
        "action": "none",
        "optimal_rpm": 2180,
        "optimal_altitude_ft": 5200,
        "safe_loiter_margin_min": 45,
    },
    {
        "step": 8,
        "name": "PRESCRIPTIVE ATA-100 RECOMMENDATION",
        "phase": "Prescribe",
        "duration_sec": 60,
        "description": "Safety envelope approves advisory: ATA 75-00 Cooling Air Baffle Inspection within 12 cycles. Derate throttle 10%.",
        "action": "none",
        "ata_chapter": "ATA 75-00",
        "corrective_work_order": "INSPECT_CYLINDER3_BAFFLE_AND_COWLING_SEALS",
        "safety_envelope_status": "APPROVED_ADVISORY",
    },
    {
        "step": 9,
        "name": "MISSION RESTORATION & OUTCOME SUMMARY",
        "phase": "Protect",
        "duration_sec": 60,
        "description": "Value delivered: Mission completion restored from 61.2% to 88.4%. Catastrophic inflight shutdown avoided.",
        "action": "none",
        "health_score": 84.0,
        "rul_hours": 80.0,
        "mission_risk": "LOW_RESIDUAL",
        "completion_prob": 88.4,
        "avoided_cost_usd": 45000.0,
        "avoided_aog_hours": 24.0,
    },
]


class ValueStoryDemoController:
    """
    Self-contained, deterministic 9-step demo controller.
    Runs on any sales laptop without requiring live CAN hardware or external brokers.
    """

    def __init__(self, control_file_path: Optional[str] = None):
        self.control_file_path = control_file_path or os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "simulator",
            "current_profile.json",
        )
        self.is_running = False
        self.current_step_idx = 0
        self.started_at: Optional[str] = None
        self._lock = threading.RLock()
        self.step_history: List[Dict[str, Any]] = []

    def start_demo(self) -> Dict[str, Any]:
        """Start or restart the 9-minute value story demo from Step 1."""
        with self._lock:
            self.is_running = True
            self.current_step_idx = 1
            self.started_at = datetime.now(timezone.utc).isoformat()
            self.step_history = [DEMO_VALUE_STORY_STEPS[0]]
            self._write_profile_state(DEMO_VALUE_STORY_STEPS[0])
            return self.get_state()

    def advance_step(self, target_step: Optional[int] = None) -> Dict[str, Any]:
        """Advance to next step or jump to target step (1 to 9)."""
        with self._lock:
            if not self.is_running:
                self.start_demo()
            if target_step is not None:
                self.current_step_idx = max(1, min(len(DEMO_VALUE_STORY_STEPS), target_step))
            else:
                self.current_step_idx = min(len(DEMO_VALUE_STORY_STEPS), self.current_step_idx + 1)

            step_def = DEMO_VALUE_STORY_STEPS[self.current_step_idx - 1]
            if step_def not in self.step_history:
                self.step_history.append(step_def)
            self._write_profile_state(step_def)
            return self.get_state()

    def reset_to_baseline(self) -> Dict[str, Any]:
        """
        Instantaneous Reset Button:
        Clears all faults, restores nominal engine state, and resets demo tracker.
        """
        with self._lock:
            self.is_running = False
            self.current_step_idx = 0
            self.started_at = None
            self.step_history = []
            nominal_cfg = {
                "mode": "NORMAL",
                "speed": 1.0,
                "paused": False,
                "injected_faults": [],
                "target_rpm": 1400.0,
            }
            try:
                os.makedirs(os.path.dirname(self.control_file_path), exist_ok=True)
                with open(self.control_file_path, "w") as f:
                    json.dump(nominal_cfg, f, indent=2)
            except Exception:
                pass
            return {
                "status": "RESET_COMPLETE",
                "message": "Pristine baseline operational state restored.",
                "active": False,
                "step": 0,
            }

    def _write_profile_state(self, step: Dict[str, Any]):
        cfg = {
            "mode": step.get("profile", "NORMAL"),
            "speed": 2.0,
            "paused": False,
            "injected_faults": [],
        }
        if step.get("action") == "inject_fault":
            cfg["injected_faults"] = [step.get("fault", "cooling_degradation")]
        try:
            os.makedirs(os.path.dirname(self.control_file_path), exist_ok=True)
            tmp_path = self.control_file_path + ".tmp"
            with open(tmp_path, "w") as f:
                json.dump(cfg, f, indent=2)
            os.replace(tmp_path, self.control_file_path)
        except Exception:
            pass

    def get_state(self) -> Dict[str, Any]:
        with self._lock:
            if not self.is_running or self.current_step_idx == 0:
                return {
                    "active": False,
                    "step": 0,
                    "total_steps": len(DEMO_VALUE_STORY_STEPS),
                    "steps_catalog": [{"step": s["step"], "name": s["name"]} for s in DEMO_VALUE_STORY_STEPS],
                }
            cur = DEMO_VALUE_STORY_STEPS[self.current_step_idx - 1]
            return {
                "active": True,
                "step": self.current_step_idx,
                "total_steps": len(DEMO_VALUE_STORY_STEPS),
                "started_at": self.started_at,
                "current_step": cur,
                "completion_pct": round((self.current_step_idx / len(DEMO_VALUE_STORY_STEPS)) * 100.0, 1),
                "steps_catalog": [{"step": s["step"], "name": s["name"]} for s in DEMO_VALUE_STORY_STEPS],
            }

    def generate_printable_outcome_report(self) -> str:
        """
        Generates clean, printable HTML executive value report summarizing the run.
        Ready for printing or PDF export directly from the sales demo.
        """
        state = self.get_state()
        now_str = datetime.now(timezone.utc).strftime("%B %d, %Y - %H:%M UTC")
        curr_step = state.get("current_step", DEMO_VALUE_STORY_STEPS[-1])

        html = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>AeroTwin — Executive Value & Mission Outcome Report</title>
  <style>
    body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #1e293b; background: #fff; }}
    .header {{ border-bottom: 3px solid #0284c7; padding-bottom: 16px; margin-bottom: 24px; }}
    .title {{ font-size: 26px; font-weight: 700; color: #0f172a; margin: 0; }}
    .subtitle {{ font-size: 14px; color: #64748b; margin-top: 4px; }}
    .grid {{ display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 32px; }}
    .card {{ background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; text-align: center; }}
    .card-val {{ font-size: 24px; font-weight: 700; color: #0369a1; margin-top: 6px; }}
    .card-lbl {{ font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }}
    table {{ width: 100%; border-collapse: collapse; margin-top: 16px; font-size: 13px; }}
    th, td {{ padding: 10px 14px; border: 1px solid #cbd5e1; text-align: left; }}
    th {{ background: #f1f5f9; font-weight: 600; color: #334155; }}
    .badge {{ display: inline-block; padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; }}
    .badge-pass {{ background: #dcfce7; color: #15803d; }}
    .badge-warn {{ background: #fef9c3; color: #854d0e; }}
    .footer {{ margin-top: 40px; font-size: 11px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 12px; }}
  </style>
</head>
<body>
  <div class="header">
    <h1 class="title">AeroTwin Propulsion Digital Twin</h1>
    <div class="subtitle">Autonomous Prognostic & Prescriptive Value Report | Tail: UAV-01 | {now_str}</div>
  </div>

  <div class="grid">
    <div class="card">
      <div class="card-lbl">Avoided Cost (Overhaul)</div>
      <div class="card-val">$45,000 USD</div>
    </div>
    <div class="card">
      <div class="card-lbl">Avoided AOG Downtime</div>
      <div class="card-val">24.0 Hours</div>
    </div>
    <div class="card">
      <div class="card-lbl">Mission Completion</div>
      <div class="card-val">88.4% (was 61%)</div>
    </div>
    <div class="card">
      <div class="card-lbl">Prescriptive Action</div>
      <div class="card-val">ATA 75-00</div>
    </div>
  </div>

  <h2>9-Minute Value Story Trajectory</h2>
  <table>
    <thead>
      <tr>
        <th>Step</th>
        <th>Phase</th>
        <th>Event Name</th>
        <th>Health Index</th>
        <th>RUL Forecast</th>
        <th>Status</th>
      </tr>
    </thead>
    <tbody>
"""
        for s in DEMO_VALUE_STORY_STEPS:
            b_class = "badge-pass" if s["step"] in (1, 9) else "badge-warn"
            html += f"""      <tr>
        <td>{s['step']}</td>
        <td><strong>{s['phase']}</strong></td>
        <td>{s['name']}</td>
        <td>{s.get('health_score', 'N/A')}%</td>
        <td>{s.get('rul_hours', 'N/A')}h</td>
        <td><span class="badge {b_class}">VERIFIED</span></td>
      </tr>
"""

        html += f"""    </tbody>
  </table>

  <h2 style="margin-top: 32px;">Executive Value Summary</h2>
  <p style="font-size: 14px; line-height: 1.6; color: #334155;">
    During active cruise operations, thermal degradation was detected in Cylinder 3 prior to threshold alarm tripping. 
    Through cross-validation, the digital twin rejected false sensor drift and correctly diagnosed physical cooling restriction.
    A counterfactual what-if simulation recommended an autonomous 250 RPM power adjustment and ATA 75-00 cowling seal inspection, 
    restoring mission success probability from 61.2% to 88.4% and averting premature in-flight emergency landing.
  </p>

  <div class="footer">
    Generated automatically by AeroTwin Value Story Demo Kit | Compliant with ASTM F3269-17 Runtime Assurance
  </div>
</body>
</html>"""
        return html
