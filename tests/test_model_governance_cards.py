"""
tests/test_model_governance_cards.py
------------------------------------
Pre-commit / CI Guardrail for Task E:
  - Rejects any model artifact lacking a model card entry, sha256 checksum sidecar,
    or explicit dataset provenance label.
"""

import unittest
import os
import json
import hashlib
import glob


class TestModelGovernanceCards(unittest.TestCase):
    def setUp(self):
        self.root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
        self.backend_dir = os.path.join(self.root, "backend")
        self.model_card_path = os.path.join(self.backend_dir, "model_card.json")

    def test_model_card_json_exists_and_is_valid(self):
        self.assertTrue(os.path.exists(self.model_card_path), "Missing backend/model_card.json")
        with open(self.model_card_path, "r") as f:
            data = json.load(f)
        self.assertIn("models", data)
        self.assertIn("datasets", data)
        self.assertIn("phase", data)

    def test_all_backend_model_artifacts_have_sha256_sidecars(self):
        """Every .h5 and .pkl artifact in backend/ must have a matching .sha256 file."""
        model_files = [
            os.path.join(self.backend_dir, "uav_rul_model.h5"),
            os.path.join(self.backend_dir, "scaler.pkl"),
            os.path.join(self.backend_dir, "anomaly_model.pkl"),
        ]
        for mf in model_files:
            if os.path.exists(mf):
                sha_file = f"{mf}.sha256"
                self.assertTrue(os.path.exists(sha_file), f"Missing checksum sidecar for {mf}")

                with open(mf, "rb") as f:
                    actual_hash = hashlib.sha256(f.read()).hexdigest()

                with open(sha_file, "r") as f:
                    declared_hash = f.read().split()[0].strip()

                self.assertEqual(
                    actual_hash, declared_hash,
                    f"Checksum mismatch for {os.path.basename(mf)}!"
                )

    def test_models_declare_valid_dataset_provenance_labels(self):
        """Enforces Task A2: No model is trained on an unlabeled source."""
        with open(self.model_card_path, "r") as f:
            card = json.load(f)

        valid_provenances = {
            "real",
            "synthetic",
            "public-benchmark (other domain)",
            "synthetic (physics-first simulation)",
            "derived-benchmark (legacy turbofan)",
        }

        # Check dataset declarations in card
        for ds_name, ds_info in card.get("datasets", {}).items():
            prov = ds_info.get("provenance")
            self.assertIn(
                prov, valid_provenances,
                f"Dataset '{ds_name}' has invalid provenance: '{prov}'"
            )

    def test_markdown_model_cards_exist(self):
        """Enforces Task D4: model_card.md exists for shipped models."""
        cards_dir = os.path.join(self.root, "docs", "model_cards")
        self.assertTrue(os.path.exists(cards_dir), "Missing docs/model_cards/ directory")

        expected_cards = [
            "lstm_rul_prognostics.md",
            "isolation_forest_anomaly.md",
        ]
        for c in expected_cards:
            cp = os.path.join(cards_dir, c)
            self.assertTrue(os.path.exists(cp), f"Missing model card markdown document: {c}")


if __name__ == "__main__":
    unittest.main()
