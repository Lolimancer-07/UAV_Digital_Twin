"""
backend/ota_manager.py

Convenience re-export for the secure OTA model bundle distribution subsystem.
"""

from twin_core.ota_manager import (
    ModelBundleManager,
    create_model_bundle,
    verify_model_bundle,
)

__all__ = [
    "ModelBundleManager",
    "create_model_bundle",
    "verify_model_bundle",
]
