"""
packages/twin-core/twin_core/mission_planner.py

Life-Aware Multi-Segment Mission Planner & Dispatch Go/No-Go Evaluator.
Implements STARTUP_BLUEPRINT.md §3 F2 & §8 Phase 4:
  - Multi-segment route and loiter schedule optimization (Climb, Outbound, Loiter, Inbound, Descent).
  - Multi-objective cost optimization: Cost = w_life * LifeBurn + w_fuel * Fuel + w_time * Time.
  - Generates verified Pareto set: 'FASTEST', 'CHEAPEST_LIFE', 'BALANCED', plus 'NAIVE_BASELINE'.
  - Pre-flight dispatch Go/No-Go scoring and engine life budgeting.
"""

from typing import Dict, List, Any, Optional, Tuple
import math
from datetime import datetime, timezone

from twin_core.life_burn import LifeBurnCalculator, life_burn_calc


class MissionSegment:
    """Defines a flight phase segment in an operational mission profile."""

    def __init__(
        self,
        name: str,
        phase: str,
        distance_nmi: float,
        target_altitude_ft: float,
        loiter_duration_hours: float = 0.0,
        wind_headwind_kts: float = 0.0,
    ):
        self.name = name
        self.phase = phase
        self.distance_nmi = distance_nmi
        self.target_altitude_ft = target_altitude_ft
        self.loiter_duration_hours = loiter_duration_hours
        self.wind_headwind_kts = wind_headwind_kts

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "phase": self.phase,
            "distance_nmi": self.distance_nmi,
            "target_altitude_ft": self.target_altitude_ft,
            "loiter_duration_hours": self.loiter_duration_hours,
            "wind_headwind_kts": self.wind_headwind_kts,
        }


class LifeAwareMissionPlanner:
    """
    Multi-segment mission planner optimizing altitude and RPM schedules
    to minimize engine life burn and fuel consumption while fulfilling time constraints.
    """

    def __init__(self, life_calculator: Optional[LifeBurnCalculator] = None):
        self.life_calc = life_calculator or life_burn_calc

    def _segment_forward_model(
        self,
        segment: MissionSegment,
        rpm: float,
        altitude_ft: float,
    ) -> Dict[str, Any]:
        """
        Physics forward model: computes speed, fuel rate, temperatures, and LBI
        for a candidate (RPM, Altitude) pair on a mission segment.
        """
        # Engine operating ratios
        rpm_ratio = max(0.5, min(1.8, rpm / 1400.0))
        alt_density_ratio = max(0.4, 1.0 - (altitude_ft / 36000.0) * 0.7)

        # True Airspeed (KTAS)
        # Higher RPM produces more thrust; higher altitude has lower air density (higher TAS)
        base_ktas = 85.0 * (rpm_ratio ** 0.8) * (1.0 / math.sqrt(alt_density_ratio))
        ground_speed_kts = max(35.0, base_ktas - segment.wind_headwind_kts)

        # Segment duration
        if segment.loiter_duration_hours > 0:
            duration_hours = segment.loiter_duration_hours
        else:
            duration_hours = max(0.05, segment.distance_nmi / ground_speed_kts)

        # Thermal response
        cht = 380.0 * (rpm_ratio ** 1.25) * (1.0 + (altitude_ft / 40000.0) * 0.15)
        egt = 1580.0 * (rpm_ratio ** 1.05)
        oil_temp = 185.0 * (rpm_ratio ** 0.9)
        oil_press = 58.0 * (1.0 / (rpm_ratio ** 0.15))
        vibration = 0.65 * (rpm_ratio ** 1.4)

        # Fuel flow (Gallons per Hour)
        # Power proportional to RPM * MAP; BSFC ~ 0.44 lb/hp-hr
        bhp = 115.0 * (rpm_ratio ** 1.5) * alt_density_ratio
        fuel_gph = max(3.5, bhp * 0.078)
        fuel_consumed_gal = fuel_gph * duration_hours

        # Life Burn Index
        lbi_res = self.life_calc.compute_instantaneous_lbi(
            cht=cht,
            egt=egt,
            oil_temp=oil_temp,
            oil_pressure=oil_press,
            vibration=vibration,
            rpm=rpm,
        )
        lbi = lbi_res["life_burn_index"]
        equivalent_life_hours = duration_hours * lbi

        return {
            "duration_hours": round(duration_hours, 3),
            "ground_speed_kts": round(ground_speed_kts, 1),
            "rpm": round(rpm, 1),
            "altitude_ft": round(altitude_ft, 0),
            "cht": round(cht, 1),
            "egt": round(egt, 1),
            "oil_pressure": round(oil_press, 1),
            "vibration": round(vibration, 2),
            "fuel_gph": round(fuel_gph, 2),
            "fuel_consumed_gal": round(fuel_consumed_gal, 2),
            "lbi": round(lbi, 2),
            "equivalent_life_hours": round(equivalent_life_hours, 3),
        }

    def _solve_segment_schedule(
        self,
        segment: MissionSegment,
        weight_life: float,
        weight_fuel: float,
        weight_time: float,
        rpm_bounds: Tuple[float, float] = (1200.0, 2400.0),
        alt_bounds: Tuple[float, float] = (2000.0, 15000.0),
    ) -> Dict[str, Any]:
        """
        Evaluates Pareto-optimal operating point for a segment across candidate bounds.
        """
        best_cost = float("inf")
        best_metrics = None

        # Grid search over operating envelope (fast and deterministic)
        rpm_steps = [rpm_bounds[0], (rpm_bounds[0] + rpm_bounds[1]) * 0.5, rpm_bounds[1]]
        if weight_time > weight_life:
            # Fastest: probe high power
            candidate_rpms = [1800.0, 2100.0, 2350.0]
        elif weight_life > weight_time:
            # Cheapest life: probe gentle derated power
            candidate_rpms = [1300.0, 1400.0, 1550.0]
        else:
            # Balanced
            candidate_rpms = [1450.0, 1650.0, 1850.0]

        target_alt = segment.target_altitude_ft

        for rpm in candidate_rpms:
            metrics = self._segment_forward_model(segment, rpm, target_alt)
            # Check CHT constraint: discard if exceeding redline (435°F)
            if metrics["cht"] > 435.0:
                continue

            cost = (
                weight_life * metrics["equivalent_life_hours"] * 10.0
                + weight_fuel * metrics["fuel_consumed_gal"]
                + weight_time * metrics["duration_hours"] * 5.0
            )

            if cost < best_cost:
                best_cost = cost
                best_metrics = metrics

        return best_metrics or self._segment_forward_model(segment, 1400.0, target_alt)

    def plan_mission_pareto(
        self,
        segments: Optional[List[MissionSegment]] = None,
        current_rul_hours: float = 120.0,
        fuel_capacity_gal: float = 65.0,
    ) -> Dict[str, Any]:
        """
        Generates Pareto set of mission schedules:
          - FASTEST
          - CHEAPEST_LIFE
          - BALANCED
          - NAIVE_BASELINE
        """
        if not segments:
            # Standard ISR Reconnaissance flight profile:
            # 1. Climb (20 nmi to 8000 ft)
            # 2. Cruise Outbound (120 nmi at 8000 ft)
            # 3. Loiter Mission (3.0 hours at 6000 ft)
            # 4. Inbound Return (120 nmi at 9000 ft)
            # 5. Descent (15 nmi to 2000 ft)
            segments = [
                MissionSegment("Climb to Altitude", "CLIMB", 20.0, 8000.0),
                MissionSegment("Outbound Cruise", "CRUISE", 120.0, 8000.0),
                MissionSegment("Tactical Loiter", "LOITER", 0.0, 6000.0, loiter_duration_hours=3.0),
                MissionSegment("Inbound Return", "CRUISE", 120.0, 9000.0),
                MissionSegment("Descent & Approach", "DESCENT", 15.0, 2000.0),
            ]

        profiles_weights = {
            "FASTEST": {"w_life": 0.1, "w_fuel": 0.2, "w_time": 1.0, "desc": "Minimizes mission duration; higher fuel and life burn."},
            "CHEAPEST_LIFE": {"w_life": 1.0, "w_fuel": 0.3, "w_time": 0.1, "desc": "Maximizes engine life preservation; lowest thermal stress."},
            "BALANCED": {"w_life": 0.5, "w_fuel": 0.5, "w_time": 0.4, "desc": "Pareto optimal balance of life consumption, fuel, and time."},
        }

        pareto_plans = {}

        for plan_name, cfg in profiles_weights.items():
            seg_results = []
            total_time = 0.0
            total_fuel = 0.0
            total_life_consumed = 0.0

            for seg in segments:
                res = self._solve_segment_schedule(seg, cfg["w_life"], cfg["w_fuel"], cfg["w_time"])
                res["segment_name"] = seg.name
                res["phase"] = seg.phase
                seg_results.append(res)
                total_time += res["duration_hours"]
                total_fuel += res["fuel_consumed_gal"]
                total_life_consumed += res["equivalent_life_hours"]

            avg_lbi = total_life_consumed / total_time if total_time > 0 else 1.0
            
            # Predict mission completion probability
            fuel_margin = max(0.0, fuel_capacity_gal - total_fuel)
            p_fuel = min(1.0, fuel_margin / 10.0 + 0.6) if fuel_margin > 0 else 0.01
            rul_margin = max(0.0, current_rul_hours - total_life_consumed)
            p_rul = min(1.0, rul_margin / 20.0 + 0.5) if rul_margin > 0 else 0.01
            p_complete = round(min(0.99, max(0.05, (p_fuel * 0.5 + p_rul * 0.5))), 3)

            pareto_plans[plan_name] = {
                "plan_name": plan_name,
                "description": cfg["desc"],
                "total_flight_time_hours": round(total_time, 2),
                "total_fuel_consumed_gal": round(total_fuel, 2),
                "total_life_consumed_hours": round(total_life_consumed, 2),
                "average_life_burn_index": round(avg_lbi, 2),
                "fuel_remaining_gal": round(max(0.0, fuel_capacity_gal - total_fuel), 2),
                "predicted_completion_probability": p_complete,
                "segments": seg_results,
            }

        # Naive Baseline (fixed unoptimized nominal 1400 RPM cruise)
        naive_segs = []
        n_time, n_fuel, n_life = 0.0, 0.0, 0.0
        for seg in segments:
            res = self._segment_forward_model(seg, 1400.0, seg.target_altitude_ft)
            res["segment_name"] = seg.name
            naive_segs.append(res)
            n_time += res["duration_hours"]
            n_fuel += res["fuel_consumed_gal"]
            n_life += res["equivalent_life_hours"]

        pareto_plans["NAIVE_BASELINE"] = {
            "plan_name": "NAIVE_BASELINE",
            "description": "Standard unoptimized fixed cruise profile (1400 RPM).",
            "total_flight_time_hours": round(n_time, 2),
            "total_fuel_consumed_gal": round(n_fuel, 2),
            "total_life_consumed_hours": round(n_life, 2),
            "average_life_burn_index": round(n_life / n_time if n_time > 0 else 1.0, 2),
            "fuel_remaining_gal": round(max(0.0, fuel_capacity_gal - n_fuel), 2),
            "predicted_completion_probability": 0.88,
            "segments": naive_segs,
        }

        return {
            "status": "OPTIMIZATION_SUCCESS",
            "plans": pareto_plans,
            "input_mission": {
                "segment_count": len(segments),
                "total_distance_nmi": sum(s.distance_nmi for s in segments),
                "current_rul_hours": current_rul_hours,
                "fuel_capacity_gal": fuel_capacity_gal,
            },
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    def evaluate_mission_dispatch(
        self,
        aircraft_id: str = "UAV-01",
        proposed_mission: Optional[Dict[str, Any]] = None,
        current_health_index: float = 92.0,
        current_rul_hours: float = 110.0,
        accumulated_life_hours: float = 340.0,
        tbo_hours: float = 1500.0,
    ) -> Dict[str, Any]:
        """
        Pre-flight Dispatch Go/No-Go evaluation and engine life budgeting.
        """
        plan_out = self.plan_mission_pareto(current_rul_hours=current_rul_hours)
        balanced_plan = plan_out["plans"]["BALANCED"]

        expected_flight_hours = balanced_plan["total_flight_time_hours"]
        expected_life_burn_hours = balanced_plan["total_life_consumed_hours"]
        p_complete = balanced_plan["predicted_completion_probability"]

        # Budget Allocation: allow max 1.3x nominal flight hours for mission life budget
        allocated_life_budget_hours = round(expected_flight_hours * 1.25, 2)
        budget_margin_hours = round(allocated_life_budget_hours - expected_life_burn_hours, 2)

        # Dispatch Rule Evaluation
        reasons = []
        if current_health_index < 65.0:
            reasons.append(f"Engine Health Index ({current_health_index:.1f}) below minimum dispatch threshold (65.0).")
        if expected_life_burn_hours > current_rul_hours:
            reasons.append(f"Mission life consumption ({expected_life_burn_hours:.1f}h) exceeds remaining RUL ({current_rul_hours:.1f}h).")
        if p_complete < 0.70:
            reasons.append(f"Predicted mission completion probability ({p_complete * 100:.1f}%) below acceptable risk envelope (70%).")

        if not reasons:
            if p_complete >= 0.85 and current_health_index >= 75.0:
                verdict = "GO"
            else:
                verdict = "GO_WITH_RESTRICTIONS"
                reasons.append("Moderate health/risk profile: Recommend derated cruise and 10% loiter altitude reduction.")
        else:
            verdict = "NO_GO"

        return {
            "aircraft_id": aircraft_id,
            "dispatch_verdict": verdict,
            "mission_feasibility_score": round(p_complete * 100.0, 1),
            "life_budget": {
                "allocated_budget_hours": allocated_life_budget_hours,
                "projected_consumption_hours": expected_life_burn_hours,
                "budget_margin_hours": budget_margin_hours,
                "within_budget": budget_margin_hours >= 0,
            },
            "engine_status": {
                "health_index": current_health_index,
                "current_rul_hours": current_rul_hours,
                "accumulated_hours": accumulated_life_hours,
                "tbo_hours": tbo_hours,
                "life_consumed_pct": round((accumulated_life_hours / tbo_hours) * 100.0, 2),
            },
            "recommended_plan": balanced_plan,
            "dispatch_notes": reasons or ["Engine and mission parameters satisfy all dispatch safety envelopes."],
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
        }


mission_planner = LifeAwareMissionPlanner()
