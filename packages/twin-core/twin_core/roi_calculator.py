"""
packages/twin-core/twin_core/roi_calculator.py

Commercial Pricing & Operational ROI Calculation Engine.
Implements improvement_plan.md §4 Phase 7:
  - Commercial pricing tiers (Edge License, Fleet Cloud, OEM White-Label, Bench Dyno).
  - Deterministic ROI calculator:
      * Avoided Aircraft-On-Ground (AOG) downtime hours.
      * Avoided false-positive catastrophic engine swaps / premature teardowns.
      * Extended Time-Between-Overhauls (TBO) via condition-based maintenance.
      * Net savings, payback period (months), and ROI %.
"""

from typing import Dict, Any, Optional
from datetime import datetime, timezone

# Commercial Pricing Tiers
COMMERCIAL_TIERS: Dict[str, Dict[str, Any]] = {
    "TIER_EDGE_LICENSE": {
        "name": "Edge Advisory License",
        "target": "UAV Operators & Integrators",
        "annual_price_per_aircraft_usd": 12000.0,
        "billing_unit": "per aircraft / year",
        "description": "On-board Jetson/i.MX8 runtime, offline diagnostics, safety envelope, and local store-and-forward.",
    },
    "TIER_FLEET_CLOUD": {
        "name": "Fleet Cloud Twin",
        "target": "Fleet Operators & MRO Facilities",
        "monthly_base_per_aircraft_usd": 1500.0,
        "flight_hour_rate_usd": 18.0,
        "billing_unit": "per aircraft / month + flight hours",
        "description": "Multi-tenant cloud twin, federated learning baselines, post-flight maintenance reports, and fleet what-if planner.",
    },
    "TIER_OEM_PLATFORM": {
        "name": "OEM White-Label Propulsion Platform",
        "target": "Engine OEMs (Rotax / Continental / Hirth)",
        "annual_base_license_usd": 150000.0,
        "per_unit_royalty_usd": 1800.0,
        "billing_unit": "annual license + per engine royalty",
        "description": "Embedded engine digital twin, warranty analytics, authorized service center diagnostic tooling.",
    },
    "TIER_BENCH_TESTCELL": {
        "name": "Test-Cell & Bench Dyno Edition",
        "target": "Engine Overhaul & HIL Facilities",
        "annual_price_per_bench_usd": 35000.0,
        "billing_unit": "per test bench / year",
        "description": "J1939/ARINC replay suite, real-time thermodynamic residual monitor, automated pass/fail certification.",
    },
}


class EngineHealthROICalculator:
    """
    Computes tangible financial return on investment (ROI) for prospective customers
    based on their fleet operational parameters.
    """

    def __init__(
        self,
        cost_per_aog_hour_usd: float = 3500.0,
        cost_per_engine_overhaul_usd: float = 45000.0,
        baseline_false_positive_swap_rate: float = 0.08,  # 8% of engines swapped due to sensor errors
        tbo_extension_factor: float = 0.15,               # 15% safe interval extension
    ):
        self.cost_per_aog_hour = cost_per_aog_hour_usd
        self.cost_per_overhaul = cost_per_engine_overhaul_usd
        self.false_positive_rate = baseline_false_positive_swap_rate
        self.tbo_extension_factor = tbo_extension_factor

    def calculate_fleet_roi(
        self,
        fleet_size: int = 10,
        annual_flight_hours_per_uav: float = 600.0,
        tier_choice: str = "TIER_FLEET_CLOUD",
    ) -> Dict[str, Any]:
        """
        Computes detailed annual savings and ROI metrics for a given fleet.
        """
        tier = COMMERCIAL_TIERS.get(tier_choice, COMMERCIAL_TIERS["TIER_FLEET_CLOUD"])
        total_annual_hours = fleet_size * annual_flight_hours_per_uav

        # 1. Avoided AOG Savings
        # Industry average: ~40 unscheduled AOG maintenance hours per 1,000 flight hours
        expected_aog_hours_baseline = (total_annual_hours / 1000.0) * 40.0
        # Digital twin predictive prescriptives reduce unscheduled AOG by 45%
        avoided_aog_hours = expected_aog_hours_baseline * 0.45
        avoided_aog_savings = avoided_aog_hours * self.cost_per_aog_hour

        # 2. Avoided False-Positive Catastrophic Engine Swaps
        # False alarms from unvalidated sensor drift causing premature engine teardowns
        prevented_false_swaps = (fleet_size * self.false_positive_rate)
        avoided_swap_savings = prevented_false_swaps * self.cost_per_overhaul

        # 3. Extended TBO Value (Condition-Based Overhaul)
        # Normal engine lifecycle ~1200h. 15% extension yields 180 extra operating hours per engine
        tbo_hours_saved = (total_annual_hours / 1200.0) * (1200.0 * self.tbo_extension_factor)
        tbo_extension_savings = (tbo_hours_saved / 1200.0) * self.cost_per_overhaul

        total_annual_value = avoided_aog_savings + avoided_swap_savings + tbo_extension_savings

        # Software Investment Cost
        if tier_choice == "TIER_EDGE_LICENSE":
            annual_software_cost = fleet_size * tier["annual_price_per_aircraft_usd"]
        elif tier_choice == "TIER_FLEET_CLOUD":
            annual_software_cost = (
                fleet_size * tier["monthly_base_per_aircraft_usd"] * 12.0
                + total_annual_hours * tier["flight_hour_rate_usd"]
            )
        elif tier_choice == "TIER_BENCH_TESTCELL":
            annual_software_cost = tier["annual_price_per_bench_usd"]
        else:
            annual_software_cost = fleet_size * 18000.0

        net_annual_savings = total_annual_value - annual_software_cost
        roi_percentage = (net_annual_savings / annual_software_cost * 100.0) if annual_software_cost > 0 else 0.0
        payback_months = (annual_software_cost / total_annual_value * 12.0) if total_annual_value > 0 else 99.0

        return {
            "fleet_size": fleet_size,
            "annual_flight_hours": total_annual_hours,
            "tier_selected": tier["name"],
            "annual_software_investment_usd": round(annual_software_cost, 2),
            "breakdown": {
                "avoided_aog_hours": round(avoided_aog_hours, 1),
                "avoided_aog_savings_usd": round(avoided_aog_savings, 2),
                "prevented_false_swaps": round(prevented_false_swaps, 2),
                "avoided_swap_savings_usd": round(avoided_swap_savings, 2),
                "tbo_extension_savings_usd": round(tbo_extension_savings, 2),
            },
            "total_annual_value_delivered_usd": round(total_annual_value, 2),
            "net_annual_savings_usd": round(net_annual_savings, 2),
            "roi_percentage": round(roi_percentage, 1),
            "payback_period_months": round(payback_months, 1),
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }
