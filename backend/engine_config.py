"""
backend/engine_config.py

Centralized configuration repository for UAV aero piston engine classes,
thresholds, physics coefficients, and fault detection parameters.

Allows dynamic retargeting of the Digital Twin between different MALE UAV engine classes
(e.g., Rotax 914 F Turbo, Austro Engine AE300, Continental CD-155) without modifying core code.
"""

from typing import Dict, Any, List

ENGINE_REGISTRY: Dict[str, Dict[str, Any]] = {
    "ROTAX_914": {
        "name": "Rotax 914 F3/F4 Turbocharged Aero Engine",
        "category": "Piston / 4-Cylinder Boxer / Turbocharged",
        "airframe": "MALE UAV (MQ-1 Predator / Heron / Rustom-I class)",
        "specs": {
            "cylinders": 4,
            "bore_m": 0.084,             # 84 mm
            "stroke_m": 0.061,           # 61 mm
            "displacement_m3": 0.001352, # 1.352 L (1352 cc)
            "compression_ratio": 9.0,    # 9.0:1
            "rated_power_hp": 115.0,     # 115 HP @ 5800 prop RPM / 2400 engine shaft
            "rated_rpm": 2400.0,
            "gamma": 1.35,               # Hot combustion gas specific heat ratio
            "fuel_lhv_j_per_kg": 44.0e6, # 44 MJ/kg
            "fuel_density_kg_per_l": 0.74,
            "friction_fudge": 0.14,      # Mechanical friction fraction (~14%)
            "mechanical_eff": 0.86,
            "r_air": 287.05,
        },
        "physics_constants": {
            "k1_cht_rpm": 38.0,
            "k2_cht_bhp": 2.25,
            "k3_egt_rpm": 65.0,
            "k4_egt_fuel": 12.0,
            "k_oil_slope": 35.0,
            "k_oil_base": 15.0,
        },
        "residual_thresholds": {
            "delta_cht": 30.0,   # °F residual tolerance before calling physics deviation
            "delta_egt": 60.0,   # °F
            "delta_oil_p": 12.0, # PSI
            "delta_fuel": 1.5,   # L/h
        },
        "fault_thresholds": {
            "cht_critical_degf": 430.0,
            "cht_warning_degf": 410.0,
            "egt_critical_degf": 1650.0,
            "egt_warning_degf": 1620.0,
            "oil_p_critical_psi": 30.0,
            "oil_p_warning_psi": 38.0,
            "oil_t_critical_degf": 235.0,
            "oil_t_warning_degf": 215.0,
            "vibration_critical_g": 2.5,
            "vibration_warning_g": 2.0,
            "kurtosis_critical": 5.5,
            "kurtosis_warning": 4.2,
            "fuel_flow_min_lh": 4.0,
            "fuel_flow_max_lh": 13.0,
            "battery_v_min": 23.5, # 28V bus standard / 12V bus scaled
            "battery_v_low_warn": 12.6,
        }
    },
    "AUSTRO_AE300": {
        "name": "Austro Engine AE300 2.0L Turbo Diesel",
        "category": "4-Cylinder Inline Common-Rail Diesel",
        "airframe": "Heavy-Fuel MALE Tactical Recon UAV",
        "specs": {
            "cylinders": 4,
            "bore_m": 0.083,
            "stroke_m": 0.092,
            "displacement_m3": 0.001991, # 1.991 L
            "compression_ratio": 17.5,   # Diesel compression
            "rated_power_hp": 168.0,
            "rated_rpm": 2300.0,
            "gamma": 1.34,
            "fuel_lhv_j_per_kg": 42.8e6, # Jet-A1 / Diesel
            "fuel_density_kg_per_l": 0.82,
            "friction_fudge": 0.16,
            "mechanical_eff": 0.84,
            "r_air": 287.05,
        },
        "physics_constants": {
            "k1_cht_rpm": 32.0,
            "k2_cht_bhp": 1.95,
            "k3_egt_rpm": 55.0,
            "k4_egt_fuel": 10.0,
            "k_oil_slope": 38.0,
            "k_oil_base": 18.0,
        },
        "residual_thresholds": {
            "delta_cht": 25.0,
            "delta_egt": 50.0,
            "delta_oil_p": 10.0,
            "delta_fuel": 1.8,
        },
        "fault_thresholds": {
            "cht_critical_degf": 415.0,
            "cht_warning_degf": 395.0,
            "egt_critical_degf": 1580.0,
            "egt_warning_degf": 1540.0,
            "oil_p_critical_psi": 32.0,
            "oil_p_warning_psi": 40.0,
            "oil_t_critical_degf": 240.0,
            "oil_t_warning_degf": 220.0,
            "vibration_critical_g": 2.8,
            "vibration_warning_g": 2.2,
            "kurtosis_critical": 5.8,
            "kurtosis_warning": 4.5,
            "fuel_flow_min_lh": 5.0,
            "fuel_flow_max_lh": 16.0,
            "battery_v_min": 24.0,
            "battery_v_low_warn": 12.8,
        }
    }
}

# Current active configuration
_ACTIVE_ENGINE = "ROTAX_914"


def get_active_engine_class() -> str:
    return _ACTIVE_ENGINE


def set_active_engine_class(engine_class: str) -> bool:
    global _ACTIVE_ENGINE
    key = engine_class.upper().replace("-", "_")
    if key in ENGINE_REGISTRY:
        _ACTIVE_ENGINE = key
        return True
    elif key == "ROTAX_914_F" and "ROTAX_914" in ENGINE_REGISTRY:
        _ACTIVE_ENGINE = "ROTAX_914"
        return True
    return False


set_engine_class = set_active_engine_class


def list_engine_classes() -> List[str]:
    return list(ENGINE_REGISTRY.keys())


def get_engine_config(engine_class: str = None) -> Dict[str, Any]:
    target = (engine_class or _ACTIVE_ENGINE).upper().replace("-", "_")
    if target == "ROTAX_914_F":
        target = "ROTAX_914"
    return ENGINE_REGISTRY.get(target, ENGINE_REGISTRY["ROTAX_914"])
