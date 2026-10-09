# Simulator Scenarios — Golden Files

These deterministic scenario snapshots serve three purposes:
1. **CI regression oracle** — the golden-file test in `tests/test_envelope.py` asserts
   that the reasoning modules produce the expected decisions for each scenario.
2. **Sales demo fixture** — the demo controller can replay any of these files for a
   reproducible, hardware-free demonstration.
3. **Edge parity baseline** — the ONNX edge agent must produce decisions within the
   declared `max_delta` tolerance for each scenario (Phase 4 parity suite).

## Scenario naming convention
`<scenario_id>__<short_description>.json`

## Schema
Each file is a JSON object with:
- `metadata` — id, description, seed, created_at
- `telemetry` — a representative snapshot telemetry packet (same fields as MQTT payload)
- `expected_decisions` — expected values from the reasoning pipeline (with tolerances)
