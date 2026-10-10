# Chaos Engineering & Infrastructure Resilience Runbook

**Document Ref:** ENG-CHAOS-2026-V1  
**Scope:** Distributed Ingest, Storage, and AI Engine Resilience  
**Applicability:** Cloud SRE, Edge Fleet Infrastructure, DevSecOps  

---

## 1. Chaos Engineering Objectives & SLA Targets

To guarantee continuous propulsion health monitoring across harsh military and enterprise deployment environments, the Digital Twin is subjected to automated failure injection drills:

| Chaos Drill Scenario | Simulated Failure Mode | Hypothesis & Acceptance SLA | Fallback Strategy |
| :--- | :--- | :--- | :--- |
| **DRILL-01: BROKER_DOWN** | MQTT Broker / Satellite Telemetry Link Disconnect | Zero telemetry frame loss ($0.0\%$ drop rate) during link outage; automatic queue drain upon reconnection. | [`StoreAndForwardQueue`](file:///home/rishi/UAV_Digital_Twin/packages/twin-core/twin_core/store_and_forward.py) SQLite persistent disk buffer. |
| **DRILL-02: STORE_DOWN** | Local Disk Full or Database Lock Collision | Zero process crashes; in-memory fallback ring buffer caches events until storage clears. | In-memory deque fallback buffer with non-blocking error isolation. |
| **DRILL-03: MODEL_MISSING** | Missing, Unsigned, or Corrupted ONNX Model Artifact | System continues executing without fatal unhandled exceptions; provides physics-based health scoring. | Graceful degradation to deterministic Otto-cycle thermodynamic residuals. |

---

## 2. Automated Drill Execution

Drills can be triggered via CLI or the backend REST API:

```bash
# Programmatic Python execution
python -c "
from twin_core.chaos_engine import chaos_runner
print(chaos_runner.run_broker_down_drill())
print(chaos_runner.run_store_down_drill())
print(chaos_runner.run_model_missing_drill())
"
```

Or via REST API:
```http
POST /api/scale/chaos/drill
Content-Type: application/json

{
  "drill_type": "BROKER_DOWN"
}
```

---

## 3. SRE Incident Playbook for Live Failures

### Scenario A: Telemetry Broker Link Failure
1. Confirm edge nodes transition to `BUFFERING` state in `/api/edge/status`.
2. Inspect buffer disk utilization on edge partitions (`df -h /var/log/aerotwin/queue`).
3. Restore broker service. Edge agents automatically initiate throttled reconciliation ($50\text{ frames/sec}$) without saturating cloud ingress.

### Scenario B: Storage Partition Pressure
1. Run automated retention pruning:
   ```bash
   python infra/scripts/prune_event_store.py --days 90 --dry-run
   ```
2. Archive aged flights to cold storage (`s3://aerotwin-archive/`).
