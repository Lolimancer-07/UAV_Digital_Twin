"""
packages/twin-core/twin_core/platform_profiles.py

Multi-Airframe & Multi-Powertrain Platform Profiles as Pure Data.
Implements improvement_plan.md §4 Phase 8:
  - Extends engine configuration from code branches into a data-driven registry.
  - Supports Rotax 914 F, Austro AE300 Diesel, Continental CD-155, and PBS TJ100 Turboprop variants.
  - Allows runtime dynamic registration and validation of custom airframe engine profiles via JSON/dict.
"""

from typing import Dict, List, Any, Optional, Tuple
import json
import threading

# Core Data-Driven Platform Profiles
PLATFORM_PROFILES_DATA: Dict[str, Dict[str, Any]] = {
    "ROTAX_914": {
        "profile_id": "ROTAX_914",
        "name": "Rotax 914 F3/F4 Turbocharged Aero Engine",
        "powertrain_type": "GASOLINE_BOXER_TURBO",
        "airframe_class": "MALE UAV (MQ-1 Predator / Heron / Rustom-I class)",
        "fuel_type": "AVGAS_100LL_MOGAS",
        "specs": {
            "cylinders": 4,
            "displacement_l": 1.352,
            "compression_ratio": 9.0,
            "rated_power_hp": 115.0,
            "rated_rpm": 2400.0,
            "redline_rpm": 5800.0,
            "fuel_density_kg_per_l": 0.74,
            "fuel_lhv_j_per_kg": 44.0e6,
        },
        "baselines": {
            "rpm": 1400.0,
            "cht": 380.0,
            "egt": 1585.0,
            "oil_pressure": 58.0,
            "oil_temp": 185.0,
            "fuel_flow": 8.5,
            "vibration": 0.65,
        },
        "thresholds": {
            "cht_warning": 410.0,
            "cht_critical": 430.0,
            "oil_p_warning": 38.0,
            "oil_p_critical": 30.0,
            "vibration_critical": 2.5,
        },
    },
    "AUSTRO_AE300": {
        "profile_id": "AUSTRO_AE300",
        "name": "Austro Engine AE300 2.0L Common-Rail Turbo Diesel",
        "powertrain_type": "HEAVY_FUEL_DIESEL",
        "airframe_class": "Tactical Reconnaissance MALE UAV",
        "fuel_type": "JET_A1_DIESEL",
        "specs": {
            "cylinders": 4,
            "displacement_l": 1.991,
            "compression_ratio": 17.5,
            "rated_power_hp": 168.0,
            "rated_rpm": 2300.0,
            "redline_rpm": 3880.0,
            "fuel_density_kg_per_l": 0.82,
            "fuel_lhv_j_per_kg": 42.8e6,
        },
        "baselines": {
            "rpm": 1850.0,
            "cht": 360.0,
            "egt": 1250.0,
            "oil_pressure": 62.0,
            "oil_temp": 195.0,
            "fuel_flow": 12.4,
            "vibration": 0.85,
        },
        "thresholds": {
            "cht_warning": 395.0,
            "cht_critical": 415.0,
            "oil_p_warning": 42.0,
            "oil_p_critical": 32.0,
            "vibration_critical": 2.8,
        },
    },
    "CONTINENTAL_CD155": {
        "profile_id": "CONTINENTAL_CD155",
        "name": "Continental CD-155 Turbocharged Diesel Engine",
        "powertrain_type": "HEAVY_FUEL_DIESEL",
        "airframe_class": "Long-Endurance Surveillance Drone",
        "fuel_type": "JET_A_DIESEL",
        "specs": {
            "cylinders": 4,
            "displacement_l": 1.991,
            "compression_ratio": 18.0,
            "rated_power_hp": 155.0,
            "rated_rpm": 2300.0,
            "redline_rpm": 3900.0,
            "fuel_density_kg_per_l": 0.81,
            "fuel_lhv_j_per_kg": 43.1e6,
        },
        "baselines": {
            "rpm": 1800.0,
            "cht": 355.0,
            "egt": 1220.0,
            "oil_pressure": 60.0,
            "oil_temp": 190.0,
            "fuel_flow": 11.2,
            "vibration": 0.78,
        },
        "thresholds": {
            "cht_warning": 390.0,
            "cht_critical": 410.0,
            "oil_p_warning": 40.0,
            "oil_p_critical": 30.0,
            "vibration_critical": 2.6,
        },
    },
    "PBS_TJ100": {
        "profile_id": "PBS_TJ100",
        "name": "PBS TJ100 Small Turbojet / Micro-Turboprop Engine",
        "powertrain_type": "TURBINE_MICRO_TURBOJET",
        "airframe_class": "High-Speed Target & Fast Tactical ISR Drone",
        "fuel_type": "JET_A1",
        "specs": {
            "cylinders": 0,  # Turbine
            "displacement_l": 0.0,
            "compression_ratio": 4.5,
            "rated_power_hp": 140.0,  # Equivalent shaft power
            "rated_rpm": 52000.0,
            "redline_rpm": 60000.0,
            "fuel_density_kg_per_l": 0.804,
            "fuel_lhv_j_per_kg": 43.2e6,
        },
        "baselines": {
            "rpm": 52000.0,
            "cht": 0.0,       # No cylinders
            "egt": 1150.0,    # Exhaust gas temp in F
            "oil_pressure": 45.0,
            "oil_temp": 160.0,
            "fuel_flow": 32.5,
            "vibration": 1.10,
        },
        "thresholds": {
            "cht_warning": 0.0,
            "cht_critical": 0.0,
            "oil_p_warning": 32.0,
            "oil_p_critical": 25.0,
            "vibration_critical": 3.2,
        },
    },
}


class PlatformProfileRegistry:
    """
    Data-driven registry managing engine and airframe configurations.
    Enables new customer propulsion platforms to be added as JSON/data payloads
    without branching or refactoring reasoning code.
    """

    def __init__(self, initial_profiles: Optional[Dict[str, Dict[str, Any]]] = None):
        self._profiles = dict(initial_profiles or PLATFORM_PROFILES_DATA)
        self._lock = threading.RLock()
        self.active_profile_id = "ROTAX_914"

    def list_profiles(self) -> List[Dict[str, Any]]:
        with self._lock:
            return list(self._profiles.values())

    def get_profile(self, profile_id: Optional[str] = None) -> Optional[Dict[str, Any]]:
        with self._lock:
            pid = profile_id or self.active_profile_id
            return self._profiles.get(pid)

    def set_active_profile(self, profile_id: str) -> bool:
        with self._lock:
            if profile_id in self._profiles:
                self.active_profile_id = profile_id
                return True
            return False

    def register_profile(self, profile_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """
        Validates and registers a new platform profile dynamically at runtime.
        Returns (success, error_message).
        """
        pid = profile_data.get("profile_id")
        if not pid:
            return False, "Missing required field: 'profile_id'"
        if not profile_data.get("specs"):
            return False, "Missing required sub-dict: 'specs'"
        if not profile_data.get("baselines"):
            return False, "Missing required sub-dict: 'baselines'"
        if not profile_data.get("thresholds"):
            return False, "Missing required sub-dict: 'thresholds'"

        with self._lock:
            self._profiles[pid] = profile_data
            return True, None


platform_registry = PlatformProfileRegistry()
