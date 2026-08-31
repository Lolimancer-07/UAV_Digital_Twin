"""
backend/physics_engine.py
--------------------------
Physics-Informed Thermodynamic & Aeromechanical Engine Model
for MALE UAV Aero Piston Engines (e.g. Rotax 914 / Austro AE300 / Continental class).

Calculates:
  1. 4-Stroke Otto cycle state points (P, V, T at 0..720 deg crank angle)
  2. Theoretical Indicated & Brake Horsepower (IHP, BHP, Friction HP)
  3. Indicated Mean Effective Pressure (IMEP) & Brake MEP (BMEP)
  4. Volumetric Efficiency (eta_v) & Brake Thermal Efficiency (eta_th)
  5. Brake Specific Fuel Consumption (BSFC in g/kWh)
  6. Theoretical Physics Residuals (Expected vs Observed delta)
  7. Real-time P-V indicator diagram coordinates
"""

import math
from typing import Dict, List, Tuple, Any

# ── Typical MALE UAV Aero Piston Engine Specifications ────────────────────────
ENGINE_SPECS = {
    "cylinders":           4,
    "bore_m":              0.084,       # 84 mm bore
    "stroke_m":            0.061,       # 61 mm stroke
    "compression_ratio":   9.0,         # r = 9.0 : 1
    "displacement_m3":     0.001352,    # 1.352 Liters (1352 cc)
    "fuel_lhv_j_per_kg":   44.0e6,      # Lower heating value Gasoline: 44 MJ/kg
    "fuel_density_kg_per_l": 0.74,      # 0.74 kg/L
    "gamma":               1.33,        # Specific heat ratio for combustion mixture
    "r_air":               287.05,      # Specific gas constant (J/kg*K)
    "ambient_p_std_pa":    101325.0,    # Std Sea Level Pressure (Pa)
    "ambient_t_std_k":     288.15,      # Std Sea Level Temp (K)
    "friction_fudge":      0.15,        # 15% mechanical friction loss
}


class AeroEnginePhysicsModel:
    """
    Thermodynamic and aeromechanical engine model continuously synchronized
    with live telemetry to compute theoretical physical baselines and residuals.
    """

    def __init__(self, specs: Dict[str, Any] = None):
        self.specs = specs or ENGINE_SPECS
        self.bore = self.specs["bore_m"]
        self.stroke = self.specs["stroke_m"]
        self.cr = self.specs["compression_ratio"]
        self.disp = self.specs["displacement_m3"]
        self.gamma = self.specs["gamma"]
        self.lhv = self.specs["fuel_lhv_j_per_kg"]
        self.fuel_dens = self.specs["fuel_density_kg_per_l"]

        # Clearance and swept volume
        self.v_swept_cyl = self.disp / self.specs["cylinders"]
        self.v_clearance_cyl = self.v_swept_cyl / (self.cr - 1.0)
        self.v_total_cyl = self.v_swept_cyl + self.v_clearance_cyl

        # Precalculate theoretical ideal Otto thermal efficiency
        self.ideal_thermal_eff = 1.0 - (1.0 / (self.cr ** (self.gamma - 1.0)))

    def calculate_pv_diagram(self, rpm: float, map_kpa: float = 100.0,
                             air_fuel_ratio: float = 14.7) -> List[Dict[str, float]]:
        """
        Generates 40 discrete points along the 4-stroke P-V indicator cycle
        for real-time dashboard rendering.
        """
        p1 = max(30.0, min(140.0, map_kpa)) * 1000.0  # Intake manifold pressure in Pa
        t1 = 310.0  # Intake charge temp in K
        v1 = self.v_total_cyl
        v2 = self.v_clearance_cyl

        # State 2: Isentropic Compression
        p2 = p1 * (self.cr ** self.gamma)
        t2 = t1 * (self.cr ** (self.gamma - 1.0))

        # State 3: Constant Volume Heat Addition (Combustion)
        # Heat added per cylinder per cycle:
        fuel_per_cyl_kg = (p1 * v1 / (287.05 * t1)) / (air_fuel_ratio + 1.0)
        q_in = fuel_per_cyl_kg * self.lhv * 0.90  # 90% combustion efficiency
        cv = 287.05 / (self.gamma - 1.0)
        t3 = t2 + (q_in / ((p1 * v1 / (287.05 * t1)) * cv))
        t3 = min(2800.0, t3)  # Cap peak flame temp
        p3 = p2 * (t3 / t2)

        # State 4: Isentropic Expansion
        p4 = p3 * ((1.0 / self.cr) ** self.gamma)

        # Generate smooth P-V coordinates
        points = []
        n_pts = 20

        # Compression stroke (V1 -> V2)
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

        # Expansion stroke (V2 -> V1)
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
        Computes thermodynamic parameters and physical residuals from live telemetry.
        """
        rpm = max(400.0, float(data.get("rpm", 1400.0)))
        cht = float(data.get("cht", 380.0))
        egt = float(data.get("egt", 1580.0))
        fuel_flow_l_h = max(0.5, float(data.get("fuel_flow", 8.5)))
        oil_p = float(data.get("oil_pressure", 55.0))
        oil_t = float(data.get("oil_temp", 185.0))
        map_kpa = float(data.get("map_kpa", 98.0))

        # Fuel mass flow (kg/s and kg/h)
        fuel_flow_kg_h = fuel_flow_l_h * self.fuel_dens
        fuel_flow_kg_s = fuel_flow_kg_h / 3600.0

        # Theoretical Indicated Mean Effective Pressure (IMEP) [bar]
        # In a 4-stroke naturally aspirated/turbo engine:
        map_bar = map_kpa / 100.0
        imep_bar = map_bar * (self.cr - 1.0) * 1.45
        bmep_bar = imep_bar * (1.0 - self.specs["friction_fudge"])

        # Indicated Power & Brake Power (kW & BHP)
        # Power = (BMEP * Displacement * (RPM / 120)) [kW for BMEP in kPa]
        bmep_kpa = bmep_bar * 100.0
        brake_power_kw = (bmep_kpa * self.disp * (rpm / 120.0))
        brake_power_hp = brake_power_kw * 1.34102

        # Friction & Heat Loss Power
        friction_power_kw = brake_power_kw * self.specs["friction_fudge"]
        fuel_energy_rate_kw = fuel_flow_kg_s * (self.lhv / 1000.0)

        # Brake Thermal Efficiency (eta_bth)
        eta_bth = (brake_power_kw / fuel_energy_rate_kw) if fuel_energy_rate_kw > 0 else 0.0
        eta_bth = max(0.10, min(0.42, eta_bth))

        # Brake Specific Fuel Consumption (BSFC) [g / (kW * h)]
        bsfc_g_kwh = (fuel_flow_kg_h * 1000.0 / brake_power_kw) if brake_power_kw > 0 else 450.0
        bsfc_g_kwh = max(180.0, min(650.0, bsfc_g_kwh))

        # Volumetric Efficiency (eta_v)
        # Ideal intake air mass rate vs actual
        theoretical_air_l_s = (self.disp * 1000.0) * (rpm / 120.0)
        eta_volumetric = min(1.05, max(0.60, (map_kpa / 101.325) * 0.88))

        # ── Expected Physics Baselines (What healthy engine should exhibit) ───
        expected_egt = 1500.0 + (rpm / 2000.0) * 120.0 + (100.0 - map_kpa) * 1.5
        expected_cht = 340.0 + (brake_power_kw / 60.0) * 60.0
        expected_oil_p = 40.0 + (rpm / 2400.0) * 25.0 - max(0.0, (oil_t - 180.0) * 0.15)
        expected_fuel_flow = (brake_power_kw * 0.32) / self.fuel_dens  # L/hr

        # Physical Residuals (Sensor - PhysicsModel)
        res_egt = egt - expected_egt
        res_cht = cht - expected_cht
        res_oil_p = oil_p - expected_oil_p
        res_fuel = fuel_flow_l_h - expected_fuel_flow

        # Combustion Thermal Ratio
        thermal_ratio = egt / cht if cht > 50.0 else 2.5

        # PV diagram data for live UI
        pv_points = self.calculate_pv_diagram(rpm, map_kpa)

        return {
            "brake_power_kw":      round(brake_power_kw, 2),
            "brake_power_hp":      round(brake_power_hp, 2),
            "imep_bar":            round(imep_bar, 2),
            "bmep_bar":            round(bmep_bar, 2),
            "bsfc_g_kwh":          round(bsfc_g_kwh, 1),
            "thermal_efficiency":  round(eta_bth * 100.0, 2),
            "volumetric_eff":      round(eta_volumetric * 100.0, 2),
            "ideal_otto_eff":      round(self.ideal_thermal_eff * 100.0, 2),
            "thermal_ratio":       round(thermal_ratio, 3),
            "expected_baselines": {
                "egt":        round(expected_egt, 1),
                "cht":        round(expected_cht, 1),
                "oil_p":      round(expected_oil_p, 1),
                "fuel_flow":  round(expected_fuel_flow, 2),
            },
            "residuals": {
                "delta_egt":   round(res_egt, 1),
                "delta_cht":   round(res_cht, 1),
                "delta_oil_p": round(res_oil_p, 1),
                "delta_fuel":  round(res_fuel, 2),
            },
            "pv_diagram": pv_points
        }


# Singleton model instance
physics_model = AeroEnginePhysicsModel()
