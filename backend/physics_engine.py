"""
backend/physics_engine.py

Thermodynamic & Aeromechanical Physics Engine for MALE UAV Aero Piston Engines
(Rotax 914 F Turbo / Austro AE300 / Continental CD-155 class).

Capabilities:
  1. Real-time Otto-cycle thermodynamics (IMEP, BMEP, Indicated/Brake Power, BSFC, thermal efficiency).
  2. International Standard Atmosphere (ISA) lapse rate corrections (ambient temperature, barometric pressure, air density ratio sigma) for altitudes up to 25,000+ ft.
  3. First-principles sensor baseline calculation and physics residuals (Delta CHT, Delta EGT, Delta Oil Pressure, Delta Fuel Flow) based on AI_MODELS_SPEC.md formulas.
  4. Dynamic 40-point P-V indicator diagram computation for live GCS cylinder pressure-volume cycles.
  5. Configurable engine profiles and residual thresholds per engine class via engine_config.py.
"""

import math
from typing import Dict, List, Tuple, Any

try:
    from backend.engine_config import get_engine_config, get_active_engine_class
except ImportError:
    from engine_config import get_engine_config, get_active_engine_class


class ISAAtmosphere:
    """
    Standard International Atmosphere (ISA) standard model (ISO 2533 / ICAO Doc 7488).
    Computes ambient temperature, barometric pressure, and density ratio (sigma)
    from sea level to 36,089 ft (troposphere).
    """
    T0_K = 288.15        # Sea-level standard temp (15°C / 59°F)
    P0_PA = 101325.0     # Sea-level standard pressure (1013.25 hPa)
    RHO0_KG_M3 = 1.225   # Sea-level standard density (kg/m^3)
    LAPSE_K_PER_M = 0.0065  # -6.5 K per 1000m (-1.98°C per 1000ft)
    G0 = 9.80665         # Gravitational acceleration (m/s^2)
    R_AIR = 287.05287    # Specific gas constant (J/kg·K)

    @classmethod
    def state_at_altitude(cls, altitude_ft: float) -> Dict[str, float]:
        """
        Returns temperature (°C, °F, K), pressure (Pa, kPa, inHg), and density ratio (sigma)
        at a given geometric altitude in feet.
        """
        alt_m = max(0.0, float(altitude_ft)) * 0.3048
        # Troposphere clamp (up to 11,000 m / 36,089 ft)
        h = min(11000.0, alt_m)

        t_k = cls.T0_K - cls.LAPSE_K_PER_M * h
        p_pa = cls.P0_PA * ((t_k / cls.T0_K) ** (cls.G0 / (cls.R_AIR * cls.LAPSE_K_PER_M)))
        rho = p_pa / (cls.R_AIR * t_k)
        sigma = rho / cls.RHO0_KG_M3  # Density ratio rho / rho0

        t_c = t_k - 273.15
        t_f = t_c * 1.8 + 32.0

        return {
            "altitude_ft": altitude_ft,
            "temp_k": round(t_k, 2),
            "temp_c": round(t_c, 2),
            "temp_f": round(t_f, 2),
            "pressure_pa": round(p_pa, 1),
            "pressure_kpa": round(p_pa / 1000.0, 2),
            "density_kg_m3": round(rho, 4),
            "density_ratio_sigma": round(sigma, 4),
        }


class AeroEnginePhysicsModel:
    """
    Thermodynamic and aeromechanical model that runs in lockstep with
    live telemetry to produce theoretical baselines, residuals, and P-V cycles.
    """

    def __init__(self, engine_class: str = None):
        self.engine_class = engine_class or get_active_engine_class()
        self.cfg = get_engine_config(self.engine_class)
        self.specs = self.cfg["specs"]
        self.constants = self.cfg.get("physics_constants", {})
        self.residual_thresholds = self.cfg.get("residual_thresholds", {})

        self.bore = self.specs["bore_m"]
        self.stroke = self.specs["stroke_m"]
        self.cr = self.specs["compression_ratio"]
        self.disp = self.specs["displacement_m3"]
        self.gamma = self.specs.get("gamma", 1.35)
        self.lhv = self.specs["fuel_lhv_j_per_kg"]
        self.fuel_dens = self.specs["fuel_density_kg_per_l"]
        self.friction_fudge = self.specs.get("friction_fudge", 0.14)
        self.mech_eff = self.specs.get("mechanical_eff", 0.86)

        # per-cylinder volumes
        self.v_swept_cyl = self.disp / self.specs["cylinders"]
        self.v_clearance_cyl = self.v_swept_cyl / (self.cr - 1.0)
        self.v_total_cyl = self.v_swept_cyl + self.v_clearance_cyl

        # Ideal air-standard Otto cycle efficiency: eta = 1 - 1/(cr^(gamma-1))
        self.ideal_thermal_eff = 1.0 - (1.0 / (self.cr ** (self.gamma - 1.0)))

    def calculate_pv_diagram(self, rpm: float, map_kpa: float = 100.0,
                             air_fuel_ratio: float = 14.7) -> List[Dict[str, float]]:
        """
        Generates 40 P-V indicator points for the 4-stroke cycle.
        Feeds the real-time indicator diagram on the GCS dashboard.
        """
        p1 = max(30.0, min(150.0, map_kpa)) * 1000.0  # intake manifold pressure in Pa
        t1 = 310.0  # intake charge temp ~ 37°C
        v1 = self.v_total_cyl
        v2 = self.v_clearance_cyl

        # Isentropic compression (BDC -> TDC)
        p2 = p1 * (self.cr ** self.gamma)
        t2 = t1 * (self.cr ** (self.gamma - 1.0))

        # Heat addition at TDC
        fuel_per_cyl_kg = (p1 * v1 / (287.05 * t1)) / (air_fuel_ratio + 1.0)
        q_in = fuel_per_cyl_kg * self.lhv * 0.90  # 90% combustion efficiency
        cv = 287.05 / (self.gamma - 1.0)
        t3 = t2 + (q_in / ((p1 * v1 / (287.05 * t1)) * cv))
        t3 = min(2850.0, t3)  # peak flame temperature clamp
        p3 = p2 * (t3 / t2)

        # Isentropic expansion (TDC -> BDC)
        p4 = p3 * ((1.0 / self.cr) ** self.gamma)

        points = []
        n_pts = 20

        # Compression stroke (180° to 360°) - volume decreasing
        for i in range(n_pts):
            fraction = i / (n_pts - 1)
            v = v1 - fraction * (v1 - v2)
            p = p1 * ((v1 / v) ** self.gamma)
            points.append({
                "stroke": "Compression",
                "crank_angle_deg": round(180 + fraction * 180, 1),
                "volume_cc": round(v * 1e6, 2),
                "pressure_bar": round(p / 1e5, 2)
            })

        # Power expansion stroke (360° to 540°) - volume increasing
        for i in range(n_pts):
            fraction = i / (n_pts - 1)
            v = v2 + fraction * (v1 - v2)
            p = p3 * ((v2 / v) ** self.gamma)
            points.append({
                "stroke": "Power",
                "crank_angle_deg": round(360 + fraction * 180, 1),
                "volume_cc": round(v * 1e6, 2),
                "pressure_bar": round(p / 1e5, 2)
            })

        return points

    def evaluate_performance(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Takes a live telemetry packet and computes aerodynamic/thermodynamic parameters
        plus residuals (measured - expected) according to AI_MODELS_SPEC.md.
        """
        rpm = max(400.0, float(data.get("rpm", 1400.0)))
        cht = float(data.get("cht", 380.0))
        egt = float(data.get("egt", 1580.0))
        fuel_flow_l_h = max(0.5, float(data.get("fuel_flow", 8.5)))
        oil_p = float(data.get("oil_pressure", 55.0))
        oil_t = float(data.get("oil_temp", 185.0))
        map_kpa = float(data.get("map_kpa", 98.0))
        alt_ft = float(data.get("altitude_ft", 0.0))
        oat_c_in = data.get("oat_c")

        # 1. ISA Atmospheric lapse rate corrections
        isa = ISAAtmosphere.state_at_altitude(alt_ft)
        sigma = isa["density_ratio_sigma"]
        t_ambient_f = float(oat_c_in) * 1.8 + 32.0 if oat_c_in is not None else isa["temp_f"]

        # 2. Fuel mass flow rate
        fuel_flow_kg_h = fuel_flow_l_h * self.fuel_dens
        fuel_flow_kg_s = fuel_flow_kg_h / 3600.0

        # 3. Indicated & Brake Mean Effective Pressure (IMEP / BMEP)
        # Per AI_MODELS_SPEC.md Section 2.1:
        # IMEP = P_manifold * ((r_c^gamma - 1) / (gamma - 1)) * eta_thermal
        map_bar = map_kpa / 100.0
        otto_work_ratio = ((self.cr ** self.gamma) - 1.0) / (self.gamma - 1.0)
        # Indicated mean effective pressure in bar (typical aero-engine IMEP: 10 - 15 bar)
        imep_bar = map_bar * otto_work_ratio * (self.ideal_thermal_eff * 0.45)
        bmep_bar = imep_bar * self.mech_eff
        bmep_kpa = bmep_bar * 100.0

        # 4. Indicated & Brake Power (Watts / kW / HP)
        # P_indicated = IMEP * V_d * (N / 120) for 4-stroke
        p_indicated_kw = (imep_bar * 100.0) * self.disp * (rpm / 120.0)
        
        # Rotax 914 maintains turbo boost to 15,000 ft, then density derating applies
        turbo_critical_alt_ft = 15000.0
        if alt_ft > turbo_critical_alt_ft:
            density_derate = max(0.65, sigma / 0.629)
        else:
            density_derate = 1.0

        brake_power_kw = (bmep_kpa * self.disp * (rpm / 120.0)) * density_derate
        brake_power_hp = brake_power_kw * 1.34102

        # 5. Brake Thermal Efficiency & BSFC
        fuel_energy_rate_kw = fuel_flow_kg_s * (self.lhv / 1000.0)
        eta_bth = (brake_power_kw / fuel_energy_rate_kw) if fuel_energy_rate_kw > 0 else 0.0
        eta_bth = max(0.12, min(0.42, eta_bth))

        bsfc_g_kwh = (fuel_flow_kg_h * 1000.0 / brake_power_kw) if brake_power_kw > 0 else 450.0
        bsfc_g_kwh = max(180.0, min(580.0, bsfc_g_kwh))

        # Volumetric efficiency
        eta_volumetric = min(1.05, max(0.60, (map_kpa / 101.325) * 0.88))

        # 6. Expected sensor baselines per aero engine first-principles thermodynamics
        k1 = self.constants.get("k1_cht_rpm", 38.0)
        k2 = self.constants.get("k2_cht_bhp", 2.25)
        # Cooling airflow scaling: density sigma reduces convective cooling efficiency at altitude
        cooling_margin_factor = 1.0 / max(0.55, (sigma ** 0.45))
        thermal_rise = (k1 * ((rpm / 1000.0) ** 1.3) + k2 * brake_power_hp) * cooling_margin_factor
        expected_cht = 255.0 + (t_ambient_f - 59.0) * 0.3 + thermal_rise * 0.72

        # EGT_expected = 1280.0 + k3*(RPM/1000)^1.1 - k4*(Fuel Flow - 9.0)
        k3 = self.constants.get("k3_egt_rpm", 60.0)
        k4 = self.constants.get("k4_egt_fuel", 12.0)
        expected_egt = 1280.0 + k3 * ((rpm / 1000.0) ** 1.1) - k4 * (fuel_flow_l_h - 9.0)

        # OilPressure_expected calibrated for Rotax 914 lubrication circuit
        clamped_oil_t = max(100.0, min(280.0, oil_t))
        expected_oil_p = 15.0 + 38.0 * (rpm / 2400.0) * math.sqrt(200.0 / clamped_oil_t)

        # Expected fuel flow based on engine shaft RPM (nominal ~9.8 L/h at 2400 RPM cruise)
        expected_fuel_flow = (rpm / 2400.0) * 9.8

        # 7. Residual deltas: Sensor - Expected
        res_egt = egt - expected_egt
        res_cht = cht - expected_cht
        res_oil_p = oil_p - expected_oil_p
        res_fuel = fuel_flow_l_h - expected_fuel_flow

        # EGT/CHT combustion thermal ratio
        thermal_ratio = egt / cht if cht > 50.0 else 2.5

        # P-V indicator points
        pv_points = self.calculate_pv_diagram(rpm, map_kpa)

        return {
            "engine_class":        self.engine_class,
            "brake_power_kw":      round(brake_power_kw, 2),
            "brake_power_hp":      round(brake_power_hp, 2),
            "imep_bar":            round(imep_bar, 2),
            "bmep_bar":            round(bmep_bar, 2),
            "bsfc_g_kwh":          round(bsfc_g_kwh, 1),
            "thermal_efficiency":  round(eta_bth * 100.0, 2),
            "volumetric_eff":        round(eta_volumetric * 100.0, 2),
            "volumetric_efficiency": round(eta_volumetric * 100.0, 2),
            "ideal_otto_eff":      round(self.ideal_thermal_eff * 100.0, 2),
            "thermal_ratio":       round(thermal_ratio, 3),
            "isa_ambient_temp_c":  isa["temp_c"],
            "isa_density_ratio":   isa["density_ratio_sigma"],
            "expected_baselines": {
                "egt":        round(expected_egt, 1),
                "cht":        round(expected_cht, 1),
                "oil_p":      round(expected_oil_p, 1),
                "fuel_flow":  round(expected_fuel_flow, 2),
            },
            "residuals": {
                "delta_egt":      round(res_egt, 1),
                "delta_cht":      round(res_cht, 1),
                "delta_oil_p":    round(res_oil_p, 1),
                "delta_fuel":     round(res_fuel, 2),
                "expected_egt":   round(expected_egt, 1),
                "expected_cht":   round(expected_cht, 1),
                "expected_oil_p": round(expected_oil_p, 1),
                "expected_fuel":  round(expected_fuel_flow, 2),
            },
            "residual_thresholds": self.residual_thresholds,
            "pv_diagram": pv_points
        }


# Singleton instance
physics_model = AeroEnginePhysicsModel()
