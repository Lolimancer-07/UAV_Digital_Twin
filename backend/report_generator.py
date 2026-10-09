"""
backend/report_generator.py

Convenience re-export for the post-flight report worker.
"""

from twin_core.report_generator import (
    generate_flight_report,
    render_report_html,
    export_report_bundle,
)

__all__ = [
    "generate_flight_report",
    "render_report_html",
    "export_report_bundle",
]
