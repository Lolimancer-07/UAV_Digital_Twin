"""
backend/demo_controller.py
---------------------------
Automated Demo Mode Controller.

Sequences through a 9-step demonstration scenario showing the complete
Sense → Detect → Predict → Explain → Simulate → Optimize → Recommend → Protect pipeline.

Demo Steps:
  1. NORMAL    — Engine healthy, RUL high, mission risk low
  2. FAULT_INJ — Inject cooling_degradation fault
  3. DETECT    — Anomaly detection triggers
  4. EXPLAIN   — XAI shows Cylinder 3 CHT as top driver
  5. PREDICT   — RUL falling, failure probability rising
  6. WHATIF    — Simulate RPM reduction by 200
  7. OPTIMIZE  — System finds safer RPM operating point
  8. RECOMMEND — Prescriptive: Reduce RPM + Inspect cooling
  9. MISSION   — Show mission completion with/without intervention
"""

import os
import json
from typing import Dict, Any

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CONTROL_FILE = os.path.join(ROOT, 'simulator', 'current_profile.json')

DEMO_STEPS = [
    {
        "step": 1, "name": "NORMAL OPERATION",
        "description": "Engine in healthy state: Health >90%, RUL >140 cycles, Mission Risk LOW.",
        "action": "clear_faults", "profile": "NORMAL", "speed": 2.0,
        "highlight": "overview",
    },
    {
        "step": 2, "name": "FAULT INJECTION",
        "description": "Injecting Cylinder 3 cooling degradation fault at severity 0.7.",
        "action": "inject_fault", "fault": "cooling_degradation", "profile": "NORMAL", "speed": 2.0,
        "highlight": "fault_injection",
    },
    {
        "step": 3, "name": "ANOMALY DETECTION",
        "description": "Multi-layer detection: Isolation Forest + 8 domain rules trigger.",
        "action": "none", "highlight": "digital_twin",
    },
    {
        "step": 4, "name": "ROOT CAUSE ANALYSIS",
        "description": "XAI identifies CHT Cylinder 3 as primary contributor (47% attribution).",
        "action": "none", "highlight": "ai_rul",
    },
    {
        "step": 5, "name": "RUL PREDICTION",
        "description": "LSTM RUL falling. Failure probability increasing. Twin consistency Case B.",
        "action": "none", "highlight": "ai_rul",
    },
    {
        "step": 6, "name": "WHAT-IF SIMULATION",
        "description": "Simulating effect of RPM reduction by 200 RPM on thermal load and RUL.",
        "action": "none", "highlight": "whatif",
    },
    {
        "step": 7, "name": "OPERATING POINT OPTIMIZATION",
        "description": "Optimizer searching for RPM and altitude that maximize mission probability.",
        "action": "none", "highlight": "whatif",
    },
    {
        "step": 8, "name": "PRESCRIPTIVE RECOMMENDATION",
        "description": "System recommends: Reduce RPM to 2100. Inspect cooling within 15 cycles.",
        "action": "none", "highlight": "maintenance",
    },
    {
        "step": 9, "name": "MISSION DECISION",
        "description": "Without intervention: 61% completion. With recommendation: 87% completion.",
        "action": "none", "highlight": "mission_risk",
    },
]


class DemoController:
    def __init__(self):
        self.active = False
        self.current_step = 0
        self.whatif_result = None
        self.optimize_result = None

    def start(self):
        self.active = True
        self.current_step = 1
        self._apply_step(1)

    def stop(self):
        self.active = False
        self.current_step = 0
        self._clear_state()

    def advance(self, step: int = None):
        if step is not None:
            self.current_step = max(1, min(len(DEMO_STEPS), step))
        else:
            self.current_step = min(len(DEMO_STEPS), self.current_step + 1)
        self._apply_step(self.current_step)
        return self.get_state()

    def _apply_step(self, step_num: int):
        step = next((s for s in DEMO_STEPS if s["step"] == step_num), None)
        if not step:
            return
        cfg = {"mode": "NORMAL", "speed": 2.0, "paused": False, "injected_faults": []}
        try:
            if os.path.exists(CONTROL_FILE):
                with open(CONTROL_FILE, 'r') as f:
                    cfg = json.load(f)
        except Exception:
            pass
        if "profile" in step:
            cfg["mode"] = step["profile"]
        if "speed" in step:
            cfg["speed"] = step["speed"]
        if step.get("action") == "clear_faults":
            cfg["injected_faults"] = []
        elif step.get("action") == "inject_fault":
            faults = set(cfg.get("injected_faults", []))
            faults.add(step.get("fault", "cooling_degradation"))
            cfg["injected_faults"] = list(faults)
        try:
            os.makedirs(os.path.dirname(CONTROL_FILE), exist_ok=True)
            with open(CONTROL_FILE, 'w') as f:
                json.dump(cfg, f, indent=2)
        except Exception:
            pass

    def _clear_state(self):
        cfg = {"mode": "NORMAL", "speed": 1.0, "paused": False, "injected_faults": []}
        try:
            os.makedirs(os.path.dirname(CONTROL_FILE), exist_ok=True)
            with open(CONTROL_FILE, 'w') as f:
                json.dump(cfg, f, indent=2)
        except Exception:
            pass

    def get_state(self) -> dict:
        if not self.active:
            return {"active": False, "step": 0, "total_steps": len(DEMO_STEPS)}
        step = next((s for s in DEMO_STEPS if s["step"] == self.current_step), DEMO_STEPS[0])
        return {
            "active": True,
            "step": self.current_step,
            "total_steps": len(DEMO_STEPS),
            "name": step["name"],
            "description": step["description"],
            "highlight": step.get("highlight", "overview"),
            "steps": [{"step": s["step"], "name": s["name"]} for s in DEMO_STEPS],
        }


demo_controller = DemoController()
