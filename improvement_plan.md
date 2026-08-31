# UAV Digital Twin — Improvement Roadmap

## Where You Are vs. What the Judges Want

| Requirement (Problem Statement) | Current State | Gap |
|---|---|---|
| RUL Estimation | ✅ LSTM trained & live | —  |
| Real-time dashboard | ✅ WebSocket + browser UI | Needs more panels |
| RPM / CHT / EGT monitoring | ✅ Live | — |
| **Anomaly Detection** | ❌ Missing | Biggest gap |
| Oil pressure, fuel flow, vibration | ❌ Not simulated | Missing sensors |
| Fault classification (misfire, injector, etc.) | ❌ Missing | Big gap |
| Mission Replay / Simulation modes | ❌ Missing | Unique differentiator |
| Maintenance Advisory | ❌ Missing | Easy win |
| Health Score / Index | ❌ Missing | Easy win |
| Physics-informed model | ❌ Missing | Innovation area |

---

## Priority 1 — Anomaly Detection (Biggest Gap, Highest Marks)

> The problem says: *"transition from threshold-based to intelligent predictive diagnostics"*. Your current system is threshold-based (`RUL < 20 = CRITICAL`). You need **AI anomaly detection**.

### What to build
**`backend/anomaly_detector.py`** — Isolation Forest trained on normal engine behaviour. Any reading outside the learned distribution → **anomaly alert** with a fault category.

```python
from sklearn.ensemble import IsolationForest
import numpy as np

class AnomalyDetector:
    def __init__(self):
        # Train on the first N cycles of "healthy" data
        self.model = IsolationForest(contamination=0.05, random_state=42)
    
    def fit(self, normal_data):  # numpy array (N, features)
        self.model.fit(normal_data)
    
    def predict(self, reading):  # returns (is_anomaly: bool, score: float)
        score = self.model.decision_function([reading])[0]
        is_anomaly = self.model.predict([reading])[0] == -1
        return is_anomaly, score
```

**Fault rule-based classification on top of anomaly:**
```python
FAULT_RULES = {
    "OVERHEATING":    lambda d: d['cht'] > 420 or d['egt'] > 1650,
    "RPM_INSTABILITY":lambda d: abs(d['rpm'] - d.get('prev_rpm',d['rpm'])) > 200,
    "SENSOR_DRIFT":   lambda d: d['egt'] < 1300 and d['cht'] > 400,
    "MISFIRE":        lambda d: d['rpm'] < 1200 and d['egt'] > 1620,
}
```

---

## Priority 2 — Expand the Simulator (More Sensors)

> Problem B requires: Oil Pressure, Fuel Flow, Vibration, Battery/Alternator

### What to build
Extend **`simulator/ecu_sim.c`** to generate synthetic readings for missing sensors using physics-informed noise:

```c
// Oil pressure drops as RUL decreases (degradation model)
float oil_pressure = 65.0f + (rul * 0.05f) + ((float)rand()/RAND_MAX - 0.5f) * 3.0f;

// Fuel flow correlates with RPM
float fuel_flow = (rpm / 1400.0f) * 8.5f + ((float)rand()/RAND_MAX) * 0.3f;

// Vibration increases as engine degrades
float vibration = 0.5f + ((260.0f - rul) / 260.0f) * 2.5f + ((float)rand()/RAND_MAX) * 0.2f;
```

JSON payload becomes:
```json
{
  "engine_id": 1, "cycle": 142, "rpm": 1403.2, "cht": 642.4, "egt": 1588.6,
  "oil_pressure": 62.1, "fuel_flow": 8.4, "vibration": 1.2, "true_rul": 117
}
```

---

## Priority 3 — Engine Health Index (Easy Win, High Visual Impact)

> Composite score 0–100 shown as a gauge on the dashboard. Judges love a single number.

### What to build
**`backend/health_index.py`**:

```python
def compute_health_index(data, predicted_rul, is_anomaly):
    # Weighted sub-scores
    rul_score  = min(100, (predicted_rul / 260) * 100)       # RUL as % of max life
    thermal_ok = 100 if data['cht'] < 400 else max(0, 100 - (data['cht']-400)*2)
    vib_ok     = 100 if data['vibration'] < 1.5 else max(0, 100 - (data['vibration']-1.5)*40)
    anomaly_penalty = -20 if is_anomaly else 0

    health = (rul_score * 0.5) + (thermal_ok * 0.3) + (vib_ok * 0.2) + anomaly_penalty
    return max(0, min(100, health))
```

Show it as a **circular arc gauge** on the dashboard.

---

## Priority 4 — Mission Replay & Simulation Modes

> Directly required in section E. Unique feature that sets you apart.

### What to build
**`simulator/mission_profiles.py`** — instead of replaying CSV linearly, allow mode selection:

| Mode | What it does |
|---|---|
| `NORMAL` | Replay CSV at 10Hz (current) |
| `HIGH_ALTITUDE` | Multiply EGT × 1.08, RPM × 0.95 (thin air = rich mixture) |
| `HOT_WEATHER` | CHT += 40°F baseline offset |
| `RAPID_THROTTLE` | Inject RPM spikes every 30 cycles |
| `ENDURANCE` | Slow replay at 1Hz, extended dataset |

Add a **mode selector dropdown** to the dashboard that sends the mode via WebSocket back to the backend.

---

## Priority 5 — Enhanced Dashboard Panels

> Section F requires: Fault alerts, efficiency trends, maintenance advisory, mission reports

### New panels to add to `frontend/index.html`

**A — Multi-line trend chart (Chart.js)**
```html
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
```
Rolling 200-cycle line chart showing RUL degradation curve (predicted vs actual).

**B — Fault Alert Panel**
```
⚠ [14:23:01] OVERHEATING TREND — CHT 421°F
⚠ [14:22:48] ANOMALY DETECTED — Score: -0.12
✔ [14:22:30] System nominal
```

**C — Maintenance Advisory**
Triggered automatically:
```
🔧 ADVISORY: Oil pressure trending down.
   Inspect lubrication system within 15 flight cycles.
   Confidence: 78%
```

**D — Health Report download button** (JSON export of session)

---

## Priority 6 — Physics-Informed Model (Innovation Area)

> "Physics-informed AI" is listed as a desired innovation area. Easy to implement, very impressive.

Add a **thermodynamic sanity check** in inference.py:

```python
def thermodynamic_check(rpm, cht, egt, fuel_flow):
    """
    Basic Otto cycle efficiency: η = 1 - 1/r^(γ-1)
    Flags when sensor readings violate physics.
    """
    # EGT should be ~2.5x CHT for healthy combustion
    thermal_ratio = egt / cht if cht > 0 else 0
    expected_ratio_range = (2.2, 2.8)
    
    if not (expected_ratio_range[0] <= thermal_ratio <= expected_ratio_range[1]):
        return "COMBUSTION_ANOMALY", thermal_ratio
    return "NORMAL", thermal_ratio
```

---

## Recommended Build Order

```
Week/Day 1: Priority 1 (Anomaly Detection) + Priority 3 (Health Index)
            → These directly address the core AI requirement

Day 2:      Priority 2 (More sensors in simulator)
            → Makes demo more realistic

Day 3:      Priority 5 (Enhanced dashboard — Chart.js trends + fault log)
            → Biggest visual impact for judges

Day 4:      Priority 4 (Mission modes)
            → Differentiating feature

Day 5:      Priority 6 (Physics check) + Polish + Documentation
```

---

## Files to Create/Modify

| File | Action | Priority |
|---|---|---|
| `backend/anomaly_detector.py` | **NEW** | 1 |
| `backend/health_index.py` | **NEW** | 3 |
| `backend/inference.py` | Integrate anomaly + health | 1 |
| `simulator/ecu_sim.c` | Add oil, fuel, vibration sensors | 2 |
| `simulator/mission_profiles.py` | **NEW** | 4 |
| `frontend/index.html` | Chart.js trends, fault log, gauge, advisory | 5 |
| `backend/physics_check.py` | **NEW** | 6 |
| `docs/architecture.md` | **NEW** — required deliverable | — |

---

> [!IMPORTANT]
> **The single highest-impact thing you can do**: Add anomaly detection (Priority 1).
> The problem explicitly says to move beyond threshold-based systems. Your current
> `if RUL < 20: CRITICAL` is literally what they're asking you to replace.
