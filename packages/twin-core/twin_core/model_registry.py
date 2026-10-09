"""
packages/twin-core/twin_core/model_registry.py

ModelRegistry — lazy, hash-verified model loader.

Phase 1 contract (improvement_plan.md §4 Phase 1):
  - Models are loaded on-demand, not at import time.
  - Every model artifact is verified against its declared SHA-256 hash before
    it is handed to the caller. Mismatched artifacts are refused.
  - The manifest lives at packages/contracts/model_manifest.json.
  - The registry never imports TensorFlow or scikit-learn at module level.

Usage:
    registry = ModelRegistry()            # no TF import happens here
    lstm   = registry.get("uav_rul_lstm_v1")      # TF loaded only now
    scaler = registry.get("scaler_minmax_v1")
    ad     = registry.get("anomaly_isolation_forest_v1")
"""

import hashlib
import json
import os
import sys
from pathlib import Path
from typing import Any, Dict, Optional

# Locate the repo root relative to this file
_PACKAGE_DIR = Path(__file__).resolve().parent          # twin_core/
_TWIN_CORE_DIR = _PACKAGE_DIR.parent                    # packages/twin-core/
_REPO_ROOT = _TWIN_CORE_DIR.parent.parent               # repo root
_MANIFEST_PATH = _REPO_ROOT / "packages" / "contracts" / "model_manifest.json"
_BACKEND_DIR = _REPO_ROOT / "backend"


class ModelHashMismatch(RuntimeError):
    """Raised when a model file's SHA-256 does not match the manifest."""


class ModelNotFound(KeyError):
    """Raised when a model_id is not in the manifest."""


class ModelRegistry:
    """
    Lazy, hash-verified model loader.

    The registry reads the model manifest on first access and loads each
    artifact exactly once (singleton per registry instance). TensorFlow and
    scikit-learn are imported lazily inside the load methods so that
    ``import twin_core`` has zero TF/sklearn cost.
    """

    def __init__(self, manifest_path: Optional[Path] = None):
        self._manifest_path = manifest_path or _MANIFEST_PATH
        self._manifest: Optional[Dict] = None
        self._cache: Dict[str, Any] = {}

    # ── public API ────────────────────────────────────────────────────────────

    def get(self, model_id: str) -> Any:
        """Return the loaded model artifact for *model_id*, loading it if needed."""
        if model_id not in self._cache:
            self._cache[model_id] = self._load(model_id)
        return self._cache[model_id]

    def verify_all(self) -> Dict[str, bool]:
        """
        Verify SHA-256 hashes for every model in the manifest without loading them.
        Returns {model_id: True/False} for each entry.
        """
        manifest = self._get_manifest()
        results = {}
        for entry in manifest.get("models", []):
            mid = entry["model_id"]
            path = self._resolve_path(entry["file"])
            declared_hash = entry.get("hash", "")
            clean_declared = declared_hash.removeprefix("sha256:") if declared_hash else ""
            try:
                actual_hash = self._sha256(path)
                results[mid] = (actual_hash == clean_declared)
            except FileNotFoundError:
                results[mid] = False
        return results

    def manifest_entry(self, model_id: str) -> Dict:
        """Return the raw manifest entry for *model_id*."""
        return self._find_entry(model_id)

    # ── private helpers ───────────────────────────────────────────────────────

    def _get_manifest(self) -> Dict:
        if self._manifest is None:
            if not self._manifest_path.exists():
                raise FileNotFoundError(
                    f"Model manifest not found at {self._manifest_path}. "
                    "Run `python packages/twin-core/scripts/generate_manifest.py` to create it."
                )
            with open(self._manifest_path, "r") as f:
                self._manifest = json.load(f)
        return self._manifest

    def _find_entry(self, model_id: str) -> Dict:
        manifest = self._get_manifest()
        for entry in manifest.get("models", []):
            if entry["model_id"] == model_id:
                return entry
        raise ModelNotFound(
            f"model_id '{model_id}' not found in manifest at {self._manifest_path}. "
            f"Known IDs: {[e['model_id'] for e in manifest.get('models', [])]}"
        )

    def _resolve_path(self, relative_file: str) -> Path:
        """Resolve a manifest-relative path (relative to repo root)."""
        return _REPO_ROOT / relative_file

    def _sha256(self, path: Path) -> str:
        h = hashlib.sha256()
        with open(path, "rb") as f:
            for chunk in iter(lambda: f.read(65536), b""):
                h.update(chunk)
        return h.hexdigest()

    def _verify_hash(self, entry: Dict, path: Path) -> None:
        declared = entry.get("hash", "")
        if not declared:
            # Hash not yet recorded — allow but warn (Phase 1 transition)
            print(
                f"[ModelRegistry] WARNING: no hash declared for '{entry['model_id']}'. "
                "Add SHA-256 to the manifest to enable integrity checks.",
                flush=True,
            )
            return
        actual = self._sha256(path)
        clean_declared = declared.removeprefix("sha256:")
        if actual != clean_declared:
            raise ModelHashMismatch(
                f"Hash mismatch for model '{entry['model_id']}'!\n"
                f"  Manifest: {declared}\n"
                f"  On disk:  {actual}\n"
                f"  File:     {path}\n"
                "The artifact may be corrupted or replaced without updating the manifest."
            )

    def _load(self, model_id: str) -> Any:
        entry = self._find_entry(model_id)
        path = self._resolve_path(entry["file"])

        if not path.exists():
            raise FileNotFoundError(
                f"Model file for '{model_id}' not found: {path}"
            )

        self._verify_hash(entry, path)

        runtime = entry.get("runtime", "")

        if runtime.startswith("tensorflow"):
            return self._load_keras(path, model_id)
        elif runtime == "sklearn_pickle":
            return self._load_sklearn_pickle(path, model_id)
        elif runtime == "sklearn_joblib":
            return self._load_sklearn_joblib(path, model_id)
        else:
            raise ValueError(
                f"Unknown runtime '{runtime}' for model '{model_id}'. "
                "Supported: tensorflow_2.x, sklearn_pickle, sklearn_joblib"
            )

    def _load_keras(self, path: Path, model_id: str):
        """Load a Keras/TF model — TF imported lazily here."""
        import os as _os
        _os.environ.setdefault("TF_CPP_MIN_LOG_LEVEL", "3")
        import tensorflow as tf  # noqa: PLC0415  (lazy import is intentional)
        tf.get_logger().setLevel("ERROR")
        from tensorflow.keras.models import load_model  # noqa: PLC0415
        print(f"[ModelRegistry] Loading Keras model: {model_id} ({path.name})")
        return load_model(str(path))

    def _load_sklearn_pickle(self, path: Path, model_id: str):
        """Load a scikit-learn pickle artifact — pickle imported lazily."""
        import pickle  # noqa: PLC0415
        print(f"[ModelRegistry] Loading sklearn pickle: {model_id} ({path.name})")
        with open(path, "rb") as f:
            return pickle.load(f)

    def _load_sklearn_joblib(self, path: Path, model_id: str):
        """Load a scikit-learn joblib artifact — joblib imported lazily."""
        import joblib  # noqa: PLC0415
        print(f"[ModelRegistry] Loading sklearn joblib: {model_id} ({path.name})")
        return joblib.load(str(path))
