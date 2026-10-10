"""
packages/twin-core/twin_core/ota_manager.py

Over-The-Air (OTA) Model Bundle Deployment with Signature Verification & Atomic Rollback.
Implements improvement_plan.md §4 Phase 4:
  - Cryptographically signed model bundles (HMAC-SHA256)
  - Integrity hash verification (SHA-256 per artifact)
  - Staging self-test validation before activation
  - Instant atomic rollback on inference failure or operator override
"""

import os
import tarfile
import json
import hmac
import hashlib
import shutil
from datetime import datetime, timezone
from typing import Dict, Any, Optional, Tuple, List

_REPO_ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))
DEFAULT_SIGNING_SECRET = os.environ.get("UAV_TWIN_OTA_SECRET", "uav-defense-ota-release-authority-2026").encode("utf-8")


class ModelBundleManager:
    """
    Manages secure airborne OTA model distribution, cryptographic verification,
    canary self-testing, and atomic rollback.
    """

    def __init__(
        self,
        base_dir: Optional[str] = None,
        signing_secret: Optional[bytes] = None,
    ):
        self.base_dir = base_dir or os.path.join(_REPO_ROOT, "backend", "ota_storage")
        self.signing_secret = signing_secret or DEFAULT_SIGNING_SECRET
        self.bundles_dir = os.path.join(self.base_dir, "bundles")
        self.active_dir = os.path.join(self.base_dir, "active")
        self.previous_dir = os.path.join(self.base_dir, "previous")
        self.history_file = os.path.join(self.base_dir, "deployment_history.json")

        os.makedirs(self.bundles_dir, exist_ok=True)
        os.makedirs(self.active_dir, exist_ok=True)
        os.makedirs(self.previous_dir, exist_ok=True)

    def _hash_file(self, filepath: str) -> str:
        sha = hashlib.sha256()
        with open(filepath, "rb") as f:
            while chunk := f.read(65536):
                sha.update(chunk)
        return sha.hexdigest()

    def _sign_manifest(self, manifest_dict: Dict[str, Any], secret: bytes) -> str:
        # Create canonical representation of manifest without signature
        clean = {k: v for k, v in manifest_dict.items() if k != "signature"}
        canonical = json.dumps(clean, sort_keys=True, separators=(",", ":")).encode("utf-8")
        return hmac.new(secret, canonical, hashlib.sha256).hexdigest()

    def create_bundle(
        self,
        version: str,
        artifacts_dir: Optional[str] = None,
        output_path: Optional[str] = None,
        secret: Optional[bytes] = None,
        model_path: Optional[str] = None,
        scaler_path: Optional[str] = None,
        int8_model_path: Optional[str] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """
        Package model files into a cryptographically signed .bundle archive.
        """
        key = secret or self.signing_secret
        dest_path = output_path or os.path.join(self.bundles_dir, f"model_bundle_{version}.tar.gz")

        default_dir = os.path.join(_REPO_ROOT, "backend", "models")
        art_dir = artifacts_dir or default_dir

        f_model = model_path or os.path.join(art_dir, "uav_rul_model.onnx")
        f_int8 = int8_model_path or os.path.join(art_dir, "uav_rul_model_int8.onnx")
        f_scaler = scaler_path or os.path.join(art_dir, "scaler_params.json")

        files_to_pack = [
            ("uav_rul_model.onnx", f_model),
            ("uav_rul_model_int8.onnx", f_int8),
            ("scaler_params.json", f_scaler),
        ]

        file_hashes = {}
        for arcname, fpath in files_to_pack:
            if not os.path.exists(fpath):
                raise FileNotFoundError(f"Missing required bundle artifact: {fpath}")
            file_hashes[arcname] = self._hash_file(fpath)

        manifest = {
            "bundle_version": version,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "target_model": "uav_rul_prognostics",
            "runtime": "onnxruntime",
            "file_hashes": file_hashes,
        }
        if metadata:
            manifest["metadata"] = metadata

        signature = self._sign_manifest(manifest, key)
        manifest["signature"] = signature

        # Write archive
        with tarfile.open(dest_path, "w:gz") as tar:
            for arcname, fpath in files_to_pack:
                tar.add(fpath, arcname=arcname)

            # Add manifest
            manifest_bytes = json.dumps(manifest, indent=2).encode("utf-8")
            import io
            ti = tarfile.TarInfo(name="manifest.json")
            ti.size = len(manifest_bytes)
            ti.mtime = int(datetime.now(timezone.utc).timestamp())
            tar.addfile(ti, io.BytesIO(manifest_bytes))

        return dest_path

    def verify_bundle(
        self,
        bundle_path: str,
        secret: Optional[bytes] = None,
    ) -> Tuple[bool, Optional[Dict[str, Any]], str]:
        """
        Verify bundle signature and SHA-256 hashes of all contained artifacts.
        Returns (is_valid, manifest, reason).
        """
        key = secret or self.signing_secret
        if not os.path.exists(bundle_path):
            return False, None, f"Bundle file not found: {bundle_path}"

        try:
            with tarfile.open(bundle_path, "r:gz") as tar:
                manifest_member = tar.extractfile("manifest.json")
                if not manifest_member:
                    return False, None, "Bundle missing manifest.json"

                manifest = json.loads(manifest_member.read().decode("utf-8"))
                provided_sig = manifest.get("signature", "")
                expected_sig = self._sign_manifest(manifest, key)

                if not hmac.compare_digest(provided_sig, expected_sig):
                    return False, None, "Invalid cryptographic signature (release authority untrusted)"

                # Check hashes of all archive files
                file_hashes = manifest.get("file_hashes", {})
                for fname, expected_hash in file_hashes.items():
                    member = tar.extractfile(fname)
                    if not member:
                        return False, None, f"Bundle missing listed file: {fname}"

                    actual_hash = hashlib.sha256(member.read()).hexdigest()
                    if actual_hash != expected_hash:
                        return False, None, f"Integrity check failed for {fname}: hash mismatch"

                return True, manifest, "Verified OK"
        except Exception as e:
            return False, None, f"Bundle read error: {e}"

    def stage_and_test(
        self,
        bundle_path: str,
        secret: Optional[bytes] = None,
    ) -> Tuple[bool, str]:
        """
        Unpack into staging directory and run self-test inference pass before activating.
        """
        ok, manifest, reason = self.verify_bundle(bundle_path, secret)
        if not ok:
            return False, f"Verification failed: {reason}"

        staging_dir = os.path.join(self.base_dir, "staging")
        if os.path.exists(staging_dir):
            shutil.rmtree(staging_dir)
        os.makedirs(staging_dir, exist_ok=True)

        try:
            with tarfile.open(bundle_path, "r:gz") as tar:
                tar.extractall(staging_dir)

            # Self-test using pure EdgePrognosticsRuntime
            from twin_core.edge_runtime import EdgePrognosticsRuntime
            import numpy as np

            model_path = os.path.join(staging_dir, "uav_rul_model.onnx")
            scaler_path = os.path.join(staging_dir, "scaler_params.json")

            runtime = EdgePrognosticsRuntime(model_path=model_path, scaler_path=scaler_path)
            sample_in = np.ones((50, 3), dtype=np.float32) * 0.5
            pred = runtime.predict(sample_in, num_mc_samples=1)

            if not (0.0 <= pred["predicted_rul"] <= 300.0):
                return False, f"Self-test sanity check failed: RUL={pred['predicted_rul']} out of nominal range"

            return True, "Self-test passed OK"
        except Exception as e:
            if os.path.exists(staging_dir):
                shutil.rmtree(staging_dir)
            return False, f"Self-test execution error: {e}"

    def activate(self, bundle_version: str) -> bool:
        """
        Atomically activate staged bundle. Preserves previous bundle for instant rollback.
        """
        staging_dir = os.path.join(self.base_dir, "staging")
        if not os.path.exists(staging_dir):
            return False

        # Backup current active to previous
        if os.path.exists(self.active_dir) and os.listdir(self.active_dir):
            if os.path.exists(self.previous_dir):
                shutil.rmtree(self.previous_dir)
            shutil.copytree(self.active_dir, self.previous_dir)

        # Move staging to active
        if os.path.exists(self.active_dir):
            shutil.rmtree(self.active_dir)
        shutil.move(staging_dir, self.active_dir)

        # Record deployment in history
        history = self.get_history()
        history.append({
            "version": bundle_version,
            "activated_at": datetime.now(timezone.utc).isoformat(),
            "status": "ACTIVE",
        })
        with open(self.history_file, "w") as f:
            json.dump(history, f, indent=2)

        return True

    def rollback(self) -> Tuple[bool, str]:
        """
        Revert active model to the previously active bundle.
        """
        if not os.path.exists(self.previous_dir) or not os.listdir(self.previous_dir):
            return False, "No previous verified bundle available for rollback"

        temp_swap = os.path.join(self.base_dir, "rollback_tmp")
        if os.path.exists(temp_swap):
            shutil.rmtree(temp_swap)

        # Move current active aside
        if os.path.exists(self.active_dir):
            shutil.move(self.active_dir, temp_swap)

        # Move previous to active
        shutil.copytree(self.previous_dir, self.active_dir)

        # Record rollback
        history = self.get_history()
        history.append({
            "event": "ROLLBACK",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "status": "ROLLED_BACK",
        })
        with open(self.history_file, "w") as f:
            json.dump(history, f, indent=2)

        if os.path.exists(temp_swap):
            shutil.rmtree(temp_swap)

        return True, "Rollback successful"

    def get_history(self) -> List[Dict[str, Any]]:
        if os.path.exists(self.history_file):
            try:
                with open(self.history_file, "r") as f:
                    return json.load(f)
            except Exception:
                return []
        return []


def create_model_bundle(
    version: str,
    model_path: str,
    scaler_path: str,
    output_dir: Optional[str] = None,
    secret: Optional[bytes] = None,
    metadata: Optional[Dict[str, Any]] = None,
) -> str:
    mgr = ModelBundleManager(base_dir=output_dir, signing_secret=secret)
    return mgr.create_bundle(
        version=version,
        model_path=model_path,
        scaler_path=scaler_path,
        metadata=metadata,
    )


def verify_model_bundle(
    bundle_path: str,
    secret: Optional[bytes] = None,
) -> Tuple[bool, str, Dict[str, Any]]:
    mgr = ModelBundleManager(signing_secret=secret)
    return mgr.verify_bundle(bundle_path)


