"""
packages/twin-core/twin_core/contingency_footprint.py

Engine-Aware Contingency Footprint & Monte Carlo Landing Site Reachability Engine.
Implements STARTUP_BLUEPRINT.md §3 F3 & §8 Phase 4:
  - Dynamically computes reachable emergency recovery footprint under degraded engine health.
  - Monte Carlo trajectory sampling over conformal RUL distribution and wind uncertainty.
  - Ranks candidate recovery sites with empirical reachability probabilities (P_reach).
  - Calculates 8-cardinal directional footprint radius factoring wind drift.
"""

from typing import Dict, List, Any, Optional, Tuple
import math
import random
from datetime import datetime, timezone


# Standard candidate recovery sites (Default catalog)
DEFAULT_RECOVERY_SITES: List[Dict[str, Any]] = [
    {
        "site_id": "BASE-ALPHA",
        "name": "Forward Operating Airbase Alpha",
        "site_type": "MILITARY_AIRBASE",
        "lat": 34.250,
        "lon": -116.850,
        "elevation_ft": 2400.0,
        "runway_length_ft": 7500.0,
        "suitability_score": 1.0,
    },
    {
        "site_id": "CIVIL-REGIONAL",
        "name": "High Desert Regional Municipal Airport",
        "site_type": "CIVIL_RUNWAY",
        "lat": 34.420,
        "lon": -116.600,
        "elevation_ft": 2900.0,
        "runway_length_ft": 4800.0,
        "suitability_score": 0.85,
    },
    {
        "site_id": "RANGE-DROPZONE",
        "name": "Designated Tactical UAV Parachute Drop Zone 4",
        "site_type": "DESIGNATED_DROP_ZONE",
        "lat": 34.050,
        "lon": -117.150,
        "elevation_ft": 1800.0,
        "runway_length_ft": 0.0,
        "suitability_score": 0.65,
    },
    {
        "site_id": "DRY-LAKEBED",
        "name": "Dry Lake Bed Emergency Flatland Bed",
        "site_type": "OFF_AIRPORT_FLATLAND",
        "lat": 34.120,
        "lon": -116.400,
        "elevation_ft": 2100.0,
        "runway_length_ft": 3000.0,
        "suitability_score": 0.50,
    },
]


def haversine_distance_nmi(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes great-circle distance between two coordinates in nautical miles."""
    r_nmi = 3440.065  # Earth radius in nautical miles
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lam = math.radians(lon2 - lon1)

    a = (math.sin(delta_phi / 2.0) ** 2) + math.cos(phi1) * math.cos(phi2) * (math.sin(delta_lam / 2.0) ** 2)
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return round(r_nmi * c, 2)


def calculate_bearing_deg(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Computes initial true bearing from (lat1, lon1) to (lat2, lon2) in degrees [0, 360)."""
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_lam = math.radians(lon2 - lon1)

    y = math.sin(delta_lam) * math.cos(phi2)
    x = math.cos(phi1) * math.sin(phi2) - math.sin(phi1) * math.cos(phi2) * math.cos(delta_lam)
    bearing = (math.degrees(math.atan2(y, x)) + 360.0) % 360.0
    return round(bearing, 1)


class ContingencyFootprintCalculator:
    """
    Computes reachable area and landing site probabilities during engine degradation.
    """

    def __init__(self, sites: Optional[List[Dict[str, Any]]] = None):
        self.candidate_sites = list(sites or DEFAULT_RECOVERY_SITES)

    def register_site(self, site: Dict[str, Any]) -> bool:
        if "site_id" in site and "lat" in site and "lon" in site:
            self.candidate_sites.append(site)
            return True
        return False

    def list_sites(self) -> List[Dict[str, Any]]:
        return list(self.candidate_sites)

    def calculate_contingency_footprint(
        self,
        current_lat: float = 34.180,
        current_lon: float = -116.750,
        current_altitude_ft: float = 7500.0,
        derated_power_pct: float = 60.0,
        conformal_rul_mean_h: float = 1.2,
        conformal_rul_sigma_h: float = 0.25,
        wind_speed_kts: float = 15.0,
        wind_direction_deg: float = 270.0,  # Westerly wind (blowing from West to East)
        mc_samples: int = 200,
        seed: Optional[int] = 42,
    ) -> Dict[str, Any]:
        """
        Executes Monte Carlo simulation to evaluate reachable range and site probabilities.
        """
        rng = random.Random(seed or 42)

        # Baseline aerodynamics and derated flight speed
        # Full power cruise = 90 KTAS; at derated 60% power = ~68 KTAS; glide speed = 55 KTAS
        derate_ratio = max(0.1, min(1.0, derated_power_pct / 100.0))
        power_assisted_ktas = 55.0 + 35.0 * math.sqrt(derate_ratio)
        unpowered_glide_ratio = 12.0  # 12 ft horizontal per 1 ft vertical descent

        # 1. Evaluate reachability for each candidate site
        ranked_sites = []
        for site in self.candidate_sites:
            dist_nmi = haversine_distance_nmi(current_lat, current_lon, site["lat"], site["lon"])
            bearing = calculate_bearing_deg(current_lat, current_lon, site["lat"], site["lon"])

            # Wind component along bearing
            # Angle between wind vector origin and aircraft track
            angle_rad = math.radians(bearing - wind_direction_deg)
            # Headwind is positive when blowing directly against track
            headwind_kts = wind_speed_kts * math.cos(angle_rad)
            ground_speed_kts = max(20.0, power_assisted_ktas - headwind_kts)

            # Flight time needed to reach site
            time_required_hours = dist_nmi / ground_speed_kts

            # Monte Carlo sampling over conformal RUL distribution
            successful_reaches = 0
            arrival_altitudes = []

            for _ in range(mc_samples):
                # Sample available powered endurance from conformal distribution
                sampled_rul = max(0.05, rng.gauss(conformal_rul_mean_h, conformal_rul_sigma_h))
                
                # Check if powered flight covers entire distance
                if sampled_rul >= time_required_hours:
                    # Arrives with powered flight intact
                    arrival_alt = current_altitude_ft - (site["elevation_ft"])
                    successful_reaches += 1
                    arrival_altitudes.append(arrival_alt)
                else:
                    # Engine quits mid-transit: remaining distance flown on unpowered glide
                    powered_dist = sampled_rul * ground_speed_kts
                    remaining_dist = max(0.0, dist_nmi - powered_dist)
                    
                    # Altitude lost in glide: remaining_dist_ft / glide_ratio
                    remaining_dist_ft = remaining_dist * 6076.12
                    alt_lost_glide = remaining_dist_ft / unpowered_glide_ratio
                    final_alt = (current_altitude_ft - alt_lost_glide) - site["elevation_ft"]

                    if final_alt >= 200.0:  # Must clear site elevation by at least 200 ft AGL for safe circuit
                        successful_reaches += 1
                        arrival_altitudes.append(final_alt)

            reach_prob = round(successful_reaches / mc_samples, 3)
            mean_arrival_alt = round(sum(arrival_altitudes) / len(arrival_altitudes), 0) if arrival_altitudes else 0.0

            suitability = site.get("suitability_score", 0.5)
            # Composite safety score: reachability * suitability
            composite_score = round(reach_prob * suitability, 3)

            ranked_sites.append({
                "site_id": site["site_id"],
                "name": site["name"],
                "site_type": site["site_type"],
                "distance_nmi": dist_nmi,
                "bearing_deg": bearing,
                "headwind_component_kts": round(headwind_kts, 1),
                "ground_speed_kts": round(ground_speed_kts, 1),
                "estimated_transit_minutes": round(time_required_hours * 60.0, 1),
                "reachability_probability": reach_prob,
                "expected_arrival_altitude_agl_ft": mean_arrival_alt,
                "composite_safety_score": composite_score,
                "recommended": reach_prob >= 0.70,
            })

        # Sort sites by composite score descending
        ranked_sites.sort(key=lambda s: s["composite_safety_score"], reverse=True)

        # 2. Compute 8-cardinal directional footprint radius (nautical miles)
        cardinal_bearings = {
            "N": 0.0,
            "NE": 45.0,
            "E": 90.0,
            "SE": 135.0,
            "S": 180.0,
            "SW": 225.0,
            "W": 270.0,
            "NW": 315.0,
        }
        footprint_radii_nmi = {}
        for cardinal, b_deg in cardinal_bearings.items():
            rad = math.radians(b_deg - wind_direction_deg)
            hw = wind_speed_kts * math.cos(rad)
            gs = max(20.0, power_assisted_ktas - hw)
            # 90th percentile conservative endurance
            conservative_endurance = max(0.1, conformal_rul_mean_h - 1.28 * conformal_rul_sigma_h)
            radius = round(conservative_endurance * gs, 1)
            footprint_radii_nmi[cardinal] = radius

        return {
            "status": "FOOTPRINT_COMPUTED",
            "current_position": {
                "lat": current_lat,
                "lon": current_lon,
                "altitude_msl_ft": current_altitude_ft,
            },
            "engine_state": {
                "derated_power_pct": derated_power_pct,
                "conformal_rul_mean_h": conformal_rul_mean_h,
                "conformal_rul_sigma_h": conformal_rul_sigma_h,
                "power_assisted_ktas": round(power_assisted_ktas, 1),
            },
            "wind_conditions": {
                "speed_kts": wind_speed_kts,
                "direction_deg": wind_direction_deg,
            },
            "footprint_radii_nmi": footprint_radii_nmi,
            "ranked_recovery_sites": ranked_sites,
            "best_option": ranked_sites[0] if ranked_sites else None,
            "evaluated_at": datetime.now(timezone.utc).isoformat(),
        }


contingency_engine = ContingencyFootprintCalculator()
