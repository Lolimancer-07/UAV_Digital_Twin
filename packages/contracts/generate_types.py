#!/usr/bin/env python3
"""
packages/contracts/generate_types.py

Generates and synchronizes TypeScript interface definitions from
packages/contracts/decision_envelope_v1.json (improvement_plan.md §4 Phase 1).

Usage:
    python packages/contracts/generate_types.py --check   # CI mode: exit 0 if in sync, 1 if drift
    python packages/contracts/generate_types.py --write   # Sync mode: updates types.ts in-place
"""

import sys
import os
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
SCHEMA_PATH = ROOT / "packages" / "contracts" / "decision_envelope_v1.json"
TYPES_PATH = ROOT / "frontend" / "lib" / "telemetry" / "types.ts"

JSON_TO_TS_PRIMITIVES = {
    "string": "string",
    "number": "number",
    "integer": "number",
    "boolean": "boolean",
    "array": "any[]",
    "object": "Record<string, any>",
}


def load_schema() -> dict:
    with open(SCHEMA_PATH, "r") as f:
        return json.load(f)


def generate_telemetry_payload_ts(schema: dict) -> str:
    """Generate the TelemetryPayload interface block from the schema."""
    lines = [
        "export interface TelemetryPayload {",
    ]

    properties = schema.get("properties", {})
    required = set(schema.get("required", []))

    # Explicit custom type mappings for rich sub-objects in frontend
    type_overrides = {
        "envelope_version": "string",
        "emitted_at": "string",
        "alert": '"NOMINAL" | "WARNING" | "CRITICAL" | SystemAlert',
        "cht_cyl": "number[]",
        "egt_cyl": "number[]",
        "fault_events": "FaultEvent[]",
        "active_faults": "string[]",
        "injected_faults": "string[]",
        "can_frames": "CanFrame[]",
        "physics": "PhysicsState",
        "health": "HealthState",
        "xai": "XaiEngineState",
        "sensor_integrity": "SensorIntegrityState",
        "twin_consistency": "TwinConsistencyState",
        "mission_risk": "MissionRiskState",
        "prescriptive": "PrescriptiveState",
        "telemetry_integrity": "TelemetryIntegrityState",
        "fleet_status": "FleetUavSummary[]",
        "demo_state": "DemoState",
        "whatif_result": "WhatIfResult | null",
        "optimize_result": "OptimizeResult | null",
        "ai_engineer_response": "AiEngineerResponse | null",
        "mission_command": "MissionCommandState",
        "federated_round": "FederatedRoundState",
        "edge_profile": "EdgeProfileState",
        "security_status": "SecurityStatusState",
        "provenance": "{\n    core_version?: string\n    config_hash?: string\n    runtime?: \"gcs_float32\" | \"edge_int8\" | string\n  }",
    }

    descriptions = {
        "envelope_version": "/** Decision Envelope contract version — \"1.0\". Consumers must reject unknown major versions. */",
        "emitted_at": "/** ISO-8601 UTC timestamp of when this envelope was emitted by the inference engine. */",
        "provenance": "/** Provenance metadata — which core version and runtime produced this envelope. */",
    }

    for prop_name, prop_spec in properties.items():
        opt = "" if prop_name in required else "?"
        ts_type = type_overrides.get(prop_name)
        if not ts_type:
            schema_type = prop_spec.get("type", "any")
            if "enum" in prop_spec:
                ts_type = " | ".join(f'"{v}"' for v in prop_spec["enum"])
            else:
                ts_type = JSON_TO_TS_PRIMITIVES.get(schema_type, "any")

        if prop_name in descriptions:
            lines.append(f"  {descriptions[prop_name]}")

        lines.append(f"  {prop_name}{opt}: {ts_type}")

    lines.append("}")
    return "\n".join(lines)


def check_sync() -> bool:
    schema = load_schema()
    props = set(schema.get("properties", {}).keys())

    if not TYPES_PATH.exists():
        print(f"Error: {TYPES_PATH} does not exist", file=sys.stderr)
        return False

    types_content = TYPES_PATH.read_text()
    start_tag = "export interface TelemetryPayload {"
    end_tag = "export interface SensorHistoryPoint {"
    start_pos = types_content.find(start_tag)
    end_pos = types_content.find(end_tag, start_pos) if start_pos != -1 else -1

    if start_pos == -1 or end_pos == -1:
        print("Error: Could not locate TelemetryPayload block in types.ts", file=sys.stderr)
        return False

    payload_block = types_content[start_pos + len(start_tag):end_pos]
    field_names = set(re.findall(r"^\s*([a-zA-Z0-9_]+)\??\s*:", payload_block, re.MULTILINE))

    # All contract properties must be present in TypeScript TelemetryPayload
    missing_in_ts = props - field_names
    if missing_in_ts:
        print(f"Contract drift detected! Fields in decision_envelope_v1.json missing in TelemetryPayload: {missing_in_ts}", file=sys.stderr)
        return False

    print(f"✓ All {len(props)} Decision Envelope contract properties verified in TelemetryPayload.")
    return True


def main():
    write_mode = "--write" in sys.argv
    check_mode = "--check" in sys.argv or not write_mode

    if check_mode and not write_mode:
        if check_sync():
            print("Types are in sync with contract.")
            sys.exit(0)
        else:
            sys.exit(1)

    if write_mode:
        schema = load_schema()
        new_block = generate_telemetry_payload_ts(schema)
        types_content = TYPES_PATH.read_text()
        pattern = r"export interface TelemetryPayload \{[^}]+(?:\s*\{[^}]+\}[^}]*)*\}"
        if re.search(pattern, types_content):
            updated = re.sub(pattern, new_block, types_content)
            TYPES_PATH.write_text(updated)
            print(f"Updated TelemetryPayload in {TYPES_PATH}")
        else:
            print("Warning: Could not replace TelemetryPayload block cleanly; checking sync instead.")
            check_sync()


if __name__ == "__main__":
    main()
