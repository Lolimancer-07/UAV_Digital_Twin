"""
backend/maintenance_advisor.py

Generates ATA-chapter–referenced maintenance work orders based on
active fault codes and AI-predicted RUL, with strict multi-fault priority ranking.

ATA chapters covered:
  ATA 72 — Engine Core & Power Section
  ATA 73 — Engine Fuel & Control (injectors, rails)
  ATA 75 — Air Cooling & Radiators
  ATA 77 — Engine Indicating (sensors & thermocouples)
  ATA 79 — Engine Oil & Lubrication
  ATA 80 — Starting & Ignition
  ATA 05 — Time Limits & Scheduled Maintenance Checks

Each work order card specifies:
  - Task ID (ATA compliant)
  - Title
  - ATA Chapter
  - Priority & Rank
  - Urgency Window (hours)
  - Priority Rationale (explaining why this item takes precedence)
  - Required Action & Step-by-Step Field Procedures
"""

from typing import Dict, List, Any

# Deterministic flight-safety priority order for concurrent fault triage
FAULT_PRIORITY_HIERARCHY: Dict[str, Dict[str, Any]] = {
    "LOW_OIL_PRESSURE": {
        "rank": 1,
        "rationale": "Loss of hydrodynamic oil film leads to catastrophic bearing seizure and uncontained engine failure within 45-90 seconds."
    },
    "OVERHEATING": {
        "rank": 2,
        "rationale": "Sustained CHT > 430°F causes thermal cylinder head warping, piston crown micro-welding, and sudden loss of compression."
    },
    "MISFIRE_SUSPECT": {
        "rank": 3,
        "rationale": "Severe torsional resonance threatens reduction gearbox spline integrity, while unburned fuel risks exhaust manifold fire."
    },
    "COOLING_DEGRADATION": {
        "rank": 4,
        "rationale": "Direct thermal runaway precursor; radiator core blockage rapidly escalates into cylinder head overheating."
    },
    "LUBRICATION_ISSUE": {
        "rank": 5,
        "rationale": "Thermal oil breakdown or pressure drop accelerates journal wear and reduces hydrodynamic film thickness."
    },
    "HIGH_VIBRATION": {
        "rank": 6,
        "rationale": "Propeller or gearbox imbalance induces structural fatigue in engine lord mounts and airframe firewall."
    },
    "INJECTOR_ANOMALY": {
        "rank": 7,
        "rationale": "Fuel rail imbalance produces lean-cylinder detonation and asymmetric thrust output."
    },
    "COMBUSTION_INSTABILITY": {
        "rank": 8,
        "rationale": "Combustion flame front variation causes erratic torque spikes and elevated specific fuel consumption."
    },
    "SENSOR_DRIFT": {
        "rank": 9,
        "rationale": "Instrumentation drift impairs FADEC closed-loop control; physical engine is intact but telemetry trust is degraded."
    },
    "ALTERNATOR_LOW": {
        "rank": 10,
        "rationale": "Depleted avionics battery bus threatens secondary actuator bus, manageable via load shedding."
    }
}

ATA_MAINTENANCE_CARDS: Dict[str, Dict[str, Any]] = {
    "OVERHEATING": {
        "task_id": "ATA 75-20-01",
        "title": "Cylinder Head Thermal Runaway & Cooling Baffle Inspection",
        "ata_chapter": "75 (Air / Liquid Cooling)",
        "priority": "CRITICAL",
        "urgency_hours": 0.5,
        "action": "Immediate descent / throttle reduction. Inspect cylinder ram-air cooling baffles, radiator coolant flow, and cylinder head torque.",
        "steps": [
            "Step 1: Check cylinder head torque specification (22 Nm).",
            "Step 2: Inspect cylinder cooling air deflector baffles for deformation or foreign object blockage.",
            "Step 3: Test thermostat valve cracking temperature (80°C ± 2°C).",
            "Step 4: Verify coolant glycol concentration (50/50 mix distilled water and Evans waterless/glycol)."
        ]
    },
    "LOW_OIL_PRESSURE": {
        "task_id": "ATA 79-20-04",
        "title": "Lubrication Circuit Pressure Loss & Scavenge Pump Servicing",
        "ata_chapter": "79 (Oil System)",
        "priority": "CRITICAL",
        "urgency_hours": 1.0,
        "action": "Inspect oil pump pressure relief valve, main gallery seals, and oil lines for micro-fractures. Replace spin-on oil filter.",
        "steps": [
            "Step 1: Cut open oil filter element and inspect for bronze/steel metallic particulate.",
            "Step 2: Check oil pressure relief valve spring free length (min 42.5 mm).",
            "Step 3: Perform crankcase blow-by pressure check with differential tester.",
            "Step 4: Refill with certified aero multigrade oil (AeroShell Oil Sport Plus 4) and prime oil galleries."
        ]
    },
    "HIGH_VIBRATION": {
        "task_id": "ATA 72-10-08",
        "title": "Propeller Dynamic Balancing & Engine Mount Damper Check",
        "ata_chapter": "72 (Engine Core)",
        "priority": "WARNING",
        "urgency_hours": 5.0,
        "action": "Perform dynamic propeller vibration survey. Inspect elastomer lord mounts and reduction gearbox dog-clutch backlash.",
        "steps": [
            "Step 1: Torque check engine mount lord isolators (45 Nm).",
            "Step 2: Perform 1X/2X shaft dynamic balancing using optical tachometer and accelerometer.",
            "Step 3: Check gearbox dog gear engagement clearance (0.4 - 0.7 mm).",
            "Step 4: Borescope inspect reduction gear pinion teeth for pitting or micro-spalling."
        ]
    },
    "MISFIRE_SUSPECT": {
        "task_id": "ATA 80-10-02",
        "title": "Dual Ignition Coil & Spark Plug High-Tension Lead Diagnostics",
        "ata_chapter": "80 (Starting & Ignition)",
        "priority": "CRITICAL",
        "urgency_hours": 2.0,
        "action": "Test dual electronic ignition modules, spark plug electrode gap, and crank trigger reluctance pickup sensor air gap.",
        "steps": [
            "Step 1: Remove all 8 dual spark plugs; verify electrode gap is 0.6 - 0.7 mm.",
            "Step 2: Measure primary coil resistance (0.8 - 1.2 Ohms).",
            "Step 3: Measure secondary coil resistance (5.5 - 7.0 kOhms).",
            "Step 4: Verify flywheel trigger wheel air gap (0.45 ± 0.05 mm) with non-magnetic feeler gauge."
        ]
    },
    "INJECTOR_ANOMALY": {
        "task_id": "ATA 73-10-05",
        "title": "Electronic Fuel Injector Flow Matching & Rail Purge",
        "ata_chapter": "73 (Engine Fuel)",
        "priority": "WARNING",
        "urgency_hours": 10.0,
        "action": "Ultrasonic clean fuel injector nozzles, check fuel distribution rail pressure, and verify injector driver pulse width.",
        "steps": [
            "Step 1: Perform fuel rail static pressure hold test (3.0 bar for 5 min).",
            "Step 2: Flow match all 4 injectors on test bench to within ±2% dynamic volume.",
            "Step 3: Replace 10-micron in-line high-pressure fuel filter.",
            "Step 4: Re-calibrate FADEC injector dead-time compensation curve."
        ]
    },
    "SENSOR_DRIFT": {
        "task_id": "ATA 77-10-03",
        "title": "EGT/CHT Thermocouple & Pressure Transducer Cross-Calibration",
        "ata_chapter": "77 (Engine Indicating)",
        "priority": "WARNING",
        "urgency_hours": 15.0,
        "action": "Perform reference dry-block calibrator test on Type-K thermocouples and piezoresistive oil pressure sender.",
        "steps": [
            "Step 1: Check thermocouple lead harness for cold-junction compensation offset.",
            "Step 2: Calibrate oil pressure sender against 0-100 PSI precision master test gauge.",
            "Step 3: Verify ECU sensor 5.00V reference excitation rail stability."
        ]
    },
    "COOLING_DEGRADATION": {
        "task_id": "ATA 75-10-01",
        "title": "Cooling Radiator Matrix De-Fouling & Thermal Resistance Check",
        "ata_chapter": "75 (Cooling)",
        "priority": "WARNING",
        "urgency_hours": 8.0,
        "action": "Clean radiator cooling fins, flush cooling matrix, and inspect coolant circulation pump impeller.",
        "steps": [
            "Step 1: Compressed air back-flush radiator matrix exterior fins.",
            "Step 2: Inspect coolant pump mechanical seal for weeping.",
            "Step 3: Measure coolant differential temperature across radiator core (delta T >= 18°C)."
        ]
    },
    "LUBRICATION_ISSUE": {
        "task_id": "ATA 79-10-02",
        "title": "Oil Thermal Exchanger & Viscosity Degradation Service",
        "ata_chapter": "79 (Oil System)",
        "priority": "WARNING",
        "urgency_hours": 6.0,
        "action": "Inspect oil cooler thermostat valve, flush oil radiator, and pull oil sample for spectrometric ferrography.",
        "steps": [
            "Step 1: Perform spectrographic oil analysis (SOAP) for Fe, Al, Cu content.",
            "Step 2: Check oil cooler bypass valve crack opening operation at 75°C.",
            "Step 3: Inspect magnetic drain plug for ferrous swarf accumulation."
        ]
    },
    "COMBUSTION_INSTABILITY": {
        "task_id": "ATA 72-30-01",
        "title": "Cylinder Differential Compression & Combustion Chamber Boroscopy",
        "ata_chapter": "72 (Engine Core)",
        "priority": "WARNING",
        "urgency_hours": 12.0,
        "action": "Perform differential compression test on all 4 cylinders and inspect combustion chambers for carbon buildup.",
        "steps": [
            "Step 1: Differential compression test (80 PSI reference, min allowable 70/80 PSI).",
            "Step 2: Borescope exhaust valve faces for green/orange burn patterns.",
            "Step 3: Inspect intake runner seals for unmetered air ingress."
        ]
    },
    "ALTERNATOR_LOW": {
        "task_id": "ATA 24-20-01",
        "title": "Engine Driven Alternator & Voltage Regulator Inspection",
        "ata_chapter": "24 (Electrical Power)",
        "priority": "INFO",
        "urgency_hours": 24.0,
        "action": "Inspect alternator serpentine belt tension, slip rings, and FADEC battery charging current.",
        "steps": [
            "Step 1: Measure alternator belt deflection under 50 N load (8 - 10 mm).",
            "Step 2: Verify regulator output voltage under simulated 25 A avionics bus load.",
            "Step 3: Inspect brushes and stator winding resistance."
        ]
    }
}


class AutonomousMaintenanceAdvisor:
    """
    Evaluates active fault signatures, multi-sensor residuals, and prognostic RUL
    to produce deterministic ATA-100 compliant digital work orders sorted by flight-safety priority.
    """

    @classmethod
    def generate_advisories(cls, telemetry: Dict[str, Any], fault_events: List[Dict[str, Any]],
                            predicted_rul: float, health_index: float) -> List[Dict[str, Any]]:
        advisories = []
        seen_tasks = set()

        # Build maintenance cards for active faults
        for fault in fault_events:
            fname = fault.get("name", "").upper()
            if fname in ATA_MAINTENANCE_CARDS and fname not in seen_tasks:
                card = dict(ATA_MAINTENANCE_CARDS[fname])
                meta = FAULT_PRIORITY_HIERARCHY.get(fname, {"rank": 50, "rationale": "Standard maintenance action item."})
                card["priority_rank"] = meta["rank"]
                card["priority_rationale"] = meta["rationale"]
                card["source_fault"] = fname
                seen_tasks.add(fname)
                advisories.append(card)

        # Sort fault advisories by priority rank (1 = highest urgency)
        advisories.sort(key=lambda x: (x.get("priority_rank", 50), x.get("urgency_hours", 100)))

        # RUL-based predictive depot alerts
        if 0 < predicted_rul < 25:
            advisories.insert(0, {
                "task_id": "ATA 72-00-99",
                "title": f"MALE UAV Engine Approaching End-Of-Life (RUL: {predicted_rul:.0f} Cycles)",
                "ata_chapter": "72 (Engine General)",
                "priority": "CRITICAL",
                "priority_rank": 0,
                "priority_rationale": "Depot overhaul mandatory before life limit exhaustion to prevent in-flight engine flameout.",
                "urgency_hours": 1.0,
                "action": "Schedule immediate scheduled overhaul (TBO). Ground aircraft from long-duration ISR dispatch.",
                "steps": [
                    "Step 1: Ground UAV and tag propulsion unit for scheduled depot-level overhaul.",
                    "Step 2: Perform full digital twin blackbox flight recorder telemetry dump.",
                    "Step 3: Inspect crankshaft journal bearings and connecting rod small ends."
                ]
            })
        elif 25 <= predicted_rul < 60:
            advisories.append({
                "task_id": "ATA 05-20-01",
                "title": f"Mid-Life Preventive Diagnostic Check (RUL: {predicted_rul:.0f} Cycles)",
                "ata_chapter": "05 (Time Limits / Maintenance Checks)",
                "priority": "WARNING",
                "priority_rank": 20,
                "priority_rationale": "Scheduled 50-hour preventative inspection ensures sustained reliability in mid-life envelope.",
                "urgency_hours": 20.0,
                "action": "Perform 50-hour scheduled preventive inspection and fluid renewals.",
                "steps": [
                    "Step 1: Replace engine oil and filter.",
                    "Step 2: Inspect throttle cable linkage and fuel lines.",
                    "Step 3: Check valve lash clearances."
                ]
            })

        # Nominal status if no faults or critical life limits
        if not advisories:
            advisories.append({
                "task_id": "ATA 05-00-00",
                "title": "Propulsion System Nominal — Ready for Dispatch",
                "ata_chapter": "05 (General)",
                "priority": "OK",
                "priority_rank": 99,
                "priority_rationale": "No active fault codes or thermodynamic deviations detected.",
                "urgency_hours": 100.0,
                "action": "All subsystems within certified airworthiness limits. Proceed with standard pre-flight checklist.",
                "steps": ["Routine pre-flight walkaround & engine runup."]
            })

        return advisories
