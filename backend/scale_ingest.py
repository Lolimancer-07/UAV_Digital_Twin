"""
backend/scale_ingest.py
Re-exports horizontal partitioned ingest and backpressure controller from twin-core.
"""

from twin_core.scale_ingest import (
    AircraftIngestPartition,
    BackpressureController,
    PartitionedIngestRouter,
)

__all__ = [
    "AircraftIngestPartition",
    "BackpressureController",
    "PartitionedIngestRouter",
]
