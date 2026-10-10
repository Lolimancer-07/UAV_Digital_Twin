"""
packages/twin-core/twin_core/cost_tracker.py

Cloud FinOps & Infrastructure Cost-Per-Aircraft-Per-Month (CPAM) Tracking Engine.
Implements improvement_plan.md §4 Phase 8:
  - Tracks Cost-per-Aircraft-per-Month (CPAM) as a first-class engineering metric.
  - Monitors compute, model inference, disk storage, and network egress costs.
  - Verifies target CPAM <= $28.50/aircraft/month, delivering >85% software gross margin.
"""

from typing import Dict, Any, Optional
from datetime import datetime, timezone
import threading

# Standard Cloud Infrastructure Unit Costs (AWS / GCP / GovCloud baselines)
DEFAULT_CLOUD_UNIT_COSTS = {
    "cpu_core_hour_usd": 0.040,         # Standard compute vCPU hour ($0.04)
    "memory_gb_hour_usd": 0.005,        # 1 GB RAM hour ($0.005)
    "storage_gb_month_usd": 0.080,      # High-performance SSD/EBS storage per GB-mo
    "archive_gb_month_usd": 0.015,      # S3/GCS Coldline storage per GB-mo
    "network_egress_gb_usd": 0.090,     # Egress bandwidth per GB
}


class CloudCostTracker:
    """
    Computes infrastructure cost consumption per tail number and monitors
    fleet software gross margin.
    """

    def __init__(self, unit_costs: Optional[Dict[str, float]] = None):
        self.unit_costs = unit_costs or DEFAULT_CLOUD_UNIT_COSTS
        self._lock = threading.RLock()

    def compute_monthly_cost_per_aircraft(
        self,
        flight_hours_per_month: float = 50.0,
        telemetry_hz: float = 10.0,
        average_inference_latency_ms: float = 12.0,
        retention_days: int = 90,
    ) -> Dict[str, Any]:
        """
        Calculates detailed monthly infrastructure cost for a single aircraft.
        """
        # 1. Total Telemetry Frames per month
        # 50 flight hours * 3600 seconds * 10 Hz = 1,800,000 frames
        total_frames = flight_hours_per_month * 3600.0 * telemetry_hz

        # 2. Compute & Ingestion Cost (CPU core-hours)
        # Average processing time ~0.00005 seconds per raw frame + inference
        ingest_cpu_seconds = total_frames * 0.00005
        # Model inference: 1 inference per frame * 12 ms = 21,600 CPU seconds (~6 hours)
        inference_cpu_seconds = total_frames * (average_inference_latency_ms / 1000.0)
        total_cpu_hours = (ingest_cpu_seconds + inference_cpu_seconds) / 3600.0
        compute_cost = total_cpu_hours * self.unit_costs["cpu_core_hour_usd"]

        # RAM footprint: allocated 0.5 GB per aircraft worker
        memory_gb_hours = total_cpu_hours * 0.5
        memory_cost = memory_gb_hours * self.unit_costs["memory_gb_hour_usd"]

        # 3. Storage Footprint Cost
        # Frame size in WAL mode: ~180 bytes compressed JSON
        # 1.8M frames * 180 bytes = ~324 MB / month
        monthly_storage_gb = (total_frames * 180.0) / (1024.0 ** 3)
        # 90-day retention means ~3x monthly storage active
        active_storage_gb = monthly_storage_gb * (retention_days / 30.0)
        storage_cost = active_storage_gb * self.unit_costs["storage_gb_month_usd"]

        # 4. Network Egress Cost (telemetry streaming to operator consoles)
        # 1.8M frames * 220 bytes WebSocket payload = ~396 MB egress / month
        egress_gb = (total_frames * 220.0) / (1024.0 ** 3)
        network_cost = egress_gb * self.unit_costs["network_egress_gb_usd"]

        total_cpam = compute_cost + memory_cost + storage_cost + network_cost

        # 5. Gross Margin Analysis against Tier 2 Fleet Cloud Pricing ($1,500/mo)
        customer_monthly_revenue = 1500.0
        gross_profit = customer_monthly_revenue - total_cpam
        gross_margin_pct = (gross_profit / customer_monthly_revenue) * 100.0

        return {
            "flight_hours_per_month": flight_hours_per_month,
            "total_frames_processed": int(total_frames),
            "breakdown": {
                "compute_cpu_usd": round(compute_cost, 3),
                "memory_ram_usd": round(memory_cost, 3),
                "storage_usd": round(storage_cost, 3),
                "network_egress_usd": round(network_cost, 3),
            },
            "cost_per_aircraft_per_month_usd": round(total_cpam, 2),
            "target_threshold_usd": 28.50,
            "target_met": total_cpam <= 28.50,
            "customer_monthly_revenue_usd": customer_monthly_revenue,
            "gross_margin_pct": round(gross_margin_pct, 1),
            "calculated_at": datetime.now(timezone.utc).isoformat(),
        }


cost_tracker = CloudCostTracker()
