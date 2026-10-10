"""
packages/twin-core/twin_core/life_burn.py

Life Burn Rate & Thermal Fatigue Damage Accumulator.
Implements STARTUP_BLUEPRINT.md §3 F1:
  - "Engine life as a fuel gauge" — exposes engine life consumption as a measurable quantity.
  - Rainflow-style thermal cycle counting on CHT/EGT/oil temperatures.
  - Cumulative damage accumulation via Miner's rule with Coffin-Manson cycle weighting.
  - Creep / overtemperature exposure and vibration penalties.
  - Relative Life Burn Index (LBI) normalized to nominal steady-state cruise (LBI = 1.0).
"""

from typing import Dict, List, Any, Optional, Tuple
import math
from datetime import datetime, timezone


class LifeBurnCalculator:
    """
    Computes instantaneous Life Burn Index (LBI) and cumulative life consumption.
    
    Damage model:
      d_total = d_thermal_fatigue + d_overtemp_creep + d_vibration_fatigue
      LBI = instantaneous_damage_rate / nominal_damage_rate
    """

    # Baseline references for nominal cruise (e.g. Rotax 914 F at 1400 RPM cruise)
    REF_CHT = 380.0          # °F
    REF_EGT = 1580.0         # °F
    REF_OIL_TEMP = 185.0     # °F
    REF_OIL_PRESS = 58.0     # PSI
    REF_VIB = 0.65           # g RMS
    
    # Critical threshold redlines
    CHT_CAUTION = 410.0      # °F
    CHT_REDLINE = 435.0      # °F
    OIL_P_CAUTION = 42.0     # PSI
    OIL_P_CRITICAL = 32.0    # PSI

    # Exponents (Coffin-Manson thermal fatigue and vibration exponents)
    EXP_THERMAL_CYCLE = 2.0
    EXP_OVERTEMP = 2.8
    EXP_VIBRATION = 1.6

    def compute_instantaneous_lbi(
        self,
        cht: float,
        egt: float,
        oil_temp: float,
        oil_pressure: float,
        vibration: float,
        rpm: float = 1400.0,
    ) -> Dict[str, Any]:
        """
        Calculates instantaneous Life Burn Index (LBI).
        LBI = 1.0 represents nominal cruise wear.
        LBI < 1.0 represents gentle loiter / reduced wear.
        LBI > 1.0 represents accelerated thermal fatigue and wear.
        """
        # 1. Thermal stress factor (temperature ratios)
        cht_ratio = max(0.5, cht / self.REF_CHT)
        egt_ratio = max(0.5, egt / self.REF_EGT)
        oil_t_ratio = max(0.5, oil_temp / self.REF_OIL_TEMP)

        base_thermal_factor = (cht_ratio ** 1.3) * (egt_ratio ** 0.8) * (oil_t_ratio ** 0.5)

        # 2. Overtemperature / creep exponential penalty
        overtemp_penalty = 0.0
        if cht > self.CHT_CAUTION:
            excess_deg = cht - self.CHT_CAUTION
            overtemp_penalty = (excess_deg / 20.0) ** self.EXP_OVERTEMP

        # 3. Low oil pressure / lubrication friction penalty
        lube_penalty = 0.0
        if oil_pressure < self.OIL_P_CAUTION:
            p_defect = max(0.0, self.OIL_P_CAUTION - oil_pressure)
            lube_penalty = (p_defect / 10.0) ** 1.8

        # 4. Vibration mechanical fatigue factor
        vib_ratio = max(0.2, vibration / self.REF_VIB)
        vib_factor = vib_ratio ** self.EXP_VIBRATION

        # 5. Combined Life Burn Index
        lbi = (base_thermal_factor * vib_factor) + overtemp_penalty + lube_penalty
        lbi = max(0.1, round(lbi, 3))

        # Qualitative classification
        if lbi < 0.85:
            wear_regime = "ECONOMY_CONSERVATION"
        elif lbi <= 1.25:
            wear_regime = "NOMINAL_CRUISE"
        elif lbi <= 2.20:
            wear_regime = "ELEVATED_STRESS"
        else:
            wear_regime = "SEVERE_DAMAGE_ACCUMULATION"

        return {
            "life_burn_index": lbi,
            "wear_regime": wear_regime,
            "components": {
                "base_thermal_factor": round(base_thermal_factor, 3),
                "vibration_factor": round(vib_factor, 3),
                "overtemp_penalty": round(overtemp_penalty, 3),
                "lubrication_penalty": round(lube_penalty, 3),
            },
            "parameters": {
                "cht": cht,
                "egt": egt,
                "oil_pressure": oil_pressure,
                "vibration": vibration,
                "rpm": rpm,
            },
        }

    def evaluate_flight_profile_damage(
        self,
        flight_duration_hours: float,
        average_lbi: float,
        initial_consumed_hours: float = 0.0,
        tbo_hours: float = 1500.0,
    ) -> Dict[str, Any]:
        """
        Translates flight duration and LBI into equivalent nominal engine hours consumed.
        """
        equivalent_hours_consumed = round(flight_duration_hours * average_lbi, 3)
        total_consumed = round(initial_consumed_hours + equivalent_hours_consumed, 3)
        remaining_life_hours = max(0.0, round(tbo_hours - total_consumed, 3))
        life_consumed_pct = round((total_consumed / tbo_hours) * 100.0, 2)

        return {
            "flight_duration_hours": flight_duration_hours,
            "average_lbi": round(average_lbi, 3),
            "equivalent_hours_consumed": equivalent_hours_consumed,
            "total_accumulated_hours": total_consumed,
            "tbo_target_hours": tbo_hours,
            "remaining_life_hours": remaining_life_hours,
            "life_consumed_pct": life_consumed_pct,
        }


class RainflowCycleCounter:
    """
    Simplified rainflow cycle counting algorithm for temperature time-series,
    extracting thermal cycle reversals (valleys and peaks) to evaluate thermal fatigue.
    """

    def __init__(self, ref_cycle_range: float = 100.0):
        self.ref_cycle_range = ref_cycle_range

    def extract_reversals(self, series: List[float]) -> List[float]:
        """Filters series to local extrema (peaks and valleys)."""
        if len(series) < 3:
            return list(series)

        extrema = [series[0]]
        for i in range(1, len(series) - 1):
            prev_val = series[i - 1]
            curr_val = series[i]
            next_val = series[i + 1]

            if (curr_val >= prev_val and curr_val >= next_val) or (curr_val <= prev_val and curr_val <= next_val):
                if extrema[-1] != curr_val:
                    extrema.append(curr_val)

        if extrema[-1] != series[-1]:
            extrema.append(series[-1])
        return extrema

    def count_cycles(self, series: List[float]) -> List[Dict[str, float]]:
        """
        Extracts cycles and half-cycles with ranges and mean temperatures.
        """
        extrema = self.extract_reversals(series)
        cycles = []
        i = 0
        while i < len(extrema) - 1:
            r = abs(extrema[i + 1] - extrema[i])
            mean_temp = (extrema[i + 1] + extrema[i]) / 2.0
            if r > 5.0:  # Ignore micro noise fluctuations < 5°F
                cycles.append({
                    "range": round(r, 1),
                    "mean_temp": round(mean_temp, 1),
                    "relative_damage": round((r / self.ref_cycle_range) ** 2.0, 4),
                })
            i += 1
        return cycles


life_burn_calc = LifeBurnCalculator()
rainflow_counter = RainflowCycleCounter()
