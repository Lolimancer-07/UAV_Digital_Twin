"""
backend/physics_firewall.py
Re-exports Physics Firewall from twin-core.
"""

from twin_core.physics_firewall import (
    PhysicsFirewall,
    physics_firewall,
)

__all__ = [
    "PhysicsFirewall",
    "physics_firewall",
]
