"""
packages/twin-core/twin_core/profile_loader.py

Engine Profile Loader and JSON Schema Validator.
Implements STARTUP_BLUEPRINT.md §4 Profiles Architecture & §8 Phase 1:
  - Loads YAML and JSON engine profiles from profiles/ directory.
  - Validates profile schema against profiles/schema.json.
  - Rejects malformed profiles with actionable error messages.
"""

import os
import json
from typing import Dict, List, Any, Optional, Tuple

try:
    import yaml
except ImportError:
    yaml = None

try:
    import jsonschema
except ImportError:
    jsonschema = None


DEFAULT_PROFILES_DIR = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))),
    "profiles",
)


class EngineProfileValidationError(ValueError):
    """Raised when an engine profile fails schema validation."""


class EngineProfileLoader:
    """Loads and validates engine profile YAML/JSON specifications."""

    def __init__(self, profiles_dir: Optional[str] = None):
        self.profiles_dir = profiles_dir or DEFAULT_PROFILES_DIR
        self.schema_path = os.path.join(self.profiles_dir, "schema.json")
        self._schema = self._load_schema()

    def _load_schema(self) -> Optional[Dict[str, Any]]:
        if os.path.exists(self.schema_path):
            try:
                with open(self.schema_path, "r") as f:
                    return json.load(f)
            except Exception:
                return None
        return None

    def validate_profile_dict(self, profile_data: Dict[str, Any]) -> Tuple[bool, Optional[str]]:
        """Validates a profile dictionary against profiles/schema.json."""
        if not isinstance(profile_data, dict):
            return False, "Profile must be a JSON/YAML mapping object."

        required_keys = ["engine", "version", "cylinders", "rated_rpm", "channels", "physics", "causal_graph", "damage", "phases"]
        for k in required_keys:
            if k not in profile_data:
                return False, f"Missing required profile field: '{k}'."

        if jsonschema and self._schema:
            try:
                jsonschema.validate(instance=profile_data, schema=self._schema)
            except jsonschema.ValidationError as e:
                return False, f"Schema validation error: {e.message}"
            except Exception as e:
                return False, f"Validation error: {str(e)}"

        return True, None

    def load_profile(self, profile_name_or_path: str) -> Dict[str, Any]:
        """Loads and validates an engine profile by name (e.g. 'rotax_914') or absolute path."""
        path = profile_name_or_path
        if not os.path.isabs(path):
            # Try yaml first, then yml, then json
            candidates = [
                os.path.join(self.profiles_dir, f"{profile_name_or_path}.yaml"),
                os.path.join(self.profiles_dir, f"{profile_name_or_path}.yml"),
                os.path.join(self.profiles_dir, f"{profile_name_or_path}.json"),
                os.path.join(self.profiles_dir, profile_name_or_path),
            ]
            for cand in candidates:
                if os.path.exists(cand):
                    path = cand
                    break

        if not os.path.exists(path):
            raise FileNotFoundError(f"Engine profile '{profile_name_or_path}' not found at {path}.")

        data: Dict[str, Any] = {}
        with open(path, "r") as f:
            content = f.read()
            if path.endswith(".yaml") or path.endswith(".yml"):
                if yaml is None:
                    raise ImportError("PyYAML is required to parse YAML engine profiles.")
                data = yaml.safe_load(content)
            else:
                data = json.loads(content)

        is_valid, err = self.validate_profile_dict(data)
        if not is_valid:
            raise EngineProfileValidationError(f"Invalid engine profile '{path}': {err}")

        return data

    def list_available_profiles(self) -> List[str]:
        """Lists all profile identifiers available in the profiles directory."""
        if not os.path.exists(self.profiles_dir):
            return []
        names = set()
        for f in os.listdir(self.profiles_dir):
            if f.endswith((".yaml", ".yml", ".json")) and f != "schema.json":
                base = os.path.splitext(f)[0]
                names.add(base)
        return sorted(list(names))


# Pre-configured singleton instance
profile_loader = EngineProfileLoader()
