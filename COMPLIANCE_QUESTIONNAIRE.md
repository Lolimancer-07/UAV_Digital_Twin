# Vendor Security & Compliance Questionnaire

**Vendor:** AeroTwin Systems / UAV Digital Twin  
**Product:** UAV Engine Digital Twin Platform  
**Document Ref:** SEC-VEND-QUEST-2026  
**Audience:** Defense Primes, MRO Enterprise Security Teams, Government Compliance Auditors  

---

## Section 1: Product Architecture & Flight Safety

**Q1.1: Does this software execute directly on the airborne flight control computer (FCC) or actuate flight surfaces?**  
> **Answer:** **No.** The UAV Digital Twin operates strictly as a ground-side / decision-support and maintenance advisory system. There is zero direct actuator write authority. All recommendations are intercepted by a runtime safety envelope barrier ([`AdvisorySafetyEnvelope`](file:///home/rishi/UAV_Digital_Twin/packages/twin-core/twin_core/safety_assurance.py)), guaranteeing human-in-the-loop oversight aligned with ASTM F3269-17 principles.  
> *Reference Document:* [`SAFETY_ASSURANCE_CASE.md`](file:///home/rishi/UAV_Digital_Twin/SAFETY_ASSURANCE_CASE.md)

**Q1.2: What hardware interfaces are required for engine bench or test-cell integration?**  
> **Answer:** Standard SAE J1939 CAN 2.0B (250 kbps) with 29-bit identifiers or ARINC 429 over optocoupled transceivers (Vector VN1610, Kvaser Leaf, or embedded CAN HATs).  
> *Reference Document:* [`HIL_TESTBED_PLAN.md`](file:///home/rishi/UAV_Digital_Twin/HIL_TESTBED_PLAN.md)

---

## Section 2: Data Protection, Encryption & Residency

**Q2.1: Is raw flight telemetry shared with other customers or used to train third-party models?**  
> **Answer:** **Never.** Raw telemetry is strictly confined within tenant boundaries. Aggregate learning operates solely via Differential Privacy Federated Learning (DP-FedAvg) with $L_2$ gradient clipping ($C=0.15$), calibrated Gaussian noise, and requires explicit opt-in. Non-opted tenants are excluded by default.  
> *Reference Document:* [`DATA_USE_POLICY.md`](file:///home/rishi/UAV_Digital_Twin/DATA_USE_POLICY.md)

**Q2.2: How is ITAR and defense-sensitive technical data handled?**  
> **Answer:** Defense tenants are hard-pinned to dedicated US Sovereign Cloud partitions (`us-gov-west-1`, `us-gov-east-1`). The [`DataResidencyEnforcer`](file:///home/rishi/UAV_Digital_Twin/packages/twin-core/twin_core/security_compliance.py) prevents cross-region data dispatch or export.  
> *Reference Document:* [`EXPORT_CONTROL_REVIEW.md`](file:///home/rishi/UAV_Digital_Twin/EXPORT_CONTROL_REVIEW.md)

**Q2.3: How are cryptographic keys managed and rotated?**  
> **Answer:** Cryptographic keys and HMAC tokens are rotated every 30 days with an automated 48-hour overlapping grace period by [`KeyRotationManager`](file:///home/rishi/UAV_Digital_Twin/packages/twin-core/twin_core/security_compliance.py). Every rotation event is durably audited in [`EventStore`](file:///home/rishi/UAV_Digital_Twin/backend/event_store.py).  
> *Reference Document:* [`SECURITY_POSTURE.md`](file:///home/rishi/UAV_Digital_Twin/SECURITY_POSTURE.md)

---

## Section 3: Supply Chain, SBOM & Vulnerability Management

**Q3.1: Do you maintain a machine-readable Software Bill of Materials (SBOM)?**  
> **Answer:** **Yes.** A CycloneDX 1.5 compliant SBOM is generated with every release, containing SHA-256 package checksums, supplier provenance, and license tracking.  
> *Reference File:* [`sbom.json`](file:///home/rishi/UAV_Digital_Twin/sbom.json)

**Q3.2: How do you verify model and software bundle integrity prior to deployment?**  
> **Answer:** Model artifacts (`.onnx`) and manifests are signed with HMAC-SHA256 / Ed25519 signatures. The edge runtime and backend verify both physical SHA-256 digests and cryptographic signatures prior to executing inference. Tampered files are rejected.  
> *Reference Test:* `test_artifact_signature_verification_rejects_tampered_model` in [`tests/test_compliance_and_security.py`](file:///home/rishi/UAV_Digital_Twin/tests/test_compliance_and_security.py)

**Q3.3: What is your documented procedure in case of a critical security breach?**  
> **Answer:** Documented P1/P2/P3 severity matrix with $< 15\text{ minute}$ response target, automated key revocation kill-switch, tenant quarantine, and blameless post-mortem reporting within 72 hours.  
> *Reference Document:* [`INCIDENT_RESPONSE_RUNBOOK.md`](file:///home/rishi/UAV_Digital_Twin/INCIDENT_RESPONSE_RUNBOOK.md)

---

## Section 4: AI Model Governance & Validation

**Q4.1: Can an AI model be deployed to production without human oversight?**  
> **Answer:** **No.** The system enforces three immutable promotion gates: offline metric benchmarks ($MAE \le 5.0, R^2 \ge 0.85$), streaming shadow-mode parity with the active champion model, and mandatory recorded human engineering sign-off. Instantaneous rollback is supported.  
> *Reference Document:* [`packages/twin-core/twin_core/model_governance.py`](file:///home/rishi/UAV_Digital_Twin/packages/twin-core/twin_core/model_governance.py) & [Phase 5 Implementation Report](file:///home/rishi/.gemini/antigravity-ide/brain/b359f007-eaa0-4e15-a4dd-a9bb4e9b54bf/phase5_implementation_report.md)
