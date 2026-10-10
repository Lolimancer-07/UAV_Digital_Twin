# Security & Operational Incident Response Runbook

**System:** UAV Engine Digital Twin Platform  
**Document Ref:** SEC-IR-RUNBOOK-2026  
**Applicability:** All Operations, DevSecOps, and Support Personnel  

---

## 1. Incident Classification & Severity Levels

| Severity | Definition | Target Response | Target Resolution | Examples |
| :--- | :--- | :--- | :--- | :--- |
| **P1 - Critical** | Catastrophic platform failure, suspected cryptographic key compromise, cross-tenant data spill, or false flight safety advisory. | $< 15\text{ minutes}$ | $< 4\text{ hours}$ | Compromised HMAC signing key; unauthorized data access between defense tenants; flight safety envelope breach. |
| **P2 - Major** | Degraded telemetry stream, widespread edge sync disconnects, unhandled drift alerts, or API server latency degradation. | $< 1\text{ hour}$ | $< 12\text{ hours}$ | Edge store-and-forward queue overflow; federated aggregation quorum failure; elevated false alarms in test cell. |
| **P3 - Minor** | Localized UI glitch, minor non-blocking drift review ticket, routine certificate expiration warning. | $< 4\text{ hours}$ | $< 48\text{ hours}$ | Single non-critical sensor calibration offset; UI visual misalignment in dark mode. |

---

## 2. Standard Operating Procedures (SOP)

### SOP-01: Cryptographic Key Compromise or Emergency Revocation
1. **Trigger Emergency Rotation:**
   Call `KeyRotationManager.rotate_key(reason="EMERGENCY_COMPROMISE")` immediately via admin API:
   ```bash
   curl -X POST http://localhost:8000/api/security/rotate-keys \
     -H "Authorization: Bearer $SEC_ADMIN_TOKEN" \
     -d '{"reason": "EMERGENCY_COMPROMISE"}'
   ```
2. **Immediate Grace Period Invalidation:**
   Set old key status to `REVOKED_IMMEDIATE` in key manager to terminate any active connections using the compromised key.
3. **Audit Verification:**
   Query `EventStore` for all events logged during the suspect window to identify any unapproved commands.

### SOP-02: Tenant Isolation & Data Containment
1. If unauthorized cross-tenant query or data exfiltration is detected:
   - Immediately set tenant state to `SUSPENDED` in multi-tenant registry.
   - Restrict tenant storage partitions in [`DataResidencyEnforcer`](file:///home/rishi/UAV_Digital_Twin/packages/twin-core/twin_core/security_compliance.py).
   - Invalidate tenant API tokens and WebSocket sessions.

### SOP-03: Model Regression & Instantaneous Rollback
1. If a newly promoted ML model exhibits divergence or erratic RUL output:
   - Call `/api/models/rollback` to immediately revert the active champion model to the previous proven artifact version.
   - Record root cause in `MODEL_ROLLBACK_DECISION` audit log.

---

## 3. Post-Incident Review (PIR) Requirements

Within 72 hours of resolving a P1/P2 incident:
1. Conduct formal Blameless Post-Mortem.
2. Establish chronological timeline of events with correlation IDs from `EventStore`.
3. Identify contributing factors and root causes.
4. Open remediation tickets with required completion dates.
5. Provide written executive summary to affected customer security officers.
